'use strict';
/**
 * Downloads a map's raster tiles into <dir>/{z}/{y}/{x}.<ext>.
 *
 * Blank (solid-colour) tiles are detected per zoom level: the most common byte-identical
 * small tile is treated as blank, not stored, and its four children are skipped at the next
 * zoom level, so only the drawn part of the map is fetched. One blank.<ext> is kept and the
 * app shows it wherever a tile is missing. manifest.json records progress, so the download
 * can be resumed or extended to a higher zoom later.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { fetchBuffer, runPool } = require('./net');

function removeEmptyDirs(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir)) {
    const p = path.join(dir, entry);
    if (fs.statSync(p).isDirectory()) {
      removeEmptyDirs(p);
      if (fs.readdirSync(p).length === 0) fs.rmdirSync(p);
    }
  }
}

function readManifest(dir) {
  const file = path.join(dir, 'manifest.json');
  if (!fs.existsSync(file)) return null;
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

/**
 * @param {object} o
 * @param {string} o.dir            output folder
 * @param {object} o.tiles          markers.json "map.tiles" block
 * @param {number} [o.maxZoom]      stop at this zoom (default: native max)
 * @param {number} [o.concurrency]
 * @param {(p: {zoom:number, done:number, total:number}) => void} [o.onProgress]
 * @param {AbortSignal} [o.signal]
 */
async function downloadTiles({ dir, tiles, maxZoom = null, concurrency = 6, onProgress = () => {}, signal }) {
  const ext = (tiles.pattern.match(/\.([a-z0-9]+)$/i) || [null, 'jpg'])[1];
  const top = Math.min(maxZoom || tiles.nativeMaxZoom, tiles.nativeMaxZoom);
  fs.mkdirSync(dir, { recursive: true });
  const manifestPath = path.join(dir, 'manifest.json');
  const blankPath = path.join(dir, `blank.${ext}`);
  const manifest = readManifest(dir) || { minZoom: tiles.minZoom, maxZoom: null, extension: ext, zooms: {} };
  const url = (z, y, x) => `${tiles.remoteBaseUrl}/${tiles.pattern.replace('{z}', z).replace('{y}', y).replace('{x}', x)}`;

  let parents = null; // non-blank [y, x] tiles of the previous zoom
  for (let z = tiles.minZoom; z <= top; z++) {
    if (manifest.zooms[z]) {
      parents = manifest.zooms[z].nonBlank;
      continue;
    }
    const todo = [];
    if (parents === null) {
      const scale = 2 ** (z - tiles.minZoom);
      for (let r = 0; r < tiles.rows * scale; r++) {
        for (let c = 0; c < tiles.cols * scale; c++) todo.push([tiles.origin.y * scale + r, tiles.origin.x * scale + c]);
      }
    } else {
      for (const [py, px] of parents) todo.push([py * 2, px * 2], [py * 2, px * 2 + 1], [py * 2 + 1, px * 2], [py * 2 + 1, px * 2 + 1]);
    }
    onProgress({ zoom: z, done: 0, total: todo.length });

    const results = [];
    let done = 0;
    await runPool(todo, concurrency, async ([y, x]) => {
      const file = path.join(dir, String(z), String(y), `${x}.${ext}`);
      let buf = null;
      if (fs.existsSync(file)) {
        buf = fs.readFileSync(file);
      } else {
        buf = await fetchBuffer(url(z, y, x), { signal });
        if (buf) {
          fs.mkdirSync(path.dirname(file), { recursive: true });
          fs.writeFileSync(file, buf);
        }
      }
      if (buf) results.push({ y, x, file, size: buf.length, md5: crypto.createHash('md5').update(buf).digest('hex') });
      done++;
      if (done % 25 === 0 || done === todo.length) onProgress({ zoom: z, done, total: todo.length });
    }, signal);

    // The most common byte-identical small tile at this zoom is the blank one.
    const counts = new Map();
    for (const r of results) if (r.size < 4096) counts.set(r.md5, (counts.get(r.md5) || 0) + 1);
    let blankMd5 = null;
    let best = 1;
    for (const [md5, n] of counts) if (n > best) { best = n; blankMd5 = md5; }

    const nonBlank = [];
    let blank = 0;
    for (const r of results) {
      if (blankMd5 && r.md5 === blankMd5) {
        if (!fs.existsSync(blankPath)) fs.copyFileSync(r.file, blankPath);
        fs.unlinkSync(r.file);
        blank++;
      } else {
        nonBlank.push([r.y, r.x]);
      }
    }
    removeEmptyDirs(path.join(dir, String(z)));
    manifest.zooms[z] = { fetched: results.length, blank, nonBlank };
    manifest.maxZoom = z;
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    parents = nonBlank;
  }
  return manifest;
}

module.exports = { downloadTiles, readManifest };
