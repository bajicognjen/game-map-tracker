'use strict';
/** Screen switching: library <-> map view, remembering the last opened map. */
(async function main() {
  const LAST_KEY = 'game-map-tracker:last-map';
  const screens = { library: document.getElementById('library'), map: document.getElementById('mapscreen') };
  const show = (name) => { for (const [key, node] of Object.entries(screens)) node.classList.toggle('hidden', key !== name); };

  async function openMap(source, gameSlug, mapSlug) {
    show('map');
    try {
      await window.MapView.open(source, gameSlug, mapSlug);
    } catch (err) {
      window.MapView.close();
      show('library');
      window.Library.toast(String((err && err.message) || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''));
    }
  }

  function showLibrary() {
    window.MapView.close();
    show('library');
    window.Library.refresh();
  }

  window.Library.init({ onOpen: openMap });
  window.MapView.init({
    onBack: showLibrary,
    // Also fires when a map is switched from the sidebar dropdown, so the last map is always current.
    onOpened: (source, gameSlug, mapSlug) => { try { localStorage.setItem(LAST_KEY, JSON.stringify({ source, game: gameSlug, map: mapSlug })); } catch { /* ignore */ } },
  });
  window.api.onMenu((action) => { if (action === 'library') showLibrary(); });

  const games = await window.Library.refresh();
  let last = null;
  try { last = JSON.parse(localStorage.getItem(LAST_KEY)); } catch { /* ignore */ }
  const game = last && games.find((g) => g.slug === last.game && g.source === last.source);
  const map = game && game.maps.find((m) => m.slug === last.map && m.ready);
  if (game && map) openMap(game.source, game.slug, map.slug);
  else show('library');
})().catch((err) => {
  console.error(err);
  document.body.insertAdjacentHTML('beforeend', `<pre style="position:fixed;inset:0;margin:0;padding:24px;background:#300;color:#fff;overflow:auto;z-index:9999">Failed to start: ${String((err && err.stack) || err).replace(/</g, '&lt;')}</pre>`);
});
