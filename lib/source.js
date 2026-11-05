'use strict';
/**
 * Reads map data from a game's interactive-map page using a hidden Electron window.
 *
 * The page fetches its marker list itself (/api/v1/maps/{id}/data) and that endpoint refuses
 * non-browser clients, so we let the real page do the work, block ads and trackers, and read
 * window.mapData once the locations have arrived. The site is whatever the pasted link points at;
 * nothing about it is hardcoded here.
 */
const { BrowserWindow, session } = require('electron');
const { sleep, throwIfAborted } = require('./net');

const SLUG = '[a-z0-9][a-z0-9_-]*';
// Third-party hosts the page needs for its own scripts (library CDNs). Anything else that is not
// the site itself (ads, analytics) is blocked, which makes the page settle much faster.
const LIBRARY_HOSTS = /(^|\.)(googleapis\.com|cloudflare\.com)$/i;

/** Accepts "https://<site>/<game>" or "https://<site>/<game>/maps/<map>". */
function parseGameUrl(input) {
  const m = String(input || '').trim().match(new RegExp(`^(https?://[^/?#]+)/(${SLUG})(?:/maps/(${SLUG}))?/?(?:[?#].*)?$`, 'i'));
  if (!m) throw new Error("Paste the full link to the game's map page, e.g. https://<site>/<game>");
  return { site: m[1].replace(/\/+$/, ''), gameSlug: m[2].toLowerCase(), mapSlug: m[3] ? m[3].toLowerCase() : null };
}

let allowedHost = null;
let filterInstalled = false;
function scraperSession(site) {
  allowedHost = new URL(site).hostname.replace(/^www\./, '').toLowerCase();
  const s = session.fromPartition('scraper'); // in-memory, separate from the app's own session
  if (!filterInstalled) {
    filterInstalled = true;
    s.setUserAgent(s.getUserAgent(), 'en-US,en'); // ask for English map data whatever the Windows languages are
    s.webRequest.onBeforeRequest((details, callback) => {
      let host = '';
      try { host = new URL(details.url).hostname.toLowerCase(); } catch { /* about:, data: */ }
      const ok = !host || host === allowedHost || host.endsWith(`.${allowedHost}`) || LIBRARY_HOSTS.test(host);
      callback({ cancel: !ok });
    });
  }
  return s;
}

async function withHiddenPage(site, signal, fn) {
  const win = new BrowserWindow({
    show: false,
    width: 1280,
    height: 800,
    webPreferences: {
      session: scraperSession(site),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  win.webContents.setAudioMuted(true);
  const onAbort = () => { if (!win.isDestroyed()) win.destroy(); };
  if (signal) signal.addEventListener('abort', onAbort);
  try {
    return await fn(win);
  } finally {
    if (signal) signal.removeEventListener('abort', onAbort);
    if (!win.isDestroyed()) win.destroy();
  }
}

/** Poll an expression in the page until it returns something truthy. */
async function waitFor(win, expression, { timeoutMs = 90000, intervalMs = 500, signal } = {}) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    throwIfAborted(signal);
    if (win.isDestroyed()) throw new Error('Cancelled');
    try {
      const value = await win.webContents.executeJavaScript(expression, true);
      if (value) return value;
    } catch { /* page not ready yet */ }
    await sleep(intervalMs);
  }
  throw new Error('The map page did not finish loading in time');
}

// Everything we need from a map page, once the page has merged the API response into mapData.
const MAP_PAGE_PROBE = `(() => {
  const md = window.mapData;
  if (!md || !md.map || !Array.isArray(md.locations)) return null;
  const resources = performance.getEntriesByType('resource').map((e) => e.name);
  if (!resources.some((n) => /\\/api\\/v1\\/maps\\/\\d+\\/data/.test(n))) return null;
  const spriteJson = (resources.find((n) => /\\/markers\\/markers(@2x)?\\.json/.test(n)) || '').replace(/\\?.*$/, '');
  const game = window.game || null;
  const og = document.querySelector('meta[property="og:image"]');
  // A logo-style image makes a cleaner card than the page's preview picture.
  const logos = [...document.images].filter((i) => /logo/i.test(i.src) && i.naturalWidth >= 128 && i.naturalWidth <= 1024).sort((a, b) => b.naturalWidth - a.naturalWidth);
  const touchIcon = document.querySelector('link[rel="apple-touch-icon"]');
  return JSON.stringify({
    mapData: md,
    game,
    cover: (og && og.content) || null,
    logo: (logos[0] && logos[0].src) || (touchIcon && touchIcon.href) || null,
    tilesCdnUrl: window.tilesCdnUrl || null,
    tilesBaseUrl: (game && game.config && game.config.tiles_base_url) || null,
    spriteBaseUrl: spriteJson ? spriteJson.replace(/markers(@2x)?\\.json$/, '') : null,
    title: document.title,
  });
})()`;

// When a page does not produce map data in time, say which stage it got stuck at.
async function explainTimeout(win, url) {
  let state = null;
  try {
    state = await win.webContents.executeJavaScript(`JSON.stringify({ ready: document.readyState, hasMapData: !!window.mapData, hasLocations: !!(window.mapData && Array.isArray(window.mapData.locations)), title: document.title })`, true);
    state = JSON.parse(state);
  } catch { /* the page never got far enough to run anything */ }
  if (!state) return `The page did not load (${url}) — check the internet connection and the link`;
  if (!state.hasMapData) return `${url} does not look like a game's map page (it has no map data) — paste the link of the interactive map itself`;
  if (!state.hasLocations) return 'The map page loaded but its locations never arrived — the site may be blocking automated loads or may have changed; try again later';
  return 'The map page did not finish loading in time';
}

async function fetchMapPage(site, url, { signal } = {}) {
  return withHiddenPage(site, signal, async (win) => {
    win.loadURL(url).catch(() => { /* cancelled ad requests can surface here; the probe decides */ });
    try {
      return JSON.parse(await waitFor(win, MAP_PAGE_PROBE, { signal }));
    } catch (err) {
      if (err.name === 'CancelledError' || err.message === 'Cancelled') throw err;
      throw new Error(await explainTimeout(win, url));
    }
  });
}

const LANDING_PROBE = `(() => {
  const links = [...document.querySelectorAll('a[href*="/maps/"]')].map((a) => a.href);
  const maps = window.mapData && window.mapData.maps;
  if (!links.length && !maps) return null;
  return JSON.stringify({ url: location.href, title: document.title, links: [...new Set(links)], maps: maps || null });
})()`;

/** Find the maps of a game from its landing page. Returns map slugs in page order. */
async function discoverMapSlugs(site, gameSlug, { signal } = {}) {
  const page = await withHiddenPage(site, signal, async (win) => {
    win.loadURL(`${site}/${gameSlug}`).catch(() => {});
    try {
      return JSON.parse(await waitFor(win, LANDING_PROBE, { signal, timeoutMs: 60000 }));
    } catch (err) {
      if (err.name === 'CancelledError' || err.message === 'Cancelled') throw err;
      throw new Error(`No maps were found at ${site}/${gameSlug} — check the link, or paste the link of one of the game's map pages (…/maps/…)`);
    }
  });
  const slugs = [];
  const re = new RegExp(`^https?://[^/]+/${gameSlug}/maps/(${SLUG})`, 'i');
  for (const link of page.links || []) {
    const m = link.match(re);
    if (m && !slugs.includes(m[1].toLowerCase())) slugs.push(m[1].toLowerCase());
  }
  for (const m of page.maps || []) if (m.slug && !slugs.includes(m.slug)) slugs.push(m.slug);
  return slugs;
}

function mapPageUrl(site, gameSlug, mapSlug) {
  return `${site}/${gameSlug}/maps/${mapSlug}`;
}

module.exports = { parseGameUrl, fetchMapPage, discoverMapSlugs, mapPageUrl };
