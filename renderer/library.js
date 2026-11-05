'use strict';
/** Library screen: installed games; look up a game's map link, pick what to download, add it; update and remove games. */
window.Library = (() => {
  const $ = (id) => document.getElementById(id);
  const el = {
    form: $('add-form'), url: $('add-url'), submit: $('add-submit'), cancelBtn: $('cancel-btn'), stopBtn: $('stop-tiles-btn'), status: $('add-status'),
    plan: $('add-plan'), planTitle: $('plan-title'), planNote: $('plan-note'), planMaps: $('plan-maps'), planBack: $('plan-back'),
    tiles: $('add-tiles'), zoom: $('add-zoom'), media: $('add-media'),
    progress: $('add-progress'), fill: $('add-fill'), log: $('add-log'),
    list: $('game-list'), empty: $('lib-empty'), version: $('app-version'),
    exportAll: $('export-all'), importAll: $('import-all'), checkAll: $('check-all'),
    openSettings: $('open-settings'), closeSettings: $('close-settings'), settingsPanel: $('settings-panel'),
    gamesDir: $('games-dir'), backupsDir: $('backups-dir'), settingsMove: $('settings-move'), settingsStatus: $('settings-status'),
    reportProblem: $('report-problem'),
  };
  const MB = (b) => {
    if (!b) return '0 MB';
    if (b >= 1048576 * 1000) return `${(b / 1073741824).toFixed(1)} GB`;
    if (b >= 1048576) return `${Math.round(b / 1048576)} MB`;
    return `${Math.max(1, Math.round(b / 1024))} KB`;
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
      const maps = g.maps.filter((m) => m.markerCount !== 0).map((m) => {
        const native = m.tiles.nativeMaxZoom || m.nativeMaxZoom || null;
        const partial = m.tiles.available && native && m.tiles.maxZoom < native;
        const tilesText = m.tiles.available ? `offline tiles to zoom ${m.tiles.maxZoom}${native ? ` of ${native}` : ''}` : 'online tiles';
        return `
        <li>
          <div>
            <div class="name">${esc(m.title)}</div>
            <div class="meta">${m.markerCount || 0} locations · ${tilesText} · ${m.mediaCount} screenshots${partial ? ` · <button type="button" class="link detail" data-detail="${esc(m.slug)}" title="Download the finer zoom levels">add detail</button>` : ''}</div>
          </div>
          <button type="button" class="btn small-btn" data-open="${esc(m.slug)}" ${m.ready ? '' : 'disabled'}>Open</button>
        </li>`;
      }).join('');
      const tiles = g.sizes ? g.sizes.tiles : 0;
      const media = g.sizes ? g.sizes.media : 0;
      const cover = g.cover ? `gamemap://${esc(g.source)}/${esc(g.slug)}/${esc(g.cover)}` : '';
      cards.push(`
        <article class="card game-card" data-game="${esc(g.slug)}" data-source="${esc(g.source)}">
          <div class="hero${g.coverKind === 'logo' ? ' logo' : ''}"${cover ? ` style="background-image:url('${cover}')"` : ''}>
            ${g.source === 'bundled' ? '<span class="badge">bundled</span>' : ''}
            <h3 class="title">${esc(g.title)}</h3>
            <details class="menu">
              <summary title="More actions" aria-label="More actions">···</summary>
              <div class="menu-items">
                <button type="button" data-update="1" title="Re-read the map data from its site and fetch anything missing">Update from the site</button>
                <button type="button" data-clean="tiles" ${tiles ? '' : 'disabled'} title="Delete the offline tiles; the map then streams them from the site">Delete offline tiles <span class="size">${MB(tiles)}</span></button>
                <button type="button" data-clean="media" ${media ? '' : 'disabled'} title="Delete the downloaded screenshots; popups then load them from the site">Delete screenshots <span class="size">${MB(media)}</span></button>
                ${g.source === 'user' ? '<hr><button type="button" class="danger" data-remove="1">Remove game</button>' : ''}
              </div>
            </details>
          </div>
          <div class="card-body">
            <div>
              <div class="progress-line"><span>${p.found} / ${p.total} found</span><span class="pct">${p.pct}%</span></div>
              <div class="progress-bar"><div style="width:${p.pct}%"></div></div>
            </div>
            <ul class="maps">${maps}</ul>
            <div class="storage">${g.maps.length} map${g.maps.length === 1 ? '' : 's'} · tiles ${MB(tiles)} · screenshots ${MB(media)}</div>
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
      el.stopBtn.classList.add('hidden');
      el.stopBtn.disabled = false;
      el.stopBtn.textContent = 'Stop tiles at this zoom';
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
        el.stopBtn.classList.toggle('hidden', !(p.stage === 'tiles' && p.canStop));
      });
      try {
        const game = await window.api.addGame(input, opts);
        el.fill.style.width = '100%';
        toast(`${game.title} is ready`);
      } catch (err) {
        const msg = ipcMessage(err);
        logLine(msg === 'Cancelled' ? 'Cancelled — anything already downloaded was kept' : `Failed: ${msg}`, 'error');
        if (msg !== 'Cancelled') logLine('Details are in the log (Help → Show log folder); "Report a problem" opens an issue with it attached.', 'hint');
      } finally {
        unsubscribe();
        await refresh();
      }
    });
  }

  async function runRefreshAll() {
    if (!games.some((g) => g.source === 'user')) { toast('No games to check yet'); return; }
    await withJob(async () => {
      el.progress.classList.remove('hidden');
      el.log.innerHTML = '';
      el.fill.style.width = '0%';
      const unsubscribe = window.api.onJobProgress((p) => { logLine(p.message, p.stage === 'done' ? 'ok' : ''); el.status.textContent = p.stage === 'done' ? '' : p.message; });
      try {
        const results = await window.api.refreshAllGames();
        el.fill.style.width = '100%';
        let added = 0;
        for (const g of results) for (const m of g.maps || []) added += m.added || 0;
        if (added) logLine(`${added} new location${added === 1 ? '' : 's'} in total. Run Update on a game to download their screenshots.`, 'hint');
        toast(added ? `${added} new location${added === 1 ? '' : 's'} found` : 'No new locations');
      } catch (err) {
        const msg = ipcMessage(err);
        logLine(msg === 'Cancelled' ? 'Cancelled' : `Failed: ${msg}`, 'error');
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

  // ---------- settings ----------
  async function renderSettings() {
    const s = await window.api.getSettings();
    el.gamesDir.textContent = s.gamesDir; el.gamesDir.title = s.gamesDir;
    el.backupsDir.textContent = s.backupsDir; el.backupsDir.title = s.backupsDir;
    el.settingsPanel.querySelector('[data-default="games"]').classList.toggle('hidden', !s.gamesDirCustom);
    el.settingsPanel.querySelector('[data-default="backups"]').classList.toggle('hidden', !s.backupsDirCustom);
  }
  async function applySettings(change) {
    el.settingsStatus.textContent = el.settingsMove.checked ? 'Moving files… this can take a while for large folders.' : 'Saving…';
    try {
      await window.api.applySettings({ ...change, move: el.settingsMove.checked });
      el.settingsStatus.textContent = '';
      toast('Settings saved');
      await renderSettings();
      await refresh();
    } catch (err) {
      el.settingsStatus.textContent = '';
      toast(ipcMessage(err));
    }
  }

  function init(opts) {
    onOpen = opts.onOpen || onOpen;
    el.openSettings.addEventListener('click', () => { el.settingsPanel.classList.toggle('hidden'); if (!el.settingsPanel.classList.contains('hidden')) renderSettings(); });
    el.closeSettings.addEventListener('click', () => el.settingsPanel.classList.add('hidden'));
    el.settingsPanel.addEventListener('click', async (e) => {
      const choose = e.target.closest('[data-choose]');
      const useDefault = e.target.closest('[data-default]');
      if (choose) {
        const kind = choose.dataset.choose;
        const folder = await window.api.chooseFolder(kind);
        if (folder) applySettings(kind === 'games' ? { gamesDir: folder } : { backupsDir: folder });
      } else if (useDefault) {
        applySettings(useDefault.dataset.default === 'games' ? { gamesDir: null } : { backupsDir: null });
      }
    });
    el.reportProblem.addEventListener('click', () => window.api.reportProblem());
    el.checkAll.addEventListener('click', () => runRefreshAll());
    el.exportAll.addEventListener('click', () => exportAll().catch((err) => toast(ipcMessage(err))));
    el.importAll.addEventListener('click', () => importAll().catch((err) => toast(ipcMessage(err))));
    window.api.appInfo().then((info) => { el.version.textContent = `Version ${info.version}`; }).catch(() => {});
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
    el.stopBtn.addEventListener('click', () => { el.stopBtn.disabled = true; el.stopBtn.textContent = 'Stopping after this zoom…'; window.api.stopTiles().catch(() => {}); });
    const closeMenus = (except) => { for (const d of el.list.querySelectorAll('details.menu[open]')) if (d !== except) d.open = false; };
    document.addEventListener('click', (e) => { if (!e.target.closest('details.menu')) closeMenus(); });
    el.list.addEventListener('click', async (e) => {
      const btn = e.target.closest('button');
      const card = e.target.closest('.game-card');
      if (e.target.closest('summary')) { closeMenus(e.target.closest('details.menu')); return; }
      if (!btn || !card) return;
      closeMenus();
      const slug = card.dataset.game;
      const source = card.dataset.source;
      const g = games.find((x) => x.slug === slug);
      if (btn.dataset.open) onOpen(source, slug, btn.dataset.open);
      else if (btn.dataset.update) {
        if (!g || !g.sourceUrl) { toast('This game has no source link; remove it and add it again'); return; }
        runAdd(g.sourceUrl, g.importOptions || { tiles: true, media: true, zoomOffset: 0, maps: g.maps.map((m) => m.slug) });
      } else if (btn.dataset.detail) {
        if (!g || !g.sourceUrl) return;
        runAdd(g.sourceUrl, { ...(g.importOptions || {}), tiles: true, zoomOffset: 0, maps: [btn.dataset.detail], media: !!(g.importOptions && g.importOptions.media) });
      } else if (btn.dataset.clean) {
        const what = btn.dataset.clean;
        if (!window.confirm(`Delete the downloaded ${what === 'tiles' ? 'map tiles' : 'screenshots'} of ${g ? g.title : slug}? Your progress and the map data stay; an Update can download them again.`)) return;
        try { const r = await window.api.cleanGame(slug, what); toast(`Freed ${MB(r.freed)}`); } catch (err) { toast(ipcMessage(err)); }
        await refresh();
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
