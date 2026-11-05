'use strict';
/** Library screen: installed games; look up a game's map link, pick what to download, add it; update and remove games. */
window.Library = (() => {
  const $ = (id) => document.getElementById(id);
  const el = {
    form: $('add-form'), url: $('add-url'), submit: $('add-submit'), cancelBtn: $('cancel-btn'), status: $('add-status'),
    plan: $('add-plan'), planTitle: $('plan-title'), planNote: $('plan-note'), planMaps: $('plan-maps'), planBack: $('plan-back'),
    tiles: $('add-tiles'), zoom: $('add-zoom'), media: $('add-media'),
    progress: $('add-progress'), fill: $('add-fill'), log: $('add-log'),
    list: $('game-list'), empty: $('lib-empty'), version: $('app-version'), checkUpdates: $('check-updates'),
    exportAll: $('export-all'), importAll: $('import-all'),
  };
  let onOpen = () => {};
  let games = [];
  let busy = false;
  let lookup = null; // result of the last "Look up": { input, title, maps, installed }

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ipcMessage = (err) => String((err && err.message) || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
  const toast = (m) => window.MapView.toast(m);

  async function progressFor(game) {
    let found = 0;
    let total = 0;
    for (const m of game.maps) {
      total += m.markerCount || 0;
      try {
        const collected = await localforage.createInstance({ name: `game-map-tracker-map-${m.id}` }).getItem('collected');
        found += collected ? Object.keys(collected).length : 0;
      } catch { /* no progress yet */ }
    }
    return { found, total, pct: total ? Math.round((found / total) * 100) : 0 };
  }

  async function render() {
    el.empty.classList.toggle('hidden', games.length > 0);
    const cards = [];
    for (const g of games) {
      const p = await progressFor(g);
      const maps = g.maps.filter((m) => m.markerCount !== 0).map((m) => `
        <li>
          <div>
            <div class="name">${esc(m.title)}</div>
            <div class="meta">${m.markerCount || 0} locations · ${m.tiles.available ? `offline tiles (zoom ${m.tiles.minZoom}–${m.tiles.maxZoom})` : 'online tiles'} · ${m.mediaCount} screenshots</div>
          </div>
          <button type="button" class="btn" data-open="${esc(m.slug)}" ${m.ready ? '' : 'disabled'}>Open</button>
        </li>`).join('');
      cards.push(`
        <article class="card game-card" data-game="${esc(g.slug)}" data-source="${esc(g.source)}">
          <div class="row between">
            <h3 class="title">${esc(g.title)}</h3>
            ${g.source === 'bundled' ? '<span class="badge">bundled</span>' : ''}
          </div>
          <div class="muted small">${g.maps.length} map${g.maps.length === 1 ? '' : 's'} · ${p.found} / ${p.total} found (${p.pct}%)</div>
          <div class="progress-bar"><div style="width:${p.pct}%"></div></div>
          <ul class="maps">${maps}</ul>
          <div class="actions">
            <button type="button" class="btn" data-update="1" title="Re-read the map data from its site and fetch anything missing">Update</button>
            ${g.source === 'user' ? '<button type="button" class="btn danger" data-remove="1">Remove</button>' : ''}
          </div>
        </article>`);
    }
    el.list.innerHTML = cards.join('');
  }

  async function refresh() {
    games = await window.api.listGames();
    await render();
    return games;
  }

  function logLine(text, cls) {
    const li = document.createElement('li');
    li.textContent = text;
    if (cls) li.className = cls;
    el.log.appendChild(li);
    while (el.log.children.length > 60) el.log.removeChild(el.log.firstChild);
    el.log.scrollTop = el.log.scrollHeight;
  }

  function setPhase() {
    const planning = !!lookup;
    el.plan.classList.toggle('hidden', !planning);
    el.submit.textContent = planning ? 'Add game' : 'Look up';
    el.url.readOnly = planning;
  }

  function renderPlan() {
    el.planTitle.textContent = lookup.title;
    el.planNote.textContent = lookup.installed ? '— already installed; adding again updates it' : `— ${lookup.maps.length} map${lookup.maps.length === 1 ? '' : 's'}`;
    el.planMaps.innerHTML = lookup.maps.map((m) => `<label class="chk"><input type="checkbox" class="plan-map" value="${esc(m.slug)}" checked> ${esc(m.title)}</label>`).join('');
    setPhase();
  }

  async function withJob(fn) {
    if (busy) return;
    busy = true;
    el.submit.disabled = true;
    el.cancelBtn.classList.remove('hidden');
    el.cancelBtn.disabled = false;
    try {
      await fn();
    } finally {
      busy = false;
      el.submit.disabled = false;
      el.cancelBtn.classList.add('hidden');
      el.status.textContent = '';
    }
  }

  async function doLookup(input) {
    await withJob(async () => {
      const unsubscribe = window.api.onJobProgress((p) => { el.status.textContent = p.message; });
      try {
        lookup = await window.api.lookupGame(input);
        lookup.input = input;
        renderPlan();
      } catch (err) {
        const msg = ipcMessage(err);
        toast(msg === 'Cancelled' ? 'Look-up cancelled' : msg);
      } finally {
        unsubscribe();
      }
    });
  }

  async function runAdd(input, opts) {
    await withJob(async () => {
      el.progress.classList.remove('hidden');
      el.log.innerHTML = '';
      el.fill.style.width = '0%';
      let lastStage = null;
      const unsubscribe = window.api.onJobProgress((p) => {
        if (p.stage !== lastStage || !Number.isFinite(p.total)) logLine(p.message, p.stage === 'done' ? 'ok' : '');
        else el.log.lastChild.textContent = p.message;
        lastStage = p.stage;
        if (Number.isFinite(p.total) && p.total > 0) el.fill.style.width = `${Math.round((p.done / p.total) * 100)}%`;
        el.status.textContent = p.stage === 'done' ? '' : p.message;
      });
      try {
        const game = await window.api.addGame(input, opts);
        el.fill.style.width = '100%';
        toast(`${game.title} is ready`);
      } catch (err) {
        const msg = ipcMessage(err);
        logLine(msg === 'Cancelled' ? 'Cancelled — anything already downloaded was kept' : `Failed: ${msg}`, 'error');
      } finally {
        unsubscribe();
        await refresh();
      }
    });
  }

  async function doAdd() {
    const maps = [...el.planMaps.querySelectorAll('.plan-map:checked')].map((i) => i.value);
    if (!maps.length) { toast('Pick at least one map'); return; }
    const input = lookup.input;
    const opts = { maps, tiles: el.tiles.checked, media: el.media.checked, zoomOffset: Number(el.zoom.value) || 0 };
    lookup = null;
    el.url.value = '';
    setPhase();
    await runAdd(input, opts);
  }

  const mapStore = (mapId) => localforage.createInstance({ name: `game-map-tracker-map-${mapId}` });

  async function exportAll() {
    const maps = [];
    for (const g of games) {
      for (const m of g.maps) {
        const s = mapStore(m.id);
        maps.push({ game: g.slug, map: m.slug, mapId: m.id, collected: (await s.getItem('collected')) || {}, notes: (await s.getItem('notes')) || {}, custom: (await s.getItem('custom')) || [] });
      }
    }
    const payload = { app: 'game-map-tracker', kind: 'all', exportedAt: new Date().toISOString(), maps };
    const ok = await window.api.exportProgress(JSON.stringify(payload, null, 2), 'game-map-tracker-progress.json');
    if (ok) toast(`Exported progress for ${maps.length} map${maps.length === 1 ? '' : 's'}`);
  }

  async function importAll() {
    const text = await window.api.importProgress();
    if (!text) return;
    let parsed;
    try { parsed = JSON.parse(text); } catch { toast('That file is not a progress export'); return; }
    const list = parsed && Array.isArray(parsed.maps) ? parsed.maps : (parsed && parsed.mapId ? [parsed] : []);
    if (!list.length) { toast('That file has no progress in it'); return; }
    let touched = 0;
    for (const one of list) {
      const owner = games.find((g) => g.maps.some((m) => m.id === one.mapId));
      const mapMeta = owner && owner.maps.find((m) => m.id === one.mapId);
      if (!mapMeta) continue;
      const s = mapStore(one.mapId);
      const collected = Object.assign((await s.getItem('collected')) || {}, (one.collected && typeof one.collected === 'object') ? one.collected : {});
      const notes = Object.assign((await s.getItem('notes')) || {}, (one.notes && typeof one.notes === 'object') ? one.notes : {});
      const custom = (await s.getItem('custom')) || [];
      for (const c of Array.isArray(one.custom) ? one.custom : []) if (c && c.id && !custom.some((x) => x.id === c.id)) custom.push(c);
      await s.setItem('collected', collected); await s.setItem('notes', notes); await s.setItem('custom', custom);
      window.api.writeBackup(owner.slug, mapMeta.slug, JSON.stringify({ app: 'game-map-tracker', game: owner.slug, map: mapMeta.slug, mapId: one.mapId, savedAt: new Date().toISOString(), collected, notes, custom })).catch(() => {});
      touched++;
    }
    toast(touched ? `Imported progress for ${touched} map${touched === 1 ? '' : 's'}` : 'None of the maps in that file are installed');
    await refresh();
  }

  function init(opts) {
    onOpen = opts.onOpen || onOpen;
    el.exportAll.addEventListener('click', () => exportAll().catch((err) => toast(ipcMessage(err))));
    el.importAll.addEventListener('click', () => importAll().catch((err) => toast(ipcMessage(err))));
    window.api.appInfo().then((info) => { el.version.textContent = `Version ${info.version}`; }).catch(() => {});
    el.checkUpdates.addEventListener('click', () => window.api.checkForUpdates());
    el.form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (lookup) doAdd();
      else {
        const input = el.url.value.trim();
        if (input) doLookup(input);
      }
    });
    el.planBack.addEventListener('click', () => { lookup = null; setPhase(); });
    el.cancelBtn.addEventListener('click', () => { el.cancelBtn.disabled = true; window.api.cancelJob().catch(() => {}); });
    el.list.addEventListener('click', async (e) => {
      const btn = e.target.closest('button');
      const card = e.target.closest('.game-card');
      if (!btn || !card) return;
      const slug = card.dataset.game;
      const source = card.dataset.source;
      const g = games.find((x) => x.slug === slug);
      if (btn.dataset.open) onOpen(source, slug, btn.dataset.open);
      else if (btn.dataset.update) {
        if (!g || !g.sourceUrl) { toast('This game has no source link; remove it and add it again'); return; }
        runAdd(g.sourceUrl, g.importOptions || { tiles: true, media: true, zoomOffset: 0, maps: g.maps.map((m) => m.slug) });
      } else if (btn.dataset.remove) {
        if (!window.confirm(`Remove ${g ? g.title : slug} and its downloaded tiles and screenshots? Your collected progress is kept.`)) return;
        try { await window.api.removeGame(slug); toast('Game removed'); } catch (err) { toast(ipcMessage(err)); }
        await refresh();
      }
    });
    setPhase();
  }

  return { init, refresh, toast };
})();
