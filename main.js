'use strict';
const { app, BrowserWindow, shell, ipcMain, dialog } = require('electron');
const path = require('node:path');
const net  = require('node:net');

const PORT = 3690;

// Suppress Chromium network-service sandbox crash on startup (safe for localhost-only app)
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu-sandbox');

// Allow multiple instances — each window connects to the shared local server.
// Do NOT call app.requestSingleInstanceLock().

let mainWindow = null;
let ownedServer = null; // only set if this instance started the server

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    title: 'Vega',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Open all target="_blank" links in the system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Retry if the network service crashes before the page loads
  mainWindow.webContents.on('did-fail-load', (_e, errCode) => {
    if (errCode === -2 || errCode === -6 || errCode === -21) {
      setTimeout(() => mainWindow?.loadURL(`http://localhost:${PORT}`), 500);
    }
  });

  mainWindow.loadURL(`http://localhost:${PORT}`);
}

/** Check whether something is already listening on PORT. */
function isPortInUse() {
  return new Promise((resolve) => {
    const probe = net.createConnection({ port: PORT, host: '127.0.0.1' });
    probe.once('connect', () => { probe.destroy(); resolve(true); });
    probe.once('error', () => resolve(false));
  });
}

app.whenReady().then(async () => {
  // Register IPC handlers (safe to register in every instance — they only serve
  // the BrowserWindow that belongs to *this* process).
  ipcMain.handle('shell:open-external', (_, url) => shell.openExternal(url));
  ipcMain.handle('dialog:select-folder', () =>
    dialog.showOpenDialog(mainWindow, { properties: ['openDirectory', 'createDirectory'] })
      .then(r => r.canceled ? null : r.filePaths[0])
  );

  ipcMain.handle('share:content', async (_, { title, text }) => {
    const os = require('node:os');
    const fs = require('node:fs');
    const safe = (title || 'vega-share').replace(/[^a-z0-9]/gi, '_').slice(0, 40);
    const tmpPath = path.join(os.tmpdir(), safe + '.txt');
    fs.writeFileSync(tmpPath, (title || '') + '\n\n' + (text || ''));
    shell.showItemInFolder(tmpPath);
    return { ok: true };
  });

  ipcMain.handle('export:data', async (_, { filename, data }) => {
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: filename,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (!result.canceled && result.filePath) {
      require('node:fs').writeFileSync(result.filePath, JSON.stringify(data, null, 2), 'utf8');
      return { ok: true, filePath: result.filePath };
    }
    return { ok: false };
  });

  ipcMain.handle('import:data', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile'],
    });
    if (!result.canceled && result.filePaths[0]) {
      try {
        const raw = require('node:fs').readFileSync(result.filePaths[0], 'utf8');
        return { ok: true, data: JSON.parse(raw) };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    }
    return { ok: false };
  });

  // Set macOS Dock icon explicitly
  if (process.platform === 'darwin' && app.dock) {
    app.dock.setIcon(path.join(__dirname, 'assets', 'icon.png'));
  }

  // Start the HTTP server only if nothing is already listening on PORT.
  const alreadyRunning = await isPortInUse();
  if (!alreadyRunning) {
    const { server } = require('./server.js');
    ownedServer = server;
    // Give the server a moment to bind before opening the window
    await new Promise(resolve => setTimeout(resolve, 400));
  }
  // If already running, connect immediately — no wait needed.

  createWindow();

  // macOS: re-open window when clicking dock icon
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  // Only the instance that started the server shuts it down on quit.
  app.on('before-quit', () => {
    if (ownedServer) ownedServer.close();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
