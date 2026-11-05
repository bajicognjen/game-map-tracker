'use strict';
/** User settings in <userData>/settings.json: custom folders for game data and progress backups. */
const { app } = require('electron');
const fs = require('fs');
const path = require('path');

const file = () => path.join(app.getPath('userData'), 'settings.json');
let cache = null;

function load() {
  if (cache) return cache;
  try { cache = JSON.parse(fs.readFileSync(file(), 'utf8')); } catch { cache = {}; }
  if (!cache || typeof cache !== 'object') cache = {};
  return cache;
}
function get() { return { ...load() }; }
function set(partial) {
  const next = { ...load(), ...partial };
  for (const k of Object.keys(next)) if (next[k] === null || next[k] === undefined || next[k] === '') delete next[k];
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  fs.writeFileSync(file(), JSON.stringify(next, null, 2));
  cache = next;
  return get();
}

module.exports = { load, get, set };
