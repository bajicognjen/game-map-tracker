# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

(A desktop app built with Electron: plain HTML/CSS/JS in the window, no framework. It ships as a Windows
installer and portable build, a Linux AppImage and macOS dmgs. Its design language is the web's, not a
native OS one.)

## Users

The author and a few friends: players who hunt collectibles in games and want a full interactive map with
their progress on it. They play on the same screen and **alt-tab** out of the game to check where something
is or to mark it collected, then go straight back. A visit is short and mid-game, and the person is often
in a hurry and wants to get back to playing.

The app is published on GitHub Releases (MIT) so friends can install and update it themselves. It is not
aimed at the general public, though nothing stops anyone from using it.

## Product Purpose

Game Map Tracker keeps a private, offline copy of a game's interactive maps: paste the link to a game's map
page, pick the maps, and the app downloads the locations, map tiles and screenshots. On those maps it tracks
what you have collected, with your own notes and markers, across every game in one Library.

Success means you find the next collectible fast, mark it in a click or a key and get back to the game, and
your progress is never lost or capped.

## Positioning

The map sites these maps come from need an account and cap tracking behind a premium plan. Game Map Tracker
is offline, private and unlimited: no account, no server of its own, no limit on what you track. It puts
every game in one Library, keeps your own notes and markers next to the site's data, backs progress up to a
folder you can sync, and keeps working with no connection once a map is downloaded.

## Operating Context

- **Alt-tab mid-game, same screen.** The window sits behind the game. People return to it for seconds at a
  time, so the Library, the map they were on and the current filters must be obvious at a glance.
- **Startup.** The app always opens on the **Library**, never straight into the last map (confirmed
  2026-11-05).
- **Adding a game** happens rarely, between sessions: paste a link, look it up, choose maps, tile detail and
  screenshots, and watch a live download log. That work happens online; using a map afterwards does not.
- **Mainly Windows.** The author's own machine runs Windows 11 26H2 (build 26300). Builds are unsigned, so
  the first install goes through SmartScreen's "Run anyway".
- **Releases and updates.** A version tag builds a draft release on GitHub; the author publishes it once the
  Release run has finished (publishing earlier leaves the updater a few seconds without `latest.yml`). The
  installed app offers the update itself: one click on **Update to <version>** downloads it, installs it
  silently and restarts. A draft release is invisible to the updater.
- **More than one computer.** The author works on the app from two laptops, so `main` on GitHub is the meeting
  point; recent changes (2.7.0, 2.7.1) landed through pull requests.

## Capabilities and Constraints

**Capabilities (shipped as of 2.7.1):** Library of games with per-game progress and disk usage; add or
update a game from its map link (choose maps, offline tiles at full or reduced detail, screenshots; resumable,
cancellable, "stop tiles at this zoom"); check every game for new, removed and renamed locations; settings for
the game-data and backups folders; export/import of all progress or one map. On a map: marker popups with
category, region, notes and screenshot; collect by right-click, button or `C`; search over titles, notes,
categories and your own notes; category and group filters; tracked categories (★) that decide the progress
total; region filter and region outlines; "Next uncollected" (`N`); "What's left" by region and category
with mark-all and a copyable checklist; titles next to pins when zoomed in; clustering; your own draggable
markers ("My markers"); keyboard shortcuts (`/`, `N`, `C`, `Esc`) shown as key hints on the controls; the
whole find-and-collect task from the keyboard (2.7.1: Tab and arrow keys walk the search results and "What's
left", Enter opens a location and its popup takes focus, Escape hands focus back, "Skip to the map");
screen-reader support (tracking stars expose their state, the found and shown counts are live regions,
screenshots have alt text); one-click self-update; the running version always on screen (Library top bar, map
sidebar footer, window title).

**Constraints:**
- **Offline, private, no account.** Maps and progress live on this computer (IndexedDB, mirrored to JSON
  backups). The app reaches the network only when the user asks: adding or updating a game, checking for new
  locations, checking for app updates, or streaming tiles for a map whose offline tiles were deleted.
- **No limits on tracking.** Nothing is capped, gated or paywalled.
- **Never name a map site.** The app is not affiliated with any map site. The source is whatever link is
  pasted; no site is hardcoded, named, branded or imitated in the app, its copy or its assets. Downloads are
  for personal use, and users should respect the source site's terms.
- **English only.** All interface text is English whatever the Windows languages are. The app forces
  Chromium's locale to `en-US`, asks map sites for English data, and ships an English-only installer.
- **Electron is pinned to exactly 45.2.2.** 45.2.3's page process crashes at start-up on Windows 11 26H2
  (build 26300) and leaves a blank window. Check a newer Electron on such a machine before moving the pin.
- **Progress must survive** reinstalling, removing and re-adding a game, and a lost in-app database (it is
  restored from the backup file).

**Terminology:** *Library* (the start screen), *game*, *map* (one game can have several), *location* or
*marker*, *category*, *group*, *region*, *collected*, *tracked category* (★, counts toward progress), *My
markers* (the user's own), *What's left*. "Update" has two meanings in the UI: a game's **Update from the
site** (re-read its map data) and the app's **Update to <version>**. Keep them clearly distinct.

## Brand Commitments

- Name: **Game Map Tracker**. Tagline in the app: "Offline interactive maps with collectible tracking".
- Icon: `build/icon.png` (used for the app, the installer and the Library header).
- No map site's name, logo or look, ever (see Constraints).
- English-only copy.
- Incumbent voice (observed in the UI copy, not separately confirmed): plain, second person, says what will
  happen ("This is where the disk space goes", "Your progress and the map data stay").

## Evidence on Hand

- Screenshots of the shipped UI: `docs/screenshot-library.jpg`, `docs/screenshot-map.jpg`,
  `docs/screenshot-popup.jpg`, `docs/screenshot-whatsleft.jpg`.
- Performance measured on a 5,709-location map (README, "Large maps"): opens in about a quarter of a second;
  filters apply in under 100 ms.
- An offline test game and an end-to-end test of the whole app: `test/fixture.mjs`, `test/e2e.mjs`.
- Absent, and not to be invented: user numbers, testimonials, reviews, press, partnerships or any
  affiliation with a map site, pricing (there is none).

## Product Principles

1. **In and out, mid-game.** Every frequent action (find, collect, next uncollected, what's left) is one
   click or one key away, and the state is readable at a glance after an alt-tab.
2. **Progress is never lost.** Local storage, automatic backups and restore come before any feature; a
   destructive action says what it keeps and what it removes.
3. **Offline and unlimited by default.** No account, no caps; the network is used only when the user asks
   for something that needs it.
4. **Neutral about sources.** The app works from any pasted map link and never names, brands or imitates a
   map site.
5. **Plain English for a small circle.** Clear English copy, and releases friends can install and update on
   their own.

## Accessibility & Inclusion

The primary task (find a location, open it, mark it collected) must work from the keyboard alone and with a
screen reader, as it does since 2.7.1; the end-to-end test covers that path. Focus is always visible (the cyan
ring), motion respects the system's reduced-motion setting, and controls meet 3:1 contrast and text 4.5:1.
