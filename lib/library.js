'use strict';
/**
 * The game library: lists installed games, looks up and adds a game from its map page (data,
 * icons, tiles, screenshots) and removes games. Used by the app's main process and by
 * scripts/add-game.js.
 *
 * On disk:
 *   <games dir>/<game slug>/game.json                 title, source link, maps, import options
 *   <games dir>/<game slug>/markers/                  marker icon sprite (markers.json + png, @2x variants)
 *   <games dir>/<game slug>/maps/<map slug>/markers.json
 *   <games dir>/<game slug>/maps/<map slug>/tiles/    {z}/{y}/{x}.jpg + blank.jpg + manifest.json
 *   <games dir>/<game slug>/maps/<map slug>/media/    location screenshots
 */
const fs = require('fs');
const path = require('path');
const paths = require('./paths');
const source = require('./source');
const { buildMapData } = require('./build-markers');
const { downloadTiles, readManifest } = require('./tiles');
const { downloadMedia } = require('./media');
const { fetchBuffer } = require('./net');
const log = require('./log');

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

/** Total size of a folder in bytes (0 when missing). */
function dirSize(dir) {
  let total = 0;
  const walk = (d) => {
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile()) { try { total += fs.statSync(p).size; } catch { /* vanished */ } }
    }
  };
  walk(dir);
  return total;
}

// Walking every tile and screenshot on each library refresh is slow (thousands of files, slower
// still inside a packaged build), so sizes are cached per game and refreshed only when the
// downloaded files change (add, update, clean).
function computeSizes(gameDir, maps) {
  const sizes = { tiles: 0, media: 0 };
  for (const m of maps || []) {
    sizes.tiles += dirSize(path.join(gameDir, 'maps', m.slug, 'tiles'));
    sizes.media += dirSize(path.join(gameDir, 'maps', m.slug, 'media'));
  }
  try { fs.writeFileSync(path.join(gameDir, 'sizes.json'), JSON.stringify({ ...sizes, computedAt: new Date().toISOString() })); } catch { /* read-only bundled game */ }
  return sizes;
}
function cachedSizes(gameDir, maps) {
  try {
    const s = readJson(path.join(gameDir, 'sizes.json'));
    if (Number.isFinite(s.tiles) && Number.isFinite(s.media)) return { tiles: s.tiles, media: s.media };
  } catch { /* not computed yet */ }
  return computeSizes(gameDir, maps);
}

function mapStatus(dir) {
  const manifest = readManifest(path.join(dir, 'tiles'));
  const mediaDir = path.join(dir, 'media');
  return {
    ready: fs.existsSync(path.join(dir, 'markers.json')),
    tiles: manifest && manifest.maxZoom
      ? { available: true, minZoom: manifest.minZoom, maxZoom: manifest.maxZoom, nativeMaxZoom: manifest.nativeMaxZoom || null, bytes: Object.values(manifest.zooms || {}).reduce((s, v) => s + (v.bytes || 0), 0) }
      : { available: false },
    mediaCount: fs.existsSync(mediaDir) ? fs.readdirSync(mediaDir).length : 0,
  };
}

const MB = (bytes) => `${(bytes / 1048576).toFixed(bytes < 10485760 ? 1 : 0)} MB`;

/** Prefer a logo-style image for the card; fall back to the page's preview picture. */
async function downloadCover(gameDir, page, signal) {
  for (const [kind, url] of [['logo', page.logo], ['image', page.cover]]) {
    if (!url || !/^https?:\/\//i.test(url)) continue;
    const ext = (url.match(/\.(png|jpe?g|webp)(?:[?#]|$)/i) || [null, 'png'])[1].toLowerCase().replace('jpeg', 'jpg');
    try {
      const buf = await fetchBuffer(url, { signal });
      if (!buf || buf.length < 1000) continue;
      const file = `cover.${ext}`;
      for (const old of ['cover.png', 'cover.jpg', 'cover.webp']) if (old !== file) fs.rmSync(path.join(gameDir, old), { force: true });
      fs.writeFileSync(path.join(gameDir, file), buf);
      return { file, kind };
    } catch (err) {
      if (err.name === 'CancelledError') throw err;
    }
  }
  return null;
}

/** Compare a freshly built map against the one on disk. */
function diffMaps(prevFile, data) {
  if (!fs.existsSync(prevFile)) return null;
  try {
    const prev = new Map(readJson(prevFile).markers.map((m) => [m.id, m.title]));
    let added = 0;
    let renamed = 0;
    for (const m of data.markers) { if (!prev.has(m.id)) added++; else if (prev.get(m.id) !== m.title) renamed++; }
    const ids = new Set(data.markers.map((m) => m.id));
    let removed = 0;
    for (const id of prev.keys()) if (!ids.has(id)) removed++;
    return { added, removed, renamed };
  } catch { return null; }
}
const diffText = (d) => (d ? (d.added || d.removed || d.renamed ? `${d.added} new, ${d.removed} removed, ${d.renamed} renamed` : 'no changes') : 'first import');

function listGames() {
  const games = [];
  for (const { source: src, dir } of paths.gamesDirs()) {
    if (!fs.existsSync(dir)) continue;
    for (const slug of fs.readdirSync(dir)) {
      if (!paths.SLUG_RE.test(slug) || games.some((g) => g.slug === slug)) continue; // user copy wins over bundled
      const file = path.join(dir, slug, 'game.json');
      if (!fs.existsSync(file)) continue;
      let game;
      try { game = readJson(file); } catch { continue; }
      const maps = (game.maps || []).map((m) => ({ ...m, ...mapStatus(path.join(dir, slug, 'maps', m.slug)) }));
      const sizes = cachedSizes(path.join(dir, slug), maps);
      games.push({ source: src, slug, title: game.title || slug, sourceUrl: game.source, addedAt: game.addedAt, importOptions: game.importOptions || null, cover: game.cover || null, coverKind: game.coverKind || 'image', sizes, maps });
    }
  }
  return games.sort((a, b) => a.title.localeCompare(b.title));
}

function loadMap(src, gameSlug, mapSlug) {
  const gameDir = paths.gameDir(src, gameSlug);
  const dir = paths.mapDir(src, gameSlug, mapSlug);
  const game = readJson(path.join(gameDir, 'game.json'));
  const data = readJson(path.join(dir, 'markers.json'));
  const frames = readJson(path.join(gameDir, data.icons.frames));
  const manifest = readManifest(path.join(dir, 'tiles'));
  const mediaDir = path.join(dir, 'media');
  return {
    baseUrl: `gamemap://${src}/${gameSlug}`,
    game: {
      slug: gameSlug, title: game.title, sourceUrl: game.source,
      maps: (game.maps || []).map((m) => ({ ...m, ...mapStatus(path.join(gameDir, 'maps', m.slug)) })),
    },
    data,
    frames,
    tiles: manifest && manifest.maxZoom
      ? {
          available: true, minZoom: manifest.minZoom, maxZoom: manifest.maxZoom, extension: manifest.extension || 'jpg',
          nonBlank: Object.fromEntries(Object.entries(manifest.zooms).map(([z, v]) => [z, v.nonBlank || []])),
        }
      : { available: false },
    mediaFiles: fs.existsSync(mediaDir) ? fs.readdirSync(mediaDir) : [],
  };
}

function removeGame(gameSlug) {
  const dir = paths.gameDir('user', gameSlug);
  if (!fs.existsSync(path.join(dir, 'game.json'))) throw new Error(`"${gameSlug}" is not an installed game`);
  fs.rmSync(dir, { recursive: true, force: true });
  log.info('game removed', { game: gameSlug });
  return true;
}

/** Delete a game's downloaded tiles or screenshots to free space; data and progress stay. */
function cleanGame(gameSlug, what) {
  if (what !== 'tiles' && what !== 'media') throw new Error(`Nothing to clean called "${what}"`);
  const dir = paths.gameDir('user', gameSlug);
  const game = readJson(path.join(dir, 'game.json'));
  let freed = 0;
  for (const m of game.maps || []) {
    const target = path.join(dir, 'maps', m.slug, what);
    freed += dirSize(target);
    fs.rmSync(target, { recursive: true, force: true });
  }
  if (game.importOptions) {
    game.importOptions[what] = false;
    fs.writeFileSync(path.join(dir, 'game.json'), JSON.stringify(game, null, 2));
  }
  computeSizes(dir, game.maps);
  log.info('game cleaned', { game: gameSlug, what, freed });
  return { freed };
}

async function downloadSprite(gameDir, page, signal) {
  const dir = path.join(gameDir, 'markers');
  fs.mkdirSync(dir, { recursive: true });
  const base = page.spriteBaseUrl;
  if (!base) throw new Error('Could not find the marker icon sprite on the map page');
  const got = {};
  for (const file of ['markers.json', 'markers.png', 'markers@2x.json', 'markers@2x.png']) {
    try {
      const buf = await fetchBuffer(`${base}${file}`, { signal });
      if (buf) { fs.writeFileSync(path.join(dir, file), buf); got[file] = true; }
    } catch (err) {
      if (err.name === 'CancelledError') throw err;
    }
  }
  if (!got['markers.json'] || !(got['markers.png'] || got['markers@2x.png'])) throw new Error('Could not download the marker icon sprite');
  return got['markers@2x.png']
    ? { sheet: 'markers/markers@2x.png', sheetScale: 2, frames: 'markers/markers.json' }
    : { sheet: 'markers/markers.png', sheetScale: 1, frames: 'markers/markers.json' };
}

const cleanTitle = (t) => String(t || '').replace(/\s*\|[^|]*$/, '').replace(/\s*(Interactive\s+)?Map\s*$/i, '').trim();

// The first map page is fetched during lookup; keep it briefly so adding right after does not fetch it again.
let cachedFirstPage = null;
const CACHE_MS = 10 * 60 * 1000;

async function fetchFirstPage(site, gameSlug, mapSlug, report, signal) {
  const key = `${site}/${gameSlug}`;
  if (cachedFirstPage && cachedFirstPage.key === key && Date.now() - cachedFirstPage.at < CACHE_MS) return cachedFirstPage.page;
  let firstSlug = mapSlug;
  if (!firstSlug) {
    report('discover', `Looking up "${gameSlug}"…`);
    firstSlug = (await source.discoverMapSlugs(site, gameSlug, { signal }))[0];
    if (!firstSlug) throw new Error(`No maps found for "${gameSlug}" — check the link`);
  }
  report('scrape', `Reading map "${firstSlug}"…`);
  const page = await source.fetchMapPage(site, source.mapPageUrl(site, gameSlug, firstSlug), { signal });
  cachedFirstPage = { key, page, at: Date.now() };
  return page;
}

const mapsOf = (page) => (page.mapData.maps && page.mapData.maps.length ? page.mapData.maps : [page.mapData.map])
  .map((m) => ({ id: m.id, slug: m.slug, title: m.title }));
const titleOf = (page, gameSlug) => (page.game && page.game.title) || cleanTitle(page.title) || gameSlug;

/** Find out what a link offers before adding: the game's title and its maps. */
async function lookupGame(input, onProgress = () => {}, signal) {
  const { site, gameSlug, mapSlug } = source.parseGameUrl(input);
  const report = (stage, message) => onProgress({ stage, message });
  const page = await fetchFirstPage(site, gameSlug, mapSlug, report, signal);
  const installed = fs.existsSync(path.join(paths.gameDir('user', gameSlug), 'game.json'));
  return { input, site, gameSlug, title: titleOf(page, gameSlug), maps: mapsOf(page), installed };
}

/**
 * Add (or refresh) a game.
 * @param {string} input   link to the game's map page (https://<site>/<game>)
 * @param {object} [opts]  { tiles: true, media: true, maps: null | ['slug'], zoomOffset: 0, dest: 'user', shouldStop }
 *                         zoomOffset: how many zoom levels below full detail to stop tile downloads at
 *                         shouldStop: () => boolean, polled between zoom levels to end tile downloads early
 * @param {(p: {stage:string, message:string, done?:number, total?:number}) => void} [onProgress]
 * @param {AbortSignal} [signal]
 */
async function addGame(input, opts = {}, onProgress = () => {}, signal) {
  const started = Date.now();
  try {
    const result = await addGameInner(input, opts, onProgress, signal);
    log.info('game added', { input, maps: result.maps.length, seconds: Math.round((Date.now() - started) / 1000) });
    return result;
  } catch (err) {
    if (err.name === 'CancelledError' || err.message === 'Cancelled') log.info('add cancelled', { input });
    else log.error('add failed', { input, message: err.message, stack: err.stack });
    throw err;
  }
}

async function addGameInner(input, opts, onProgress, signal) {
  const { tiles = true, media = true, maps = null, zoomOffset = 0, dest = 'user', shouldStop = () => false } = opts;
  const { site, gameSlug, mapSlug } = source.parseGameUrl(input);
  const report = (stage, message, extra = {}) => onProgress({ stage, message, ...extra });

  const first = await fetchFirstPage(site, gameSlug, mapSlug, report, signal);
  const gameTitle = titleOf(first, gameSlug);
  let mapList = mapsOf(first);
  if (maps && maps.length) mapList = mapList.filter((m) => maps.includes(m.slug));
  if (!mapList.length) throw new Error('None of the requested maps exist for this game');

  const gameDir = paths.gameDir(dest, gameSlug);
  fs.mkdirSync(gameDir, { recursive: true });
  const built = [];
  for (const m of mapList) {
    let page = first;
    if (m.slug !== first.mapData.map.slug) {
      report('scrape', `Reading map "${m.title}"…`);
      page = await source.fetchMapPage(site, source.mapPageUrl(site, gameSlug, m.slug), { signal });
    }
    const data = buildMapData(page, { gameSlug, gameTitle, pageUrl: source.mapPageUrl(site, gameSlug, m.slug) });
    if (!data.markers.length) {
      report('scrape', `${data.map.title}: no locations, skipped`);
      continue;
    }
    const dir = path.join(gameDir, 'maps', data.map.slug);
    fs.mkdirSync(dir, { recursive: true });
    built.push({ dir, data, meta: { id: data.map.id, slug: data.map.slug, title: data.map.title, markerCount: data.markers.length, nativeMaxZoom: data.map.tiles.nativeMaxZoom } });
    const diff = diffMaps(path.join(dir, 'markers.json'), data);
    report('scrape', `${data.map.title}: ${data.markers.length} locations in ${data.categories.length} categories${diff ? ` — ${diffText(diff)}` : ''}`);
  }
  if (!built.length) throw new Error('This game has no locations on any of its maps');

  report('sprite', 'Downloading marker icons…');
  const icons = await downloadSprite(gameDir, first, signal);
  for (const b of built) {
    b.data.icons = icons;
    fs.writeFileSync(path.join(b.dir, 'markers.json'), JSON.stringify(b.data));
  }
  report('sprite', 'Downloading the cover image…');
  const cover = await downloadCover(gameDir, first, signal);
  const gameJson = {
    slug: gameSlug,
    title: gameTitle,
    source: `${site}/${gameSlug}`,
    cover: cover ? cover.file : null,
    coverKind: cover ? cover.kind : null,
    addedAt: new Date().toISOString(),
    importOptions: { tiles, media, zoomOffset, maps: built.map((b) => b.meta.slug) },
    maps: built.map((b) => b.meta),
  };
  fs.writeFileSync(path.join(gameDir, 'game.json'), JSON.stringify(gameJson, null, 2));

  if (tiles) {
    for (const b of built) {
      const t = b.data.map.tiles;
      const maxZoom = Math.max(t.minZoom, t.nativeMaxZoom - Math.max(0, Number(zoomOffset) || 0));
      report('tiles', `${b.meta.title}: downloading map tiles…`);
      let sizeNote = '';
      await downloadTiles({
        dir: path.join(b.dir, 'tiles'), tiles: t, maxZoom, signal, shouldStop,
        onProgress: (p) => {
          if (p.levelDone) {
            sizeNote = ` · ${MB(p.downloadedBytes)} so far` + (p.zoom < maxZoom && p.remainingBytes > 0 ? `, about ${MB(p.remainingBytes)} more to zoom ${maxZoom}` : '');
            return;
          }
          report('tiles', `${b.meta.title}: tiles, zoom ${p.zoom} of ${t.nativeMaxZoom} — ${p.done}/${p.total}${sizeNote}`, { done: p.done, total: p.total, zoom: p.zoom, canStop: p.zoom > t.minZoom });
        },
      });
      if (shouldStop()) report('tiles', `${b.meta.title}: stopped early — the map works at the detail downloaded so far`);
    }
  }
  if (media) {
    for (const b of built) {
      report('media', `${b.meta.title}: downloading screenshots…`);
      await downloadMedia({
        dir: path.join(b.dir, 'media'), markers: b.data.markers, signal,
        onProgress: (p) => report('media', `${b.meta.title}: screenshots ${p.done}/${p.total} (${(p.bytes / 1048576).toFixed(1)} MB)`, { done: p.done, total: p.total }),
      });
    }
  }
  computeSizes(gameDir, gameJson.maps);
  report('done', `Added ${gameTitle}: ${built.length} map${built.length === 1 ? '' : 's'}, ${built.reduce((s, b) => s + b.meta.markerCount, 0)} locations`);
  return gameJson;
}

/**
 * Re-read one installed game's map data from its site (no tiles, no screenshots) and report
 * what changed per map. Keeps the import options, icons and downloaded files as they are.
 */
async function refreshGameData(gameSlug, onProgress = () => {}, signal) {
  const gameDir = paths.gameDir('user', gameSlug);
  const game = readJson(path.join(gameDir, 'game.json'));
  const { site } = source.parseGameUrl(game.source);
  const report = (message, extra = {}) => onProgress({ stage: 'refresh', message, ...extra });
  const results = [];
  for (const m of game.maps || []) {
    report(`${game.title}: reading "${m.title}"…`);
    const page = await source.fetchMapPage(site, source.mapPageUrl(site, gameSlug, m.slug), { signal });
    const data = buildMapData(page, { gameSlug, gameTitle: game.title, pageUrl: source.mapPageUrl(site, gameSlug, m.slug) });
    const file = path.join(gameDir, 'maps', m.slug, 'markers.json');
    const diff = diffMaps(file, data) || { added: data.markers.length, removed: 0, renamed: 0 };
    try { data.icons = readJson(file).icons || data.icons; } catch { /* keep new */ }
    fs.writeFileSync(file, JSON.stringify(data));
    m.markerCount = data.markers.length;
    m.nativeMaxZoom = data.map.tiles.nativeMaxZoom;
    results.push({ slug: m.slug, title: m.title, total: data.markers.length, ...diff });
    report(`${game.title} · ${m.title}: ${diffText(diff)}`);
  }
  game.refreshedAt = new Date().toISOString();
  fs.writeFileSync(path.join(gameDir, 'game.json'), JSON.stringify(game, null, 2));
  log.info('game data refreshed', { game: gameSlug, results });
  return { slug: gameSlug, title: game.title, maps: results };
}

/** Refresh every installed game's data; returns one entry per game (errors included, not thrown). */
async function refreshAllGames(onProgress = () => {}, signal) {
  const out = [];
  for (const g of listGames()) {
    if (g.source !== 'user') continue;
    try {
      out.push(await refreshGameData(g.slug, onProgress, signal));
    } catch (err) {
      if (err.name === 'CancelledError' || err.message === 'Cancelled') throw err;
      log.error('refresh failed', { game: g.slug, message: err.message });
      out.push({ slug: g.slug, title: g.title, error: err.message, maps: [] });
      onProgress({ stage: 'refresh', message: `${g.title}: ${err.message}` });
    }
  }
  onProgress({ stage: 'done', message: `Checked ${out.length} game${out.length === 1 ? '' : 's'}` });
  return out;
}

module.exports = { listGames, loadMap, lookupGame, addGame, removeGame, cleanGame, dirSize, refreshGameData, refreshAllGames };
