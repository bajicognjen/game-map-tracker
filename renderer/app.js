'use strict';
/** Screen switching (library <-> map view) and the update banner. The app always starts on the library. */
(async function main() {
  const $ = (id) => document.getElementById(id);
  const screens = { library: $('library'), map: $('mapscreen') };
  const show = (name) => { for (const [key, node] of Object.entries(screens)) node.classList.toggle('hidden', key !== name); };
  const toast = (m) => window.MapView.toast(m);

  async function openMap(source, gameSlug, mapSlug) {
    show('map');
    try {
      await window.MapView.open(source, gameSlug, mapSlug);
    } catch (err) {
      window.MapView.close();
      show('library');
      toast(String((err && err.message) || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''));
    }
  }

  function showLibrary() {
    window.MapView.close();
    show('library');
    window.Library.refresh();
  }

  window.Library.init({ onOpen: openMap });
  window.MapView.init({ onBack: showLibrary });
  window.api.onMenu((action) => { if (action === 'library') showLibrary(); });

  // ---------- update banner ----------
  const banner = { box: $('update-banner'), text: $('update-text'), action: $('update-action'), dismiss: $('update-dismiss'), notesToggle: $('update-notes-toggle'), notes: $('update-notes') };
  function showBanner(text, actionLabel, onAction, notes) {
    banner.text.textContent = text;
    banner.action.textContent = actionLabel || '';
    banner.action.classList.toggle('hidden', !actionLabel);
    banner.action.onclick = onAction || null;
    if (notes !== undefined) {
      banner.notes.textContent = notes || '';
      banner.notes.classList.add('hidden');
      banner.notesToggle.classList.toggle('hidden', !notes);
    }
    banner.box.classList.remove('hidden');
  }
  banner.notesToggle.addEventListener('click', () => banner.notes.classList.toggle('hidden'));
  banner.dismiss.addEventListener('click', () => banner.box.classList.add('hidden'));
  window.api.onUpdateStatus((s) => {
    switch (s.status) {
      case 'available':
        if (s.mode === 'auto') showBanner(`Version ${s.version} is available`, 'Download', () => { window.api.downloadUpdate(); showBanner(`Downloading version ${s.version}…`); }, s.notes);
        else showBanner(`Version ${s.version} is available`, 'Open download page', () => window.api.openExternal(s.releasesUrl), s.notes);
        break;
      case 'downloading': showBanner(`Downloading update… ${s.percent}%`); break;
      case 'downloaded': showBanner(`Version ${s.version} is ready to install`, 'Restart now', () => window.api.installUpdate()); break;
      case 'none': if (s.manual) toast(`You have the latest version (${s.current})`); break;
      case 'disabled': if (s.manual) toast('Update checks only work in the installed app'); break;
      case 'error': if (s.manual) toast(`Update check failed: ${s.message}`); break;
      default: break;
    }
  });

  // Earlier versions reopened the last map on start-up; drop what they stored.
  try { localStorage.removeItem('game-map-tracker:last-map'); } catch { /* ignore */ }
  show('library');
  await window.Library.refresh();
})().catch((err) => {
  console.error(err);
  document.body.insertAdjacentHTML('beforeend', `<pre style="position:fixed;inset:0;margin:0;padding:24px;background:#300;color:#fff;overflow:auto;z-index:9999">Failed to start: ${String((err && err.stack) || err).replace(/</g, '&lt;')}</pre>`);
});
