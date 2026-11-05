'use strict';
/**
 * Where game data lives. Games added by the user go to the Electron user-data folder
 * (e.g. ~/.config/game-map-tracker/games/<slug>/) so they survive app updates and work
 * from a packaged, read-only build. A games/ folder next to the app is also scanned,
 * for games you want to ship inside a build.
 */
const { app } = require('electron');
const path = require('path');

const APP_NAME = 'game-map-tracker';
// Same user-data folder no matter how the app was started (npm start, packaged, CLI script).
app.setName(APP_NAME);
// GMT_USER_DATA moves everything (games, progress, backups) elsewhere; the end-to-end test uses it.
if (process.env.GMT_USER_DATA) {
  app.setPath('userData', process.env.GMT_USER_DATA);
  app.setPath('sessionData', process.env.GMT_USER_DATA);
}

const BUNDLED_GAMES_DIR = path.join(__dirname, '..', 'games');
const SLUG_RE = /^[a-z0-9][a-z0-9_-]*$/i;

function userGamesDir() {
  return path.join(app.getPath('userData'), 'games');
}

function backupsDir() {
  return path.join(app.getPath('userData'), 'backups');
}

function gamesDirs() {
  return [
    { source: 'user', dir: userGamesDir() },
    { source: 'bundled', dir: BUNDLED_GAMES_DIR },
  ];
}

function assertSlug(value, what = 'slug') {
  if (typeof value !== 'string' || !SLUG_RE.test(value)) throw new Error(`Invalid ${what}: ${value}`);
  return value;
}

function sourceDir(source) {
  const entry = gamesDirs().find((d) => d.source === source);
  if (!entry) throw new Error(`Unknown game source: ${source}`);
  return entry.dir;
}

function gameDir(source, gameSlug) {
  return path.join(sourceDir(source), assertSlug(gameSlug, 'game slug'));
}

function mapDir(source, gameSlug, mapSlug) {
  return path.join(gameDir(source, gameSlug), 'maps', assertSlug(mapSlug, 'map slug'));
}

module.exports = { APP_NAME, BUNDLED_GAMES_DIR, SLUG_RE, userGamesDir, backupsDir, gamesDirs, sourceDir, gameDir, mapDir, assertSlug };
