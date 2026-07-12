// Interactive line-algorithm playground.
// Runs the REAL DiagramEngine + SVGRenderer (same code paths as the app),
// with controls for every line option and preset scenarios to explore.
//
// Build & serve:  node libs/renderer/e2e/playground.mjs

import {
  DiagramEngine,
  NodeModel,
  PortModel,
  LinkModel,
  InteractionMode,
  PortVisibilityStrategy,
} from '@grafloria/engine';
import { SVGRenderer, LIGHT_THEME, DARK_THEME } from '@grafloria/renderer';
import { InteractionHandlerService } from '@grafloria/interaction-handler';

const SVG_NS = 'http://www.w3.org/2000/svg';

// ---------------------------------------------------------------------------
// VNode -> DOM (same rules as the Angular VNodeRenderer / harness)
// ---------------------------------------------------------------------------
function camelToKebab(s: string): string {
  return s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}
const VERBATIM = new Set(['viewBox', 'preserveAspectRatio']);
function vnodeToDom(vnode: any): Element {
  const el = document.createElementNS(SVG_NS, vnode.type);
  for (const [k, v] of Object.entries(vnode.props || {})) {
    if (v === null || v === undefined) continue;
    if (k === 'className') { el.setAttribute('class', String(v)); continue; }
    if (k === 'textContent') { el.textContent = String(v); continue; }
    if (k === 'style' && typeof v === 'object') {
      el.setAttribute('style', Object.entries(v as any).map(([a, b]) => `${camelToKebab(a)}:${b}`).join(';'));
      continue;
    }
    el.setAttribute(VERBATIM.has(k) ? k : camelToKebab(k), String(v));
  }
  if (vnode.key) el.setAttribute('data-vnode-key', String(vnode.key));
  for (const c of vnode.children || []) if (c) el.appendChild(vnodeToDom(c));
  return el;
}

// ---------------------------------------------------------------------------
// Playground state
// ---------------------------------------------------------------------------
type PathType = 'direct' | 'smooth' | 'bezier' | 'orthogonal';

const ARROW_TYPES = [
  'none', 'arrow', 'open-arrow', 'double-arrow', 'circle', 'square', 'diamond',
  'hollow-diamond', 'filled-diamond', 'generalization', 'crow-foot', 'one',
  'zero-or-one', 'zero-or-many', 'one-or-many', 'cross', 'bar', 'dot', 'oval',
];

let engine: DiagramEngine;
let renderer: SVGRenderer | null = null;
let diagram: any;
let zoom = 1.0;
let dark = false;
let selectedLinkId: string | null = null;
const interaction = new InteractionHandlerService();

const canvasHost = document.getElementById('canvas')!;
const statusEl = document.getElementById('status')!;
const guideEl = document.getElementById('guide')!;

const VIEW = { x: 0, y: 0, width: 1160, height: 640 };

// ---------------------------------------------------------------------------
// Scenario presets
// ---------------------------------------------------------------------------
interface Scenario { title: string; guide: string[]; build: () => void; }

function freshEngine() {
  engine = new DiagramEngine({
    interaction: { mode: InteractionMode.SMART, portVisibility: PortVisibilityStrategy.ALWAYS },
  } as any);
  diagram = engine.createDiagram('playground');
  renderer = null; // recreated on next render (theme/config)
  selectedLinkId = null;
}

function addNode(
  label: string, x: number, y: number,
  opts: { w?: number; h?: number; shape?: string; fill?: string; ports?: Array<{ id: string; side: 'left' | 'right' | 'top' | 'bottom'; type: 'input' | 'output'; index?: number }> } = {}
) {
  const node = new NodeModel({ type: 'rect', position: { x, y }, size: { width: opts.w ?? 120, height: opts.h ?? 56 } } as any);
  node.setMetadata('shape', { type: opts.shape ?? 'rect', fill: opts.fill ?? (dark ? '#1e293b' : '#dbeafe'), stroke: dark ? '#94a3b8' : '#334155', strokeWidth: 1.5, cornerRadius: 6 });
  node.setMetadata('label', label);
  for (const p of opts.ports ?? []) node.addPort(new PortModel({ id: p.id, type: p.type, side: p.side, index: p.index } as any));
  diagram.addNode(node);
  return node;
}

function addLink(src: string, dst: string, pathType: PathType, style: any = {}) {
  const link = new LinkModel(src, dst, pathType);
  link.updateStyle({
    stroke: dark ? '#94a3b8' : '#475569',
    strokeWidth: 2,
    arrowHead: { type: 'arrow', size: 12, filled: true, color: dark ? '#94a3b8' : '#475569' },
    ...style,
  });
  diagram.addLink(link);
  return link;
}

const SCENARIOS: Record<string, Scenario> = {
  basics: {
    title: '1 · Basics — one link, all line types',
    guide: [
      'Drag either node around — the link re-routes live and the arrow stays glued to the port.',
      'Switch <b>Line type</b> (direct / smooth / bezier / orthogonal) and watch the same link change shape.',
      'Try different <b>Arrow head</b> and <b>Arrow tail</b> markers — every tip must touch the node edge exactly.',
      'Type a <b>Label</b> — it sits at the path midpoint at 100% zoom.',
      'Drag the right node to the LEFT of the left node: the line must never cut through either node.',
    ],
    build() {
      addNode('A', 120, 280, { fill: '#fef3c7', ports: [{ id: 'a-r', side: 'right', type: 'output' }] });
      addNode('B', 760, 200, { ports: [{ id: 'b-l', side: 'left', type: 'input' }] });
      addLink('a-r', 'b-l', 'orthogonal');
    },
  },
  crossings: {
    title: '2 · Crossings & jump points',
    guide: [
      'Enable <b>Jump points</b> — the horizontal link hops over both crossing links.',
      'Try styles: <b>arc</b> (hop), <b>gap</b> (break), <b>bridge</b> (square notch). Change <b>size</b>.',
      'Drag one vertical link\'s nodes close to the other (&lt;12px): the two jumps MERGE into one wide hop, never a squiggle.',
      'Drag a vertical link along the horizontal one — the jump follows in real time.',
      'Drag a crossing right next to node B\'s arrow: the jump shifts aside instead of hiding under the arrowhead.',
    ],
    build() {
      addNode('A', 60, 300, { w: 90, ports: [{ id: 'a-r', side: 'right', type: 'output' }] });
      addNode('B', 950, 300, { w: 90, ports: [{ id: 'b-l', side: 'left', type: 'input' }] });
      addLink('a-r', 'b-l', 'direct', { jumpPoints: { enabled: true, size: 12, style: 'arc', detectMode: 'all', threshold: 45 } });
      addNode('C', 330, 80, { w: 90, ports: [{ id: 'c-b', side: 'bottom', type: 'output' }] });
      addNode('D', 330, 520, { w: 90, ports: [{ id: 'd-t', side: 'top', type: 'input' }] });
      addLink('c-b', 'd-t', 'direct', { stroke: '#0891b2', arrowHead: { type: 'arrow', size: 10, filled: true, color: '#0891b2' } });
      addNode('E', 600, 80, { w: 90, ports: [{ id: 'e-b', side: 'bottom', type: 'output' }] });
      addNode('F', 600, 520, { w: 90, ports: [{ id: 'f-t', side: 'top', type: 'input' }] });
      addLink('e-b', 'f-t', 'direct', { stroke: '#059669', arrowHead: { type: 'arrow', size: 10, filled: true, color: '#059669' } });
    },
  },
  hub: {
    title: '3 · Hub — mixed types follow a drag',
    guide: [
      'The hub connects with <b>direct</b> (blue), <b>smooth</b> (green) and <b>orthogonal</b> (grey) links.',
      'Drag the HUB anywhere — all three links must follow, every type re-routing in its own style.',
      'Drag it far right, past the targets — routes loop around, never through node bodies.',
    ],
    build() {
      addNode('HUB', 120, 260, { fill: '#fef3c7', ports: [
        { id: 'h-1', side: 'top', type: 'output' },
        { id: 'h-2', side: 'right', type: 'output' },
        { id: 'h-3', side: 'bottom', type: 'output' },
      ] });
      addNode('direct', 860, 80, { ports: [{ id: 't1-l', side: 'left', type: 'input' }] });
      addNode('smooth', 860, 290, { ports: [{ id: 't2-l', side: 'left', type: 'input' }] });
      addNode('orthogonal', 860, 500, { ports: [{ id: 't3-l', side: 'left', type: 'input' }] });
      addLink('h-1', 't1-l', 'direct', { stroke: '#2563eb', arrowHead: { type: 'arrow', size: 11, filled: true, color: '#2563eb' } });
      addLink('h-2', 't2-l', 'smooth', { stroke: '#059669', arrowHead: { type: 'arrow', size: 11, filled: true, color: '#059669' } });
      addLink('h-3', 't3-l', 'orthogonal');
    },
  },
  obstacle: {
    title: '4 · Obstacle avoidance',
    guide: [
      'An unrelated node sits exactly between source and target.',
      'Every line type detours around it — drag OBSTACLE up/down and watch routes flip sides.',
      'Drag OBSTACLE away — routes snap back to straight/smooth.',
      'Drag TARGET to the far side of SOURCE (inverted geometry): the route loops, no node is pierced.',
    ],
    build() {
      addNode('SOURCE', 80, 290, { fill: '#fef3c7', ports: [{ id: 's-r', side: 'right', type: 'output' }] });
      addNode('TARGET', 900, 290, { ports: [{ id: 't-l', side: 'left', type: 'input' }] });
      addNode('OBSTACLE', 480, 270, { w: 140, h: 90, fill: '#fee2e2', ports: [] });
      addLink('s-r', 't-l', 'smooth');
    },
  },
  vertical: {
    title: '5 · Vertical & same-side ports',
    guide: [
      'Left pair connects <b>bottom → top</b>: the smooth curve leaves/enters vertically and the arrow points DOWN into the port.',
      'Right pair connects <b>right → right</b> (same side): a U-shaped route.',
      'Switch line types on both; drag nodes to stress the port directions.',
    ],
    build() {
      addNode('A', 120, 80, { ports: [{ id: 'a-b', side: 'bottom', type: 'output' }] });
      addNode('B', 300, 460, { ports: [{ id: 'b-t', side: 'top', type: 'input' }] });
      addLink('a-b', 'b-t', 'smooth', { stroke: '#2563eb', arrowHead: { type: 'arrow', size: 11, filled: true, color: '#2563eb' } });
      addNode('C', 640, 140, { ports: [{ id: 'c-r', side: 'right', type: 'output' }] });
      addNode('D', 640, 430, { ports: [{ id: 'd-r', side: 'right', type: 'input' }] });
      addLink('c-r', 'd-r', 'orthogonal');
    },
  },
  waypoints: {
    title: '6 · Manual waypoints',
    guide: [
      '<b>Click</b> a link to select it (dashed highlight + red waypoint handles).',
      '<b>Double-click</b> anywhere on the selected link to ADD a waypoint there.',
      '<b>Drag</b> a red handle — the link is pinned through it.',
      'Now drag a NODE: endpoints follow the node while your waypoints stay put.',
      '<b>Alt-click</b> a handle to remove it; the <i>Clear waypoints</i> button resets to auto-routing.',
    ],
    build() {
      addNode('A', 100, 150, { fill: '#fef3c7', ports: [{ id: 'a-r', side: 'right', type: 'output' }] });
      addNode('B', 840, 420, { ports: [{ id: 'b-l', side: 'left', type: 'input' }] });
      addLink('a-r', 'b-l', 'orthogonal');
    },
  },
  shapes: {
    title: '7 · Shapes & multi-ports',
    guide: [
      'Circle, ellipse and hexagon nodes with several ports per side — ports spread evenly, always ON the shape outline.',
      'Links connect shaped ports; drag the shapes around.',
      'Turn on jump points and cross the links.',
    ],
    build() {
      addNode('circle', 120, 100, { w: 120, h: 120, shape: 'circle', fill: '#fce7f3', ports: [
        { id: 'ci-1', side: 'right', type: 'output', index: 0 },
        { id: 'ci-2', side: 'right', type: 'output', index: 1 },
      ] });
      addNode('ellipse', 620, 90, { w: 170, h: 90, shape: 'ellipse', fill: '#dcfce7', ports: [
        { id: 'el-1', side: 'left', type: 'input', index: 0 },
        { id: 'el-2', side: 'bottom', type: 'output', index: 0 },
      ] });
      addNode('hexagon', 380, 420, { w: 170, h: 90, shape: 'hexagon', fill: '#fef9c3', ports: [
        { id: 'hx-1', side: 'top', type: 'input', index: 0 },
        { id: 'hx-2', side: 'top', type: 'input', index: 1 },
      ] });
      addLink('ci-1', 'el-1', 'smooth', { stroke: '#db2777', arrowHead: { type: 'arrow', size: 11, filled: true, color: '#db2777' } });
      addLink('ci-2', 'hx-1', 'orthogonal');
      addLink('el-2', 'hx-2', 'smooth', { stroke: '#16a34a', arrowHead: { type: 'arrow', size: 11, filled: true, color: '#16a34a' } });
    },
  },
  zoo: {
    title: '8 · Arrow zoo',
    guide: [
      'Every marker type, head and tail, on one screen — light and dark (toggle <b>Theme</b>).',
      'Check each tip touches the red-lit node edge; hollow markers must match the background, not glare white.',
      'Zoom out below 20% — arrows hide (low LOD); below 100% labels hide.',
    ],
    build() {
      const types = ARROW_TYPES.filter(t => t !== 'none');
      types.forEach((t, i) => {
        const col = i % 2, row = Math.floor(i / 2);
        const y = 30 + row * 64, x = col * 580;
        addNode('', x + 40, y, { w: 60, h: 36, ports: [{ id: `z-s-${i}`, side: 'right', type: 'output' }] });
        addNode(t, x + 400, y, { w: 150, h: 36, ports: [{ id: `z-d-${i}`, side: 'left', type: 'input' }] });
        addLink(`z-s-${i}`, `z-d-${i}`, 'direct', {
          arrowHead: { type: t, size: 14, filled: true, color: '#1d4ed8' },
          arrowTail: { type: t, size: 14, filled: false, color: '#b91c1c' },
        });
      });
    },
  },
};

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
function render() {
  if (!renderer) {
    renderer = new SVGRenderer(engine, { enableCaching: false, useCSSMode: false }, dark ? DARK_THEME : LIGHT_THEME);
  }
  const vnode = renderer.render(VIEW, zoom);
  const dom = vnodeToDom(vnode) as SVGSVGElement;
  dom.setAttribute('width', String(VIEW.width));
  dom.setAttribute('height', String(VIEW.height));
  dom.id = 'diagram-svg';

  // selection highlight + waypoint handles overlay
  if (selectedLinkId) {
    const link = diagram.getLink(selectedLinkId);
    const g = dom.querySelector(`[data-vnode-key="link-${selectedLinkId}"] path`);
    if (g) {
      (g as SVGElement).setAttribute('stroke-dasharray', '6,4');
      (g as SVGElement).setAttribute('stroke-width', '3');
    }
    if (link?.points?.length > 2) {
      link.points.slice(1, -1).forEach((p: any, i: number) => {
        const h = document.createElementNS(SVG_NS, 'circle');
        h.setAttribute('cx', String(p.x)); h.setAttribute('cy', String(p.y)); h.setAttribute('r', '6');
        h.setAttribute('fill', '#dc2626'); h.setAttribute('stroke', '#fff'); h.setAttribute('stroke-width', '2');
        h.setAttribute('class', 'pg-waypoint'); h.setAttribute('data-wp-index', String(i + 1));
        (h as any).style.cursor = 'move';
        dom.appendChild(h);
      });
    }
  }

  canvasHost.innerHTML = '';
  canvasHost.appendChild(dom);
  updateStatus();
}

function updateStatus() {
  const link = selectedLinkId ? diagram.getLink(selectedLinkId) : null;
  const manual = link?.getMetadata?.('hasManualWaypoints') === true;
  statusEl.innerHTML = link
    ? `selected link: <b>${link.pathType}</b>${manual ? ' · manual waypoints' : ''} — controls apply to it (click empty space to deselect)`
    : 'no link selected — controls apply to ALL links · click a link to select it';
}

// world coords from a mouse event
function toWorld(e: MouseEvent): { x: number; y: number } {
  const svg = document.getElementById('diagram-svg') as unknown as SVGSVGElement;
  const pt = svg.createSVGPoint();
  pt.x = e.clientX; pt.y = e.clientY;
  const m = svg.getScreenCTM();
  if (!m) return { x: e.offsetX, y: e.offsetY };
  const p = pt.matrixTransform(m.inverse());
  return { x: p.x, y: p.y };
}

// ---------------------------------------------------------------------------
// Mouse interactions: drag nodes, select links, waypoint editing
// ---------------------------------------------------------------------------
let dragNode: any = null;
let dragOffset = { x: 0, y: 0 };
let draggingWaypoint = false;

canvasHost.addEventListener('mousedown', (e) => {
  const target = e.target as Element;

  // waypoint handle?
  const wp = target.closest('.pg-waypoint');
  if (wp && selectedLinkId) {
    const idx = Number(wp.getAttribute('data-wp-index'));
    const link = diagram.getLink(selectedLinkId);
    if (e.altKey) {
      interaction.removeWaypoint(idx, link);
      render();
      return;
    }
    interaction.startWaypointDrag(idx, link);
    draggingWaypoint = true;
    e.preventDefault();
    return;
  }

  // node?
  const nodeG = target.closest('[data-vnode-key^="node-"]');
  if (nodeG) {
    const id = nodeG.getAttribute('data-vnode-key')!.slice('node-'.length);
    dragNode = diagram.getNode(id);
    if (dragNode) {
      const w = toWorld(e);
      dragOffset = { x: w.x - dragNode.position.x, y: w.y - dragNode.position.y };
      e.preventDefault();
    }
    return;
  }

  // link?
  const linkG = target.closest('[data-vnode-key^="link-"]');
  if (linkG) {
    selectedLinkId = linkG.getAttribute('data-vnode-key')!.slice('link-'.length);
    syncControlsFromSelection();
    render();
    return;
  }

  // empty space: deselect
  if (selectedLinkId) { selectedLinkId = null; render(); }
});

window.addEventListener('mousemove', (e) => {
  if (draggingWaypoint && selectedLinkId) {
    const w = toWorld(e);
    interaction.moveWaypoint(w.x, w.y, engine);
    render();
    return;
  }
  if (dragNode) {
    const w = toWorld(e);
    dragNode.setPosition(w.x - dragOffset.x, w.y - dragOffset.y);
    render();
  }
});

window.addEventListener('mouseup', () => {
  dragNode = null;
  if (draggingWaypoint) { draggingWaypoint = false; interaction.endWaypointDrag?.(); }
});

canvasHost.addEventListener('dblclick', (e) => {
  if (!selectedLinkId) return;
  const link = diagram.getLink(selectedLinkId);
  const w = toWorld(e);
  if (interaction.addWaypoint(w.x, w.y, link)) render();
});

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------
const $ = (id: string) => document.getElementById(id) as any;

function targetLinks(): any[] {
  if (selectedLinkId) {
    const l = diagram.getLink(selectedLinkId);
    return l ? [l] : [];
  }
  return diagram.getLinks();
}

function syncControlsFromSelection() {
  const link = selectedLinkId ? diagram.getLink(selectedLinkId) : null;
  if (!link) return;
  $('pathType').value = link.pathType;
  $('arrowHead').value = link.style.arrowHead?.type ?? 'none';
  $('arrowTail').value = link.style.arrowTail?.type ?? 'none';
  $('arrowSize').value = link.style.arrowHead?.size ?? 12;
  $('jumpsOn').checked = !!link.style.jumpPoints?.enabled;
  $('jumpStyle').value = link.style.jumpPoints?.style ?? 'arc';
  $('jumpSize').value = link.style.jumpPoints?.size ?? 12;
  $('labelText').value = link.getMetadata('label') ?? '';
}

function scenarioChanged() {
  const key = $('scenario').value as string;
  freshEngine();
  SCENARIOS[key].build();
  guideEl.innerHTML = `<h3>${SCENARIOS[key].title}</h3><ol>` +
    SCENARIOS[key].guide.map(s => `<li>${s}</li>`).join('') + '</ol>';
  render();
  render(); // settle: 2nd render lets jump detection see every link's route
}

$('scenario').addEventListener('change', scenarioChanged);
$('reset').addEventListener('click', scenarioChanged);

$('pathType').addEventListener('change', () => {
  targetLinks().forEach(l => l.setPathType($('pathType').value));
  render();
});
const applyArrows = () => {
  const size = Number($('arrowSize').value) || 12;
  targetLinks().forEach(l => {
    const head = $('arrowHead').value;
    const tail = $('arrowTail').value;
    l.updateStyle({
      arrowHead: head === 'none' ? { type: 'none', size } : { type: head, size, filled: true, color: l.style.stroke ?? '#475569' },
      arrowTail: tail === 'none' ? undefined : { type: tail, size, filled: false, color: l.style.stroke ?? '#475569' },
    });
  });
  render();
};
$('arrowHead').addEventListener('change', applyArrows);
$('arrowTail').addEventListener('change', applyArrows);
$('arrowSize').addEventListener('input', applyArrows);

const applyJumps = () => {
  targetLinks().forEach(l => l.updateStyle({
    jumpPoints: {
      enabled: $('jumpsOn').checked,
      style: $('jumpStyle').value,
      size: Number($('jumpSize').value) || 12,
      detectMode: 'all',
      threshold: 45,
    },
  }));
  render(); render(); // settle
};
$('jumpsOn').addEventListener('change', applyJumps);
$('jumpStyle').addEventListener('change', applyJumps);
$('jumpSize').addEventListener('input', applyJumps);

$('labelText').addEventListener('input', () => {
  targetLinks().forEach(l => l.setMetadata('label', $('labelText').value));
  render();
});

$('clearWps').addEventListener('click', () => {
  targetLinks().forEach(l => { l.setPoints([]); l.setMetadata('hasManualWaypoints', false); });
  render();
});

$('zoom').addEventListener('input', () => {
  zoom = Number($('zoom').value);
  $('zoomVal').textContent = `${Math.round(zoom * 100)}%`;
  render();
});

$('theme').addEventListener('change', () => {
  dark = $('theme').checked;
  document.body.classList.toggle('dark', dark);
  // rebuild the scenario so node fills/strokes pick up the theme
  scenarioChanged();
});

// populate arrow selects
for (const sel of ['arrowHead', 'arrowTail']) {
  const el = $(sel);
  for (const t of ARROW_TYPES) {
    const o = document.createElement('option');
    o.value = t; o.textContent = t;
    el.appendChild(o);
  }
}
$('arrowHead').value = 'arrow';
$('arrowTail').value = 'none';

// populate scenario select
for (const [key, sc] of Object.entries(SCENARIOS)) {
  const o = document.createElement('option');
  o.value = key; o.textContent = sc.title;
  $('scenario').appendChild(o);
}

// go
scenarioChanged();
(window as any).__PLAYGROUND_READY__ = true;
