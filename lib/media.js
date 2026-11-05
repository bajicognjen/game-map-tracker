'use strict';
/** Downloads the location screenshots referenced by a map's markers into <dir>. */
const fs = require('fs');
const path = require('path');
const { fetchBuffer, runPool } = require('./net');

const SAFE_NAME = /^[\w.-]+$/;

function mediaItems(markers) {
  const seen = new Set();
  const items = [];
  for (const m of markers) {
    for (const media of m.media || []) {
      const file = path.basename(String(media.file || ''));
      if (!file || !SAFE_NAME.test(file) || seen.has(file)) continue;
      seen.add(file);
      items.push({ file, url: media.url });
    }
  }
  return items;
}

async function downloadMedia({ dir, markers, concurrency = 4, onProgress = () => {}, signal }) {
  const items = mediaItems(markers);
  fs.mkdirSync(dir, { recursive: true });
  let done = 0;
  let bytes = 0;
  let failed = 0;
  onProgress({ done, total: items.length, bytes });
  await runPool(items, concurrency, async (item) => {
    const file = path.join(dir, item.file);
    if (!fs.existsSync(file)) {
      try {
        const buf = await fetchBuffer(item.url, { signal });
        if (buf) { fs.writeFileSync(file, buf); bytes += buf.length; } else failed++;
      } catch (err) {
        if (err.name === 'CancelledError') throw err;
        failed++;
      }
    }
    done++;
    if (done % 10 === 0 || done === items.length) onProgress({ done, total: items.length, bytes });
  }, signal);
  return { total: items.length, bytes, failed };
}

module.exports = { downloadMedia, mediaItems };
