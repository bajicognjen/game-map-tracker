'use strict';
/**
 * Map view: Leaflet on a flat pixel grid for one map of one game.
 *
 * The CRS is a CRS.Simple variant whose scale is 2^(zoom − nativeMaxZoom), so Leaflet's zoom
 * levels line up with the tile pyramid and 1 unit = 1 pixel at the native max zoom.
 * Markers live in a cluster group (switchable to a plain group). Progress ("collected"), notes,
 * the user's own markers, filters and the last view are stored per map with LocalForage and
 * mirrored to a JSON backup on disk.
 *
 * Controls: click a marker for details, right-click (or the popup button) to toggle collected,
 * right-click an empty spot to add your own marker.
 */
window.MapView = (() => {
  const $ = (id) => document.getElementById(id);
  const el = {
    back: $('back-library'), gameTitle: $('game-title'), mapSelect: $('map-select'), mapTitle: $('map-title'),
    progressText: $('progress-text'), progressPct: $('progress-pct'), progressFill: $('progress-fill'), progressNote: $('progress-note'),
    regionFilter: $('region-filter'), nextBtn: $('next-uncollected'),
    titles: $('show-titles'), leftBtn: $('whats-left'), leftPanel: $('whats-left-panel'),
    search: $('search'), hideCollected: $('hide-collected'), showAll: $('show-all'), hideAll: $('hide-all'),
    cluster: $('cluster-markers'), regions: $('region-outlines'), regionsLabel: $('region-outlines-label'),
    visibleCount: $('visible-count'), categories: $('categories'), results: $('search-results'),
    exportBtn: $('export-progress'), importBtn: $('import-progress'), resetBtn: $('reset-progress'),
    tileStatus: $('tile-status'), toast: $('toast'), map: $('map'),
  };
  const CUSTOM = 'custom';
  const CUSTOM_COLOR = '#ffb347';
  let onBack = () => {};
  let view = null; // the active map
  let toastTimer = null;

  // ---------- helpers ----------
  function toast(message) {
    el.toast.textContent = message;
    el.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.remove('show'), 2400);
  }
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function debounce(fn, ms) {
    let timer = null;
    return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
  }
  function imageSize(src) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => resolve({ w: 0, h: 0 });
      img.src = src;
    });
  }
  const fmtDate = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(); };
  const ipcMessage = (err) => String((err && err.message) || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
  const catId = (raw) => (raw === CUSTOM ? CUSTOM : Number(raw));
  const isCustomId = (id) => typeof id === 'string' && id.startsWith('c-');
  const newCustomId = () => `c-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

  // Tiny markdown renderer for location notes: links, bold, italic, line breaks.
  // Links to other locations on the same map become in-app "jump to marker" links.
  function md(text) {
    let html = esc(text);
    html = html.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, url) => {
      const loc = url.match(/locationIds=(\d+)/);
      if (loc) return `<a href="#" data-goto="${loc[1]}">${label}</a>`;
      return `<a href="${url}" data-ext="1">${label}</a>`;
    });
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    return html.replace(/\n/g, '<br>');
  }

  // ---------- static wiring (once) ----------
  function init(opts) {
    onBack = opts.onBack || onBack;
    el.back.addEventListener('click', () => onBack());
    el.mapSelect.addEventListener('change', () => { if (view) open(view.source, view.gameSlug, el.mapSelect.value).catch((e) => toast(ipcMessage(e))); });
    el.categories.addEventListener('change', (e) => view && view.onCategoryChange(e));
    el.categories.addEventListener('click', (e) => { const b = e.target.closest('[data-track]'); if (b && view) { e.preventDefault(); view.toggleTracked(Number(b.dataset.track)); } });
    el.showAll.addEventListener('click', () => view && view.showAll());
    el.hideAll.addEventListener('click', () => view && view.hideAll());
    el.hideCollected.addEventListener('change', () => view && view.setHideCollected(el.hideCollected.checked));
    el.cluster.addEventListener('change', () => view && view.setClustering(el.cluster.checked));
    el.regions.addEventListener('change', () => view && view.setRegions(el.regions.checked));
    el.regionFilter.addEventListener('change', () => view && view.setRegionFilter(el.regionFilter.value));
    el.titles.addEventListener('change', () => view && view.setTitles(el.titles.checked));
    el.leftBtn.addEventListener('click', () => view && view.toggleWhatsLeft());
    el.leftPanel.addEventListener('click', (e) => {
      if (!view) return;
      const item = e.target.closest('[data-id]');
      const collect = e.target.closest('[data-collect-region]');
      const action = e.target.closest('[data-left]');
      if (item) view.focus(item.dataset.id);
      else if (collect) view.collectRegion(collect.dataset.collectRegion);
      else if (action && action.dataset.left === 'copy') view.copyLeft();
      else if (action && action.dataset.left === 'save') view.saveLeft();
      else if (action && action.dataset.left === 'close') view.toggleWhatsLeft(false);
    });
    el.nextBtn.addEventListener('click', () => view && view.nextUncollected());
    el.progressNote.addEventListener('click', (e) => { if (e.target.closest('[data-track-all]') && view) view.trackAll(); });
    document.addEventListener('keydown', (e) => {
      if (!view || e.ctrlKey || e.metaKey || e.altKey) return;
      const tag = (e.target && e.target.tagName) || '';
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target && e.target.isContentEditable);
      if (e.key === 'Escape') { if (typing) e.target.blur(); else view.closePopup(); return; }
      if (typing) return;
      if (e.key === 'n' || e.key === 'N') { e.preventDefault(); view.nextUncollected(); }
      else if (e.key === '/') { e.preventDefault(); el.search.focus(); el.search.select(); }
      else if (e.key === 'c' || e.key === 'C') { e.preventDefault(); view.collectOpen(); }
    });
    el.search.addEventListener('input', debounce(() => view && view.setSearch(el.search.value), 120));
    el.search.addEventListener('keydown', (e) => {
      if (!view) return;
      if (e.key === 'Enter') { e.preventDefault(); view.focusFirstResult(); }
      if (e.key === 'Escape') { el.search.value = ''; view.setSearch(''); }
    });
    el.results.addEventListener('click', (e) => {
      const item = e.target.closest('[data-id]');
      if (item && view) view.focus(item.dataset.id);
    });
    el.exportBtn.addEventListener('click', () => view && view.exportProgress());
    el.importBtn.addEventListener('click', () => view && view.importProgress());
    el.resetBtn.addEventListener('click', () => view && view.resetProgress());
    // Leaflet stops click propagation at the popup wrapper, so listen in the capture phase.
    el.map.addEventListener('click', (e) => view && view.onMapClick(e), true);
    el.map.addEventListener('input', (e) => view && view.onMapInput(e), true);
    el.map.addEventListener('error', (e) => {
      if (e.target && e.target.tagName === 'IMG') {
        const wrap = e.target.closest('.pp-media');
        if (wrap) wrap.remove();
      }
    }, true);
    el.map.addEventListener('load', (e) => view && view.onImageLoad(e), true);
  }

  async function open(source, gameSlug, mapSlug) {
    close();
    el.gameTitle.textContent = 'Loading…';
    el.mapTitle.textContent = '';
    const payload = await window.api.loadMap(source, gameSlug, mapSlug);
    view = await createView(payload, source, gameSlug, mapSlug);
  }

  function close() {
    if (view) { view.destroy(); view = null; }
    el.categories.innerHTML = '';
    el.results.innerHTML = '';
    el.results.classList.add('hidden');
    el.categories.classList.remove('hidden');
  }

  // ---------- one map ----------
  async function createView(payload, source, gameSlug, mapSlug) {
    const { data, frames, game, tiles: tileStatus, mediaFiles, baseUrl } = payload;
    const T = data.map.tiles;
    const NATIVE_ZOOM = T.nativeMaxZoom;
    const mapBase = `${baseUrl}/maps/${mapSlug}`;
    const localMedia = new Set(mediaFiles);

    // header
    el.gameTitle.textContent = game.title;
    el.mapTitle.textContent = `${data.map.title} · ${data.markers.length} locations`;
    document.title = `${game.title} — ${data.map.title}`;
    const readyMaps = game.maps.filter((m) => m.ready && m.markerCount !== 0);
    el.mapSelect.innerHTML = readyMaps.map((m) => `<option value="${esc(m.slug)}"${m.slug === mapSlug ? ' selected' : ''}>${esc(m.title)}</option>`).join('');
    el.mapSelect.classList.toggle('hidden', readyMaps.length < 2);

    // ---------- persistence ----------
    // One small IndexedDB per map (the site's map ids are globally unique), mirrored to a JSON
    // backup on disk after every change; restored from the backup if the database is empty.
    const store = localforage.createInstance({ name: `game-map-tracker-map-${data.map.id}` });
    const get = async (key, fallback) => { const v = await store.getItem(key); return v === null || v === undefined ? fallback : v; };
    const state = {
      collected: await get('collected', {}),
      notes: await get('notes', {}),
      custom: await get('custom', []),
      hidden: new Set(await get('hiddenCategories', [])),
      hideCollected: !!(await get('hideCollected', false)),
      cluster: !!(await get('cluster', true)),
      regions: !!(await get('regions', true)),
      tracked: await get('trackedCategories', null), // null = every category counts toward progress
      region: await get('regionFilter', null),
      titles: !!(await get('titles', true)),
      view: await get('view', null),
      search: '',
    };
    let backupPending = false;
    const writeBackupNow = () => {
      backupPending = false;
      const payload = { app: 'game-map-tracker', game: gameSlug, map: mapSlug, mapId: data.map.id, savedAt: new Date().toISOString(), collected: state.collected, notes: state.notes, custom: state.custom };
      window.api.writeBackup(gameSlug, mapSlug, JSON.stringify(payload)).catch(() => {});
    };
    const backupSoon = debounce(() => { if (backupPending) writeBackupNow(); }, 1500);
    const scheduleBackup = () => { backupPending = true; backupSoon(); };
    const flushBackup = () => { if (backupPending) writeBackupNow(); };
    window.addEventListener('beforeunload', flushBackup);
    const persist = {
      collected: () => { store.setItem('collected', state.collected); scheduleBackup(); },
      notes: () => { store.setItem('notes', state.notes); scheduleBackup(); },
      custom: () => { store.setItem('custom', state.custom); scheduleBackup(); },
      hidden: () => store.setItem('hiddenCategories', [...state.hidden]),
      hideCollected: () => store.setItem('hideCollected', state.hideCollected),
      cluster: () => store.setItem('cluster', state.cluster),
      regions: () => store.setItem('regions', state.regions),
      tracked: () => store.setItem('trackedCategories', state.tracked),
      region: () => store.setItem('regionFilter', state.region),
      titles: () => store.setItem('titles', state.titles),
      view: () => store.setItem('view', state.view),
    };
    const isTracked = (categoryId) => categoryId !== CUSTOM && (!state.tracked || state.tracked.includes(categoryId));
    let restoredFromBackup = false;
    if (!Object.keys(state.collected).length && !Object.keys(state.notes).length && !state.custom.length) {
      try {
        const raw = await window.api.readBackup(gameSlug, mapSlug);
        const b = raw ? JSON.parse(raw) : null;
        if (b && b.mapId === data.map.id) {
          state.collected = (b.collected && typeof b.collected === 'object') ? b.collected : {};
          state.notes = (b.notes && typeof b.notes === 'object') ? b.notes : {};
          state.custom = Array.isArray(b.custom) ? b.custom : [];
          if (Object.keys(state.collected).length || Object.keys(state.notes).length || state.custom.length) {
            store.setItem('collected', state.collected); store.setItem('notes', state.notes); store.setItem('custom', state.custom);
            restoredFromBackup = true;
          }
        }
      } catch { /* no usable backup */ }
    }
    const isCollected = (id) => Object.prototype.hasOwnProperty.call(state.collected, id);
    el.search.value = '';
    el.hideCollected.checked = state.hideCollected;
    el.cluster.checked = state.cluster;
    el.regions.checked = state.regions;
    el.titles.checked = state.titles;
    // region filter: only regions that actually have markers
    const regionCounts = new Map();
    for (const m of data.markers) if (m.regionId != null) regionCounts.set(m.regionId, (regionCounts.get(m.regionId) || 0) + 1);
    const regionOptions = data.regions.filter((r) => regionCounts.get(r.id)).sort((a, b) => a.title.localeCompare(b.title));
    if (state.region != null && !regionCounts.get(state.region)) state.region = null;
    el.regionFilter.innerHTML = '<option value="">All regions</option>' + regionOptions.map((r) => `<option value="${r.id}"${state.region === r.id ? ' selected' : ''}>${esc(r.title)} (${regionCounts.get(r.id)})</option>`).join('');
    el.regionFilter.classList.toggle('hidden', regionOptions.length < 1);

    const customCategory = { id: CUSTOM, groupId: CUSTOM, title: 'My markers', icon: null, info: 'Your own markers — right-click the map to add one', count: 0 };
    const categoriesById = new Map(data.categories.map((c) => [c.id, c]));
    categoriesById.set(CUSTOM, customCategory);
    const groupsById = new Map(data.groups.map((g) => [g.id, g]));
    const regionsById = new Map(data.regions.map((r) => [r.id, r]));

    // ---------- Leaflet map ----------
    const CRS = L.extend({}, L.CRS.Simple, {
      transformation: new L.Transformation(1, 0, 1, 0), // x right, y down: image pixel space
      scale: (zoom) => Math.pow(2, zoom - NATIVE_ZOOM),
      zoom: (scale) => Math.log(scale) / Math.LN2 + NATIVE_ZOOM,
    });
    const mapBounds = L.latLngBounds([[0, 0], [data.map.height, data.map.width]]);
    const panBounds = mapBounds.pad(0.05);
    let alive = true; // false once the view is destroyed: late timers and animation callbacks then do nothing
    const map = L.map(el.map, {
      crs: CRS,
      minZoom: T.minZoom,
      maxZoom: T.maxZoom,
      zoomSnap: 0.25,
      zoomDelta: 0.5,
      wheelPxPerZoomLevel: 90,
      maxBounds: panBounds,
      maxBoundsViscosity: 0.9,
      attributionControl: false,
      zoomControl: false,
    });
    L.control.zoom({ position: 'topright' }).addTo(map);

    const tilesLocal = !!tileStatus.available;
    const ext = tilesLocal ? tileStatus.extension : null;
    const localTiles = new Set();
    for (const [z, list] of Object.entries((tilesLocal && tileStatus.nonBlank) || {})) {
      for (const [y, x] of list) localTiles.add(`${z}/${y}/${x}`);
    }
    const MapTiles = L.TileLayer.extend({
      getTileUrl(coords) {
        const scale = Math.pow(2, coords.z - T.minZoom);
        const y = T.origin.y * scale + coords.y;
        const x = T.origin.x * scale + coords.x;
        if (tilesLocal) {
          if (!localTiles.has(`${coords.z}/${y}/${x}`)) return `${mapBase}/tiles/blank.${ext}`;
          return `${mapBase}/tiles/${coords.z}/${y}/${x}.${ext}`;
        }
        return `${T.remoteBaseUrl}/${T.pattern.replace('{z}', coords.z).replace('{y}', y).replace('{x}', x)}`;
      },
    });
    new MapTiles('', {
      tileSize: T.tileSize,
      minZoom: T.minZoom,
      maxZoom: T.maxZoom,
      maxNativeZoom: tilesLocal ? Math.min(tileStatus.maxZoom, T.nativeMaxZoom) : T.nativeMaxZoom,
      bounds: mapBounds,
      noWrap: true,
      keepBuffer: 4,
      errorTileUrl: tilesLocal ? `${mapBase}/tiles/blank.${ext}` : '',
    }).addTo(map);

    const goHome = () => map.setView([data.map.start.y, data.map.start.x], data.map.start.zoom);
    if (state.view && Number.isFinite(state.view.zoom)) map.setView([state.view.y, state.view.x], state.view.zoom);
    else goHome();
    map.on('moveend', debounce(() => {
      if (!alive) return;
      const c = map.getCenter();
      state.view = { x: c.lng, y: c.lat, zoom: map.getZoom() };
      persist.view();
    }, 300));

    const HomeControl = L.Control.extend({
      onAdd() {
        const bar = L.DomUtil.create('div', 'leaflet-bar');
        const a = L.DomUtil.create('a', 'mg-home', bar);
        a.href = '#'; a.title = 'Reset view'; a.setAttribute('role', 'button'); a.setAttribute('aria-label', 'Reset view'); a.innerHTML = '<span class="ico ico-home" aria-hidden="true"></span>';
        L.DomEvent.on(a, 'click', (e) => { L.DomEvent.stop(e); goHome(); });
        return bar;
      },
    });
    new HomeControl({ position: 'topright' }).addTo(map);

    el.tileStatus.textContent = tilesLocal
      ? `Map tiles: offline copy (zoom ${tileStatus.minZoom}–${tileStatus.maxZoom})`
      : 'Map tiles: streaming from the map site (needs internet) — update the game with tiles for offline use';

    // ---------- region outlines ----------
    const regionLayer = L.layerGroup();
    let regionsDrawn = 0;
    for (const r of data.regions) {
      if (!r.polygons || !r.polygons.length) continue;
      for (const ring of r.polygons) {
        L.polygon(ring.map(([x, y]) => [y, x]), { color: '#9fb0c0', weight: 1.5, dashArray: '6 4', fillColor: '#5ec8ff', fillOpacity: 0.05, interactive: false }).addTo(regionLayer);
      }
      if (r.center) L.tooltip({ permanent: true, direction: 'center', className: 'region-label', interactive: false, opacity: 0.9 }).setLatLng([r.center.y, r.center.x]).setContent(esc(r.title)).addTo(regionLayer);
      regionsDrawn++;
    }
    el.regionsLabel.classList.toggle('hidden', !regionsDrawn);
    if (regionsDrawn && state.regions) regionLayer.addTo(map);

    // ---------- icons ----------
    const sheetUrl = `${baseUrl}/${data.icons.sheet}`;
    const sheetScale = data.icons.sheetScale || 1;
    const sheetSize = await imageSize(sheetUrl);
    const FALLBACK_FRAME = { x: 0, y: 0, width: 33, height: 44 };
    const frameFor = (category) => frames[category.icon] || frames.miscellaneous || Object.values(frames)[0] || FALLBACK_FRAME;
    function spriteStyle(frame, scale) {
      const size = sheetSize.w ? `${(sheetSize.w / sheetScale) * scale}px ${(sheetSize.h / sheetScale) * scale}px` : 'auto';
      return `background-image:url('${sheetUrl}');background-size:${size};` +
        `background-position:${-frame.x * scale}px ${-frame.y * scale}px;` +
        `width:${frame.width * scale}px;height:${frame.height * scale}px`;
    }
    const smallIcon = (category) => (category.id === CUSTOM ? '<span class="custom-dot"><span class="ico ico-star" aria-hidden="true"></span></span>' : `<span class="cat-icon" style="${spriteStyle(frameFor(category), 0.5)}"></span>`);
    const iconCache = new Map();
    function iconFor(category, collected) {
      const key = `${category.id}|${collected ? 1 : 0}`;
      let icon = iconCache.get(key);
      if (!icon) {
        if (category.id === CUSTOM) {
          icon = L.divIcon({
            className: `mg-marker custom-marker${collected ? ' collected' : ''}`,
            iconSize: [30, 30], iconAnchor: [15, 36], popupAnchor: [0, -34], tooltipAnchor: [0, -30],
            html: '<span class="mg-pin custom"><span class="custom-pin"></span></span>',
          });
        } else {
          const f = frameFor(category);
          icon = L.divIcon({
            className: `mg-marker${collected ? ' collected' : ''}`,
            iconSize: [f.width, f.height],
            iconAnchor: [f.width / 2, f.height],
            popupAnchor: [0, -f.height + 6],
            tooltipAnchor: [0, -f.height + 10],
            html: `<span class="mg-pin" style="${spriteStyle(f, 1)}"></span>`,
          });
        }
        iconCache.set(key, icon);
      }
      return icon;
    }

    // ---------- markers ----------
    const entries = new Map(); // id -> { data, category, marker }
    const markerIds = new WeakMap(); // L.Marker -> id (for cluster icons)
    const labeled = new Set(); // entries currently showing their title next to the pin
    const hoverTooltip = (marker, title) => marker.bindTooltip(title || 'My marker', { direction: 'top', opacity: 0.95 });
    function makeEntry(m, category) {
      const custom = category.id === CUSTOM;
      const marker = L.marker([m.y, m.x], { icon: iconFor(category, isCollected(m.id)), riseOnHover: true, keyboard: false, draggable: custom });
      hoverTooltip(marker, m.title);
      marker.bindPopup(() => popupHtml(m), { maxWidth: 380, minWidth: 260, className: 'mg-popup', autoPanPadding: [40, 40] });
      marker.on('contextmenu', (e) => { if (e.originalEvent) { e.originalEvent.preventDefault(); e.originalEvent.stopPropagation(); } toggleCollected(m.id); });
      const entry = { data: m, category, marker };
      marker.on('popupopen', () => { if (!labeled.has(entry)) marker.closeTooltip(); }); // Leaflet also opens the tooltip on click
      if (custom) {
        marker.on('dragend', () => {
          const ll = marker.getLatLng();
          m.x = Math.round(ll.lng);
          m.y = Math.round(ll.lat);
          persist.custom();
          if (marker.isPopupOpen()) marker.getPopup().setContent(popupHtml(m));
        });
      }
      markerIds.set(marker, m.id);
      entries.set(m.id, entry);
      return entry;
    }
    for (const m of data.markers) {
      const category = categoriesById.get(m.categoryId);
      if (category) makeEntry(m, category);
    }
    for (const c of state.custom) makeEntry(Object.assign(c, { categoryId: CUSTOM, media: [] }), customCategory);

    // Markers sit in a cluster group (or a plain group when clustering is off). Only the
    // visible, filtered markers are in the group; clusters are rebuilt from those.
    function makeGroup(clustered) {
      if (clustered && L.markerClusterGroup) {
        return L.markerClusterGroup({
          maxClusterRadius: 48,
          disableClusteringAtZoom: T.nativeMaxZoom,
          spiderfyOnMaxZoom: true,
          showCoverageOnHover: false,
          zoomToBoundsOnClick: true,
          chunkedLoading: true,
          iconCreateFunction: (cluster) => {
            const children = cluster.getAllChildMarkers();
            let done = 0;
            for (const c of children) if (isCollected(markerIds.get(c))) done++;
            const n = children.length;
            const size = n < 10 ? 30 : n < 100 ? 38 : 48;
            return L.divIcon({
              html: `<span>${n}</span>`,
              className: `mg-cluster ${n < 10 ? 'sm' : n < 100 ? 'md' : 'lg'}${done === n ? ' done' : ''}`,
              iconSize: L.point(size, size),
            });
          },
        });
      }
      return L.featureGroup();
    }
    let group = makeGroup(state.cluster).addTo(map);
    const customGroup = L.featureGroup().addTo(map); // your own markers: never clustered, draggable
    const onMap = new Set(); // entries currently on the map (either group)
    const isCustomEntry = (entry) => entry.category.id === CUSTOM;
    function placeEntries(list, on) {
      const site = list.filter((e) => !isCustomEntry(e)).map((e) => e.marker);
      const custom = list.filter(isCustomEntry).map((e) => e.marker);
      if (on) {
        if (site.length) { if (group.addLayers) group.addLayers(site); else for (const l of site) group.addLayer(l); }
        for (const l of custom) customGroup.addLayer(l);
      } else {
        for (const e of list) if (labeled.has(e)) { e.marker.unbindTooltip(); hoverTooltip(e.marker, e.data.title); labeled.delete(e); }
        if (site.length) { if (group.removeLayers) group.removeLayers(site); else for (const l of site) group.removeLayer(l); }
        for (const l of custom) customGroup.removeLayer(l);
      }
    }
    const groupAdd = (layers) => { /* kept for clustering swaps */ if (group.addLayers) group.addLayers(layers); else for (const l of layers) group.addLayer(l); };

    function matchesSearch(entry) {
      if (!state.search) return true;
      const m = entry.data;
      return `${m.title}\n${m.description || ''}\n${entry.category.title}\n${state.notes[m.id] || ''}`.toLowerCase().includes(state.search);
    }
    function isVisible(entry) {
      if (state.hidden.has(entry.data.categoryId)) return false;
      if (state.hideCollected && isCollected(entry.data.id)) return false;
      if (state.region != null && entry.data.categoryId !== CUSTOM && entry.data.regionId !== state.region) return false;
      return matchesSearch(entry);
    }
    let lastNextId = null;
    function nextUncollected() {
      const c = map.getCenter();
      let best = null;
      let bestDist = Infinity;
      for (const entry of entries.values()) {
        if (!isVisible(entry) || isCollected(entry.data.id)) continue;
        if (entry.data.id === lastNextId && entry.marker.isPopupOpen()) continue;
        const d = (entry.data.x - c.lng) ** 2 + (entry.data.y - c.lat) ** 2;
        if (d < bestDist) { bestDist = d; best = entry; }
      }
      if (!best) { toast(state.region != null || state.hidden.size || state.search ? 'Nothing uncollected left in the current filters' : 'Everything on this map is collected'); return; }
      lastNextId = best.data.id;
      focusMarker(best.data.id);
    }
    function applyFilters() {
      const add = [];
      const remove = [];
      let shown = 0;
      for (const entry of entries.values()) {
        const visible = isVisible(entry);
        const has = onMap.has(entry);
        if (visible && !has) { add.push(entry); onMap.add(entry); }
        else if (!visible && has) { remove.push(entry); onMap.delete(entry); }
        if (visible) shown++;
      }
      placeEntries(remove, false);
      placeEntries(add, true);
      el.visibleCount.textContent = `${shown} of ${entries.size} shown`;
      updateTitles();
      if (leftOpen) renderLeft();
    }
    function setClustering(on) {
      state.cluster = !!on;
      persist.cluster();
      const layers = [...onMap].filter((e) => !isCustomEntry(e)).map((e) => e.marker);
      map.closePopup();
      map.removeLayer(group);
      group = makeGroup(state.cluster).addTo(map);
      groupAdd(layers);
      updateTitles();
    }

    // ---------- location titles next to the pins when zoomed in ----------
    function updateTitles() {
      const show = state.titles && map.getZoom() >= T.nativeMaxZoom - 1;
      const bounds = map.getBounds().pad(0.15);
      for (const entry of onMap) {
        const want = show && !!entry.marker._icon && bounds.contains(entry.marker.getLatLng());
        const has = labeled.has(entry);
        if (want && !has) {
          entry.marker.unbindTooltip();
          entry.marker.bindTooltip(entry.data.title || 'My marker', { permanent: true, direction: 'right', offset: [10, 0], className: 'pin-label', interactive: false });
          labeled.add(entry);
        } else if (!want && has) {
          entry.marker.unbindTooltip();
          hoverTooltip(entry.marker, entry.data.title);
          labeled.delete(entry);
        }
      }
    }
    map.on('zoomend moveend', debounce(() => { if (alive) updateTitles(); }, 120));
    function setTitles(on) { state.titles = !!on; persist.titles(); updateTitles(); }
    function setRegions(on) {
      state.regions = !!on;
      persist.regions();
      if (!regionsDrawn) return;
      if (state.regions) regionLayer.addTo(map); else map.removeLayer(regionLayer);
    }
    function refreshEntry(entry) {
      entry.marker.setIcon(iconFor(entry.category, isCollected(entry.data.id)));
      if (entry.marker.isPopupOpen()) entry.marker.getPopup().setContent(popupHtml(entry.data));
      if (group.refreshClusters && onMap.has(entry) && !isCustomEntry(entry)) group.refreshClusters(entry.marker);
    }
    function toggleCollected(id) {
      const entry = entries.get(id);
      if (!entry) return;
      if (isCollected(id)) delete state.collected[id];
      else state.collected[id] = new Date().toISOString();
      persist.collected();
      refreshEntry(entry);
      renderProgress();
      if (state.hideCollected) applyFilters();
      if (state.search) renderResults();
      if (leftOpen) renderLeft();
    }
    function focusMarker(id) {
      const entry = entries.get(id);
      if (!entry) return;
      let changed = false;
      if (state.hidden.has(entry.data.categoryId)) { state.hidden.delete(entry.data.categoryId); persist.hidden(); changed = true; }
      if (state.hideCollected && isCollected(id)) { state.hideCollected = false; el.hideCollected.checked = false; persist.hideCollected(); changed = true; }
      if (state.region != null && entry.data.categoryId !== CUSTOM && entry.data.regionId !== state.region) { state.region = null; el.regionFilter.value = ''; persist.region(); changed = true; }
      if (changed) { syncCategoryUI(); applyFilters(); }
      map.closePopup();
      let opened = false;
      // The cluster plugin animates for a moment after a zoom; asking it to reveal a marker during
      // that window never calls back, so wait for its 'animationend' first.
      const whenSettled = (fn) => { if (group._inZoomAnimation) group.once('animationend', fn); else fn(); };
      const openIt = () => {
        if (opened || !alive) return;
        opened = true;
        whenSettled(() => {
          if (entry.marker._icon || !group.zoomToShowLayer || !onMap.has(entry) || isCustomEntry(entry)) entry.marker.openPopup();
          else group.zoomToShowLayer(entry.marker, () => entry.marker.openPopup());
        });
      };
      map.once('moveend', openIt);
      setTimeout(openIt, 700);
      map.setView([entry.data.y, entry.data.x], Math.max(map.getZoom(), T.nativeMaxZoom - 1), { animate: true });
    }

    // ---------- the user's own markers ----------
    map.on('contextmenu', (e) => {
      const target = e.originalEvent && e.originalEvent.target;
      if (target && target.closest && target.closest('.leaflet-marker-icon, .leaflet-popup')) return;
      const x = Math.round(e.latlng.lng);
      const y = Math.round(e.latlng.lat);
      L.popup({ className: 'mg-popup mg-add', closeButton: false, offset: [0, -4] })
        .setLatLng(e.latlng)
        .setContent(`<button type="button" class="pp-toggle" data-add-custom="${x},${y}">+ Add my marker here</button>`)
        .openOn(map);
    });
    function addCustomMarker(x, y) {
      const c = { id: newCustomId(), categoryId: CUSTOM, title: 'My marker', description: '', x, y, media: [], createdAt: new Date().toISOString() };
      state.custom.push(c);
      persist.custom();
      const entry = makeEntry(c, customCategory);
      map.closePopup();
      if (isVisible(entry)) { onMap.add(entry); placeEntries([entry], true); }
      renderCounts();
      el.visibleCount.textContent = `${onMap.size} of ${entries.size} shown`;
      setTimeout(() => {
        if (!alive) return;
        entry.marker.openPopup();
        const input = el.map.querySelector('[data-custom-title]');
        if (input) { input.focus(); input.select(); }
      }, 50);
    }
    function deleteCustomMarker(id) {
      const entry = entries.get(id);
      if (!entry) return;
      if (!window.confirm(`Delete "${entry.data.title || 'My marker'}"?`)) return;
      map.closePopup();
      if (onMap.has(entry)) { placeEntries([entry], false); onMap.delete(entry); }
      entries.delete(id);
      state.custom = state.custom.filter((c) => c.id !== id);
      delete state.collected[id];
      delete state.notes[id];
      persist.custom(); persist.collected();
      renderCounts();
      el.visibleCount.textContent = `${onMap.size} of ${entries.size} shown`;
      if (state.search) renderResults();
    }
    const persistNotesSoon = debounce(() => persist.notes(), 400);
    const persistCustomSoon = debounce(() => persist.custom(), 400);

    // ---------- sidebar panels: categories, search results, what's left ----------
    let leftOpen = false;
    function syncPanels() {
      const which = state.search ? 'results' : (leftOpen ? 'left' : 'categories');
      el.results.classList.toggle('hidden', which !== 'results');
      el.leftPanel.classList.toggle('hidden', which !== 'left');
      el.categories.classList.toggle('hidden', which !== 'categories');
      el.leftBtn.classList.toggle('active', leftOpen);
    }
    function leftData() {
      const groups = new Map();
      for (const entry of entries.values()) {
        if (isCustomEntry(entry) || !isTracked(entry.data.categoryId) || isCollected(entry.data.id) || !isVisible(entry)) continue;
        const r = regionsById.get(entry.data.regionId);
        const key = r ? String(r.id) : 'none';
        if (!groups.has(key)) groups.set(key, { key, title: r ? r.title : 'No region', items: [] });
        groups.get(key).items.push(entry);
      }
      // named regions first (largest first), "No region" always last
      const list = [...groups.values()].sort((a, b) => (a.key === 'none') - (b.key === 'none') || b.items.length - a.items.length || a.title.localeCompare(b.title));
      for (const g of list) g.items.sort((a, b) => a.category.title.localeCompare(b.category.title) || String(a.data.title).localeCompare(String(b.data.title)));
      return list;
    }
    function renderLeft() {
      const list = leftData();
      const total = list.reduce((s, g) => s + g.items.length, 0);
      const sections = list.map((g) => {
        let lastCat = null;
        const items = g.items.map((e) => {
          const head = e.category.id !== lastCat ? `<li class="left-cat">${esc(e.category.title)}</li>` : '';
          lastCat = e.category.id;
          const sub = (state.notes[e.data.id] || e.data.description || '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/\*\*?/g, '').replace(/\s+/g, ' ').trim().slice(0, 80);
          return `${head}<li class="left-item" data-id="${esc(e.data.id)}"><span class="left-text"><span class="left-title">${esc(e.data.title)}</span>${sub ? `<span class="left-sub">${esc(sub)}</span>` : ''}</span>${state.notes[e.data.id] ? '<span class="ico ico-note muted" title="has a note"></span>' : ''}</li>`;
        }).join('');
        return `
          <section class="left-region">
            <header class="left-head"><span class="left-region-title">${esc(g.title)}</span><span class="count">${g.items.length}</span><button type="button" class="link" data-collect-region="${esc(g.key)}" title="Mark every listed location in this region as collected">mark all</button></header>
            <ul>${items}</ul>
          </section>`;
      }).join('');
      el.leftPanel.innerHTML = `
        <div class="left-toolbar">
          <strong>${total} left</strong><span class="muted small">${state.tracked || state.hidden.size || state.region != null ? ' in the current filters' : ''}</span>
          <span class="spacer"></span>
          <button type="button" class="link" data-left="copy" title="Copy the list as text">Copy</button>
          <button type="button" class="link" data-left="save" title="Save the list as a text file">Save…</button>
          <button type="button" class="link" data-left="close">Close</button>
        </div>
        ${total ? sections : '<div class="empty-note">Nothing left here — everything counted is collected.</div>'}`;
    }
    function leftText() {
      const lines = [`What's left — ${game.title} / ${data.map.title}`, ''];
      for (const g of leftData()) {
        lines.push(`## ${g.title} (${g.items.length})`);
        for (const e of g.items) lines.push(`- [ ] ${e.category.title}: ${e.data.title}`);
        lines.push('');
      }
      return lines.join('\n');
    }
    function toggleWhatsLeft(force) {
      leftOpen = force === undefined ? !leftOpen : !!force;
      if (leftOpen && state.search) { state.search = ''; el.search.value = ''; applyFilters(); }
      if (leftOpen) renderLeft();
      syncPanels();
    }
    function collectRegion(key) {
      const g = leftData().find((x) => x.key === key);
      if (!g) return;
      if (!window.confirm(`Mark all ${g.items.length} listed locations in "${g.title}" as collected?`)) return;
      const stamp = new Date().toISOString();
      for (const e of g.items) state.collected[e.data.id] = stamp;
      persist.collected();
      for (const e of g.items) refreshEntry(e);
      renderProgress();
      if (state.hideCollected) applyFilters();
      renderLeft();
      toast(`${g.items.length} marked as collected`);
    }

    // ---------- search results ----------
    let firstResultId = null;
    const RESULT_LIMIT = 300;
    function renderResults() {
      if (!state.search) {
        el.results.innerHTML = '';
        firstResultId = null;
        syncPanels();
        return;
      }
      const matches = [...entries.values()].filter(matchesSearch).sort((a, b) => String(a.data.title).localeCompare(String(b.data.title)));
      firstResultId = matches.length ? matches[0].data.id : null;
      const items = matches.slice(0, RESULT_LIMIT).map((e) => {
        const r = regionsById.get(e.data.regionId);
        const done = isCollected(e.data.id);
        return `<li class="result${done ? ' done' : ''}" data-id="${esc(e.data.id)}">
          ${smallIcon(e.category)}
          <span class="result-text"><span class="result-title">${esc(e.data.title || 'My marker')}</span><span class="result-meta">${esc(e.category.title)}${r ? ` · ${esc(r.title)}` : ''}${state.notes[e.data.id] ? ' · has a note' : ''}</span></span>
          ${done ? '<span class="result-check ico ico-check" title="collected"></span>' : ''}
        </li>`;
      }).join('');
      el.results.innerHTML = `<div class="results-head">${matches.length} match${matches.length === 1 ? '' : 'es'}${matches.length > RESULT_LIMIT ? ` · showing the first ${RESULT_LIMIT}` : ''} · Enter jumps to the first</div><ul>${items}</ul>`;
      syncPanels();
    }

    // ---------- popup ----------
    const mediaSrc = (media) => (localMedia.has(media.file) ? `${mapBase}/media/${media.file}` : media.url);
    function popupHtml(m) {
      const collected = isCollected(m.id);
      const toggle = `<button type="button" class="pp-toggle${collected ? ' done' : ''}" data-toggle="${esc(m.id)}">${collected ? '<span class="ico ico-check" aria-hidden="true"></span>Collected · click to undo' : 'Mark as collected'}</button>`;
      if (m.categoryId === CUSTOM) {
        return `
          <div class="pp pp-custom">
            <div class="pp-head"><span class="pp-cat" style="color:${CUSTOM_COLOR}">My marker</span></div>
            <input type="text" class="pp-input" data-custom-title="${esc(m.id)}" value="${esc(m.title || '')}" placeholder="Title" maxlength="120">
            <textarea class="pp-notes" data-custom-notes="${esc(m.id)}" placeholder="Notes…" rows="3">${esc(m.description || '')}</textarea>
            ${toggle}
            <div class="pp-meta row between"><span>${collected ? `Found ${esc(fmtDate(state.collected[m.id]))} · ` : ''}x ${Math.round(m.x)}, y ${Math.round(m.y)}</span><button type="button" class="link danger" data-delete-custom="${esc(m.id)}">Delete marker</button></div>
          </div>`;
      }
      const c = categoriesById.get(m.categoryId);
      const g = groupsById.get(c.groupId);
      const r = regionsById.get(m.regionId);
      const media = m.media[0];
      return `
        <div class="pp">
          <h3 class="pp-title">${esc(m.title)}</h3>
          <div class="pp-head">
            <span class="pp-cat" style="color:${(g && g.color) || '#9aa'}">${esc(c.title)}</span>
            ${r ? `<span class="pp-sep">·</span><span class="pp-region">${esc(r.title)}</span>` : ''}
          </div>
          ${m.description ? `<div class="pp-desc">${md(m.description)}</div>` : ''}
          ${!m.description && c.info ? `<div class="pp-desc muted">${md(c.info)}</div>` : ''}
          ${media ? `<div class="pp-media${media.spoiler ? ' spoiler' : ''}"><img src="${esc(mediaSrc(media))}" alt="" loading="lazy"></div>` : ''}
          <textarea class="pp-notes" data-note="${m.id}" placeholder="Your notes…" rows="2">${esc(state.notes[m.id] || '')}</textarea>
          ${toggle}
          <div class="pp-meta">${collected ? `Found ${esc(fmtDate(state.collected[m.id]))} · ` : ''}#${m.id} · x ${Math.round(m.x)}, y ${Math.round(m.y)}</div>
        </div>`;
    }
    let openPopup = null;
    map.on('popupopen', (e) => { openPopup = e.popup; });
    map.on('popupclose', (e) => { delete e.popup._relaidOut; openPopup = null; });
    // A popup near the map's edge needs room the pan limits don't allow (most of all in a small window),
    // so they are lifted while a popup is open and the map eases back inside them once it closes.
    map.on('popupopen', () => map.setMaxBounds(null));
    map.on('popupclose', () => setTimeout(() => { if (alive && !openPopup) map.setMaxBounds(panBounds); }, 0));

    // ---------- sidebar ----------
    function categoryItem(c) {
      return `
        <li class="cat${state.hidden.has(c.id) ? ' off' : ''}" data-cat="${c.id}">
          <label class="chk">
            <input type="checkbox" class="cat-toggle" data-cat="${c.id}" ${state.hidden.has(c.id) ? '' : 'checked'}>
            ${smallIcon(c)}
            <span class="cat-title" title="${esc(c.info || c.title)}">${esc(c.title)}</span>
          </label>
          <button type="button" class="track${isTracked(c.id) ? ' on' : ''}" data-track="${c.id}" title="${isTracked(c.id) ? 'Counts toward progress — click to leave it out' : 'Not counted toward progress — click to count it'}"><span class="ico ico-star" aria-hidden="true"></span></button>
          <span class="count" data-cat-count="${c.id}"></span>
        </li>`;
    }
    function syncTrackUI() {
      el.categories.classList.toggle('tracking-custom', !!state.tracked);
      for (const b of el.categories.querySelectorAll('[data-track]')) {
        const on = isTracked(Number(b.dataset.track));
        b.classList.toggle('on', on);
        b.title = on ? 'Counts toward progress — click to leave it out' : 'Not counted toward progress — click to count it';
      }
    }
    function toggleTracked(categoryId) {
      const all = data.categories.map((c) => c.id);
      const current = state.tracked ? [...state.tracked] : all;
      const next = current.includes(categoryId) ? current.filter((id) => id !== categoryId) : [...current, categoryId];
      state.tracked = next.length === all.length ? null : next;
      persist.tracked();
      syncTrackUI();
      renderProgress();
      if (leftOpen) renderLeft();
    }
    function trackAll() { state.tracked = null; persist.tracked(); syncTrackUI(); renderProgress(); if (leftOpen) renderLeft(); }
    function renderCategories() {
      const sections = [`
        <section class="group custom-group">
          <header class="group-head">
            <label class="chk">
              <input type="checkbox" class="cat-toggle" data-cat="${CUSTOM}" ${state.hidden.has(CUSTOM) ? '' : 'checked'}>
              <span class="group-title" style="color:${CUSTOM_COLOR}">My markers</span>
            </label>
            <span class="count" data-cat-count="${CUSTOM}"></span>
          </header>
          <div class="hint muted small">Right-click the map to add one</div>
        </section>`];
      for (const g of data.groups) {
        const cats = data.categories.filter((c) => c.groupId === g.id);
        if (!cats.length) continue;
        sections.push(`
          <section class="group" data-group="${g.id}">
            <header class="group-head">
              <label class="chk">
                <input type="checkbox" class="group-toggle" data-group="${g.id}">
                <span class="group-title" style="color:${g.color || '#ccc'}">${esc(g.title)}</span>
              </label>
              <span class="count" data-group-count="${g.id}"></span>
            </header>
            <ul class="cats">${cats.map(categoryItem).join('')}</ul>
          </section>`);
      }
      const orphans = data.categories.filter((c) => !groupsById.has(c.groupId));
      if (orphans.length) {
        sections.push(`<section class="group"><header class="group-head"><span class="group-title">Other</span></header><ul class="cats">${orphans.map(categoryItem).join('')}</ul></section>`);
      }
      el.categories.innerHTML = sections.join('');
      syncCategoryUI();
      renderCounts();
    }
    function syncCategoryUI() {
      for (const input of el.categories.querySelectorAll('.cat-toggle')) {
        const id = catId(input.dataset.cat);
        input.checked = !state.hidden.has(id);
        const row = input.closest('.cat');
        if (row) row.classList.toggle('off', state.hidden.has(id));
      }
      for (const input of el.categories.querySelectorAll('.group-toggle')) {
        const gid = Number(input.dataset.group);
        const cats = data.categories.filter((c) => c.groupId === gid);
        const visible = cats.filter((c) => !state.hidden.has(c.id)).length;
        input.checked = visible === cats.length;
        input.indeterminate = visible > 0 && visible < cats.length;
      }
    }
    function renderCounts() {
      const foundByCat = new Map();
      for (const id of Object.keys(state.collected)) {
        const entry = entries.get(isCustomId(id) ? id : Number(id));
        if (entry) foundByCat.set(entry.category.id, (foundByCat.get(entry.category.id) || 0) + 1);
      }
      const groupTotals = new Map();
      for (const c of data.categories) {
        const found = foundByCat.get(c.id) || 0;
        const node = el.categories.querySelector(`[data-cat-count="${c.id}"]`);
        if (node) { node.textContent = `${found}/${c.count}`; node.classList.toggle('done', c.count > 0 && found === c.count); }
        const gt = groupTotals.get(c.groupId) || { found: 0, total: 0 };
        gt.found += found; gt.total += c.count;
        groupTotals.set(c.groupId, gt);
      }
      for (const [gid, gt] of groupTotals) {
        const node = el.categories.querySelector(`[data-group-count="${gid}"]`);
        if (node) { node.textContent = `${gt.found}/${gt.total}`; node.classList.toggle('done', gt.total > 0 && gt.found === gt.total); }
      }
      const customNode = el.categories.querySelector(`[data-cat-count="${CUSTOM}"]`);
      if (customNode) {
        const found = foundByCat.get(CUSTOM) || 0;
        customNode.textContent = `${found}/${state.custom.length}`;
        customNode.classList.toggle('done', state.custom.length > 0 && found === state.custom.length);
      }
    }
    function renderProgress() {
      let total = 0;
      let found = 0;
      for (const entry of entries.values()) {
        if (isCustomId(entry.data.id) || !isTracked(entry.data.categoryId)) continue;
        total++;
        if (isCollected(entry.data.id)) found++;
      }
      const pct = total ? Math.round((found / total) * 100) : 0;
      el.progressText.innerHTML = `<strong>${found}</strong> / ${total} found`;
      el.progressPct.textContent = `${pct}%`;
      el.progressFill.style.width = `${pct}%`;
      const trackedCount = state.tracked ? state.tracked.length : data.categories.length;
      el.progressNote.classList.toggle('hidden', !state.tracked);
      if (state.tracked) el.progressNote.innerHTML = `${trackedCount} of ${data.categories.length} categories counted (starred in the list) · <button type="button" class="link" data-track-all="1">count all</button>`;
      renderCounts();
    }

    renderCategories();
    renderProgress();
    applyFilters();
    syncPanels();
    if (restoredFromBackup) toast('Progress restored from the backup file');

    // ---------- handlers used by the static wiring ----------
    return {
      source, gameSlug, mapSlug,
      destroy() {
        alive = false;
        // keep the view the user left (a pending debounced save would otherwise be dropped)
        try { const c = map.getCenter(); state.view = { x: c.lng, y: c.lat, zoom: map.getZoom() }; persist.view(); } catch { /* map not laid out */ }
        map.stop();
        map._animatingZoom = false; // Leaflet's zoom-end timer still runs after remove(); this makes it a no-op
        flushBackup(); window.removeEventListener('beforeunload', flushBackup); map.remove(); openPopup = null; leftOpen = false; el.leftPanel.innerHTML = ''; el.leftBtn.classList.remove('active'); },
      focus: (id) => focusMarker(isCustomId(id) ? id : Number(id)),
      focusFirstResult() { if (firstResultId !== null) focusMarker(firstResultId); },
      onCategoryChange(e) {
        const t = e.target;
        if (t.classList.contains('cat-toggle')) {
          const id = catId(t.dataset.cat);
          if (t.checked) state.hidden.delete(id); else state.hidden.add(id);
        } else if (t.classList.contains('group-toggle')) {
          const gid = Number(t.dataset.group);
          for (const c of data.categories) {
            if (c.groupId !== gid) continue;
            if (t.checked) state.hidden.delete(c.id); else state.hidden.add(c.id);
          }
        } else return;
        persist.hidden(); syncCategoryUI(); applyFilters();
      },
      showAll() { state.hidden.clear(); persist.hidden(); syncCategoryUI(); applyFilters(); },
      hideAll() { for (const c of data.categories) state.hidden.add(c.id); state.hidden.add(CUSTOM); persist.hidden(); syncCategoryUI(); applyFilters(); },
      setHideCollected(value) { state.hideCollected = !!value; persist.hideCollected(); applyFilters(); },
      setClustering,
      setRegions,
      setRegionFilter(value) { state.region = value === '' ? null : Number(value); persist.region(); applyFilters(); if (state.search) renderResults(); },
      setTitles,
      toggleWhatsLeft,
      collectRegion,
      async copyLeft() { try { await navigator.clipboard.writeText(leftText()); toast('List copied'); } catch { toast('Could not copy'); } },
      async saveLeft() { const ok = await window.api.exportProgress(leftText(), `${gameSlug}-${mapSlug}-whats-left.txt`, 'text'); if (ok) toast('List saved'); },
      nextUncollected,
      toggleTracked,
      trackAll,
      closePopup() { map.closePopup(); },
      collectOpen() {
        const btn = el.map.querySelector('.leaflet-popup [data-toggle]');
        if (!btn) { toast('Open a marker first (click it), then press C'); return; }
        toggleCollected(isCustomId(btn.dataset.toggle) ? btn.dataset.toggle : Number(btn.dataset.toggle));
      },
      setSearch(value) { state.search = String(value).trim().toLowerCase(); applyFilters(); renderResults(); },
      onMapClick(e) {
        const t = e.target.closest('[data-toggle],[data-goto],[data-ext],[data-add-custom],[data-delete-custom],.pp-media.spoiler');
        if (!t) return;
        // Re-rendering the popup detaches the clicked element, after which Leaflet can no longer
        // tell the click came from inside the popup and would close it as a map click.
        e.stopPropagation();
        if (t.dataset.toggle) toggleCollected(isCustomId(t.dataset.toggle) ? t.dataset.toggle : Number(t.dataset.toggle));
        else if (t.dataset.goto) { e.preventDefault(); focusMarker(Number(t.dataset.goto)); }
        else if (t.dataset.ext) { e.preventDefault(); window.api.openExternal(t.getAttribute('href')); }
        else if (t.dataset.addCustom) { const [x, y] = t.dataset.addCustom.split(',').map(Number); addCustomMarker(x, y); }
        else if (t.dataset.deleteCustom) deleteCustomMarker(t.dataset.deleteCustom);
        else if (t.classList.contains('spoiler')) t.classList.remove('spoiler');
      },
      onMapInput(e) {
        const t = e.target;
        if (!t || !t.dataset) return;
        if (t.dataset.note) {
          const id = Number(t.dataset.note);
          if (t.value.trim()) state.notes[id] = t.value; else delete state.notes[id];
          persistNotesSoon();
        } else if (t.dataset.customTitle) {
          const entry = entries.get(t.dataset.customTitle);
          if (!entry) return;
          entry.data.title = t.value;
          entry.marker.setTooltipContent(t.value || 'My marker');
          persistCustomSoon();
        } else if (t.dataset.customNotes) {
          const entry = entries.get(t.dataset.customNotes);
          if (!entry) return;
          entry.data.description = t.value;
          persistCustomSoon();
        }
      },
      onImageLoad(e) {
        // The popup auto-pans when it opens, before its screenshot has a height; lay it out again once.
        if (!openPopup || openPopup._relaidOut || e.target.tagName !== 'IMG' || !e.target.closest('.pp-media')) return;
        openPopup._relaidOut = true;
        openPopup.update();
      },
      async exportProgress() {
        const payload = { app: 'game-map-tracker', game: gameSlug, map: mapSlug, mapId: data.map.id, exportedAt: new Date().toISOString(), collected: state.collected, notes: state.notes, custom: state.custom };
        const ok = await window.api.exportProgress(JSON.stringify(payload, null, 2), `${gameSlug}-${mapSlug}-progress.json`);
        if (ok) toast('Progress exported');
      },
      async importProgress() {
        const text = await window.api.importProgress();
        if (!text) return;
        try {
          const parsed = JSON.parse(text);
          const one = parsed && Array.isArray(parsed.maps) ? parsed.maps.find((m) => m.mapId === data.map.id) : parsed;
          if (!one) throw new Error('That file has no progress for this map');
          if (one.mapId && one.mapId !== data.map.id) throw new Error(`That file is for a different map (${one.game || '?'} / ${one.map || '?'})`);
          const src = one && typeof one.collected === 'object' ? one.collected : one;
          if (!src || typeof src !== 'object') throw new Error('That file is not a progress export');
          let imported = 0;
          for (const [key, value] of Object.entries(src)) {
            const id = isCustomId(key) ? key : Number(key);
            if (!entries.has(id) && !isCustomId(key)) continue;
            state.collected[id] = typeof value === 'string' ? value : new Date().toISOString();
            imported++;
          }
          if (one.notes && typeof one.notes === 'object') Object.assign(state.notes, one.notes);
          if (Array.isArray(one.custom)) {
            for (const c of one.custom) {
              if (!c || !isCustomId(c.id) || entries.has(c.id)) continue;
              const copy = { id: c.id, categoryId: CUSTOM, title: String(c.title || 'My marker'), description: String(c.description || ''), x: Number(c.x), y: Number(c.y), media: [], createdAt: c.createdAt || new Date().toISOString() };
              if (!Number.isFinite(copy.x) || !Number.isFinite(copy.y)) continue;
              state.custom.push(copy);
              makeEntry(copy, customCategory);
            }
          }
          persist.collected(); persist.notes(); persist.custom();
          for (const entry of entries.values()) refreshEntry(entry);
          renderProgress();
          applyFilters();
          if (state.search) renderResults();
          toast(`Imported ${imported} collected marker${imported === 1 ? '' : 's'}`);
        } catch (err) {
          toast(err.message || 'That file is not a progress export');
        }
      },
      resetProgress() {
        if (!window.confirm('Clear every collected marker on this map? Notes and your own markers are kept. This cannot be undone (export first if unsure).')) return;
        state.collected = {};
        persist.collected();
        for (const entry of entries.values()) refreshEntry(entry);
        renderProgress();
        applyFilters();
        if (state.search) renderResults();
        toast('Progress reset');
      },
    };
  }

  return { init, open, close, toast };
})();
