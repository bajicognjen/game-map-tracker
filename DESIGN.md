---
name: Game Map Tracker
description: Offline interactive maps with collectible tracking
colors:
  pit-lane-cyan: "#5ec8ff"
  pit-lane-ink: "#06202e"
  pit-lane-soft: "rgba(94, 200, 255, .14)"
  green-flag: "#3ddc84"
  green-flag-ink: "#05210f"
  green-flag-soft: "rgba(61, 220, 132, .14)"
  tracked-gold: "#ffd166"
  own-marker-amber: "#ffb347"
  own-marker-ink: "#3a2a00"
  danger-coral: "#ff6b6b"
  cluster-cyan-light: "#9fe0ff"
  cluster-cyan: "#45b8f5"
  cluster-green-light: "#a6f5c8"
  cluster-green: "#2fd07e"
  night-asphalt: "#0b0f14"
  map-void: "#080b10"
  inset-asphalt: "#10151c"
  slate-panel: "#151b23"
  raised-slate: "#1b222c"
  hover-slate: "#232c37"
  hairline: "#242d38"
  strong-hairline: "#323d4b"
  track-off: "#5f6b7a"
  soft-white: "#e8eef4"
  secondary-gray: "#b9c4ce"
  muted-steel: "#8794a2"
typography:
  count:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, sans-serif"
    fontSize: "24px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, sans-serif"
    fontSize: "18px"
    fontWeight: 650
    lineHeight: 1.2
    letterSpacing: "-0.012em"
  title:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, sans-serif"
    fontSize: "16px"
    fontWeight: 650
    lineHeight: 1.3
    letterSpacing: "-0.012em"
  body:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.45
  list:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, sans-serif"
    fontSize: "13.5px"
    fontWeight: 400
    lineHeight: 1.45
  body-small:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.45
  overline:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, sans-serif"
    fontSize: "11px"
    fontWeight: 700
    lineHeight: 1.45
    letterSpacing: "0.08em"
  mono:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.45
  key:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
    fontSize: "11px"
    fontWeight: 600
    lineHeight: 1
rounded:
  code: "4px"
  key: "5px"
  xs: "6px"
  s: "8px"
  m: "12px"
  pill: "999px"
spacing:
  gap-xs: "6px"
  gap-s: "8px"
  gap-m: "10px"
  gap-l: "12px"
  inset-sidebar: "16px"
  inset-card: "20px"
  section: "28px"
  page: "32px"
components:
  button:
    backgroundColor: "{colors.raised-slate}"
    textColor: "{colors.soft-white}"
    typography: "{typography.body}"
    rounded: "{rounded.s}"
    padding: "0 14px"
    height: "34px"
  button-hover:
    backgroundColor: "{colors.hover-slate}"
  button-primary:
    backgroundColor: "{colors.pit-lane-cyan}"
    textColor: "{colors.pit-lane-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.s}"
    padding: "0 14px"
    height: "34px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.secondary-gray}"
    rounded: "{rounded.s}"
    padding: "0 14px"
    height: "34px"
  button-ghost-hover:
    backgroundColor: "{colors.raised-slate}"
    textColor: "{colors.soft-white}"
  button-small:
    typography: "{typography.label}"
    rounded: "{rounded.xs}"
    padding: "0 10px"
    height: "28px"
  link:
    backgroundColor: "transparent"
    textColor: "{colors.pit-lane-cyan}"
  link-danger:
    textColor: "{colors.danger-coral}"
  input:
    backgroundColor: "{colors.inset-asphalt}"
    textColor: "{colors.soft-white}"
    typography: "{typography.body}"
    rounded: "{rounded.s}"
    padding: "0 12px"
    height: "34px"
  input-hero:
    height: "38px"
  chip:
    backgroundColor: "{colors.raised-slate}"
    textColor: "{colors.secondary-gray}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 9px"
    height: "26px"
  chip-active:
    backgroundColor: "{colors.pit-lane-soft}"
    textColor: "{colors.soft-white}"
  key-hint:
    backgroundColor: "{colors.hover-slate}"
    textColor: "{colors.secondary-gray}"
    typography: "{typography.key}"
    rounded: "{rounded.key}"
    padding: "0 5px"
    height: "18px"
  card:
    backgroundColor: "{colors.slate-panel}"
    textColor: "{colors.soft-white}"
    rounded: "{rounded.m}"
    padding: "20px 22px"
  sidebar:
    backgroundColor: "{colors.slate-panel}"
    textColor: "{colors.soft-white}"
    width: "328px"
  collect-toggle:
    backgroundColor: "{colors.pit-lane-cyan}"
    textColor: "{colors.pit-lane-ink}"
    rounded: "{rounded.s}"
    height: "36px"
    width: "100%"
  collect-toggle-done:
    backgroundColor: "{colors.green-flag-soft}"
    textColor: "{colors.green-flag}"
  version-tag:
    textColor: "{colors.muted-steel}"
    typography: "{typography.label}"
  cluster:
    backgroundColor: "{colors.cluster-cyan}"
    textColor: "{colors.pit-lane-ink}"
    rounded: "{rounded.pill}"
  cluster-done:
    backgroundColor: "{colors.cluster-green}"
    textColor: "{colors.green-flag-ink}"
  toast:
    backgroundColor: "{colors.raised-slate}"
    textColor: "{colors.soft-white}"
    rounded: "{rounded.s}"
    padding: "9px 16px"
---

# Design System: Game Map Tracker

## Overview

**Creative North Star: "The Pit Stop"**

The app is visited in seconds, mid-game: alt-tab in, read the state at a glance, mark something or find the
next collectible, and back to the game. Every visual decision serves that stop: dark, calm surfaces that don't
glare after a dark game, state you can read without hunting (the big found count, the progress bar, collected
pins greyed out with a green check), keyboard hints right on the controls (`/`, `N`, `C`), and one color for
"act here", with nothing in the chrome competing with the map.

The interface is a quiet set of dark slate layers. The color on screen belongs to the game: its map tiles,
marker icons and cover art. The app adds just three signals: **Pit-Lane Cyan** for the one thing to do or the
thing in focus, **Green Flag** for done, and gold ★ for what counts toward progress. Surfaces have two heights:
cards sit on the page with a faint shadow and a hairline of top light, and only things that float above it
(popups, menus, the toast, the update banner) cast a real shadow. The map sidebar is dense and compact (328px,
12–16px insets) because it sits beside the map. The Library is airier: a centred 1,120px column, headed
sections, cover-topped game cards and a blurred sticky top bar.

Controls are **soft and friendly**: gently rounded corners (8px), pill-shaped chips, one drawn icon set with
round strokes, and state changes that ease in over about 150ms (and switch off under reduced motion). Two looks
are explicitly rejected: **a busy map website** (ads, banners, upsells, clutter around the map) and **a light,
bright app** (white surfaces that glare when you alt-tab from a dark game).

**Key Characteristics:**
- Dark everywhere: page, panels, popups, menus, tooltips, map controls, select menus and scrollbars.
- One accent (Pit-Lane Cyan) for action and focus; green means done and nothing else.
- The game's art carries the color; the app's chrome stays neutral slate.
- Readable at a glance: a 24px found count, tabular numbers, greyed collected pins, key hints on controls.
- Soft, compact controls: 8px corners, pill chips, 34px standard height, one round-stroke icon set.
- Two heights: resting surfaces with a faint lift, floating ones with a real shadow.

## Colors

A near-black blue-slate base in stepped layers, one cool cyan accent, and a few warm signals that each have a
single meaning.

### Primary
- **Pit-Lane Cyan** (#5ec8ff): the "act here" color. Primary buttons ("Look up", "Add game", "Update to …"),
  the popup's "Mark as collected", focus outlines and the focus ring, links, active filter chips, the skip
  link, the first-run guide's step numbers, the update banner's border, and the faint glow behind the Library
  top bar.
- **Pit-Lane Ink** (#06202e): text on Pit-Lane Cyan.
- **Pit-Lane Soft** (14% cyan): tinted fills for chosen things: an active chip, the guide's step circles.

### Secondary
- **Green Flag** (#3ddc84): done. Collected checkmarks on pins, finished category counts, all-collected
  clusters, a collected popup's button, "ok" lines in the download log, and the start of the progress bar's
  gradient (Green Flag to Pit-Lane Cyan).
- **Green Flag Ink** (#05210f) and **Green Flag Soft** (14% green): the check drawn on a green badge, and the
  tinted fill of the collected button.

### Tertiary
- **Tracked Gold** (#ffd166): the ★ that marks a category as counted toward progress. While every category
  counts, the stars sit at 45% so they don't shout; hovering a row brings its star to full gold.
- **Track Off** (#5f6b7a): an untracked ★, the dimmest gray that still reaches 3:1 on the panel.
- **Own-Marker Amber** (#ffb347) with **Own-Marker Ink** (#3a2a00): your own markers (the amber teardrop pin
  and the "My markers" dot) and warnings.
- **Danger Coral** (#ff6b6b): destructive actions and errors only ("Reset", "Remove game", error log lines).
- **Cluster gradients**: clusters are lit spheres, lighter top left: Cluster Cyan Light (#9fe0ff) to Cluster
  Cyan (#45b8f5), or Cluster Green Light (#a6f5c8) to Cluster Green (#2fd07e) when everything inside is
  collected.

### Neutral
- **Night Asphalt** (#0b0f14): the page background.
- **Map Void** (#080b10): the canvas around and behind map tiles, a step darker than the page.
- **Inset Asphalt** (#10151c): recessed surfaces: text fields, selects, folder paths.
- **Slate Panel** (#151b23): cards, the map sidebar, popups, map controls, tooltips.
- **Raised Slate** (#1b222c): default buttons, chips, menus, the toast, list-row hover, select menu options.
- **Hover Slate** (#232c37): button hover, key hints, the progress bar track, scrollbar thumbs.
- **Hairline** (#242d38): dividers, card borders, map-row separators.
- **Strong Hairline** (#323d4b): control borders, menu and popup outlines.
- **Soft White** (#e8eef4): primary text.
- **Secondary Gray** (#b9c4ce): secondary text, ghost buttons, idle chips, descriptions, the log.
- **Muted Steel** (#8794a2): meta text, counts, placeholders, hints, the version.

### Named Rules
**The Pit-Lane Rule.** Pit-Lane Cyan marks the action or the focus: one primary button per area, the field
you're typing in, the filter that's on. It never fills a panel or a large area.

**The Green Flag Rule.** Green means done, and only done: collected, finished, complete. Never use it for a
generic "success" message or a call to action.

**The Game Owns the Color Rule.** The app's chrome stays in slate neutrals so the game's map, icons and covers
are the most colorful things on screen. New color goes into the game's content, not the interface.

## Typography

**Body Font:** the operating system's UI font (`system-ui`, with -apple-system, Segoe UI, Roboto and Ubuntu as
fallbacks)
**Label/Mono Font:** `ui-monospace` (SFMono-Regular, Menlo, Consolas) for key hints, folder paths, inline code
and the first-run guide's step numbers

**Character:** one familiar native voice at a compact 14px base. Hierarchy comes from weight (650 headings,
700 for the found count and overlines) and half-pixel size steps, not from a second typeface. Headings balance
their lines; descriptions wrap without orphans.

### Hierarchy
- **Count** (700, 24px, 1, -0.02em): the found number at the top of the map sidebar ("**0** / 658 found").
- **Headline** (650, 18px, 1.2): Library section headings ("Your games"). The app name in the top bar is 17px.
- **Title** (650, 16px, 1.3): card headings ("Add a game", "Settings"), game-card titles, the game title in the
  map sidebar. A location's name in its popup is 15.5px.
- **Body** (400, 14px, 1.45): default text, buttons (500) and fields. The add-game link field is 14.5px.
- **List** (400, 13.5px): category rows, "What's left" items, map rows in a game card.
- **Body small** (400, 13px): the download log, the progress line, the back link, top-bar and sidebar-footer
  buttons, popup notes.
- **Label** (400, 12–12.5px): meta lines, counts, chips, small buttons, help text, the version.
- **Overline** (700, 11px, 0.08em, uppercase): sidebar group headings and "What's left" region headings.
  Game-card badges use 600 at 0.06em. Region names on the map are 12px at 0.14em, outlined in near-black so
  they read on any map art.
- **Key** (600, 11px mono): keyboard hints such as `/`, `N` and `C`.

### Named Rules
**The System Voice Rule.** One family, the OS's own UI font. Add hierarchy with weight (650 or 700) and size
steps of a pixel or two; never with a display face. Monospace is for keys, paths and code, not decoration.

**The Tabular Count Rule.** Every number someone compares at a glance (counts, percentages, progress, sizes,
the download log, the version) uses tabular numerals so columns don't jitter as values change.

## Layout

A desktop app with a minimum window of 960 × 600 and no mobile layout. There are two screens:

- **Library:** a sticky top bar (brand on the left; ghost buttons and the version on the right) in translucent
  Night Asphalt at 80% opacity with a 12px backdrop blur. Under it sits a centred column, at most 1,120px wide,
  with 28px top and 32px side padding and 28px between sections. The add-game card is a headed form: title,
  one-line hint underneath, then a 38px field and button. Game cards fill an auto-fill grid (columns at least
  340px wide, 20px gap). The map picker in the add-game form uses a 200px auto-fill grid. The page reserves its
  scrollbar gutter so nothing shifts when a scrollbar appears.
- **Map:** a fixed 328px sidebar on the left next to the full-bleed map. The sidebar stacks a header (back
  link, map switcher, game and map title), progress (the big found count over a 6px bar), controls (search,
  chips, region filter, "Next uncollected"), a list that scrolls on its own (categories, search results or
  "What's left", with sticky group headings), and a footer (export, import, reset, tile status and version).
  Each block is separated by a Hairline rule, with 12–16px vertical and 16px horizontal padding. A skip link
  appears at the top of the sidebar on keyboard focus and jumps to the map.

The spacing rhythm is 6, 8, 10, 12 and 16px inside components, 20–28px between cards and sections, and 32px at
the page edge. Rows default to a 10px gap. Ghost buttons at a container's edge are pulled out by their padding
so their text lines up with the content.

## Elevation & Depth

Depth has two heights. **At rest**, surfaces are stepped tones (Map Void and Night Asphalt up to Slate Panel,
Raised Slate and Hover Slate) separated by hairlines. Cards and map controls add a faint Rest shadow plus a
4%-white line of top light, and buttons carry just the top light. **Floating** things (the location popup, the
game-card menu, the toast, the update banner, the skip link, and a game card while you hover it, which also
lifts 2px) take the Float shadow. Fields and the progress track are pressed in with a small inset shadow.
Things drawn on the map get tight dark shadows so they stay legible over any map art.

### Shadow Vocabulary
- **Rest** (`box-shadow: 0 1px 2px rgba(0, 0, 0, .35), 0 2px 8px rgba(0, 0, 0, .25)`): cards, the map's zoom
  and home controls, tooltips, the brand icon.
- **Top light** (`box-shadow: inset 0 1px 0 rgba(255, 255, 255, .04)`): paired with Rest on cards and with
  Float on popups and menus; alone on buttons.
- **Float** (`box-shadow: 0 10px 30px rgba(0, 0, 0, .5), 0 2px 6px rgba(0, 0, 0, .35)`): popups, menus, the
  toast, the update banner, the skip link, a hovered game card.
- **Pressed in** (`box-shadow: inset 0 1px 2px rgba(0, 0, 0, .25)`): text fields and selects; the progress
  track uses `inset 0 1px 1px rgba(0, 0, 0, .35)`.
- **Focus ring** (`box-shadow: 0 0 0 3px rgba(94, 200, 255, .22)`): fields while focused (other controls get a
  2px cyan outline with a 2px offset).
- **Pin drop** (`filter: drop-shadow(0 2px 3px rgba(0, 0, 0, .7))`): marker pins over map tiles.
- **Cluster** (`box-shadow: 0 2px 6px rgba(0, 0, 0, .55), 0 0 0 1px rgba(6, 32, 46, .35)`) with a 2px
  near-white border: marker clusters.

### Named Rules
**The Two Heights Rule.** A surface either rests (tone, hairline, Rest shadow and top light) or floats (Float
shadow). There is no third, in-between elevation, and nothing at rest gets Float.

## Shapes

Soft, friendly corners throughout. Buttons, fields, selects, menus and map controls share an 8px radius; small
buttons, menu items and tooltips use 6px; cards, popups and the update banner use 12px. Anything that tags or
toggles is a full pill: filter chips, badges, the progress bar, marker clusters and the collected check. Key
hints use 5px and inline code 4px. Borders are always 1px hairlines (dashed only for the empty Library). The one
non-rectangular form is your own marker: an amber teardrop pin (a rotated square with three rounded corners)
holding a ★.

**The Soft Corner Rule.** Nothing interactive has square corners: 8px on controls, 6px on small ones, 12px on
containers, a pill for anything that toggles or tags. The only square edges are full-width list rows in the
sidebar.

## Components

### Buttons
Soft and friendly, compact, and clear about which one is primary.
- **Shape:** gently rounded (8px), 34px tall, 14px side padding, weight 500; small buttons are 28px tall with
  10px padding at 12.5px text and 6px corners. Top-bar buttons are 32px at 13px.
- **Primary:** Pit-Lane Cyan with Pit-Lane Ink text at weight 650, a 25%-white top highlight and a small drop
  shadow. One per area: "Look up" or "Add game", "Update to …", "Mark as collected", the skip link.
- **Default:** Raised Slate with a Strong Hairline border and the top light; hover turns the background Hover
  Slate.
- **Ghost:** transparent, in Secondary Gray, for top-bar and toolbar actions; hover gives a Raised Slate
  background and Soft White text.
- **Hover / Press / Focus:** transitions take 150ms on the shared ease (`cubic-bezier(.2, .7, .2, 1)`).
  Pressing nudges the button down 1px and drops its highlight. Focus shows a 2px cyan outline with a 2px
  offset. Disabled buttons sit at 50% opacity.
- **Links as buttons:** cyan text with no box, underlined on hover (3px offset); Danger Coral for destructive
  links ("Reset").

### Chips
- **Style:** pills 26px tall, 12px text, 9px padding, Raised Slate with a Strong Hairline border and Secondary
  Gray text. Each is a checkbox styled as a toggle ("Hide collected", "Cluster", "Regions", "Titles").
- **State:** when on, the fill becomes Pit-Lane Soft, the border 60% cyan and the text Soft White. Hover shows a
  cyan border.

### Key hints
- Small mono keycaps (18px tall, 5px corners, Hover Slate with a Strong Hairline border and a dark bottom
  edge) sit on the controls they trigger: `/` inside the search field (hidden while you type), `N` on "Next
  uncollected", `C` on the collect button (tinted to match it).

### Cards / Containers
- **Corner Style:** 12px.
- **Background:** Slate Panel with a Hairline border.
- **Shadow Strategy:** Rest shadow and top light at rest; Float and a 2px lift on a hovered game card (see
  Elevation & Depth).
- **Internal Padding:** 20px top and bottom, 22px at the sides.
- **Game card:** a 150px cover band on top. A logo cover sits centred at 46% height over a faint cyan glow;
  a game with no cover gets a compact 84px band. Below the cover: the title (16px), the progress line (13px)
  over a 6px bar, map rows separated by hairlines (name, details, an "Open" small button), and the storage
  used. A "⋯" menu button (30px, translucent dark) sits top right on the cover; an uppercase badge sits top
  left when the game is bundled.
- **Empty Library:** a dashed-outline panel with a numbered first-run guide; step numbers are mono digits in
  22px Pit-Lane Soft circles.

### Inputs / Fields
- **Style:** Inset Asphalt, a Strong Hairline border, 8px corners, 34px tall (38px for the add-game link),
  12px side padding, pressed in with a small inset shadow. Placeholders are Muted Steel. Selects use the drawn
  chevron in Muted Steel and dark option menus; compact selects in the sidebar are 28–30px tall. The search
  field shows the drawn magnifier (Muted Steel, cyan while focused) and a drawn × to clear it.
- **Focus:** the border turns cyan and the 3px focus ring appears.
- **Checkboxes:** the native control, tinted with the cyan accent, 15px.

### Navigation
- **Library top bar:** brand mark (36px icon, 9px corners) and the app name on the left; ghost buttons ("Check
  for updates", "Settings", "Report a problem") and the version on the right. "Check for updates" becomes the
  primary "Update to …" when a release is waiting.
- **Map sidebar:** "Library" with a drawn back arrow, in Secondary Gray, turning cyan on hover. The map switcher
  is a compact select shown only when a game has more than one map.

### Icons
- One drawn set on a 24-unit grid with round caps and joins: strokes of 2.2 (2.4 for plus, minus and close,
  2.8 for the check), filled shapes for the star and the "more" dots. Icons are drawn through CSS masks so they
  take the surrounding text color, and are 16px by default (13px in tight rows).
- The set: search, back, home, plus, minus, close, check, star, more, note and chevron.

### Map markers and clusters (signature)
- Marker pins are the game's own icons, with the Pin drop shadow. They grow 12% on hover, anchored at the tip.
- A collected pin turns grey and dim (grayscale, 75% brightness, 55% opacity) and gets a 16px Green Flag badge
  with a drawn check at its top right.
- Clusters are lit spheres (Cluster Cyan, or Cluster Green when everything inside is collected) with a 2px
  near-white border, tabular numbers, and a slight grow on hover.
- Your own markers are the amber teardrop with a drawn ★.
- Region names are uppercase, widely tracked and outlined in near-black, and they ignore the pointer. Titles
  next to pins (when zoomed in) are small dark labels with a faint light border.

### Location popup (signature)
- Slate Panel, 12px corners, a Strong Hairline border, the top light and Float. It shows the location's name
  first (15.5px, the popup's focus target), then a 12px meta line (category in bold, then region), the
  description in Secondary Gray with cyan links, the screenshot (8px corners; blurred behind "Spoiler — click to
  reveal" when it's a spoiler), and a notes field.
- At the bottom is a full-width 36px filled collect button: cyan "Mark as collected" with a `C` key hint, which
  turns into a Green Flag Soft button with green text once collected. The close button is a drawn ×.

### Version
- Plain Muted Steel text at 12px with tabular numerals: "Version 2.7.x" in the Library top bar and "v2.7.x" at
  the end of the map sidebar's footer, so the running version is always on screen.

### Toast and update banner
- **Toast:** centred near the bottom, Raised Slate with 8px corners, the top light and Float. It rises 8px and
  fades in over 200ms.
- **Update banner:** bottom right, at most 460px wide, Slate Panel with a 50% cyan border, the top light and
  Float. It holds the message, an optional "What's new" toggle, a primary action ("Update now") and "Later". It
  appears only when an update exists, and you can dismiss it.

### Sidebar lists
- Category, search-result and "What's left" rows run the full width of the sidebar (at least 28px tall, 16px
  inset, 22–30px for nested rows), with a Raised Slate background on hover. Group and region headings stick to
  the top while their list scrolls.
- Counts are right-aligned, 12px, tabular and in Muted Steel, turning Green Flag when complete. Collected
  search results are struck through and muted. Rows reached by keyboard get an inset cyan outline.
- A category that's switched off fades to 40%. The ★ track toggle is a 22px target: Track Off when untracked,
  Tracked Gold when tracked (45% while every category counts), and grows 1.15× on hover.

### Motion
- One shared ease (`cubic-bezier(.2, .7, .2, 1)`): 150ms for state changes, 180ms for a game card's lift, 140ms
  for a menu popping in, 200ms for the toast, 400ms for progress bars. Under reduced motion every transition and
  animation is effectively instant.

## Do's and Don'ts

### Do:
- **Do** keep every surface dark: Night Asphalt (#0b0f14) for the page, Slate Panel (#151b23) for panels and
  popups, and Raised Slate (#1b222c) for controls and menus, including Leaflet's zoom bar, tooltips, select
  option menus and scrollbars.
- **Do** use Pit-Lane Cyan (#5ec8ff) for one primary action per area and for every focus state (a 2px outline
  with a 2px offset; fields get the 3px focus ring).
- **Do** show "collected" with Green Flag (#3ddc84) and a drawn check, and dim collected pins (grayscale, 55%
  opacity) instead of hiding them.
- **Do** use tabular numerals for counts, percentages, progress, sizes and the version.
- **Do** keep controls soft and friendly: 8px corners on buttons and fields, pills for chips, 150ms
  transitions on the shared ease.
- **Do** draw every icon from the one round-stroke set through masks, and put key hints on the controls they
  trigger.
- **Do** keep controls compact beside the map: 34px standard, 28px small, 26px chips, a 328px sidebar.

### Don't:
- **Don't** add light themes, white panels or bright surfaces. The app must never feel like "a light, bright
  app" that glares after a dark game.
- **Don't** surround the map with banners, promos, badges or decoration. It must never feel like "a busy map
  website"; the update banner appears only when there is an update and can be dismissed.
- **Don't** use a map site's colors, logo or look anywhere in the app.
- **Don't** introduce a second accent hue or a display typeface.
- **Don't** use Unicode glyphs or emoji as icons.
- **Don't** give a resting surface the Float shadow; Float is for floating things.
- **Don't** use Green Flag for anything but done, or Danger Coral for anything but destructive actions and
  errors.
