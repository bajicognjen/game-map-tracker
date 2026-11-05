'use strict';
/**
 * Map view: Leaflet on a flat pixel grid for one map of one game.
 *
 * The CRS is a CRS.Simple variant whose scale is 2^(zoom − nativeMaxZoom), so Leaflet's zoom
 * levels line up with the tile pyramid and 1 unit = 1 pixel at the native max zoom.
 * Progress ("collected"), filters and the last view are stored per map with LocalForage.
 *
 * Controls: click a marker for details, right-click (or the popup button) to toggle collected.
 */
window.MapView = (() => {
  const $ = (id) => document.getElementById(id);
  const el = {
    back: $('back-library'), gameTitle: $('game-title'), mapSelect: $('map-select'), mapTitle: $('map-title'),
    progressText: $('progress-text'), progressPct: $('progress-pct'), progressFill: $('progress-fill'),
    search: $('search'), hideCollected: $('hide-collected'), showAll: $('show-all'), hideAll: $('hide-all'),
    visibleCount: $('visible-count'), categories: $('categories'),
    exportBtn: $('export-progress'), importBtn: $('import-progress'), resetBtn: $('reset-progress'),
    tileStatus: $('tile-status'), toast: $('toast'), map: $('map'),
  };
  let onBack = () => {};
  let onOpened = () => {};
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
    onOpened = opts.onOpened || onOpened;
    el.back.addEventListener('click', () => onBack());
    el.mapSelect.addEventListener('change', () => { if (view) open(view.source, view.gameSlug, el.mapSelect.value).catch((e) => toast(ipcMessage(e))); });
    el.categories.addEventListener('change', (e) => view && view.onCategoryChange(e));
    el.showAll.addEventListener('click', () => view && view.showAll());
    el.hideAll.addEventListener('click', () => view && view.hideAll());
    el.hideCollected.addEventListener('change', () => view && view.setHideCollected(el.hideCollected.checked));
    el.search.addEventListener('input', debounce(() => view && view.setSearch(el.search.value), 120));
    el.exportBtn.addEventListener('click', () => view && view.exportProgress());
    el.importBtn.addEventListener('click', () => view && view.importProgress());
    el.resetBtn.addEventListener('click', () => view && view.resetProgress());
    // Leaflet stops click propagation at the popup wrapper, so listen in the capture phase.
    el.map.addEventListener('click', (e) => view && view.onMapClick(e), true);
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
    onOpened(source, gameSlug, mapSlug);
  }

  function close() {
    if (view) { view.destroy(); view = null; }
    el.categories.innerHTML = '';
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
    const readyMaps = game.maps.filter((m) => m.ready);
    el.mapSelect.innerHTML = readyMaps.map((m) => `<option value="${esc(m.slug)}"${m.slug === mapSlug ? ' selected' : ''}>${esc(m.title)}</option>`).join('');
    el.mapSelect.classList.toggle('hidden', readyMaps.length < 2);

    // persistence (one small IndexedDB per map; the site's map ids are globally unique)
    const store = localforage.createInstance({ name: `game-map-tracker-map-${data.map.id}` });
    const state = {
      collected: (await store.getItem('collected')) || {},
      hidden: new Set((await store.getItem('hiddenCategories')) || []),
      hideCollected: !!(await store.getItem('hideCollected')),
      view: await store.getItem('view'),
      search: '',
    };
    const persist = {
      collected: () => store.setItem('collected', state.collected),
      hidden: () => store.setItem('hiddenCategories', [...state.hidden]),
      hideCollected: () => store.setItem('hideCollected', state.hideCollected),
      view: () => store.setItem('view', state.view),
    };
    const isCollected = (id) => Object.prototype.hasOwnProperty.call(state.collected, id);
    el.search.value = '';
    el.hideCollected.checked = state.hideCollected;

    const categoriesById = new Map(data.categories.map((c) => [c.id, c]));
    const groupsById = new Map(data.groups.map((g) => [g.id, g]));
    const regionsById = new Map(data.regions.map((r) => [r.id, r]));

    // ---------- Leaflet map ----------
    const CRS = L.extend({}, L.CRS.Simple, {
      transformation: new L.Transformation(1, 0, 1, 0), // x right, y down: image pixel space
      scale: (zoom) => Math.pow(2, zoom - NATIVE_ZOOM),
      zoom: (scale) => Math.log(scale) / Math.LN2 + NATIVE_ZOOM,
    });
    const mapBounds = L.latLngBounds([[0, 0], [data.map.height, data.map.width]]);
    const map = L.map(el.map, {
      crs: CRS,
      minZoom: T.minZoom,
      maxZoom: T.maxZoom,
      zoomSnap: 0.25,
      zoomDelta: 0.5,
      wheelPxPerZoomLevel: 90,
      maxBounds: mapBounds.pad(0.05),
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
      const c = map.getCenter();
      state.view = { x: c.lng, y: c.lat, zoom: map.getZoom() };
      persist.view();
    }, 300));

    const HomeControl = L.Control.extend({
      onAdd() {
        const bar = L.DomUtil.create('div', 'leaflet-bar');
        const a = L.DomUtil.create('a', 'mg-home', bar);
        a.href = '#'; a.title = 'Reset view'; a.setAttribute('role', 'button'); a.textContent = '⌂';
        L.DomEvent.on(a, 'click', (e) => { L.DomEvent.stop(e); goHome(); });
        return bar;
      },
    });
    new HomeControl({ position: 'topright' }).addTo(map);

    el.tileStatus.textContent = tilesLocal
      ? `Map tiles: offline copy (zoom ${tileStatus.minZoom}–${tileStatus.maxZoom})`
      : 'Map tiles: streaming from the map site (needs internet) — update the game with tiles for offline use';

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
    const iconCache = new Map();
    function iconFor(category, collected) {
      const key = `${category.id}|${collected ? 1 : 0}`;
      let icon = iconCache.get(key);
      if (!icon) {
        const f = frameFor(category);
        icon = L.divIcon({
          className: `mg-marker${collected ? ' collected' : ''}`,
          iconSize: [f.width, f.height],
          iconAnchor: [f.width / 2, f.height],
          popupAnchor: [0, -f.height + 6],
          tooltipAnchor: [0, -f.height + 10],
          html: `<span class="mg-pin" style="${spriteStyle(f, 1)}"></span>`,
        });
        iconCache.set(key, icon);
      }
      return icon;
    }

    // ---------- markers ----------
    const entries = new Map(); // id -> { data, category, marker }
    for (const m of data.markers) {
      const category = categoriesById.get(m.categoryId);
      if (!category) continue;
      const marker = L.marker([m.y, m.x], { icon: iconFor(category, isCollected(m.id)), riseOnHover: true, keyboard: false });
      marker.bindTooltip(m.title, { direction: 'top', opacity: 0.95 });
      marker.bindPopup(() => popupHtml(m), { maxWidth: 380, minWidth: 260, className: 'mg-popup', autoPanPadding: [40, 40] });
      marker.on('contextmenu', (e) => { if (e.originalEvent) e.originalEvent.preventDefault(); toggleCollected(m.id); });
      marker.on('popupopen', () => marker.closeTooltip()); // Leaflet also opens the tooltip on click
      entries.set(m.id, { data: m, category, marker });
    }

    function isVisible(entry) {
      const m = entry.data;
      if (state.hidden.has(m.categoryId)) return false;
      if (state.hideCollected && isCollected(m.id)) return false;
      if (state.search) {
        const hay = `${m.title}\n${m.description || ''}\n${entry.category.title}`.toLowerCase();
        if (!hay.includes(state.search)) return false;
      }
      return true;
    }
    function applyFilters() {
      let shown = 0;
      for (const entry of entries.values()) {
        const visible = isVisible(entry);
        const onMap = map.hasLayer(entry.marker);
        if (visible && !onMap) entry.marker.addTo(map);
        else if (!visible && onMap) map.removeLayer(entry.marker);
        if (visible) shown++;
      }
      el.visibleCount.textContent = state.search
        ? `${shown} match${shown === 1 ? '' : 'es'} for “${state.search}”`
        : `${shown} of ${entries.size} markers shown`;
    }
    function refreshEntry(entry) {
      entry.marker.setIcon(iconFor(entry.category, isCollected(entry.data.id)));
      if (entry.marker.isPopupOpen()) entry.marker.getPopup().setContent(popupHtml(entry.data));
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
    }
    function focusMarker(id) {
      const entry = entries.get(id);
      if (!entry) return;
      let changed = false;
      if (state.hidden.has(entry.data.categoryId)) { state.hidden.delete(entry.data.categoryId); persist.hidden(); changed = true; }
      if (state.hideCollected && isCollected(id)) { state.hideCollected = false; el.hideCollected.checked = false; persist.hideCollected(); changed = true; }
      if (state.search) { state.search = ''; el.search.value = ''; changed = true; }
      if (changed) { syncCategoryUI(); applyFilters(); }
      map.closePopup();
      let opened = false;
      const openIt = () => { if (!opened) { opened = true; entry.marker.openPopup(); } };
      map.once('moveend', openIt);
      setTimeout(openIt, 700);
      map.setView([entry.data.y, entry.data.x], Math.max(map.getZoom(), T.nativeMaxZoom - 1), { animate: true });
    }

    // ---------- popup ----------
    const mediaSrc = (media) => (localMedia.has(media.file) ? `${mapBase}/media/${media.file}` : media.url);
    function popupHtml(m) {
      const c = categoriesById.get(m.categoryId);
      const g = groupsById.get(c.groupId);
      const r = regionsById.get(m.regionId);
      const collected = isCollected(m.id);
      const media = m.media[0];
      return `
        <div class="pp">
          <div class="pp-head">
            <span class="pp-cat" style="color:${(g && g.color) || '#9aa'}">${esc(c.title)}</span>
            ${r ? `<span class="pp-sep">·</span><span class="pp-region">${esc(r.title)}</span>` : ''}
          </div>
          <h3 class="pp-title">${esc(m.title)}</h3>
          ${m.description ? `<div class="pp-desc">${md(m.description)}</div>` : ''}
          ${!m.description && c.info ? `<div class="pp-desc muted">${md(c.info)}</div>` : ''}
          ${media ? `<div class="pp-media${media.spoiler ? ' spoiler' : ''}"><img src="${esc(mediaSrc(media))}" alt="" loading="lazy"></div>` : ''}
          <button type="button" class="pp-toggle${collected ? ' done' : ''}" data-toggle="${m.id}">
            ${collected ? '✓ Collected · click to undo' : 'Mark as collected'}
          </button>
          <div class="pp-meta">${collected ? `Found ${esc(fmtDate(state.collected[m.id]))} · ` : ''}#${m.id} · x ${Math.round(m.x)}, y ${Math.round(m.y)}</div>
        </div>`;
    }
    let openPopup = null;
    map.on('popupopen', (e) => { openPopup = e.popup; });
    map.on('popupclose', (e) => { delete e.popup._relaidOut; openPopup = null; });

    // ---------- sidebar ----------
    function renderCategories() {
      const sections = [];
      for (const g of data.groups) {
        const cats = data.categories.filter((c) => c.groupId === g.id);
        if (!cats.length) continue;
        const items = cats.map((c) => `
          <li class="cat${state.hidden.has(c.id) ? ' off' : ''}" data-cat="${c.id}">
            <label class="chk">
              <input type="checkbox" class="cat-toggle" data-cat="${c.id}" ${state.hidden.has(c.id) ? '' : 'checked'}>
              <span class="cat-icon" style="${spriteStyle(frameFor(c), 0.5)}"></span>
              <span class="cat-title" title="${esc(c.info || c.title)}">${esc(c.title)}</span>
            </label>
            <span class="count" data-cat-count="${c.id}"></span>
          </li>`).join('');
        sections.push(`
          <section class="group" data-group="${g.id}">
            <header class="group-head">
              <label class="chk">
                <input type="checkbox" class="group-toggle" data-group="${g.id}">
                <span class="group-title" style="color:${g.color || '#ccc'}">${esc(g.title)}</span>
              </label>
              <span class="count" data-group-count="${g.id}"></span>
            </header>
            <ul class="cats">${items}</ul>
          </section>`);
      }
      // categories without a known group
      const orphans = data.categories.filter((c) => !groupsById.has(c.groupId));
      if (orphans.length) {
        sections.push(`<section class="group"><header class="group-head"><span class="group-title">Other</span></header><ul class="cats">${orphans.map((c) => `
          <li class="cat${state.hidden.has(c.id) ? ' off' : ''}" data-cat="${c.id}"><label class="chk"><input type="checkbox" class="cat-toggle" data-cat="${c.id}" ${state.hidden.has(c.id) ? '' : 'checked'}><span class="cat-icon" style="${spriteStyle(frameFor(c), 0.5)}"></span><span class="cat-title">${esc(c.title)}</span></label><span class="count" data-cat-count="${c.id}"></span></li>`).join('')}</ul></section>`);
      }
      el.categories.innerHTML = sections.join('');
      syncCategoryUI();
      renderCounts();
    }
    function syncCategoryUI() {
      for (const input of el.categories.querySelectorAll('.cat-toggle')) {
        const id = Number(input.dataset.cat);
        input.checked = !state.hidden.has(id);
        input.closest('.cat').classList.toggle('off', state.hidden.has(id));
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
        const entry = entries.get(Number(id));
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
    }
    function renderProgress() {
      const total = entries.size;
      const found = Object.keys(state.collected).filter((id) => entries.has(Number(id))).length;
      const pct = total ? Math.round((found / total) * 100) : 0;
      el.progressText.textContent = `${found} / ${total} found`;
      el.progressPct.textContent = `${pct}%`;
      el.progressFill.style.width = `${pct}%`;
      renderCounts();
    }

    renderCategories();
    renderProgress();
    applyFilters();

    // ---------- handlers used by the static wiring ----------
    return {
      source, gameSlug, mapSlug,
      destroy() { map.remove(); openPopup = null; },
      onCategoryChange(e) {
        const t = e.target;
        if (t.classList.contains('cat-toggle')) {
          const id = Number(t.dataset.cat);
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
      hideAll() { for (const c of data.categories) state.hidden.add(c.id); persist.hidden(); syncCategoryUI(); applyFilters(); },
      setHideCollected(value) { state.hideCollected = !!value; persist.hideCollected(); applyFilters(); },
      setSearch(value) { state.search = String(value).trim().toLowerCase(); applyFilters(); },
      onMapClick(e) {
        const t = e.target.closest('[data-toggle],[data-goto],[data-ext],.pp-media.spoiler');
        if (!t) return;
        // Re-rendering the popup detaches the clicked element, after which Leaflet can no longer
        // tell the click came from inside the popup and would close it as a map click.
        e.stopPropagation();
        if (t.dataset.toggle) toggleCollected(Number(t.dataset.toggle));
        else if (t.dataset.goto) { e.preventDefault(); focusMarker(Number(t.dataset.goto)); }
        else if (t.dataset.ext) { e.preventDefault(); window.api.openExternal(t.getAttribute('href')); }
        else if (t.classList.contains('spoiler')) t.classList.remove('spoiler');
      },
      onImageLoad(e) {
        // The popup auto-pans when it opens, before its screenshot has a height; lay it out again once.
        if (!openPopup || openPopup._relaidOut || e.target.tagName !== 'IMG' || !e.target.closest('.pp-media')) return;
        openPopup._relaidOut = true;
        openPopup.update();
      },
      async exportProgress() {
        const payload = { app: 'game-map-tracker', game: gameSlug, map: mapSlug, mapId: data.map.id, exportedAt: new Date().toISOString(), collected: state.collected };
        const ok = await window.api.exportProgress(JSON.stringify(payload, null, 2), `${gameSlug}-${mapSlug}-progress.json`);
        if (ok) toast('Progress exported');
      },
      async importProgress() {
        const text = await window.api.importProgress();
        if (!text) return;
        try {
          const parsed = JSON.parse(text);
          if (parsed && parsed.mapId && parsed.mapId !== data.map.id) throw new Error(`That file is for a different map (${parsed.game || '?'} / ${parsed.map || '?'})`);
          const source = parsed && typeof parsed.collected === 'object' ? parsed.collected : parsed;
          if (!source || typeof source !== 'object') throw new Error('That file is not a progress export');
          let imported = 0;
          for (const [key, value] of Object.entries(source)) {
            const id = Number(key);
            if (!entries.has(id)) continue;
            state.collected[id] = typeof value === 'string' ? value : new Date().toISOString();
            imported++;
          }
          persist.collected();
          for (const entry of entries.values()) refreshEntry(entry);
          renderProgress();
          applyFilters();
          toast(`Imported ${imported} collected marker${imported === 1 ? '' : 's'}`);
        } catch (err) {
          toast(err.message || 'That file is not a progress export');
        }
      },
      resetProgress() {
        if (!window.confirm('Clear every collected marker on this map? This cannot be undone (export first if unsure).')) return;
        state.collected = {};
        persist.collected();
        for (const entry of entries.values()) refreshEntry(entry);
        renderProgress();
        applyFilters();
        toast('Progress reset');
      },
    };
  }

  return { init, open, close, toast };
})();
