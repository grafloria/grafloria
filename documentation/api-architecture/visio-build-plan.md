# Visio-style stencil authoring — build plan

**Goal:** a Visio/draw.io-style authoring surface on Grafloria — a categorized, searchable **stencil palette** you drag onto the canvas, with **smart guides + snap/align** and container/shape-data depth.

**Derived from** [`app-gap-analysis.html`](./app-gap-analysis.html) (draw.io/Visio tab, re-verified against `main` 2026-07-25). Verdict: **56% there, ~2–3 dev-months.** The headline finding holds: **~70% of the prioritised work is exposure/wiring, not construction.** File:line references below are the audit's verified touch points — start there.

**Methodology (repo conventions):** prototype-as-executable-spec; every demo must actually render and pass its gate; verify by rendering, not inferring; commit the moment a slice is green.

---

## Sequence at a glance

| Phase | Theme | Tickets | Effort | ~Weeks |
|---|---|---|---|---|
| 1 | "Feels precise" (snap/guides/align) | T1–T3 | S · S · S–M | 1–1.5 |
| 2 | Stencils & the palette (signature) | T4–T7 | S · S–M · M · M | 3–4 |
| 3 | Container & shape-data depth | T8–T10 | M · M · M | 3 |
| 4 | Flagship demo + gate | T11 | M | 1 |
| 5+ | Backlog (Layers, pages, import…) | — | L each | deferred |

Phase 1 ships value in week one and is independent of everything else. Phase 2 is the feature. Phase 3 adds Visio depth. Phase 4 proves it end-to-end.

---

## Phase 1 — "It feels precise" (cheap, high-impact, independent)

> **Status (2026-07-25, branch `feat/visio-phase1`):**
> - **T4 ✅ DONE** (`b945a03`) — `engine.templateRegistry` is real; `registerGeneratedTemplates()` un-orphans all 80 masters. 4 tests, engine builds.
> - **T3 ✅ DONE** (`ddfaa74`) — `AlignCommand` + `DistributeCommand`, single undoable step, locked-node-safe. 7 tests.
> - **T1 → FINDING (not shipped as a default flip):** making `enableHelperLines` the global default **regresses the interaction gate** — verified it fails DRAG-ATTACH on `contextual-zoom` and LINK-SELECT-SPAN on `layout-portfolio` (both pass on `main`), because snapping breaks the gate's 1:1-drag covenant and would change the feel for every existing embedder (n8n workflows, dashboards). **Kept opt-in;** the Visio editor (T11) enables it.
> - **T2 → DEFERRED to the editor phase:** the `updateResize` snap hook is ready to pass, but correct *edge*-snapping (the moving handle's edge, not the box origin) must be verified with snapping actually ON — which only happens in the editor. Wiring it gated-off and unverifiable would violate verify-by-rendering.
>
> **Takeaway:** the two *interaction* tickets (T1, T2) are editor-context features, not library defaults — the library keeps its stock feel; the editor turns snapping on. The two *capability* tickets (T3, T4) shipped clean.


### T1 · Default-on drag-time snapping + alignment guides — **S**
- **Why:** guides already compute & publish, but drag-snap is gated behind a new `enableHelperLines` flag that defaults **false** (row: *Snapping / guides*).
- **Touch:** `libs/engine/src/config/InteractionConfig.ts:390` (`enableHelperLines: false`); gate at `libs/renderer/src/instance/dom-event-binder.ts:1561`. `DEFAULT_SNAP_CONFIG.enabled` is already `true` (`snapping.ts:51`).
- **Do:** default `enableHelperLines: true` (or surface a first-class `snap` toggle on `createDiagram` options + a toolbar button); extend `applyHelperLineSnap` (`dom-event-binder.ts:1554`) beyond single unparented nodes to multi-select.
- **Accept:** dragging a node shows edge/center + equal-spacing guides and snaps by default; multi-select drag snaps; a public option toggles it off.

### T2 · Wire resize-snapping — **S**
- **Why:** `updateResize` accepts a snap hook that the binder never passes (row: *Snapping / guides*).
- **Touch:** hook param `libs/renderer/src/interaction/selection-tools.ts:906` (applied `:949`); the binder resize call omits it at `dom-event-binder.ts:952`.
- **Do:** pass `box => snap.computeSnap(box, siblingBoxes).box` into the resize call.
- **Accept:** resizing a shape snaps its edges to sibling edges / grid, with guides.

### T3 · Align & Distribute commands — **S–M**
- **Why:** zero `AlignCommand`/`DistributeCommand` exist, but the geometry is ready (row: *Align / distribute*).
- **Touch:** reuse `libs/renderer/src/interaction/snapping.ts:345` `bestAlignment` + `:465` `bestSpacing`; new `libs/engine/src/commands/basic/AlignCommands.ts` (batch of `MoveNodeCommand`); expose `alignNodes(edge)` / `distributeNodes(axis)` on the engine + toolbar actions.
- **Accept:** select 3+ nodes → align left/center-x/right/top/middle-y/bottom and distribute horizontally/vertically; each is a single undo entry; collab-safe.

---

## Phase 2 — Stencils & the palette (the signature feature)

> **Status (2026-07-25, branch `feat/visio-phase1`): T5, T6, T7 all ✅ DONE.**
> - **T5** (`069890c`) — `Stencil` model + `listStencils()`/`getStencil()`/`registerStencils()`, **8 named sections** built from the authored notation groupings (`meta.category` is too coarse: all 30 UML + 19 ERD masters share `"diagram"`). Named front-door exports added. 7 tests; 544 element tests still green.
> - **T6+T7** (`a1f873f`) — `bindStencilPalette()` in a new `libs/element/src/lib/stencil-kit/` (mirrors the dashboard-kit idiom). Categorized collapsible sections, live search, and a thumbnail drawn from each master's **own** `getShape(type).outline(w,h)` — the palette shows the real silhouette, not stock icons. Drag-to-place via **HTML5 DnD** (deliberately not pointer events: the canvas binder consumes `pointerdown`).
> - **Undo:** `NodeFactory.createFromTemplate` writes straight to the model, so the kit captures the created subtree, detaches it, and replays it through the CommandManager as one `BatchCommand` → **one Ctrl+Z removes a dropped shape.**
> - **Proof:** 105th demo `demos/diagrams/stencil-palette.html`. Live-verified: **8 sections, 109 shapes, 109 thumbnails**, scripted checks PASS, and a **real Playwright HTML5 drag** places `flowchart:connector` at exactly the cursor-centred point with one-undo. Gates: gallery **105/105**, interaction 1/1, zero page errors.
>
> **Remaining for the full Visio experience:** Phase 3 (T8 drag-into-container reparent · T9 shape-data panel · T10 in-place text) and Phase 4 (T11 flagship editor, which is also where T1/T2 snapping gets switched on).


### T4 · Own the template registry on the engine + register the 80 masters — **S**
- **Why:** `TemplateRegistry` is real and wired to `NodeFactory`, and a 26-template `template-library/` is registered — but the **80 `templates/generated/` masters** (bpmn 15, erd 19, flowchart 16, uml 30) are imported by nothing, and `engine.templateRegistry` as a `DiagramEngine` property is still absent (row: *Shape / stencil libraries*).
- **Touch:** `libs/engine/src/templates/TemplateRegistry.ts:14`, `templates/generated/index.ts`, `template-library/integration.ts:62` (`registerTemplateLibrary`), `NodeFactory.ts:29`; add a `templateRegistry`/`nodeFactory` property to `DiagramEngine.ts`.
- **Do:** `registerGeneratedTemplates(registry)` (import the `generated/` barrel and register all 80); construct + expose `engine.templateRegistry`/`engine.nodeFactory` so the documented shape is real.
- **Accept:** `engine.templateRegistry` resolves all 80 masters + the 26 curated templates; `NodeFactory` stamps any of them by id.

### T5 · Stencil model + loader + front-door exports — **S–M**
- **Why:** no first-class "stencil" (a *named, categorized set* of masters); template symbols reach `@grafloria/element` only via wholesale `export *` (rows: *Shape / stencil libraries*, *Templates*).
- **Touch:** new `Stencil` type (`{ id, name, category, masters: NodeTemplate[] }`) + a stencil registry over `TemplateRegistry`; add **named** re-exports (`TemplateRegistry`, `registerTemplateLibrary`, `NodeTemplate`, `Stencil`) to `libs/element/src/index.ts`.
- **Do:** group the 80 masters + 26 templates into named stencils (Basic Shapes, Flowchart, BPMN, UML, ERD, Workflow, Data-viz); expose `listStencils()` / `getStencil(id)`.
- **Accept:** an embedder can enumerate stencils by category and their masters from `@grafloria/element` with types.

### T6 · Stencil palette UI component — **M**
- **Why:** the signature Visio surface; no reusable palette exists (the n8n demo hand-rolls a mini one).
- **Touch:** new framework-agnostic palette core (categorized, searchable list: icon/thumbnail + name), rendered from `listStencils()`; thin wrappers for element/React/Vue/Angular. Reuse the master's geometry to render a small SVG thumbnail.
- **Accept:** a collapsible, searchable palette shows every stencil category and its shapes; filtering by name works; keyboard-navigable.

### T7 · Drag-from-palette → drop-to-place — **M**
- **Why:** the core authoring gesture; net-new.
- **Touch:** palette drag source + a canvas drop handler on the `createDiagram` binder; on drop, stamp the master via `NodeFactory` at the cursor (world coords), with a ghost preview and snap-on-drop (reuses T1).
- **Accept:** dragging a shape from the palette drops a real, connectable, snapped node at the cursor; single undo; works in element/React/Vue.

---

## Phase 3 — Container & shape-data depth

> **Status (2026-07-25, branch `feat/visio-phase1`): T8, T9, T10 all ✅ DONE.**
> - **T8** — drag-into-container now **reparents**. `GroupMembershipService.handleNodeDragEnd()` already held the entire policy (innermost hit-test, `canAddMember` veto, coordinate translation, undoable Add/Remove commands) and was never called; the binder now calls it on the node-drag mouseup, hit-testing the node's **centre** (the cursor can sit outside a small shape). Opt-in `enableGroupMembershipOnDrop`. **106th demo** proves join → travel-with-container → transfer → unembed with **real pointer drags**.
> - **T10** — **double-click edits a label** in the framework-free binder (was auto-wired only in Angular, so vanilla/React/Vue got an event and no caret). Opt-in `enableInPlaceTextEdit`; the widget is positioned through the live world→client map so it lands on the label at any zoom. **107th demo** proves Enter-commit + undo/redo, Escape-abandon, blur-commit.
> - **T9** — **`SetNodeDataCommand`** (new: shape data was a raw `setData` write outside undo) + a **framework-free shape-data panel** rendering each master's `dataSchema` (all 80 carry one). Per-**key** writes so collab's LWW registers don't clobber a co-editor's other field; undo removes keys the edit invented. **108th demo** proves seed → edit → undo/redo → follows-selection.
>
> **Verification:** gallery **108/108**, interaction **1066/1066**, engine **3467** tests, element **545**. Every new gesture is opt-in, so all 105 pre-existing demos are untouched.


### T8 · Drag-into-container reparents — **M**
- **Why:** pointer drop does **not** reparent today; both `GroupMembershipService` and the new `SemanticMembershipService` exist but are never instantiated in lib code (row: *Containers / swimlanes*).
- **Touch:** binder node-drag commit path in `dom-event-binder.ts`; hit-test with the existing `findGroupAtPoint` (`:1653`); on mouseup emit `SetParentCommand` (pattern proven in `keyboard-navigation.ts:647`) / `AddToGroupCommand`, gated by `GroupMembershipService.canAddMember` / `SemanticMembershipService`; show a target-container highlight during hover.
- **Accept:** dropping a shape inside a container reparents it (one undo) and it moves with the container; dragging it out un-parents; membership rules can veto.

### T9 · Framework-agnostic shape-data panel — **M**
- **Why:** `property-schema/` is types-only (zero runtime); the working property sheet is Angular-only (row: *Shape data / custom properties*).
- **Touch:** new runtime in `libs/renderer` consuming `renderer/types/property-schema/` — a per-node-type schema registry + validation (`validation.ts`) + condition/visibility (`conditions.ts`) evaluator that writes through to `node.data` (per-key LWW, so collab-safe); a headless property sheet mountable from element/React/Vue.
- **Accept:** selecting a shape shows its `dataSchema`/`defaultData` fields, editable, validated, conditionally shown; edits are undoable and sync over collab; parity with the Angular panel.

### T10 · In-place text editing in the binder — **M**
- **Why:** `InPlaceTextEditor` is embed-exported now but auto-wired only in Angular; the binder's `onDoubleClick` just emits an event (row: *Text on shapes & in-place editing*).
- **Touch:** `dom-event-binder.ts:1230` (`onDoubleClick`) → open `InPlaceTextEditor`; make node label align/valign configurable off node style (`svg-renderer.ts:5011` is hard-centred); centralize the `length×0.6` metric (now duplicated in ~8 sites) into one exported helper.
- **Accept:** double-click a shape edits its label in vanilla/React/Vue (not just Angular); label alignment is configurable; one text-metric helper.

---

## Phase 4 — Prove it

> **Status (2026-07-25, branch `feat/visio-phase1`): T11 ✅ DONE — and with it T2, and T1's enablement.**
> - **T11** — `demos/diagrams/visio-editor.html`, the **109th demo**: stencil rail · canvas · shape-data panel · align/distribute toolbar, with drag-to-place, drop-to-contain, in-place rename and snap guides all live in one surface.
> - **T2** — the resize-snap hook is now passed (`selection-tools.ts` always accepted it; the binder never did). It shares `enableHelperLines` with the drag — a host that asked for snap guides means both — and publishes the same guide segments, so a resize aligns to neighbours instead of landing a pixel out. Needed a new `activeGestureNodeId()` so a box never snaps to itself.
> - **T1** — helper lines are switched on **here**, in the editor, rather than as a library default (see the Phase 1 note: a global flip regressed the drag gate).
> - **A real find from the gate:** the first cut of the toolbar failed **DEAD-BUTTON** — Align/Distribute did nothing when too few shapes were selected. Fixed properly by *disabling* each button below the count its command needs (2 for align, 3 for distribute) and syncing on `selection:change`. An enabled control that does nothing is a bug, and the gate was right to call it.
>
> **Verification:** gallery **109/109** · interaction **1088/1088** · engine **3467** · renderer **2649** · element **545**.

### Original ticket

### T11 · "Visio-style editor" flagship demo + gate — **M**
- **Do:** a gallery demo — stencil palette (left) · canvas · shape-data panel (right) · snap/guides · align toolbar · templates — tying T1–T10 together, published to the demo gallery.
- **Gate:** add to the variant/visual battery (`demos/e2e/…`) with a real-mouse scenario: drag a shape from the palette, drop into a container (reparents), align a selection, edit a label, edit shape data — screenshot-asserted.
- **Accept:** the demo authors a diagram Visio-style end-to-end and is gate-verified green; extract the reusable palette/drop/align bits into the library kit as they prove out.

---

## Phase 5+ — Backlog (deferred; not needed for the core stencil experience)

| Item | Effort | Note |
|---|---|---|
| **`.drawio` (mxGraph XML) import** | L | **v1 SHIPPED 2026-07-26** (`libs/engine/src/interop/drawio/`, demo `misc/drawio-import` gated): plain + compressed saves, containers with membership, named-loss warnings. Pending: multi-page, container-endpoint edges, waypoint application. |
| **`.vsdx` import** | L | OOXML/zip; heavier than drawio. |
| **Layers** (`LayerModel` + per-layer visibility/lock) | L | No layer entity exists; z-order per-node already landed. |
| **Multi-page documents** (`pages[]` / Workspace) | L | `PersistedDocument` is single-diagram today. |
| **OS clipboard bridge** (`navigator.clipboard`) | M | Clipboard is in-memory only. |
| **Undo-stack reconciliation** (CommandManager ↔ collab undo) | L | Two non-communicating stacks. |
| **`SetNodeLockCommand`** | S | Mirror the z-order command pattern. |

---

## Effort roll-up

- **Phase 1:** ~1–1.5 wk — immediate "precise" feel, zero dependencies.
- **Phase 2:** ~3–4 wk — the stencil palette (T7 depends on T4–T6).
- **Phase 3:** ~3 wk — container reparent + shape-data + text editing (largely independent).
- **Phase 4:** ~1 wk — flagship demo + gate.
- **Total: ~8–10 weeks**, matching the gap analysis's `~2–3 dev-months`.

**Recommended start:** T1–T3 (Phase 1) in parallel with T4 (the S-sized registry wiring) — both are cheap, unblock the palette, and make the canvas feel like Visio within the first week.
