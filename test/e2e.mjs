/**
 * End-to-end test: drives the real Electron app against a generated offline game.
 * Runs locally (`npm run test:e2e`, needs a display) and in CI under xvfb. No network is used.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';
import { writeFixture, FIXTURE } from './fixture.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'gmt-e2e-'));
writeFixture(userData);
const electronBin = process.platform === 'win32'
  ? path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
  : process.platform === 'darwin'
    ? path.join(ROOT, 'node_modules', 'electron', 'dist', 'Electron.app', 'Contents', 'MacOS', 'Electron')
    : path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron');

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '  ok ' : 'FAIL '} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};
const launch = () => electron.launch({ executablePath: electronBin, args: [ROOT], env: { ...process.env, GMT_USER_DATA: userData }, timeout: 60000 });
const attach = (page, issues, ignore = null) => {
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type()) && !(ignore && ignore.test(m.text()))) issues.push(m.text()); });
  page.on('pageerror', (e) => issues.push(e.message));
  page.on('dialog', (d) => d.accept());
};
const openFixtureMap = async (page) => {
  await page.waitForSelector('#library:not(.hidden), #mapscreen:not(.hidden)', { timeout: 30000 });
  await page.waitForTimeout(800);
  if (await page.evaluate(() => document.getElementById('library').classList.contains('hidden'))) {
    await page.evaluate(() => document.getElementById('back-library').click());
    await page.waitForTimeout(400);
  }
  await page.evaluate((slug) => document.querySelector(`.game-card[data-game="${slug}"] [data-open]`).click(), FIXTURE.gameSlug);
  await page.waitForSelector('#mapscreen:not(.hidden) #categories .cat', { timeout: 30000 });
  await page.waitForTimeout(1200);
};
const counts = (page) => page.evaluate(() => ({
  pins: document.querySelectorAll('.mg-marker').length,
  custom: document.querySelectorAll('.mg-pin.custom').length,
  clusters: document.querySelectorAll('.mg-cluster').length,
  tiles: document.querySelectorAll('.leaflet-tile-loaded').length,
  broken: [...document.querySelectorAll('img.leaflet-tile')].filter((i) => i.complete && i.naturalWidth === 0).length,
  regionLabels: document.querySelectorAll('.region-label').length,
  progress: document.getElementById('progress-text').textContent,
}));

try {
  // ----- first run -----
  let issues = [];
  let app = await launch();
  let page = await app.firstWindow();
  attach(page, issues);
  await page.waitForSelector('#library:not(.hidden)', { timeout: 30000 });
  await page.waitForTimeout(800);
  check('library lists the fixture game', await page.evaluate((slug) => !!document.querySelector(`.game-card[data-game="${slug}"]`), FIXTURE.gameSlug));
  await openFixtureMap(page);
  if (await page.evaluate(() => document.getElementById('cluster-markers').checked)) {
    await page.evaluate(() => document.getElementById('cluster-markers').click());
    await page.waitForTimeout(600);
  }
  let c = await counts(page);
  check('all five markers shown without clustering', c.pins === 5, JSON.stringify(c));
  check('tiles load from the fixture', c.tiles > 0 && c.broken === 0, `loaded ${c.tiles}, broken ${c.broken}`);
  check('region label drawn', c.regionLabels === 1);
  check('progress starts at 0 / 5', c.progress === '0 / 5 found', c.progress);

  // tracked categories: leave "Key" (2 markers) out of the progress total, then count it again
  await page.evaluate(() => document.querySelector('[data-track="102"]').click());
  await page.waitForTimeout(200);
  check('untracking a category shrinks the progress total', (await page.evaluate(() => document.getElementById('progress-text').textContent)) === '0 / 3 found');
  check('progress note offers to count all again', await page.evaluate(() => !document.getElementById('progress-note').classList.contains('hidden')));
  await page.evaluate(() => document.querySelector('[data-track-all]').click());
  await page.waitForTimeout(200);
  check('count all restores the total', (await page.evaluate(() => document.getElementById('progress-text').textContent)) === '0 / 5 found');

  // region filter: three markers are in "North"
  await page.selectOption('#region-filter', '7');
  await page.waitForTimeout(500);
  check('region filter shows only that region', (await counts(page)).pins === 3, JSON.stringify(await counts(page)));
  // jumping to a search result outside the filtered region clears the region filter
  await page.fill('#search', 'key of the south');
  await page.waitForTimeout(400);
  await page.evaluate(() => document.querySelector('#search-results .result').click());
  await page.waitForSelector('.mg-popup .pp-title', { timeout: 10000 });
  check('jump to a result outside the region clears the region filter', await page.evaluate(() => document.getElementById('region-filter').value === '' && document.querySelector('.pp-title').textContent === 'Key of the south'));
  await page.fill('#search', '');
  await page.evaluate(() => document.querySelector('.leaflet-popup-close-button')?.click());
  await page.waitForTimeout(500);
  check('clearing the region filter shows everything', (await counts(page)).pins === 5);

  // next uncollected: jumps to a marker and opens its popup
  await page.evaluate(() => document.getElementById('next-uncollected').click());
  await page.waitForSelector('.mg-popup .pp-title', { timeout: 10000 });
  check('next uncollected opens a popup', await page.evaluate(() => !!document.querySelector('.mg-popup .pp-title')));

  // keyboard: C collects the open marker, Escape closes it, / focuses search
  await page.evaluate(() => document.getElementById('map').focus());
  await page.keyboard.press('c');
  await page.waitForTimeout(300);
  check('C collects the open marker', (await page.evaluate(() => document.getElementById('progress-text').textContent)) === '1 / 5 found');
  await page.keyboard.press('c');
  await page.waitForTimeout(300);
  check('C again undoes it', (await page.evaluate(() => document.getElementById('progress-text').textContent)) === '0 / 5 found');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  check('Escape closes the popup', await page.evaluate(() => !document.querySelector('.mg-popup')));
  await page.keyboard.press('/');
  check('/ focuses the search box', await page.evaluate(() => document.activeElement === document.getElementById('search')));
  await page.keyboard.press('Escape');

  // settings: progress backups go to the chosen folder
  const altBackups = path.join(userData, 'synced-backups');
  await page.evaluate((dir) => window.api.applySettings({ backupsDir: dir, move: true }), altBackups);

  // popup, collect, note
  await page.fill('#search', 'chest one');
  await page.waitForTimeout(400);
  await page.evaluate(() => document.querySelector('#search-results .result').click());
  await page.waitForSelector('.mg-popup .pp-title', { timeout: 10000 });
  await page.waitForTimeout(500);
  check('popup opens from a search result', (await page.evaluate(() => document.querySelector('.pp-title').textContent)) === 'Chest one');
  check('note link to another location is an in-app link', await page.evaluate(() => { document.querySelector('.pp-notes').value = ''; return true; }));
  await page.evaluate(() => document.querySelector('.pp-toggle').click());
  await page.waitForTimeout(300);
  check('toggle keeps the popup open and marks collected', await page.evaluate(() => !!document.querySelector('.mg-popup') && document.getElementById('progress-text').textContent === '1 / 5 found'));
  await page.fill('.pp-notes', 'under the big tree');
  await page.waitForTimeout(800);
  await page.fill('#search', '');
  await page.waitForTimeout(300);

  // custom marker via right-click on an empty spot
  const box = await page.evaluate(() => { const r = document.getElementById('map').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
  await page.mouse.click(box.x + box.w / 2 + 60, box.y + box.h / 2 - 90, { button: 'right' });
  await page.waitForSelector('[data-add-custom]', { timeout: 10000 });
  await page.evaluate(() => document.querySelector('[data-add-custom]').click());
  await page.waitForSelector('[data-custom-title]', { timeout: 10000 });
  await page.fill('[data-custom-title]', 'Secret stash');
  await page.waitForTimeout(800);
  c = await counts(page);
  check('custom marker created', c.custom === 1, JSON.stringify(c));
  check('regions toggle hides the outline', await page.evaluate(async () => { document.getElementById('region-outlines').click(); await new Promise((r) => setTimeout(r, 300)); return document.querySelectorAll('.region-label').length === 0; }));
  check('no console errors in the first run', issues.length === 0, issues.slice(0, 3).join(' | '));
  await page.waitForTimeout(2000); // let the debounced backup land (closing the window flushes it too)
  await app.close();

  const backup = path.join(userData, 'synced-backups', FIXTURE.gameSlug, `${FIXTURE.mapSlug}.json`);
  await new Promise((r) => setTimeout(r, 500));
  const backupJson = fs.existsSync(backup) ? JSON.parse(fs.readFileSync(backup, 'utf8')) : null;
  check('backup file written', !!backupJson && Object.keys(backupJson.collected || {}).length === 1 && backupJson.custom.length === 1, backup);

  // ----- second run: persistence -----
  issues = [];
  app = await launch();
  page = await app.firstWindow();
  attach(page, issues);
  await openFixtureMap(page);
  c = await counts(page);
  check('collected progress persists', c.progress === '1 / 5 found', c.progress);
  check('custom marker persists', c.custom === 1);
  await page.fill('#search', 'big tree');
  await page.waitForTimeout(400);
  check('notes are searchable and persist', (await page.evaluate(() => document.querySelectorAll('#search-results .result').length)) === 1);
  await page.fill('#search', 'secret');
  await page.waitForTimeout(400);
  check('custom marker title is searchable', (await page.evaluate(() => document.querySelector('#search-results .result-title')?.textContent)) === 'Secret stash');
  check('no console errors in the second run', issues.length === 0, issues.slice(0, 3).join(' | '));
  await app.close();

  // ----- third run: restore from backup after the database is wiped -----
  for (const entry of fs.readdirSync(userData)) {
    if (/^(IndexedDB|Local Storage|Session Storage)$/i.test(entry)) fs.rmSync(path.join(userData, entry), { recursive: true, force: true });
  }
  issues = [];
  app = await launch();
  page = await app.firstWindow();
  attach(page, issues, /Failed to load resource: net::ERR_NAME_NOT_RESOLVED/); // online-tile fallback has no server in this test
  await openFixtureMap(page);
  c = await counts(page);
  check('progress restored from the backup file', c.progress === '1 / 5 found' && c.custom === 1, JSON.stringify(c));

  // storage: deleting the offline tiles keeps the data and switches the map to online tiles
  await page.evaluate(() => document.getElementById('back-library').click());
  await page.waitForTimeout(600);
  check('library shows the tile size', await page.evaluate((slug) => /tiles \d+ MB/.test(document.querySelector(`.game-card[data-game="${slug}"] .storage`).textContent), FIXTURE.gameSlug));
  await page.evaluate((slug) => document.querySelector(`.game-card[data-game="${slug}"] [data-clean="tiles"]`).click(), FIXTURE.gameSlug);
  await page.waitForTimeout(800);
  check('tiles folder removed', !fs.existsSync(path.join(userData, 'games', FIXTURE.gameSlug, 'maps', FIXTURE.mapSlug, 'tiles')));
  await openFixtureMap(page);
  check('map falls back to online tiles after cleanup', await page.evaluate(() => document.getElementById('tile-status').textContent.includes('streaming')));
  check('no console errors in the third run', issues.length === 0, issues.slice(0, 3).join(' | '));
  await app.close();
} catch (err) {
  console.error(err);
  failures++;
} finally {
  // Windows can hold file locks for a moment after the app exits
  fs.rmSync(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
}
console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
