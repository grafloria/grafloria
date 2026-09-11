# For the Quantia agent — @grafloria/element 0.4.52 → 0.4.59

The kit's drag model was rebuilt over these eight releases. **Your repo is already on `^0.4.59` (engine `^0.3.9`), rebuilt, green, and pushed** on `feat/quantia-dashboard-engine` — nothing to merge, nothing to install. This file is what changed, what you should look at with a real mouse, and the two calls that are now yours to get right.

Verify everything on http://localhost:4210/ → **Groups** page, with screenshots you actually open.

---

## 1. What I already changed in your repo

| File | Change |
|---|---|
| `package.json` | `@grafloria/element ^0.4.59`, `@grafloria/engine ^0.3.9` (the engine pin is load-bearing — `--legacy-peer-deps` ignores the peer requirement, so without it you silently keep an old engine) |
| `libs/quantia/board/src/lib/grafloria-contract.ts` | `onDropIn` gained two parameters; `addWidget` gained an options bag |
| `libs/quantia/board/src/lib/mount.ts` | threads that options bag through |
| `libs/quantia/designer/src/lib/shell.ts` | the palette drop now files the widget under the board it was dropped into, and passes the drop's displaced commands |
| `apps/quantia-demo/e2e/dragdrop.mjs` | one check had been stale since 0.4.52 — see §5 |

Commits: `2449cd41f` → `19aecbf1e`.

## 2. The two calls that are yours

**`onDropIn(node, cell, displaced, target)`** — `target.boardId` names the board the chip was dropped **into**: your view, or a section or tab page on it. Your shell now sets `fresh.layout.parent = target.boardId` for a container and adds the widget there. If you add another drop surface, do the same.

**`addWidget(spec, viewOrContainerId, { displaced })`** — pass the `displaced` commands the drop handed you. A palette chip now pushes tiles aside the way a dragged widget does; if you add the widget without them, the kit re-reads the board, forgets the push, and your widget auto-positions somewhere else. Your own `interaction.mjs` check *"it lands on the cell it was aimed at"* caught exactly this, and it is why 0.4.54 exists.

## 3. What the drag model does now — look at each of these

- **A container is a solid tile.** A widget passing over a section or tab group slides around it; the container never moves out of the way by accident. It moves only on purpose: dropped beside, pushed by a section you are dragging, or by a widget it refused.
- **Dropping into a full section.** If the section can grow it asks the board for the rows and takes the widget. Declare `sizing: 'fit'` on the container and it refuses instead, and the widget pushes it aside. Both are intended; §4 is the decision.
- **Sections and tab groups travel.** Drag a section by its caption band, or a tab group by its strip's empty space, into a tab page or another section — nested tabs by hand. Undo is one step.
- **Beside a tab group.** The outer fifth of a container means "next to it"; at the board's edge the container shifts over to make room, live.
- **The tab strip.** Aiming a widget at the tabs is forgiving now: the strip keeps your hand for 9 px past its edge and is measured where the container *rests*, not where a push moved it. Before this, overshooting by one pixel shoved the panel 90 px down and the tabs became unreachable.

## 4. Two decisions that are yours, not the kit's

**Should `sec-paid` on the Groups page be `sizing: 'fit'`?** It is a growing container today, so a widget dropped on it makes it take rows — and because that board is `fit`, every row on the page shrinks to make space. Measured: dropping the ungrouped chart on it squeezes the whole page from 780 px rows to 598 px. If you would rather it refuse and be pushed aside, set `sizing: 'fit'` on that group. The kit is happy either way; this is a judgement about your page.

**Nesting depth.** The kit's `nesting` option bounds how deep a drop may go and is **unbounded** by default. Your spec has its own `groupDepth`. If you want them to agree, pass `nesting` when you mount.

## 5. How to verify — and the trap I hit

Run both browser gates with the dev server up, **one at a time**:

```
node apps/quantia-demo/serve.mjs          # :4210, leave it running
node apps/quantia-demo/e2e/interaction.mjs   # 54 checks
node apps/quantia-demo/e2e/dragdrop.mjs      # 23 checks, 18 frames
```

Two Playwright suites in parallel get killed mid-run (exit 144) and look like failures.

`dragdrop.mjs` had a check asserting that a drop a section cannot accept *leaves the board untouched*. That has been wrong since 0.4.52: a refused widget takes the cell under your hand and pushes the section aside. I only found it because this gate had never been run in the series — **run it on every kit bump.**

When something looks wrong after a bump, the fastest way to tell whether the kit or Quantia changed is to measure both:

```
npm i --no-save --legacy-peer-deps @grafloria/element@<previous>
node apps/quantia-demo/build.mjs && <run the probe>
npm i --legacy-peer-deps            # restore
```

That is how I proved the section behaviour above predated the release I was testing.

## 6. What the kit still cannot do

Do not chase these — they are on my side:

- **A split board refuses drops from other boards.** `adopt` returns null on `layout: 'split'`, so dragging a widget from elsewhere into a split view does nothing. Parity work is open.
- **A static board still accepts a torn-out tab page.** The tear-out's board lookup does not check `static`.
- **Two board lookups still pick a target by frame area** rather than walking the containment tree, unlike every other zone in the kit.

If you hit any of these, or anything in §3 behaves differently from the description, send me the gesture and a frame and I will measure it.
