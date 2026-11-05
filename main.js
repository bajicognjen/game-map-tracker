'use strict';
/**
 * Electron main process: window, menu, the gamemap:// protocol that serves game assets from
 * the user-data folder, and the IPC the sandboxed renderer uses for the library and the map.
 */
const { app, BrowserWindow, Menu, dialog, ipcMain, shell, protocol, net } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const paths = require('./lib/paths'); // sets the app name (user-data folder) — keep it first
const library = require('./lib/library');

const isHttpUrl = (url) => typeof url === 'string' && /^https?:\/\//i.test(url);

// gamemap://<source>/<game slug>/<relative path>  ->  file inside that games folder
protocol.registerSchemesAsPrivileged([{ scheme: 'gamemap', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);

function registerGameProtocol() {
  protocol.handle('gamemap', async (request) => {
    try {
      const url = new URL(request.url);
      const root = paths.sourceDir(url.hostname);
      const file = path.normalize(path.join(root, decodeURIComponent(url.pathname)));
      if (!file.startsWith(root + path.sep)) return new Response('Forbidden', { status: 403 });
      if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return new Response('Not found', { status: 404 });
      return await net.fetch(pathToFileURL(file).toString());
    } catch {
      return new Response('Not found', { status: 404 });
    }
  });
}

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    title: 'Game Map Tracker',
    backgroundColor: '#0e1216',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isHttpUrl(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault());
  mainWindow.on('closed', () => { mainWindow = null; });
  return mainWindow;
}

function buildMenu() {
  const send = (action) => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('menu', action); };
  const template = [
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'Game library', accelerator: 'CmdOrCtrl+L', click: () => send('library') },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' }, { role: 'toggleDevTools' }, { type: 'separator' },
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        { label: 'Show game data folder', click: () => { fs.mkdirSync(paths.userGamesDir(), { recursive: true }); shell.openPath(paths.userGamesDir()); } },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---------- IPC ----------
ipcMain.handle('library:list', () => library.listGames());

let addController = null;
ipcMain.handle('library:add', async (event, input, opts) => {
  if (addController) throw new Error('A game is already being added — wait for it to finish or cancel it');
  addController = new AbortController();
  const sender = event.sender;
  const onProgress = (p) => { if (!sender.isDestroyed()) sender.send('library:progress', p); };
  const safeOpts = {
    tiles: !(opts && opts.tiles === false),
    media: !(opts && opts.media === false),
    maxZoom: opts && Number.isFinite(Number(opts.maxZoom)) ? Number(opts.maxZoom) : null,
  };
  try {
    return await library.addGame(String(input || ''), safeOpts, onProgress, addController.signal);
  } finally {
    addController = null;
  }
});
ipcMain.handle('library:cancel', () => { if (addController) addController.abort(); return true; });
ipcMain.handle('library:remove', (event, slug) => library.removeGame(paths.assertSlug(slug, 'game slug')));
ipcMain.handle('map:load', (event, source, gameSlug, mapSlug) => library.loadMap(String(source), gameSlug, mapSlug));

ipcMain.handle('progress:export', async (event, json, suggestedName) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: 'Export progress',
    defaultPath: String(suggestedName || 'progress.json').replace(/[^\w.-]+/g, '-'),
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (canceled || !filePath) return false;
  fs.writeFileSync(filePath, String(json));
  return true;
});

ipcMain.handle('progress:import', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: 'Import progress',
    filters: [{ name: 'JSON', extensions: ['json'] }],
    properties: ['openFile'],
  });
  if (canceled || !filePaths.length) return null;
  return fs.readFileSync(filePaths[0], 'utf8');
});

ipcMain.handle('shell:open-external', (event, url) => (isHttpUrl(url) ? shell.openExternal(url) : undefined));

app.whenReady().then(() => {
  registerGameProtocol();
  buildMenu();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
