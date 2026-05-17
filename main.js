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
