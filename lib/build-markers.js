'use strict';
/**
 * Converts a scraped map page into the compact markers.json the app uses.
 *
 * The site serves every map as Web-Mercator raster tiles inside a tiny lat/lng square near
 * (0, 0). We work out which tiles of the lowest zoom level cover the map, then express every
 * marker in flat pixel coordinates of the full-resolution (native max zoom) image, with
 * (0, 0) at the top-left tile corner. Leaflet then runs in that flat space.
 */
const DEFAULT_BOUNDS = [-1.40625, 0, 0, 1.40625]; // [west, south, east, north]
const TILE_SIZE = 256;

function mercatorTile(lat, lng, zoom) {
  const n = 2 ** zoom;
  const phi = (Number(lat) * Math.PI) / 180;
  return {
    x: ((Number(lng) + 180) / 360) * n,
    y: ((1 - Math.log(Math.tan(phi) + 1 / Math.cos(phi)) / Math.PI) / 2) * n,
  };
}

const isBounds = (b) => Array.isArray(b) && b.length === 4 && b.every((v) => Number.isFinite(Number(v)));

/** Area centroid of a simple polygon ring (falls back to the vertex average for degenerate rings). */
function ringCentroid(ring) {
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[(i + 1) % ring.length];
    const cross = x0 * y1 - x1 * y0;
    area += cross;
    cx += (x0 + x1) * cross;
    cy += (y0 + y1) * cross;
  }
  if (Math.abs(area) < 1e-6) {
    return { x: Math.round(ring.reduce((s, p) => s + p[0], 0) / ring.length), y: Math.round(ring.reduce((s, p) => s + p[1], 0) / ring.length) };
  }
  return { x: Math.round(cx / (3 * area)), y: Math.round(cy / (3 * area)) };
}

function buildMapData(page, { gameSlug, gameTitle, pageUrl }) {
  const md = page.mapData;
  const cfg = md.mapConfig || {};
  const tileSet = [...(cfg.tile_sets || [])].sort((a, b) => (a.order || 0) - (b.order || 0))[0];
  if (!tileSet) throw new Error(`Map "${md.map && md.map.title}" has no tile set`);

  const minZoom = Number(tileSet.min_zoom);
  const nativeMaxZoom = Number(tileSet.tiles_max_zoom || tileSet.max_zoom);
  const maxZoom = cfg.overzoom ? Math.max(Number(tileSet.max_zoom) || nativeMaxZoom, nativeMaxZoom) : nativeMaxZoom;

  // "<game>/<map>/default-v2/{z}/{y}/{x}.jpg" -> prefix + "{z}/{y}/{x}.jpg"
  const fullPattern = String(tileSet.pattern || `${tileSet.path}/{z}/{y}/{x}.${tileSet.extension || 'jpg'}`);
  const zAt = fullPattern.indexOf('{z}');
  const prefix = (zAt > 0 ? fullPattern.slice(0, zAt) : `${tileSet.path}/`).replace(/\/+$/, '');
  const pattern = zAt >= 0 ? fullPattern.slice(zAt) : `{z}/{y}/{x}.${tileSet.extension || 'jpg'}`;
  const cdnBase = page.tilesCdnUrl || (page.tilesBaseUrl ? `${String(page.tilesBaseUrl).replace(/\/+$/, '')}/games/` : null);
  if (!cdnBase) throw new Error('The map page did not expose its tile server address');
  const remoteBaseUrl = `${String(cdnBase).replace(/\/+$/, '')}/${prefix}`;

  // Which tiles at minZoom cover the map: from the declared bounds, widened by any marker outside them.
  const bounds = (md.styles && md.styles.mapStyle && isBounds(md.styles.mapStyle.bounds) && md.styles.mapStyle.bounds)
    || (isBounds(tileSet.bounds) && tileSet.bounds)
    || DEFAULT_BOUNDS;
  const eps = 1e-9;
  const nw = mercatorTile(Number(bounds[3]) - eps, Number(bounds[0]) + eps, minZoom);
  const se = mercatorTile(Number(bounds[1]) + eps, Number(bounds[2]) - eps, minZoom);
  let x0 = Math.floor(Math.min(nw.x, se.x));
  let x1 = Math.floor(Math.max(nw.x, se.x));
  let y0 = Math.floor(Math.min(nw.y, se.y));
  let y1 = Math.floor(Math.max(nw.y, se.y));
  const locations = md.locations || [];
  for (const l of locations) {
    const t = mercatorTile(l.latitude, l.longitude, minZoom);
    if (!Number.isFinite(t.x) || !Number.isFinite(t.y)) continue;
    x0 = Math.min(x0, Math.floor(t.x)); x1 = Math.max(x1, Math.floor(t.x));
    y0 = Math.min(y0, Math.floor(t.y)); y1 = Math.max(y1, Math.floor(t.y));
  }
  const cols = x1 - x0 + 1;
  const rows = y1 - y0 + 1;
  const scale = 2 ** (nativeMaxZoom - minZoom);
  const toXY = (lat, lng) => {
    const t = mercatorTile(lat, lng, nativeMaxZoom);
    return {
      x: Math.round((t.x - x0 * scale) * TILE_SIZE * 100) / 100,
      y: Math.round((t.y - y0 * scale) * TILE_SIZE * 100) / 100,
    };
  };
  const width = cols * TILE_SIZE * scale;
  const height = rows * TILE_SIZE * scale;

  const groupList = [...(md.groups || [])].sort((a, b) => (a.order || 0) - (b.order || 0) || a.id - b.id);
  const groups = groupList.map((g) => ({ id: g.id, title: g.title, color: g.color ? `#${String(g.color).replace(/^#/, '')}` : null, order: g.order }));

  const seen = new Set();
  const categories = [];
  const pushCategory = (c) => {
    if (!c || seen.has(c.id)) return;
    seen.add(c.id);
    categories.push({
      id: c.id, groupId: c.group_id, title: c.title, icon: c.icon,
      info: c.info || null, template: c.template || null, premium: !!c.premium, count: 0,
    });
  };
  for (const g of groupList) for (const c of g.categories || []) pushCategory(c);
  for (const c of Object.values(md.categories || {})) pushCategory(c);

  // Region outlines: outer rings of each polygon, in pixel space, plus a point to put the label on.
  const toRing = (ring) => ring.map(([lng, lat]) => { const p = toXY(lat, lng); return [Math.round(p.x), Math.round(p.y)]; });
  const regions = (md.regions || []).map((r) => {
    const polygons = [];
    for (const f of r.features || []) {
      const g = f && f.geometry;
      if (!g || !Array.isArray(g.coordinates)) continue;
      if (g.type === 'Polygon') polygons.push(toRing(g.coordinates[0] || []));
      else if (g.type === 'MultiPolygon') for (const poly of g.coordinates) polygons.push(toRing((poly && poly[0]) || []));
    }
    const valid = polygons.filter((p) => p.length >= 3);
    const center = valid.length ? ringCentroid(valid.reduce((a, b) => (b.length > a.length ? b : a))) : null;
    return { id: r.id, title: r.title, polygons: valid, center };
  });

  const markers = locations
    .map((l) => {
      const { x, y } = toXY(l.latitude, l.longitude);
      return {
        id: l.id, categoryId: l.category_id, regionId: l.region_id, title: l.title,
        description: l.description || null, x, y, lat: Number(l.latitude), lng: Number(l.longitude),
        media: (l.media || [])
          .filter((m) => m.type === 'image' && m.url)
          .map((m) => ({ url: m.url, file: m.file_name || m.url.split('/').pop(), spoiler: !!m.spoiler })),
      };
    })
    .filter((m) => Number.isFinite(m.x) && Number.isFinite(m.y))
    .sort((a, b) => a.id - b.id);

  const byCategory = new Map();
  for (const m of markers) byCategory.set(m.categoryId, (byCategory.get(m.categoryId) || 0) + 1);
  for (const c of categories) c.count = byCategory.get(c.id) || 0;

  let start = { x: width / 2, y: height / 2 };
  if (Number.isFinite(Number(cfg.start_lat)) && Number.isFinite(Number(cfg.start_lng))) start = toXY(cfg.start_lat, cfg.start_lng);
  else if (markers.length) {
    start = { x: markers.reduce((s, m) => s + m.x, 0) / markers.length, y: markers.reduce((s, m) => s + m.y, 0) / markers.length };
  }
  const startZoom = Math.min(maxZoom, Math.max(minZoom, Number(cfg.initial_zoom) || minZoom));

  return {
    game: { slug: gameSlug, title: gameTitle },
    map: {
      id: md.map.id, title: md.map.title, slug: md.map.slug, source: pageUrl,
      scrapedAt: new Date().toISOString(), width, height,
      tiles: { remoteBaseUrl, pattern, tileSize: TILE_SIZE, minZoom, maxZoom, nativeMaxZoom, origin: { x: x0, y: y0 }, cols, rows },
      start: { x: start.x, y: start.y, zoom: startZoom },
    },
    icons: { sheet: 'markers/markers@2x.png', sheetScale: 2, frames: 'markers/markers.json' },
    groups, categories, regions, markers,
  };
}

module.exports = { buildMapData, mercatorTile };
