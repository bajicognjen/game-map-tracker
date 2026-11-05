'use strict';
/**
 * Command-line way to add a game (same code path as the app's "Add game" button).
 * Runs under Electron because the map site's data endpoint needs a real browser.
 *
 *   npm run add-game -- https://<site>/<game>                   # data, icons, tiles, screenshots
 *   npm run add-game -- https://<site>/<game> --no-media        # skip screenshots
 *   npm run add-game -- https://<site>/<game> --no-tiles --maps a,b   # only these maps, no tiles
 *   npm run add-game -- https://<site>/<game> --max-zoom 14 --dest bundled
 *
 * Games go to the app's user-data folder (--dest user, default) or to ./games/ next to the
 * app (--dest bundled) if you want them inside a packaged build.
 */
const { app } = require('electron');
const paths = require('../lib/paths');
const library = require('../lib/library');

const args = process.argv.slice(2).filter((a) => a !== '--');
const flag = (name) => args.includes(name);
const value = (name, def) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] ? args[i + 1] : def; };
const input = args.find((a) => !a.startsWith('--') && a !== value('--maps') && a !== value('--max-zoom') && a !== value('--dest'));

if (!input || flag('--help')) {
  console.log('Usage: npm run add-game -- https://<site>/<game> [--no-tiles] [--no-media] [--maps slug,slug] [--max-zoom N] [--dest user|bundled]');
  app.exit(input ? 0 : 1);
} else {
  const opts = {
    tiles: !flag('--no-tiles'),
    media: !flag('--no-media'),
    maps: value('--maps') ? value('--maps').split(',').map((s) => s.trim()).filter(Boolean) : null,
    maxZoom: value('--max-zoom') ? Number(value('--max-zoom')) : null,
    dest: value('--dest', 'user'),
  };
  // The scraper opens and closes hidden windows; without this Electron would quit when the first one closes.
  app.on('window-all-closed', () => {});
  const controller = new AbortController();
  process.on('SIGINT', () => { console.log('\nCancelling…'); controller.abort(); });
  let lastLine = '';
  const onProgress = (p) => {
    const line = p.message;
    if (Number.isFinite(p.total) && p.total > 0 && p.stage === (lastLine.split(':')[0] || p.stage)) process.stdout.write(`\r${line}   `);
    else process.stdout.write(`${lastLine ? '\n' : ''}${line}`);
    lastLine = `${p.stage}:${line}`;
  };
  app.whenReady()
    .then(() => library.addGame(input, opts, onProgress, controller.signal))
    .then((game) => {
      console.log(`\nSaved to ${paths.gameDir(opts.dest, game.slug)}`);
      app.exit(0);
    })
    .catch((err) => {
      console.error(`\n${err.message}`);
      app.exit(1);
    });
}
