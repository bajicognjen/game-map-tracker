'use strict';
// Small download helpers shared by the tile and media downloaders (Node 18+ fetch).

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class CancelledError extends Error {
  constructor() { super('Cancelled'); this.name = 'CancelledError'; }
}

function throwIfAborted(signal) {
  if (signal && signal.aborted) throw new CancelledError();
}

/** GET a URL as a Buffer with retries. Returns null on 404. */
async function fetchBuffer(url, { signal, attempts = 4 } = {}) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    throwIfAborted(signal);
    try {
      const res = await fetch(url, { signal });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (err) {
      throwIfAborted(signal);
      if (attempt === attempts) throw err;
      await sleep(750 * attempt);
    }
  }
  return null;
}

/** Run `worker(item)` over `items` with a fixed number of parallel lanes. */
async function runPool(items, concurrency, worker, signal) {
  let next = 0;
  const lanes = Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, async () => {
    while (next < items.length) {
      throwIfAborted(signal);
      await worker(items[next++]);
    }
  });
  await Promise.all(lanes);
}

module.exports = { sleep, fetchBuffer, runPool, throwIfAborted, CancelledError };
