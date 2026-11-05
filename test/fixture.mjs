/**
 * Builds a tiny self-contained game in a folder, so the app can be exercised without a network:
 * one map, five markers in two categories, one region, a two-level tile pyramid and an icon sprite.
 * Images are written with a minimal PNG encoder (no dependencies).
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
/** RGBA PNG from a pixel function (x, y) => [r, g, b, a]. */
export function png(width, height, pixel) {
  const stride = width * 4 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = pixel(x, y);
      const o = y * stride + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

export const FIXTURE = {
  gameSlug: 'test-game', gameTitle: 'Test Game', mapSlug: 'alpha', mapTitle: 'Alpha', mapId: 999001,
  markers: [
    { id: 1, categoryId: 101, regionId: 7, title: 'Chest one', description: 'Behind the **waterfall**', x: 100, y: 100 },
    { id: 2, categoryId: 101, regionId: 7, title: 'Chest two', description: null, x: 120, y: 110 },
    { id: 3, categoryId: 102, regionId: 7, title: 'Key of the north', description: 'Opens [Chest one](https://example.test/x?locationIds=1)', x: 300, y: 200 },
    { id: 4, categoryId: 102, regionId: null, title: 'Key of the south', description: null, x: 400, y: 400 },
    { id: 5, categoryId: 101, regionId: null, title: 'Chest three', description: null, x: 256, y: 300 },
  ],
};

/** Writes the fixture game under <userData>/games and returns its folder. */
export function writeFixture(userData) {
  const F = FIXTURE;
  const gameDir = path.join(userData, 'games', F.gameSlug);
  const mapDir = path.join(gameDir, 'maps', F.mapSlug);
  const tilesDir = path.join(mapDir, 'tiles');
  fs.mkdirSync(path.join(gameDir, 'markers'), { recursive: true });
  fs.mkdirSync(tilesDir, { recursive: true });

  // icon sprite: two 33x44 frames, red and blue
  fs.writeFileSync(path.join(gameDir, 'markers', 'markers.png'), png(66, 44, (x) => (x < 33 ? [200, 60, 60, 255] : [60, 100, 220, 255])));
  fs.writeFileSync(path.join(gameDir, 'markers', 'markers.json'), JSON.stringify({
    chest: { width: 33, height: 44, x: 0, y: 0, pixelRatio: 1 },
    key: { width: 33, height: 44, x: 33, y: 0, pixelRatio: 1 },
  }));

  // tiles: zoom 8 = one tile covering the 512x512 map, zoom 9 = four tiles; a gradient so they are not "blank"
  const tile = (z, ty, tx) => {
    const span = 512 / 2 ** (z - 8);
    return png(256, 256, (x, y) => {
      const gx = (tx * span + (x / 256) * span) / 512;
      const gy = (ty * span + (y / 256) * span) / 512;
      return [Math.round(40 + 120 * gx), Math.round(60 + 100 * gy), 90, 255];
    });
  };
  fs.mkdirSync(path.join(tilesDir, '8', '0'), { recursive: true });
  fs.writeFileSync(path.join(tilesDir, '8', '0', '0.png'), tile(8, 0, 0));
  for (const [ty, tx] of [[0, 0], [0, 1], [1, 0], [1, 1]]) {
    fs.mkdirSync(path.join(tilesDir, '9', String(ty)), { recursive: true });
    fs.writeFileSync(path.join(tilesDir, '9', String(ty), `${tx}.png`), tile(9, ty, tx));
  }
  fs.writeFileSync(path.join(tilesDir, 'blank.png'), png(256, 256, () => [20, 20, 24, 255]));
  fs.writeFileSync(path.join(tilesDir, 'manifest.json'), JSON.stringify({
    minZoom: 8, maxZoom: 9, extension: 'png',
    zooms: { 8: { fetched: 1, blank: 0, nonBlank: [[0, 0]] }, 9: { fetched: 4, blank: 0, nonBlank: [[0, 0], [0, 1], [1, 0], [1, 1]] } },
  }));

  const markers = F.markers.map((m) => ({ ...m, lat: 0, lng: 0, media: [] }));
  fs.writeFileSync(path.join(mapDir, 'markers.json'), JSON.stringify({
    game: { slug: F.gameSlug, title: F.gameTitle },
    map: {
      id: F.mapId, title: F.mapTitle, slug: F.mapSlug, source: 'http://localhost/test-game/maps/alpha', scrapedAt: new Date().toISOString(),
      width: 512, height: 512,
      tiles: { remoteBaseUrl: 'https://tiles.invalid/t', pattern: '{z}/{y}/{x}.png', tileSize: 256, minZoom: 8, maxZoom: 9, nativeMaxZoom: 9, origin: { x: 0, y: 0 }, cols: 1, rows: 1 },
      start: { x: 256, y: 256, zoom: 8 },
    },
    icons: { sheet: 'markers/markers.png', sheetScale: 1, frames: 'markers/markers.json' },
    groups: [{ id: 1, title: 'Items', color: '#A83148', order: 1 }],
    categories: [
      { id: 101, groupId: 1, title: 'Chest', icon: 'chest', info: 'Loot', template: null, premium: false, count: 3 },
      { id: 102, groupId: 1, title: 'Key', icon: 'key', info: 'Opens things', template: null, premium: false, count: 2 },
    ],
    regions: [{ id: 7, title: 'North', polygons: [[[0, 0], [512, 0], [512, 256], [0, 256]]], center: { x: 256, y: 128 } }],
    markers,
  }));
  fs.writeFileSync(path.join(gameDir, 'game.json'), JSON.stringify({
    slug: F.gameSlug, title: F.gameTitle, source: 'http://localhost/test-game', addedAt: new Date().toISOString(),
    importOptions: { tiles: true, media: false, zoomOffset: 0, maps: [F.mapSlug] },
    maps: [{ id: F.mapId, slug: F.mapSlug, title: F.mapTitle, markerCount: F.markers.length }],
  }, null, 2));
  return gameDir;
}
