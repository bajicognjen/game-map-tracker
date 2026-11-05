'use strict';
/**
 * The game library: lists installed games, adds a game from its map page (data, icons, tiles,
 * screenshots) and removes games. Used by the app's main process and by scripts/add-game.js.
 *
 * On disk:
 *   <games dir>/<game slug>/game.json                 title, maps, when it was added
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

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

function mapStatus(dir) {
  const manifest = readManifest(path.join(dir, 'tiles'));
  const mediaDir = path.join(dir, 'media');
  return {
    ready: fs.existsSync(path.join(dir, 'markers.json')),
    tiles: manifest && manifest.maxZoom ? { available: true, minZoom: manifest.minZoom, maxZoom: manifest.maxZoom } : { available: false },
    mediaCount: fs.existsSync(mediaDir) ? fs.readdirSync(mediaDir).length : 0,
  };
}

function listGames() {
  const games = [];
  for (const { source, dir } of paths.gamesDirs()) {
    if (!fs.existsSync(dir)) continue;
    for (const slug of fs.readdirSync(dir)) {
      if (!paths.SLUG_RE.test(slug) || games.some((g) => g.slug === slug)) continue; // user copy wins over bundled
      const file = path.join(dir, slug, 'game.json');
      if (!fs.existsSync(file)) continue;
      let game;
      try { game = readJson(file); } catch { continue; }
      const maps = (game.maps || []).map((m) => ({ ...m, ...mapStatus(path.join(dir, slug, 'maps', m.slug)) }));
      games.push({ source, slug, title: game.title || slug, sourceUrl: game.source, addedAt: game.addedAt, maps });
    }
  }
  return games.sort((a, b) => a.title.localeCompare(b.title));
}

function loadMap(source, gameSlug, mapSlug) {
  const gameDir = paths.gameDir(source, gameSlug);
  const dir = paths.mapDir(source, gameSlug, mapSlug);
  const game = readJson(path.join(gameDir, 'game.json'));
  const data = readJson(path.join(dir, 'markers.json'));
  const frames = readJson(path.join(gameDir, data.icons.frames));
  const manifest = readManifest(path.join(dir, 'tiles'));
  const mediaDir = path.join(dir, 'media');
  return {
    baseUrl: `gamemap://${source}/${gameSlug}`,
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
  return true;
}

async function downloadSprite(gameDir, gameSlug, page, signal) {
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

/**
 * Add (or refresh) a game.
 * @param {string} input   link to the game's map page (https://<site>/<game>)
 * @param {object} [opts]  { tiles: true, media: true, maps: null | ['slug'], maxZoom: null, dest: 'user' }
 * @param {(p: {stage:string, message:string, done?:number, total?:number}) => void} [onProgress]
 * @param {AbortSignal} [signal]
 */
async function addGame(input, opts = {}, onProgress = () => {}, signal) {
  const { tiles = true, media = true, maps = null, maxZoom = null, dest = 'user' } = opts;
  const { site, gameSlug, mapSlug } = source.parseGameUrl(input);
  const report = (stage, message, extra = {}) => onProgress({ stage, message, ...extra });

  let firstSlug = mapSlug;
  if (!firstSlug) {
    report('discover', `Looking up "${gameSlug}"…`);
    firstSlug = (await source.discoverMapSlugs(site, gameSlug, { signal }))[0];
    if (!firstSlug) throw new Error(`No maps found for "${gameSlug}" — check the link`);
  }

  report('scrape', `Reading map "${firstSlug}"…`);
  const first = await source.fetchMapPage(site, source.mapPageUrl(site, gameSlug, firstSlug), { signal });
  const gameTitle = (first.game && first.game.title) || cleanTitle(first.title) || gameSlug;
  let mapList = (first.mapData.maps && first.mapData.maps.length ? first.mapData.maps : [first.mapData.map])
    .map((m) => ({ id: m.id, slug: m.slug, title: m.title }));
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
    const dir = path.join(gameDir, 'maps', data.map.slug);
    fs.mkdirSync(dir, { recursive: true });
    built.push({ dir, data, meta: { id: data.map.id, slug: data.map.slug, title: data.map.title, markerCount: data.markers.length } });
    report('scrape', `${data.map.title}: ${data.markers.length} locations in ${data.categories.length} categories`);
  }

  report('sprite', 'Downloading marker icons…');
  const icons = await downloadSprite(gameDir, gameSlug, first, signal);
  for (const b of built) {
    b.data.icons = icons;
    fs.writeFileSync(path.join(b.dir, 'markers.json'), JSON.stringify(b.data));
  }
  const gameJson = { slug: gameSlug, title: gameTitle, source: `${site}/${gameSlug}`, addedAt: new Date().toISOString(), maps: built.map((b) => b.meta) };
  fs.writeFileSync(path.join(gameDir, 'game.json'), JSON.stringify(gameJson, null, 2));

  if (tiles) {
    for (const b of built) {
      report('tiles', `${b.meta.title}: downloading map tiles…`);
      await downloadTiles({
        dir: path.join(b.dir, 'tiles'), tiles: b.data.map.tiles, maxZoom, signal,
        onProgress: (p) => report('tiles', `${b.meta.title}: tiles, zoom ${p.zoom} — ${p.done}/${p.total}`, { done: p.done, total: p.total, zoom: p.zoom }),
      });
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
  report('done', `Added ${gameTitle}: ${built.length} map${built.length === 1 ? '' : 's'}, ${built.reduce((s, b) => s + b.meta.markerCount, 0)} locations`);
  return gameJson;
}

module.exports = { listGames, loadMap, addGame, removeGame };
