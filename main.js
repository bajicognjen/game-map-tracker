'use strict';
/**
 * Electron main process: window, menu, the gamemap:// protocol that serves game assets from
 * the user-data folder, the IPC the sandboxed renderer uses, and update checks.
 */
const { app, BrowserWindow, Menu, dialog, ipcMain, shell, protocol, net } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const paths = require('./lib/paths'); // sets the app name (user-data folder) — keep it first
const library = require('./lib/library');
const pkg = require('./package.json');

const isHttpUrl = (url) => typeof url === 'string' && /^https?:\/\//i.test(url);
const repoUrl = (() => {
  const m = String(pkg.repository || '').match(/([\w.-]+)\/([\w.-]+?)(?:\.git)?$/);
  return m ? `https://github.com/${m[1]}/${m[2]}` : null;
})();

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
const send = (channel, payload) => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload); };

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

// ---------- updates ----------
// Windows (installer) and Linux (AppImage) can replace themselves. macOS refuses to update an
// unsigned app and the portable Windows build has nothing to install into, so those only get told.
const { autoUpdater } = require('electron-updater');
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;
autoUpdater.logger = null;
if (!app.isPackaged && process.env.GMT_DEV_UPDATE) autoUpdater.forceDevUpdateConfig = true;

function updateMode() {
  if (!app.isPackaged && !process.env.GMT_DEV_UPDATE) return 'disabled';
  if (process.platform === 'darwin' || process.env.PORTABLE_EXECUTABLE_FILE) return 'notify';
  return 'auto';
}
let manualCheck = false;
const updateStatus = (status, extra = {}) => send('update:status', { status, mode: updateMode(), manual: manualCheck, current: app.getVersion(), releasesUrl: repoUrl ? `${repoUrl}/releases` : null, ...extra });
autoUpdater.on('update-available', (info) => updateStatus('available', { version: info.version }));
autoUpdater.on('update-not-available', () => updateStatus('none'));
autoUpdater.on('download-progress', (p) => updateStatus('downloading', { percent: Math.round(p.percent) }));
autoUpdater.on('update-downloaded', (info) => updateStatus('downloaded', { version: info.version }));
autoUpdater.on('error', (err) => updateStatus('error', { message: String((err && err.message) || err).split('\n')[0] }));

function checkForUpdates(manual) {
  if (updateMode() === 'disabled') { if (manual) updateStatus('disabled'); return; }
  manualCheck = !!manual;
  autoUpdater.checkForUpdates().catch(() => { /* reported through the error event */ });
}

function buildMenu() {
  const template = [
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'Game library', accelerator: 'CmdOrCtrl+L', click: () => send('menu', 'library') },
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
        { label: 'Check for updates…', click: () => checkForUpdates(true) },
        { label: 'Show game data folder', click: () => { fs.mkdirSync(paths.userGamesDir(), { recursive: true }); shell.openPath(paths.userGamesDir()); } },
        { label: 'Show progress backups folder', click: () => { fs.mkdirSync(paths.backupsDir(), { recursive: true }); shell.openPath(paths.backupsDir()); } },
        ...(repoUrl ? [{ label: 'Project page', click: () => shell.openExternal(repoUrl) }] : []),
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---------- IPC ----------
ipcMain.handle('app:info', () => ({ version: app.getVersion(), updateMode: updateMode(), releasesUrl: repoUrl ? `${repoUrl}/releases` : null }));
ipcMain.handle('library:list', () => library.listGames());

let jobController = null; // one lookup or add at a time
async function runJob(event, fn) {
  if (jobController) throw new Error('Another download is running — wait for it to finish or cancel it');
  jobController = new AbortController();
  const sender = event.sender;
  const onProgress = (p) => { if (!sender.isDestroyed()) sender.send('library:progress', p); };
  try {
    return await fn(onProgress, jobController.signal);
  } finally {
    jobController = null;
  }
}
const cleanOpts = (opts) => ({
  tiles: !(opts && opts.tiles === false),
  media: !(opts && opts.media === false),
  maps: opts && Array.isArray(opts.maps) ? opts.maps.filter((s) => paths.SLUG_RE.test(String(s))) : null,
  zoomOffset: opts && Number.isFinite(Number(opts.zoomOffset)) ? Math.max(0, Math.min(4, Number(opts.zoomOffset))) : 0,
});
ipcMain.handle('library:lookup', (event, input) => runJob(event, (onProgress, signal) => library.lookupGame(String(input || ''), onProgress, signal)));
ipcMain.handle('library:add', (event, input, opts) => runJob(event, (onProgress, signal) => library.addGame(String(input || ''), cleanOpts(opts), onProgress, signal)));
ipcMain.handle('library:cancel', () => { if (jobController) jobController.abort(); return true; });
ipcMain.handle('library:remove', (event, slug) => library.removeGame(paths.assertSlug(slug, 'game slug')));
ipcMain.handle('map:load', (event, src, gameSlug, mapSlug) => library.loadMap(String(src), gameSlug, mapSlug));

// Progress backups: a JSON copy of each map's collected/notes/custom markers next to the games,
// written by the renderer after every change, restored when the in-app database is empty.
const backupFile = (gameSlug, mapSlug) => path.join(paths.backupsDir(), paths.assertSlug(gameSlug, 'game slug'), `${paths.assertSlug(mapSlug, 'map slug')}.json`);
ipcMain.handle('backup:write', (event, gameSlug, mapSlug, json) => {
  const file = backupFile(gameSlug, mapSlug);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, String(json));
  return true;
});
ipcMain.handle('backup:read', (event, gameSlug, mapSlug) => {
  const file = backupFile(gameSlug, mapSlug);
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
});

ipcMain.handle('update:check', () => { checkForUpdates(true); return true; });
ipcMain.handle('update:download', () => { autoUpdater.downloadUpdate().catch(() => {}); return true; });
ipcMain.handle('update:install', () => { autoUpdater.quitAndInstall(); return true; });

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
  setTimeout(() => checkForUpdates(false), 4000);
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
