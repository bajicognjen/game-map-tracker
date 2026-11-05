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
    document.title = 'Game Map Tracker'; // the window title adds the version (main.js)
    show('library');
    window.Library.refresh();
  }

  // The version is always on screen: the Library's top bar and the map sidebar's footer.
  window.api.appInfo().then((info) => {
    for (const node of document.querySelectorAll('[data-app-version]')) {
      node.textContent = node.dataset.appVersion === 'short' ? `v${info.version}` : `Version ${info.version}`;
    }
  }).catch(() => {});

  window.Library.init({ onOpen: openMap });
  window.MapView.init({ onBack: showLibrary });
  window.api.onMenu((action) => { if (action === 'library') showLibrary(); });

  // ---------- updates: the Library's update button and the banner ----------
  const updateBtn = $('check-updates');
  const banner = { box: $('update-banner'), text: $('update-text'), action: $('update-action'), dismiss: $('update-dismiss'), notesToggle: $('update-notes-toggle'), notes: $('update-notes') };
  let update = null; // what the main process last said about updates
  let buttonTimer = null;
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
  function setButton(label, { disabled = false, primary = false, title = '' } = {}) {
    updateBtn.textContent = label;
    updateBtn.disabled = disabled;
    updateBtn.classList.toggle('primary', primary);
    updateBtn.classList.toggle('ghost', !primary);
    updateBtn.title = title;
  }
  const idleButton = () => setButton('Check for updates', { title: 'Look for a newer version of the app' });
  const ipcFail = (err) => toast(String((err && err.message) || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''));

  /** One click: download, install and restart (or open the download page where the app cannot replace itself). */
  function updateNow() {
    if (!update || update.status !== 'available') return;
    if (update.mode !== 'auto') { window.api.openExternal(update.releasesUrl); return; }
    onUpdateStatus({ status: 'downloading', percent: 0 });
    window.api.downloadUpdate({ install: true }).catch(ipcFail);
  }
  const installNow = () => window.api.installUpdate().catch(ipcFail);

  updateBtn.addEventListener('click', () => {
    const status = update && update.status;
    if (status === 'available') updateNow();
    else if (status === 'downloaded') installNow();
    else if (status !== 'downloading' && status !== 'installing') {
      setButton('Checking…', { disabled: true });
      buttonTimer = setTimeout(idleButton, 30000); // no answer: let it be pressed again
      window.api.checkForUpdates();
    }
  });

  function onUpdateStatus(s) {
    clearTimeout(buttonTimer);
    update = { ...(update || {}), ...s }; // "downloading" carries no version; keep the one from "available"
    const u = update;
    const auto = u.mode === 'auto';
    switch (s.status) {
      case 'available':
        setButton(auto ? `Update to ${u.version}` : `Get version ${u.version}`, { primary: true, title: auto ? 'Download and install it; the app restarts by itself' : 'Open the download page' });
        showBanner(`Version ${u.version} is available`, auto ? 'Update now' : 'Open download page', updateNow, u.notes);
        break;
      case 'downloading':
        setButton(`Downloading… ${u.percent}%`, { disabled: true });
        showBanner(`Downloading version ${u.version}… ${u.percent}%`);
        break;
      case 'installing':
        setButton('Installing…', { disabled: true });
        showBanner(`Installing version ${u.version}. The app closes and opens again by itself.`);
        break;
      case 'downloaded':
        setButton('Restart to update', { primary: true, title: `Install version ${u.version} and restart` });
        showBanner(`Version ${u.version} is ready to install`, 'Restart now', installNow);
        break;
      case 'none':
        if (!u.manual) { idleButton(); break; }
        setButton('Up to date');
        buttonTimer = setTimeout(idleButton, 4000);
        toast(`You have the latest version (${u.current})`);
        break;
      case 'disabled':
        idleButton();
        if (u.manual) toast('Updates only work in the installed app');
        break;
      case 'error':
        idleButton();
        banner.box.classList.add('hidden');
        if (u.manual) toast(`Update failed: ${u.message}`);
        break;
      default: break;
    }
  }
  window.api.onUpdateStatus(onUpdateStatus);
  idleButton();

  // Earlier versions reopened the last map on start-up; drop what they stored.
  try { localStorage.removeItem('game-map-tracker:last-map'); } catch { /* ignore */ }
  show('library');
  await window.Library.refresh();
})().catch((err) => {
  console.error(err);
  document.body.insertAdjacentHTML('beforeend', `<pre style="position:fixed;inset:0;margin:0;padding:24px;background:#300;color:#fff;overflow:auto;z-index:9999">Failed to start: ${String((err && err.stack) || err).replace(/</g, '&lt;')}</pre>`);
});
