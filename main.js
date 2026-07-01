'use strict';
const { app, BrowserWindow, shell, ipcMain, dialog, Menu } = require('electron');
const path = require('node:path');
const net  = require('node:net');
const fs   = require('node:fs');

const PORT = 3690;

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu-sandbox');

let ownedServer = null;
let pendingOpenFile = null; // file path queued before window is ready

// Handle macOS Finder "Open With" — file path arrives before window exists
app.on('open-file', (event, filePath) => {
  event.preventDefault();
  const wins = BrowserWindow.getAllWindows();
  if (wins.length > 0) {
    wins[0].webContents.send('vega:open-file', filePath);
    wins[0].focus();
  } else {
    pendingOpenFile = filePath; // will be sent once window is ready
  }
});

function createWindow() {
  const win = new BrowserWindow({
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

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  win.webContents.on('did-fail-load', (_e, errCode) => {
    if (errCode === -2 || errCode === -6 || errCode === -21) {
      setTimeout(() => win.loadURL(`http://localhost:${PORT}`), 500);
    }
  });

  win.loadURL(`http://localhost:${PORT}`);

  // Send any file that was queued before the window was ready
  win.webContents.once('did-finish-load', () => {
    if (pendingOpenFile) {
      win.webContents.send('vega:open-file', pendingOpenFile);
      pendingOpenFile = null;
    }
  });

  return win;
}

function isPortInUse() {
  return new Promise((resolve) => {
    const probe = net.createConnection({ port: PORT, host: '127.0.0.1' });
    probe.once('connect', () => { probe.destroy(); resolve(true); });
    probe.once('error', () => resolve(false));
  });
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'New Window',
          accelerator: isMac ? 'Cmd+Shift+N' : 'Ctrl+Shift+N',
          click: () => createWindow(),
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(async () => {
  ipcMain.handle('shell:open-external', (_, url) => shell.openExternal(url));

  // Read a file from disk (used when opening .vega files from Finder)
  ipcMain.handle('read-file', (_, filePath) => {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const name = path.basename(filePath, path.extname(filePath));
      return { ok: true, content, name };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });
  ipcMain.handle('dialog:select-folder', () =>
    dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
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
    const result = await dialog.showSaveDialog({
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
    const result = await dialog.showOpenDialog({
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

  if (process.platform === 'darwin' && app.dock) {
    app.dock.setIcon(path.join(__dirname, 'assets', 'icon.png'));
  }

  buildMenu();

  const alreadyRunning = await isPortInUse();
  if (!alreadyRunning) {
    const { server } = require('./server.js');
    ownedServer = server;
    await new Promise(resolve => setTimeout(resolve, 400));
  }

  createWindow();

  // macOS: clicking the Dock icon always opens a new window
  app.on('activate', () => createWindow());

  app.on('before-quit', () => {
    if (ownedServer) ownedServer.close();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
