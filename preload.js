'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openExternal:  (url)  => ipcRenderer.invoke('shell:open-external', url),
  selectFolder:  ()     => ipcRenderer.invoke('dialog:select-folder'),
  shareContent:  (opts) => ipcRenderer.invoke('share:content', opts),
  exportData:    (opts) => ipcRenderer.invoke('export:data', opts),
  importData:    ()     => ipcRenderer.invoke('import:data'),
  readFile:      (p)    => ipcRenderer.invoke('read-file', p),
  // Called when Finder opens a .vega file — renderer registers a handler
  onOpenFile:    (cb)   => ipcRenderer.on('vega:open-file', (_, filePath) => cb(filePath)),
});
