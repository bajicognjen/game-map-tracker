'use strict';
// Bridge between the sandboxed page and the main process. Only these functions are exposed.
const { contextBridge, ipcRenderer } = require('electron');

const listen = (channel, callback) => {
  const handler = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

contextBridge.exposeInMainWorld('api', {
  appInfo: () => ipcRenderer.invoke('app:info'),
  listGames: () => ipcRenderer.invoke('library:list'),
  lookupGame: (input) => ipcRenderer.invoke('library:lookup', input),
  addGame: (input, opts) => ipcRenderer.invoke('library:add', input, opts),
  cancelJob: () => ipcRenderer.invoke('library:cancel'),
  refreshAllGames: () => ipcRenderer.invoke('library:refresh-all'),
  stopTiles: () => ipcRenderer.invoke('library:stop-tiles'),
  removeGame: (slug) => ipcRenderer.invoke('library:remove', slug),
  cleanGame: (slug, what) => ipcRenderer.invoke('library:clean', slug, what),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  chooseFolder: (kind) => ipcRenderer.invoke('settings:choose-folder', kind),
  applySettings: (change) => ipcRenderer.invoke('settings:apply', change),
  reportProblem: () => ipcRenderer.invoke('shell:report-problem'),
  onJobProgress: (callback) => listen('library:progress', callback),
  onMenu: (callback) => listen('menu', callback),
  loadMap: (source, gameSlug, mapSlug) => ipcRenderer.invoke('map:load', source, gameSlug, mapSlug),
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  downloadUpdate: (opts) => ipcRenderer.invoke('update:download', opts),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  onUpdateStatus: (callback) => listen('update:status', callback),
  writeBackup: (gameSlug, mapSlug, json) => ipcRenderer.invoke('backup:write', gameSlug, mapSlug, json),
  readBackup: (gameSlug, mapSlug) => ipcRenderer.invoke('backup:read', gameSlug, mapSlug),
  exportProgress: (json, suggestedName, kind) => ipcRenderer.invoke('progress:export', json, suggestedName, kind),
  importProgress: () => ipcRenderer.invoke('progress:import'),
  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),
});
