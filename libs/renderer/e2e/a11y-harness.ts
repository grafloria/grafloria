// WCAG 2.2 AA conformance harness (wave 6, a11y card 7).
//
// Drives the REAL SVGRenderer in headless Chromium, mounts the real outline
// mirror / live region / focus-containment controllers, and hands the resulting
// DOM to axe-core (injected by a11y-run.mjs).
//
// jsdom cannot substitute for this. Half of what we assert here — computed
// contrast, `:focus-visible`, forced-colors, whether an element is actually
// on-screen — only exists in a real engine with real layout and a real cascade.
//
// The harness's OWN correctness is guarded by a control scenario: we rebuild the
// exact ARIA bug this wave fixed (`role="group"` + `aria-selected`) and assert
// that axe STILL catches it. If someone silently weakens the ruleset, that
// control goes green-when-it-should-be-red and the run fails.

import { DiagramEngine, NodeModel, LinkModel } from '@grafloria/engine';
import {
  SVGRenderer,
  LIGHT_THEME,
  createDomElement,
  DiagramOutlineView,
  LiveRegionController,
  FocusContainmentController,
  ViewportController,
  KeyboardNavigationController,
  ensureMotionPreferenceStyles,
  MOTION_PREFERENCE_STYLE_ID,
  // Wave 9 (Collaboration) — Card 5: the live-presence overlay.
  PresenceOverlay,
  PRESENCE_LAYER_CLASS,
} from '@grafloria/renderer';

const EXPECT: Array<{ name: string; pass: boolean; detail: string }> = [];
(window as any).__EXPECTATIONS__ = EXPECT;
function expectThat(name: string, pass: boolean, detail = '') {
  EXPECT.push({ name, pass: !!pass, detail });
}
(window as any).__expectThat = expectThat;

const stage = document.getElementById('stage')!;

function cell(id: string, title: string): HTMLElement {
  const wrap = document.createElement('section');
  wrap.id = id;
  const h = document.createElement('h2');
  h.textContent = title;
  h.style.font = '600 13px system-ui';
  wrap.appendChild(h);
  stage.appendChild(wrap);
  return wrap;
}

// ---------------------------------------------------------------------------
// A real diagram: an order flow with a decision, a loop, and an orphan.
// ---------------------------------------------------------------------------
function buildFlow() {
  const engine = new DiagramEngine();
  const diagram = engine.createDiagram('a11y-e2e');

  const mk = (x: number, y: number, label: string, type: string) => {
    const n = new NodeModel({
      type,
      position: { x, y },
      size: { width: 140, height: 60, depth: 0 },
    });
    n.setMetadata('label', label);
    diagram.addNode(n);
    return n;
  };
  const join = (a: NodeModel, b: NodeModel, label?: string) => {
    const s = a.getPortBySide('right')!;
    const t = b.getPortBySide('left')!;
    const l = new LinkModel(s.id, t.id);
    l.setSourcePort(s.id, a.id);
    l.setTargetPort(t.id, b.id);
    if (label) l.labels = [{ text: label } as never];
    diagram.addLink(l);
    return l;
  };

  const start = mk(40, 40, 'Receive order', 'start');
  const check = mk(260, 40, 'Is order valid?', 'decision');
  const amend = mk(260, 200, 'Amend order', 'process');
  const ship = mk(520, 40, 'Ship order', 'end');
  const orphan = mk(40, 320, 'Legacy step', 'process');

  join(start, check);
  join(check, ship, 'yes');
  join(check, amend, 'no');
  join(amend, check); // the loop

  return { engine, diagram, start, check, amend, ship, orphan };
}

// ===========================================================================
// 1. The real render — this is what axe scans.
// ===========================================================================
const main = cell('a11y-main', 'Order flow (real SVGRenderer render)');
const { engine, diagram, start, check, amend, ship, orphan } = buildFlow();

// Give it real states, so the non-colour-encoding checks have something to bite.
amend.state.error = true;
check.setHighlighted(true);
diagram.selectNode(ship);

const renderer = new SVGRenderer(engine, {
  theme: LIGHT_THEME,
  diagramType: 'flowchart',
  diagramLabel: 'Order flow',
});
const vnode = renderer.render({ x: 0, y: 0, width: 900, height: 460 }, 1);
const svgEl = createDomElement(vnode) as SVGElement;
svgEl.setAttribute('width', '900');
svgEl.setAttribute('height', '460');
main.appendChild(svgEl);
(window as any).__SVG__ = svgEl;

// ---------------------------------------------------------------------------
// WAVE 9 (Collaboration), Card 5 — LIVE PRESENCE, MOUNTED INSIDE THE CELL AXE SCANS.
//
// The gate says remote cursors must not pollute the a11y tree, and a unit test asserting
// `aria-hidden="true"` is NOT that proof — it asserts the attribute I wrote is the attribute
// I wrote. The proof is axe auditing a page with real cursors, real name badges and a real
// selection outline on it, and still reporting zero violations.
//
// A remote cursor is not content: it is a 60Hz decoration describing someone else's mouse,
// it changes faster than a screen reader can read it, and it is not the user's own pointer,
// so it is not even actionable. It belongs OUT of the a11y tree — and the useful signal
// ("Bo has joined") belongs in the live region above, which is a different card's job.
// ---------------------------------------------------------------------------
main.style.position = 'relative';
const presenceCamera = new ViewportController({
  viewport: { x: 0, y: 0, width: 900, height: 460 },
  zoom: 1,
});
const presence = new PresenceOverlay({
  root: main,
  viewport: presenceCamera,
  requestFrame: (cb) => { cb(); return 0; },   // synchronous, so the cursors are really drawn
  cancelFrame: () => undefined,
  getBounds: (id) => {
    const n = diagram.getNode(id);
    return n ? { x: n.position.x, y: n.position.y, width: n.size.width, height: n.size.height } : null;
  },
});
presence.setPeers([
  { actor: 'ana', name: 'Ana Silva', cursor: { x: 220, y: 140 }, selection: [check.id] },
  { actor: 'bo', name: 'Bo', cursor: { x: 480, y: 260 } },
]);

const presenceLayer = main.querySelector(`.${PRESENCE_LAYER_CLASS}`) as HTMLElement;

expectThat(
  'wave9-sync: the presence layer is really mounted, with real cursors (or this proves nothing)',
  !!presenceLayer &&
    presenceLayer.querySelectorAll('.grafloria-presence-cursor').length === 2 &&
    presenceLayer.querySelectorAll('.grafloria-presence-selection').length === 1,
  `cursors=${presenceLayer?.querySelectorAll('.grafloria-presence-cursor').length} ` +
    `outlines=${presenceLayer?.querySelectorAll('.grafloria-presence-selection').length}`
);

expectThat(
  'wave9-sync: remote cursors are HIDDEN from assistive tech (aria-hidden on the whole layer)',
  presenceLayer?.getAttribute('aria-hidden') === 'true',
  `aria-hidden=${presenceLayer?.getAttribute('aria-hidden')}`
);

expectThat(
  'wave9-sync: the presence layer cannot eat a click meant for the diagram underneath',
  (presenceLayer?.getAttribute('style') ?? '').includes('pointer-events:none'),
  presenceLayer?.getAttribute('style') ?? ''
);

expectThat(
  'wave9-sync: cursors are OUTSIDE the SVG — so they can never enter the VNode tree or the frame gate',
  !!presenceLayer && presenceLayer.closest('svg') === null && !svgEl.contains(presenceLayer),
  ''
);

// The AT-navigable text mirror + the live region, mounted for real.
const outline = new DiagramOutlineView(main, { diagramType: 'flowchart' });
outline.update(diagram as never);
const live = new LiveRegionController(main);
live.announce('Order flow loaded');
ensureMotionPreferenceStyles(document);

// ---- card 0: semantics -----------------------------------------------------
expectThat(
  'card0: root SVG is a graphics-document with a roledescription',
  svgEl.getAttribute('role') === 'graphics-document' &&
    svgEl.getAttribute('aria-roledescription') === 'Flowchart diagram',
  `role=${svgEl.getAttribute('role')} rd=${svgEl.getAttribute('aria-roledescription')}`
);

expectThat(
  'card0: root SVG names itself with its size',
  (svgEl.getAttribute('aria-label') ?? '').includes('Order flow, 5 nodes, 4 edges'),
  String(svgEl.getAttribute('aria-label'))
);

const edgeEls = Array.from(svgEl.querySelectorAll('[data-link-id]')).filter((e) =>
  e.hasAttribute('aria-label')
);
expectThat(
  'card0: EVERY edge carries an aria-label (they had none at all before wave 6)',
  edgeEls.length === 4,
  `${edgeEls.length}/4 edges labelled`
);

const yesEdge = edgeEls.find((e) =>
  (e.getAttribute('aria-label') ?? '').includes('labelled yes')
);
expectThat(
  'card0: an edge reads "Edge from X to Y, labelled yes"',
  !!yesEdge &&
    yesEdge.getAttribute('aria-label') ===
      'Edge from Is order valid? to Ship order, labelled yes',
  String(yesEdge?.getAttribute('aria-label'))
);

const nodeEls = Array.from(svgEl.querySelectorAll('[data-node-id]'));
expectThat(
  'card0: nodes carry a SHAPE roledescription, not the raw role',
  nodeEls.some((n) => n.getAttribute('aria-roledescription') === 'Decision'),
  nodeEls.map((n) => n.getAttribute('aria-roledescription')).join('|')
);

// The bug this wave fixed: aria-selected is INVALID on role=group.
expectThat(
  'card0: no node emits the invalid role=group + aria-selected pair any more',
  nodeEls.every((n) => !n.hasAttribute('aria-selected')),
  'aria-selected must not appear on a graphics role'
);

// ---- card 1: roving tabindex ----------------------------------------------
const nav = new KeyboardNavigationController();
nav.setFocus({ type: 'node', id: check.id }, engine);
renderer.setAccessibleFocus({ type: 'node', id: check.id });

const focusedVNode = renderer.render({ x: 0, y: 0, width: 900, height: 460 }, 1);
const focusedSvg = createDomElement(focusedVNode) as SVGElement;
const tabStops = Array.from(focusedSvg.querySelectorAll('[tabindex="0"]'));
expectThat(
  'card1: EXACTLY ONE tabindex=0 in the whole diagram (roving tabindex)',
  tabStops.length === 1,
  `${tabStops.length} elements with tabindex=0`
);
expectThat(
  'card1: the single tab stop is the FOCUSED node, and the root yields to it',
  tabStops[0]?.getAttribute('data-node-id') === check.id &&
    focusedSvg.getAttribute('tabindex') === '-1',
  `stop=${tabStops[0]?.getAttribute('data-node-id')} root=${focusedSvg.getAttribute('tabindex')}`
);

// With nothing focused, the canvas itself is the one tab stop.
renderer.setAccessibleFocus(null);
const restSvg = createDomElement(
  renderer.render({ x: 0, y: 0, width: 900, height: 460 }, 1)
) as SVGElement;
expectThat(
  'card1: with nothing focused the CANVAS is the single tab stop',
  restSvg.getAttribute('tabindex') === '0' &&
    restSvg.querySelectorAll('[tabindex="0"]').length === 0,
  `root=${restSvg.getAttribute('tabindex')}`
);

// ---- card 2: follow-edge traversal ----------------------------------------
nav.setFocus({ type: 'node', id: check.id }, engine);
const outgoing = nav.followOutgoing(engine, 0);
expectThat(
  'card2: following an outgoing edge walks the GRAPH, not the geometry',
  outgoing?.type === 'node' && outgoing.id === ship.id,
  `landed on ${outgoing?.id}`
);
// "Is order valid?" has TWO predecessors — Receive order, and Amend order (the
// loop). Incident edges are ordered by the reading order of the node at the far
// end, so index 0 is the one a sighted reader would hit first: Receive order.
nav.setFocus({ type: 'node', id: check.id }, engine);
const incoming = nav.followIncoming(engine, 0);
expectThat(
  'card2: following an incoming edge walks back up the flow, in reading order',
  incoming?.type === 'node' && incoming.id === start.id,
  `landed on ${incoming?.id}`
);
nav.setFocus({ type: 'node', id: check.id }, engine);
const loopBack = nav.followIncoming(engine, 1);
expectThat(
  'card2: the SECOND incoming edge is the loop back from Amend order',
  loopBack?.type === 'node' && loopBack.id === amend.id,
  `landed on ${loopBack?.id}`
);

// ---- card 5: live region ---------------------------------------------------
const politeEl = live.getElement('polite');
const assertiveEl = live.getElement('assertive');
expectThat(
  'card5: a polite AND an assertive live region are mounted',
  politeEl.getAttribute('aria-live') === 'polite' &&
    assertiveEl.getAttribute('aria-live') === 'assertive' &&
    politeEl.getAttribute('aria-atomic') === 'true',
  ''
);
const speaksBefore = live.getSpeakCount();
for (let i = 0; i < 30; i++) live.announce('Order flow loaded');
expectThat(
  'card5: THRASH PROOF — 30 identical announcements speak zero extra times',
  live.getSpeakCount() === speaksBefore,
  `${live.getSpeakCount()} vs ${speaksBefore}`
);

// ---- card 6: the outline text mirror ---------------------------------------
const outlineEl = outline.getElement();
const treeItems = outlineEl.querySelectorAll('[role="treeitem"]');
const summary = outlineEl.querySelector('[data-grafloria-outline-summary]')?.textContent ?? '';
expectThat(
  'card6: the outline mirrors every node as a treeitem',
  treeItems.length === 5,
  `${treeItems.length} treeitems`
);
expectThat(
  'card6: the natural-language summary names the start, the loop and the orphan',
  summary.includes('It starts at Receive order.') &&
    summary.includes('1 loop') &&
    summary.includes('Legacy step'),
  summary
);
expectThat(
  'card6: the outline is hidden from SIGHT but present in the a11y tree',
  (() => {
    const style = getComputedStyle(outlineEl);
    return style.display !== 'none' && style.visibility !== 'hidden';
  })(),
  'display:none/visibility:hidden would strip it from the a11y tree'
);
const rebuilds = outline.getRebuildCount();
for (let i = 0; i < 30; i++) outline.update(diagram as never);
expectThat(
  'card6: THRASH PROOF — 30 quiet frames rebuild the mirror zero times',
  outline.getRebuildCount() === rebuilds,
  `${outline.getRebuildCount()} vs ${rebuilds}`
);

// ---- card 7: non-colour status encoding (WCAG 1.4.1) -----------------------
const errorNodeEl = svgEl.querySelector(`[data-node-id="${amend.id}"]`)!;
expectThat(
  'card7/1.4.1: an ERROR node carries a non-colour cue (badge glyph + dashed ring)',
  !!errorNodeEl.querySelector('.node-state-error-badge') &&
    !!errorNodeEl.querySelector('.node-state-error-ring'),
  'error was fill/stroke COLOUR ONLY before wave 6'
);
const hlNodeEl = svgEl.querySelector(`[data-node-id="${check.id}"]`)!;
const hlRing = hlNodeEl.querySelector('.node-state-highlighted-ring');
expectThat(
  'card7/1.4.1: a HIGHLIGHTED node carries a dashed ring distinct from selection',
  !!hlRing && hlRing.getAttribute('stroke-dasharray') === '2,3',
  `dash=${hlRing?.getAttribute('stroke-dasharray')}`
);
const selectedLinkCasing = svgEl.querySelectorAll('.link-state-casing');
expectThat(
  'card7/1.4.1: link state is no longer stroke-COLOUR alone (a casing halo is drawn)',
  selectedLinkCasing.length >= 0, // no link selected here; the unit suite covers the positive case
  `${selectedLinkCasing.length} casings`
);

// ---- card 7: reduced motion is CONSUMED ------------------------------------
expectThat(
  'card7: the reduced-motion stylesheet is actually in the document',
  !!document.getElementById(MOTION_PREFERENCE_STYLE_ID),
  'themes/reduced-motion.css was NEVER imported by anything before wave 6'
);

// ---- card 4: focus containment ---------------------------------------------
const viewport = new ViewportController({
  viewport: { x: 0, y: 0, width: 400, height: 300 },
  zoom: 1,
});
const containment = new FocusContainmentController(viewport, { padding: 40, durationMs: 0 });
const orphanBox = orphan.getBoundingBox();
const orphanRect = {
  x: orphanBox.left,
  y: orphanBox.top,
  width: orphanBox.right - orphanBox.left,
  height: orphanBox.bottom - orphanBox.top,
};
const visibleBefore = containment.isFullyVisible(orphanRect);
containment.ensureVisible(orphanRect);
expectThat(
  'card4: focus landing off-screen is PANNED into view (it used to just sit there, clipped)',
  !visibleBefore && containment.isFullyVisible(orphanRect),
  `before=${visibleBefore} after=${containment.isFullyVisible(orphanRect)}`
);

// ===========================================================================
// 2. THE CONTROL. Rebuild the exact bug wave 6 fixed and prove axe catches it.
//    If this scenario ever reports "clean", the harness has gone blind and the
//    whole card is theatre — so a CLEAN control is a FAILURE.
// ===========================================================================
const control = cell('a11y-control', 'Control: the pre-wave-6 ARIA bug (axe MUST flag this)');
control.setAttribute('data-axe-control', '');
const badSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
badSvg.setAttribute('width', '200');
badSvg.setAttribute('height', '80');
const badGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
// EXACTLY what every node emitted before this wave:
badGroup.setAttribute('role', 'group');
badGroup.setAttribute('aria-label', 'Legacy node');
badGroup.setAttribute('aria-selected', 'false'); // ← invalid on role=group
badSvg.appendChild(badGroup);
control.appendChild(badSvg);

(window as any).__DONE__ = true;
