'use strict';
const { app, BrowserWindow, shell, ipcMain, dialog } = require('electron');
const path = require('node:path');

const PORT = 3690;

// Suppress Chromium network-service sandbox crash on startup (safe for localhost-only app)
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu-sandbox');

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

let mainWindow = null;

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

app.whenReady().then(() => {
  // Handle openExternal from renderer via IPC (more reliable than direct shell call in preload)
  ipcMain.handle('shell:open-external', (_, url) => shell.openExternal(url));
  ipcMain.handle('dialog:select-folder', () =>
    dialog.showOpenDialog(mainWindow, { properties: ['openDirectory', 'createDirectory'] })
      .then(r => r.canceled ? null : r.filePaths[0])
  );

  // Share: write temp .txt file and show in Finder so user can Share via right-click
  ipcMain.handle('share:content', async (_, { title, text }) => {
    const os = require('node:os');
    const fs = require('node:fs');
    const safe = (title || 'vega-share').replace(/[^a-z0-9]/gi, '_').slice(0, 40);
    const tmpPath = path.join(os.tmpdir(), safe + '.txt');
    fs.writeFileSync(tmpPath, (title || '') + '\n\n' + (text || ''));
    shell.showItemInFolder(tmpPath);
    return { ok: true };
  });

  // Export: show save dialog and write JSON
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

  // Import: show open dialog and read JSON
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
  // Set macOS Dock icon explicitly (BrowserWindow icon alone doesn't update it)
  if (process.platform === 'darwin' && app.dock) {
    app.dock.setIcon(path.join(__dirname, 'assets', 'icon.png'));
  }

  // Start the HTTP server
  const { server } = require('./server.js');

  // Give the server a moment to bind before opening the window
  setTimeout(() => {
    createWindow();

    // macOS: re-open window when clicking dock icon
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  }, 400);

  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.on('before-quit', () => {
    server.close();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
