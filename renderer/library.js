'use strict';
/** Library screen: installed games, add a game from its map link, update and remove games. */
window.Library = (() => {
  const $ = (id) => document.getElementById(id);
  const el = {
    form: $('add-form'), url: $('add-url'), tiles: $('add-tiles'), media: $('add-media'),
    addBtn: $('add-btn'), cancelBtn: $('cancel-btn'), status: $('add-status'),
    progress: $('add-progress'), fill: $('add-fill'), log: $('add-log'),
    list: $('game-list'), empty: $('lib-empty'),
  };
  let onOpen = () => {};
  let games = [];
  let adding = false;

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
      const maps = g.maps.map((m) => `
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

  async function addGame(input, opts) {
    if (adding) return;
    adding = true;
    el.addBtn.disabled = true;
    el.cancelBtn.classList.remove('hidden');
    el.progress.classList.remove('hidden');
    el.log.innerHTML = '';
    el.fill.style.width = '0%';
    el.status.textContent = '';
    let lastStage = null;
    const unsubscribe = window.api.onAddProgress((p) => {
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
      el.url.value = '';
    } catch (err) {
      const msg = ipcMessage(err);
      logLine(msg === 'Cancelled' ? 'Cancelled — anything already downloaded was kept' : `Failed: ${msg}`, 'error');
    } finally {
      unsubscribe();
      adding = false;
      el.addBtn.disabled = false;
      el.cancelBtn.classList.add('hidden');
      el.status.textContent = '';
      await refresh();
    }
  }

  function init(opts) {
    onOpen = opts.onOpen || onOpen;
    el.form.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = el.url.value.trim();
      if (!input) return;
      addGame(input, { tiles: el.tiles.checked, media: el.media.checked });
    });
    el.cancelBtn.addEventListener('click', () => { el.cancelBtn.disabled = true; window.api.cancelAdd().finally(() => { el.cancelBtn.disabled = false; }); });
    el.list.addEventListener('click', async (e) => {
      const btn = e.target.closest('button');
      const card = e.target.closest('.game-card');
      if (!btn || !card) return;
      const slug = card.dataset.game;
      const source = card.dataset.source;
      if (btn.dataset.open) onOpen(source, slug, btn.dataset.open);
      else if (btn.dataset.update) {
        const g = games.find((x) => x.slug === slug);
        if (g && g.sourceUrl) addGame(g.sourceUrl, { tiles: el.tiles.checked, media: el.media.checked });
        else toast('This game has no source link; remove it and add it again');
      }
      else if (btn.dataset.remove) {
        const g = games.find((x) => x.slug === slug);
        if (!window.confirm(`Remove ${g ? g.title : slug} and its downloaded tiles and screenshots? Your collected progress is kept.`)) return;
        try { await window.api.removeGame(slug); toast('Game removed'); } catch (err) { toast(ipcMessage(err)); }
        await refresh();
      }
    });
  }

  return { init, refresh, toast };
})();
