# Dashboard kit findings from the Quantia integration (element 0.4.9)

Quantia (the amlak dashboard engine) moved onto `@grafloria/element` 0.4.9 /
`engine` 0.3.7 on 2026-09-07 and drove every mode × sizing × layout × drag-handle
combination with real pointer events in Chromium. Most of what broke was on
Quantia's side and is fixed there. The items below are the kit's. Each has a
reproduction, most of them on `demos/dashboard/fluid-board.html` itself.

## 1. Fit squeezes instead of refusing — contradicts the kit's own contract

`grid-binder.js` says: "A board is never bounded BELOW what it already holds …
and only further growth is refused." The behaviour is the opposite for
gestures.

Reproduction on `fluid-board.html`: click **Fit**, then drag the first KPI's
bottom edge down by ~300 px.

| tile heights (px) | before | after |
|---|---|---|
| KPI row | 83, 83, 83, 83 | **361, 36, 36, 36** |
| chart row | 269, 269, 269, 269 | 129, 129, 129, 129 |

Every other tile shrank to make room. The same happens for a move that pushes a
neighbour below capacity. `fitCapacity()` is `max(rowsThatFit, engine.rows())`,
so once a board holds more rows than fit (a loaded document, a grow→fit switch)
the capacity follows the row count and nothing is ever refused; `geom()` then
sets `minRowHeight: 1` under fit, and the squeeze has no floor at all. In a
Quantia view holding 17 rows against a 5-row frame, text boxes went from 41 px
to 30 px on one resize.

Suggested: clamp a resize/move at `bound()` the way `addWidget` is refused
(the placeholder stays put, `onGesture` reports `changed: false`), and treat
"already over capacity" as frozen rather than elastic. If squeezing is wanted
somewhere, make it an explicit `overflow` value.

## 2. `dragHandle: true` names a header custom hosts never render

`dragHandleSelector(true)` is `.axdb-widget-h`. A host that paints its own
content through `renderWidget` (Quantia does) has no such element, so "drag by
caption" silently drags nothing — no error, no fallback. Measured: a drag from
the header moved nothing until Quantia passed its own selector string.

Suggested: when `true` is given and the host contains no `.axdb-widget-h`,
fall back to a top band of the node host (the caption strip's height), or
document loudly that custom hosts must pass a selector.

## 3. `static: true` still claims the press, which kills clicks inside content

A static board's binder still handles `pointerdown` ("claimed and deadened,
click still focuses"). A handled pointerdown cancels the compatibility mouse
events, and ECharts/zrender listen to those — so a click on a chart inside a
static board reaches nothing. Measured: every click-to-filter check in
Quantia's viewer went red the moment its own pointerdown guard was removed in
favour of `static: true`; restoring the guard fixed it.

Suggested: under `static`, do not claim presses that land inside the node's
content — only presses on kit chrome. A read-only board should still let its
content be clicked.

## 4. Edge resize exists but announces itself only mid-gesture

`EDGE_GRIP` (7 px) resizes from any edge — good — but the host gets no cursor
until the gesture starts (`api.container.style.cursor` is set in the gesture
only). With content covering the tile (a chart canvas sets `cursor: default`),
the only visible affordance is the corner handle; users conclude the corner is
the only way to resize. Quantia now sets `ew-/ns-/nwse-/nesw-resize` on
`pointermove` itself.

Suggested: on `pointermove` over a node host, set a class or the cursor per
`cursorFor(edgesNear(...))` so every embedder gets it for free.

## 5. `setLayout('grid' | 'split')` drops the selection

Switching layouts rebuilds the binders and the selected widget (`axdb-selected`,
the grip) is forgotten; the host has to call `focusWidget(id)` again. The
DevExpress designer keeps the selected item across a layout change.

## 6. Small things

- The grip's hover colour `#3b52d9` is hard-coded in `styles.js` while its fill,
  border and dots read `--axdb-card/--axdb-line/--axdb-muted`. An
  `--axdb-accent` would let a host theme the whole grip.
- Under `layout: 'split'` applied to every view, hosts in the non-active
  (parked) views still carry `.axdb-rs` corner handles (6 seen off-screen on a
  4-view board). Harmless while parked; worth a look when a view is shown.
- `focusWidget()` on a widget added in the same tick returns `false` (adds are
  fire-and-forget commits); hosts have to retry a frame later. Returning a
  promise, or focusing once the commit lands, would remove that dance.
- The grip fades in over 120 ms; anything reading its opacity right after a
  selection sees a mid-fade value. Fine, just worth a note in the learn page
  for people writing gates.

## 7. Feature request: layout and sizing PER CONTAINER

Today `layout: 'grid' | 'split'` lives on the view and `sizing` on the board;
a container (`DashboardWidgetSpec.widgets`) gets only `columns` and `maxRows`.
The DevExpress shapes Quantia has to reproduce need one level more: a board
that is **fit + split** (the screen is always covered, panes are percentages)
whose one pane is a **grow + grid** of KPI cards that scrolls inside the pane,
or a tab/group container laid out as a grid inside a split board.

Suggested: `DashboardWidgetSpec.layout?: 'grid' | 'split'` and
`sizing?: 'fit' | 'grow'` on a container, the container's frame being the
bound — under fit the container squeezes/refuses within its own pane, under
grow it extends and scrolls inside the pane (the fluid camera's bounded scroll,
scoped to the container). `toJSON()` would carry a `tree` per split container
the way it does per view. Quantia's sections are still flat overlays for this
reason; with this in the kit they would become real containers.

## What Quantia did meanwhile (for context, not for the kit)

Default handle is the kit's grip, centre, outside; fluid boards default to
grow; caption drag uses Quantia's own header selector; the viewer mounts
`static: true` **and** keeps its pointer guard (item 3); edge presses are let
through to the kit with a cursor announced on hover (item 4); selection is
restated after a layout switch (item 5). Gate: `apps/quantia-demo/e2e/kit-matrix.mjs`
in the amlak repo, 275 checks.

---

## Quantia side, 2026-09-08: 0.4.16 verified

Installed 0.4.16, rebuilt every Quantia bundle, ran the full gate suite (22 gates, kit matrix 300+ checks, sections included): green. On the Groups page the Product pull no longer collapses the section (frame stays 325×729) under either squeeze setting. Quantia follows the kit's squeeze default and exposes "Freeze" (squeeze: false) per dashboard: frozen, the pull is refused with every control untouched; after shrinking Invoice date, Product grows into the room, exactly as described. Items 2–7 are all in use: selectWidget for the designer's selection, the kit's edge cursor, --axdb-accent as a picker, static without a host-side guard, and sections switching grid/split live with their trees saved.

## Quantia side, 2026-09-08 (later): 0.4.18 done

To-do list worked through. No escalation or section-resize workaround existed on Quantia's side; the drag-out drop goes through the kit's own adoption path and is refused when frozen (parent stays, nothing moves), so no capacity check was needed. Section frames now reach floor(gap/2)−1 px outside their tiles, read off `--axdb-gap`: adjacent frames sit 5 px apart, the label is a 16 px tab inside the frame's corner. Hand-checked on the Groups page: grow-mode pull on Product pushes Invoice date and size and grows the section (frame 1930→2068 px), three clicks across three panels leave one ring, Split→Grid returns the identical layout, undo restores each. 22 gates green, kit matrix included.

## Quantia side, 2026-09-08 (evening): 0.4.24 adopted

The 0.4.24 to-do is done. Pins committed. Section presses now reach the kit (`.axdb-slab` plus a point-in-slab test in the board-background guard) — before that a section could not be selected or resized on our page at all. Our `.sec` frame, `.sec-t` tab and section rail are deleted; the kit's caption band carries the title, icon, colours and two action buttons (settings, remove) routed through `onCaptionAction`, and `setCaption` drives the designer's title, icon and colour edits as one undo step. Selection is the kit's through `onSelect`.

Item 5 needs nothing on our side: on a Fit board with squeeze off and every section full, dragging a control out onto the ungrouped chart is refused — parent unchanged, geometry identical to the pixel. There is no Quantia append path that bypasses capacity; the earlier report was against a build with squeezing on.

Hand checklist (item 7) all pass: one ring across three panels, band press and empty-column press both select, corner and right-edge section resize, child width into the free column, refused top pull, shrink-then-grow, split dividers mid-span (and a press near the section edge resizes nothing), board Split→Grid identical, live caption with undo, and captions restored after save and reopen.

Appearance sweep (item 8) found two things, both ours and both fixed: in dark mode the band painted near-white text on a light ground, because the kit themes the band from the OS colour scheme while Quantia themes from its own mount — the band now reads `--axdb-caption-fg/-bg/-border` from Quantia's tokens; and driving our selection from `onSelect` repainted widget bodies on pointerdown, which destroyed the element an in-flight click was aimed at (a decomposition tree's "split by" pick stopped working). No band escapes its slab, lies over a foreign widget or covers its own child, in grid, tab, and RTL.

Verification: unit suites board 53, widgets 438, designer 325, viewer 152, angular 76; all 22 browser gates green, kit matrix included. One caveat on our side: the filtering gate's "Clear puts the board back" step flakes on two chart widgets in a full-suite run and passes standalone — its own documented hover-emphasis artefact, not a kit issue.
