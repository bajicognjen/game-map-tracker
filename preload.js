'use strict';
// Bridge between the sandboxed page and the main process. Only these functions are exposed.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  listGames: () => ipcRenderer.invoke('library:list'),
  addGame: (input, opts) => ipcRenderer.invoke('library:add', input, opts),
  cancelAdd: () => ipcRenderer.invoke('library:cancel'),
  removeGame: (slug) => ipcRenderer.invoke('library:remove', slug),
  onAddProgress: (callback) => {
    const handler = (_event, progress) => callback(progress);
    ipcRenderer.on('library:progress', handler);
    return () => ipcRenderer.removeListener('library:progress', handler);
  },
  onMenu: (callback) => ipcRenderer.on('menu', (_event, action) => callback(action)),
  loadMap: (source, gameSlug, mapSlug) => ipcRenderer.invoke('map:load', source, gameSlug, mapSlug),
  exportProgress: (json, suggestedName) => ipcRenderer.invoke('progress:export', json, suggestedName),
  importProgress: () => ipcRenderer.invoke('progress:import'),
  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),
});
