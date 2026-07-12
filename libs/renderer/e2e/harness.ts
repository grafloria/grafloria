// E2E harness for @grafloria/renderer line algorithms.
// Builds real DiagramEngine diagrams, renders them through the real SVGRenderer,
// materializes the VNode tree to DOM, and records numeric probes on window.__PROBES__.

import {
  DiagramEngine,
  NodeModel,
  PortModel,
  LinkModel,
  InteractionMode,
  PortVisibilityStrategy,
} from '@grafloria/engine';
import {
  SVGRenderer,
  LIGHT_THEME,
  DARK_THEME,
  JumpPointDetector,
  JumpPointRenderer,
  getPortPositionForShape,
} from '@grafloria/renderer';

import { InteractionHandlerService } from '@grafloria/interaction-handler';

const SVG_NS = 'http://www.w3.org/2000/svg';
const PROBES: Record<string, any> = {};
(window as any).__PROBES__ = PROBES;

// ---- expectations: hard pass/fail assertions collected for run.mjs ---------
const EXPECT: Array<{ name: string; pass: boolean; detail: string }> = [];
(window as any).__EXPECTATIONS__ = EXPECT;
function expectThat(name: string, pass: boolean, detail = '') {
  EXPECT.push({ name, pass: !!pass, detail });
}

// ---- console counting (perf finding) -------------------------------------
let logCount = 0;
const origLog = console.log.bind(console);
console.log = (...args: any[]) => {
  logCount++;
  // keep quiet to not slow the page; comment next line to debug
  // origLog(...args);
};
function resetLogCount() { logCount = 0; }

// ---- VNode -> DOM materializer (mirrors SVGRendererV2 / VNodeRendererService rules)
function camelToKebab(s: string): string {
  return s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}
const VERBATIM_ATTRS = new Set(['viewBox', 'preserveAspectRatio', 'textContent']);
function vnodeToDom(vnode: any): Element {
  const el = document.createElementNS(SVG_NS, vnode.type);
  const props = vnode.props || {};
  for (const [k, v] of Object.entries(props)) {
    if (v === null || v === undefined) continue;
    if (k === 'className') { el.setAttribute('class', String(v)); continue; }
    if (k === 'textContent') { el.textContent = String(v); continue; }
    if (k === 'style' && typeof v === 'object') {
      el.setAttribute('style', Object.entries(v as any).map(([sk, sv]) => `${camelToKebab(sk)}:${sv}`).join(';'));
      continue;
    }
    if (VERBATIM_ATTRS.has(k)) { el.setAttribute(k, String(v)); continue; }
    el.setAttribute(camelToKebab(k), String(v));
  }
  if (vnode.key) el.setAttribute('data-vnode-key', String(vnode.key));
  for (const c of vnode.children || []) {
    if (!c) continue;
    if (typeof c === 'string') { el.appendChild(document.createTextNode(c)); continue; }
    el.appendChild(vnodeToDom(c));
  }
  return el;
}

// ---- scenario cell helpers -------------------------------------------------
const root = document.getElementById('root')!;
function cell(id: string, title: string, dark = false): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'cell' + (dark ? ' dark' : '');
  wrap.id = `cell-${id}`;
  const h = document.createElement('h3');
  h.textContent = title;
  wrap.appendChild(h);
  const inner = document.createElement('div');
  inner.className = 'stage';
  wrap.appendChild(inner);
  root.appendChild(wrap);
  return inner;
}

function makeEngine(): any {
  return new DiagramEngine({
    interaction: {
      mode: InteractionMode.SMART,
      portVisibility: PortVisibilityStrategy.ALWAYS,
    },
  } as any);
}

interface PortSpec { id: string; side: 'left' | 'right' | 'top' | 'bottom'; type: 'input' | 'output'; index?: number; }
function addNode(
  diagram: any, label: string, x: number, y: number,
  opts: { w?: number; h?: number; shape?: string; fill?: string; ports: PortSpec[] }
): any {
  const node = new NodeModel({
    type: 'rect',
    position: { x, y },
    size: { width: opts.w ?? 110, height: opts.h ?? 50 },
  } as any);
  node.setMetadata('shape', {
    type: opts.shape ?? 'rect',
    fill: opts.fill ?? '#dbeafe',
    stroke: '#334155',
    strokeWidth: 1.5,
    cornerRadius: 4,
  });
  node.setMetadata('label', label);
  for (const p of opts.ports) {
    node.addPort(new PortModel({ id: p.id, type: p.type, side: p.side, index: p.index } as any));
  }
  diagram.addNode(node);
  return node;
}

function makeLink(diagram: any, srcPortId: string, dstPortId: string, pathType: any, style: any = {}): any {
  const link = new LinkModel(srcPortId, dstPortId, pathType);
  link.updateStyle({ stroke: '#475569', strokeWidth: 2, ...style });
  diagram.addLink(link);
  return link;
}

function renderInto(engine: any, container: HTMLElement, w: number, h: number, theme: any = LIGHT_THEME): SVGSVGElement {
  const renderer = new SVGRenderer(engine, { enableCaching: false, useCSSMode: false }, theme);
  const vnode = renderer.render({ x: 0, y: 0, width: w, height: h }, 1.0);
  const dom = vnodeToDom(vnode) as SVGSVGElement;
  dom.setAttribute('width', String(w));
  dom.setAttribute('height', String(h));
  container.appendChild(dom);
  return dom;
}

// First render populates link.points for every link (jump detection depends on
// other links' points); second render is what a user sees after any update.
function renderTwice(engine: any, container: HTMLElement, w: number, h: number, theme: any = LIGHT_THEME): SVGSVGElement {
  const tmp = document.createElement('div');
  renderInto(engine, tmp, w, h, theme);
  tmp.remove();
  return renderInto(engine, container, w, h, theme);
}

// overlay helper: draw a marker (cross/line/label) in world coords on a rendered svg
function overlayLine(svg: SVGSVGElement, x1: number, y1: number, x2: number, y2: number, color = '#ef4444', dash = '4,3') {
  const l = document.createElementNS(SVG_NS, 'line');
  l.setAttribute('x1', String(x1)); l.setAttribute('y1', String(y1));
  l.setAttribute('x2', String(x2)); l.setAttribute('y2', String(y2));
  l.setAttribute('stroke', color); l.setAttribute('stroke-width', '1');
  l.setAttribute('stroke-dasharray', dash);
  svg.appendChild(l);
}
function overlayText(svg: SVGSVGElement, x: number, y: number, text: string, color = '#ef4444', size = 10) {
  const t = document.createElementNS(SVG_NS, 'text');
  t.setAttribute('x', String(x)); t.setAttribute('y', String(y));
  t.setAttribute('fill', color); t.setAttribute('font-size', String(size));
  t.setAttribute('font-family', 'monospace');
  t.textContent = text;
  svg.appendChild(t);
}
function overlayDot(svg: SVGSVGElement, x: number, y: number, color = '#ef4444', r = 2.5) {
  const c = document.createElementNS(SVG_NS, 'circle');
  c.setAttribute('cx', String(x)); c.setAttribute('cy', String(y)); c.setAttribute('r', String(r));
  c.setAttribute('fill', color);
  svg.appendChild(c);
}

// world-coord bbox of an element inside our svg (zoom=1, svg at natural size)
function worldBBox(svg: SVGSVGElement, el: SVGGraphicsElement) {
  const sr = svg.getBoundingClientRect();
  const er = el.getBoundingClientRect();
  return {
    minX: er.left - sr.left, minY: er.top - sr.top,
    maxX: er.right - sr.left, maxY: er.bottom - sr.top,
    w: er.width, h: er.height,
  };
}

function pathD(svg: SVGSVGElement, linkId: string): string | null {
  const g = svg.querySelector(`[data-vnode-key="link-${linkId}"]`);
  const p = g?.querySelector('path');
  return p ? p.getAttribute('d') : null;
}

// ===========================================================================
// S1: arrow anchoring per type (light theme)
// ===========================================================================
function s1_arrowAnchoring() {
  const types = [
    'arrow', 'open-arrow', 'double-arrow', 'circle', 'square', 'diamond',
    'hollow-diamond', 'filled-diamond', 'generalization', 'crow-foot', 'one',
    'zero-or-one', 'zero-or-many', 'one-or-many', 'cross', 'bar', 'dot', 'oval',
  ];
  const ROW = 52, W = 560, H = types.length * ROW + 20;
  const stage = cell('s1', 'S1 — Arrow anchoring per type (size=16, red line = target node edge, tip should touch it)');
  const engine = makeEngine();
  const diagram = engine.createDiagram('s1');
  const rows: Array<{ type: string; link: any; target: any }> = [];
  types.forEach((t, i) => {
    const y = 10 + i * ROW;
    const src = addNode(diagram, '', 20, y, { w: 70, h: 36, ports: [{ id: `s1-src-${i}`, side: 'right', type: 'output' }] });
    const dst = addNode(diagram, t, 420, y, { w: 120, h: 36, ports: [{ id: `s1-dst-${i}`, side: 'left', type: 'input' }] });
    const link = makeLink(diagram, `s1-src-${i}`, `s1-dst-${i}`, 'direct', {
      arrowHead: { type: t, size: 16, filled: true, color: '#1d4ed8', width: 1.5 },
    });
    rows.push({ type: t, link, target: dst });
  });
  const svg = renderInto(engine, stage, W, H);

  // probes: for each arrow, gap between arrow bbox max-x and the target port x (=node left edge)
  const results: any[] = [];
  rows.forEach((row, i) => {
    const portX = row.target.position.x;
    const portY = row.target.position.y + row.target.size.height / 2;
    overlayLine(svg, portX, portY - 22, portX, portY + 22);
    const g = svg.querySelector(`[data-vnode-key="link-${row.link.id}"]`);
    const arrowEl = g?.querySelector('.arrow') as SVGGraphicsElement | null;
    let gap: number | null = null, bbox: any = null;
    if (arrowEl) {
      bbox = worldBBox(svg, arrowEl);
      gap = portX - bbox.maxX; // >0 means arrow floats short of the node
      overlayText(svg, portX + 6, portY - 8, `gap=${gap.toFixed(1)}px`, '#b91c1c', 10);
    }
    // where does the path itself end?
    const d = pathD(svg, row.link.id);
    const nums = d ? d.match(/-?[\d.]+/g)!.map(Number) : [];
    const pathEndX = nums.length >= 2 ? nums[nums.length - 2] : null;
    results.push({ type: row.type, portX, arrowMaxX: bbox ? +bbox.maxX.toFixed(2) : null, tipGapPx: gap !== null ? +gap.toFixed(2) : null, pathEndX });
  });
  PROBES.s1_arrowAnchoring = results;
}

// ===========================================================================
// S2: hollow arrows on dark theme (hardcoded white fill)
// ===========================================================================
function s2_darkTheme() {
  const types = ['arrow', 'open-arrow', 'hollow-diamond', 'generalization', 'zero-or-one'];
  const ROW = 52, W = 560, H = types.length * ROW + 20;
  const stage = cell('s2', 'S2 — Hollow arrows on DARK_THEME (filled:false → hardcoded white fill?)', true);
  const engine = makeEngine();
  const diagram = engine.createDiagram('s2');
  const rows: any[] = [];
  types.forEach((t, i) => {
    const y = 10 + i * ROW;
    addNode(diagram, '', 20, y, { w: 70, h: 36, fill: '#1e293b', ports: [{ id: `s2-src-${i}`, side: 'right', type: 'output' }] });
    addNode(diagram, t, 420, y, { w: 120, h: 36, fill: '#1e293b', ports: [{ id: `s2-dst-${i}`, side: 'left', type: 'input' }] });
    const link = makeLink(diagram, `s2-src-${i}`, `s2-dst-${i}`, 'direct', {
      stroke: '#94a3b8',
      arrowHead: { type: t, size: 16, filled: false, color: '#94a3b8', width: 1.5 },
    });
    rows.push({ type: t, link });
  });
  const svg = renderInto(engine, stage, W, H, DARK_THEME);
  PROBES.s2_darkFills = rows.map((r) => {
    const g = svg.querySelector(`[data-vnode-key="link-${r.link.id}"]`);
    const arrowEl = g?.querySelector('.arrow');
    const fill = arrowEl?.getAttribute('fill') ?? [...(arrowEl?.querySelectorAll('[fill]') ?? [])].map(e => e.getAttribute('fill')).join(',');
    return { type: r.type, fill };
  });
}

// ===========================================================================
// S3: jump point size + sweep direction on straight crossings
// ===========================================================================
function s3_jumpSizeAndSweep() {
  buildS3('s3a', 'S3a — FIRST render: jump points enabled but none drawn (other links have no points yet)', false);
  buildS3('s3b', 'S3b — SECOND render of same diagram: arcs appear. size=12 configured; measure chord/sweep. Blue dots = true crossings', true);
}
function buildS3(id: string, title: string, twice: boolean) {
  const W = 640, H = 340;
  const stage = cell(id, title);
  const engine = makeEngine();
  const diagram = engine.createDiagram(id);
  // horizontal link with jump points
  addNode(diagram, 'A', 10, 140, { w: 60, h: 40, ports: [{ id: `${id}-a-r`, side: 'right', type: 'output' }] });
  addNode(diagram, 'B', 560, 140, { w: 60, h: 40, ports: [{ id: `${id}-b-l`, side: 'left', type: 'input' }] });
  const mainLink = makeLink(diagram, `${id}-a-r`, `${id}-b-l`, 'direct', {
    jumpPoints: { enabled: true, size: 12, style: 'arc', detectMode: 'all', threshold: 45 },
  });
  // steep (90°) crossing at x≈220
  addNode(diagram, '', 190, 10, { w: 60, h: 30, ports: [{ id: `${id}-c-b`, side: 'bottom', type: 'output' }] });
  addNode(diagram, '', 190, 290, { w: 60, h: 30, ports: [{ id: `${id}-d-t`, side: 'top', type: 'input' }] });
  makeLink(diagram, `${id}-c-b`, `${id}-d-t`, 'direct', { stroke: '#0891b2' });
  // shallow (~20°) crossing around x≈430
  addNode(diagram, '', 250, 100, { w: 60, h: 30, ports: [{ id: `${id}-e-r`, side: 'right', type: 'output' }] });
  addNode(diagram, '', 570, 210, { w: 60, h: 30, ports: [{ id: `${id}-f-l`, side: 'left', type: 'input' }] });
  makeLink(diagram, `${id}-e-r`, `${id}-f-l`, 'direct', { stroke: '#0891b2' });

  const svg = twice ? renderTwice(engine, stage, W, H) : renderInto(engine, stage, W, H);
  const d = pathD(svg, mainLink.id) || '';
  // measure each arc: chord length between the point before 'A' and the arc endpoint
  const arcRe = /L\s*(-?[\d.]+)\s+(-?[\d.]+)\s*A\s*(-?[\d.]+)\s+(-?[\d.]+)\s+\S+\s+(\S+)\s+(\S+)\s+(-?[\d.]+)\s+(-?[\d.]+)/g;
  const arcs: any[] = [];
  let m;
  while ((m = arcRe.exec(d))) {
    const [, x1, y1, rx, , , sweep, x2, y2] = m;
    const chord = Math.hypot(+x2 - +x1, +y2 - +y1);
    arcs.push({ from: [+x1, +y1], to: [+x2, +y2], declaredRadius: +rx, sweep: +sweep, chordLen: +chord.toFixed(2), effectiveRenderedRadius: +(chord / 2).toFixed(2) });
    overlayText(svg, (+x1 + +x2) / 2 - 30, +y1 - 18, `chord=${chord.toFixed(0)} r=${rx} sweep=${sweep}`, '#b91c1c', 9);
  }
  // true intersections of mainLink polyline with the two crossing links
  const det = new JumpPointDetector();
  const others = diagram.getLinks().filter((l: any) => l.id !== mainLink.id).map((l: any) => ({ id: l.id, points: l.points }));
  const ints = det.detectIntersections({ id: mainLink.id, points: mainLink.points }, others, 'all', 45);
  ints.forEach((it: any) => overlayDot(svg, it.point.x, it.point.y, '#2563eb'));
  PROBES[`${id}_jumpArcs`] = { configuredSize: 12, pathD: d, arcs, intersections: ints.map((i: any) => ({ x: +i.point.x.toFixed(1), y: +i.point.y.toFixed(1), angle: +i.angle.toFixed(1) })) };
}

// ===========================================================================
// S4: jump points on orthogonal (rounded-corner) path — segment misalignment
// ===========================================================================
function s4_jumpOrthogonal() {
  const W = 640, H = 360;
  const stage = cell('s4', 'S4 — Jump points on ORTHOGONAL link (rounded corners). Blue dots = true crossings; arcs should sit on them');
  const engine = makeEngine();
  const diagram = engine.createDiagram('s4');
  addNode(diagram, 'A', 10, 260, { w: 70, h: 40, ports: [{ id: 's4-a-r', side: 'right', type: 'output' }] });
  addNode(diagram, 'B', 540, 40, { w: 70, h: 40, ports: [{ id: 's4-b-l', side: 'left', type: 'input' }] });
  const mainLink = makeLink(diagram, 's4-a-r', 's4-b-l', 'orthogonal', {
    jumpPoints: { enabled: true, size: 12, style: 'arc', detectMode: 'all', threshold: 45 },
  });
  // vertical crossing link (crosses the first horizontal segment)
  addNode(diagram, '', 270, 5, { w: 60, h: 30, ports: [{ id: 's4-c-b', side: 'bottom', type: 'output' }] });
  addNode(diagram, '', 270, 320, { w: 60, h: 30, ports: [{ id: 's4-d-t', side: 'top', type: 'input' }] });
  makeLink(diagram, 's4-c-b', 's4-d-t', 'direct', { stroke: '#0891b2' });
  // horizontal crossing link (crosses the VERTICAL segment of the orthogonal path)
  addNode(diagram, '', 350, 155, { w: 60, h: 30, ports: [{ id: 's4-e-r', side: 'right', type: 'output' }] });
  addNode(diagram, '', 585, 155, { w: 50, h: 30, ports: [{ id: 's4-f-l', side: 'left', type: 'input' }] });
  makeLink(diagram, 's4-e-r', 's4-f-l', 'direct', { stroke: '#059669' });

  const svg = renderTwice(engine, stage, W, H);
  const d = pathD(svg, mainLink.id) || '';
  const det = new JumpPointDetector();
  const others = diagram.getLinks().filter((l: any) => l.id !== mainLink.id).map((l: any) => ({ id: l.id, points: l.points }));
  const ints = det.detectIntersections({ id: mainLink.id, points: mainLink.points }, others, 'all', 45);
  ints.forEach((it: any) => overlayDot(svg, it.point.x, it.point.y, '#2563eb', 3.5));
  // arc positions in rendered path
  const arcRe = /A\s*[\d.]+\s+[\d.]+\s+\S+\s+\S+\s+\S+\s+(-?[\d.]+)\s+(-?[\d.]+)/g;
  const arcEnds: any[] = [];
  let m;
  while ((m = arcRe.exec(d))) arcEnds.push({ x: +m[1], y: +m[2] });
  arcEnds.forEach(a => overlayDot(svg, a.x, a.y, '#dc2626', 3));
  PROBES.s4_jumpOrthogonal = {
    linkPoints: mainLink.points,
    trueIntersections: ints.map((i: any) => ({ x: +i.point.x.toFixed(1), y: +i.point.y.toFixed(1), segmentIndex: i.segmentIndex })),
    renderedArcEndpoints: arcEnds,
    pathD: d,
  };
}

// ===========================================================================
// S5: jump points destroy bezier/smooth curves
// ===========================================================================
function s5_jumpBezier() {
  const build = (withJumps: boolean, suffix: string) => {
    const engine = makeEngine();
    const diagram = engine.createDiagram('s5' + suffix);
    addNode(diagram, 'A', 10, 200, { w: 70, h: 40, ports: [{ id: `s5${suffix}-a-r`, side: 'right', type: 'output' }] });
    addNode(diagram, 'B', 500, 30, { w: 70, h: 40, ports: [{ id: `s5${suffix}-b-l`, side: 'left', type: 'input' }] });
    const mainLink = makeLink(diagram, `s5${suffix}-a-r`, `s5${suffix}-b-l`, 'smooth', {
      jumpPoints: withJumps ? { enabled: true, size: 12, style: 'arc', detectMode: 'all', threshold: 45 } : undefined,
    });
    addNode(diagram, '', 240, 5, { w: 60, h: 30, ports: [{ id: `s5${suffix}-c-b`, side: 'bottom', type: 'output' }] });
    addNode(diagram, '', 240, 260, { w: 60, h: 30, ports: [{ id: `s5${suffix}-d-t`, side: 'top', type: 'input' }] });
    makeLink(diagram, `s5${suffix}-c-b`, `s5${suffix}-d-t`, 'direct', { stroke: '#0891b2' });
    return { engine, mainLink };
  };
  const stageA = cell('s5a', 'S5a — smooth link, jumpPoints DISABLED (reference)');
  const a = build(false, 'a');
  const svgA = renderTwice(a.engine, stageA, 620, 300);
  const stageB = cell('s5b', 'S5b — SAME smooth link, jumpPoints ENABLED (2nd render)');
  const b = build(true, 'b');
  const svgB = renderTwice(b.engine, stageB, 620, 300);
  PROBES.s5_bezier = {
    disabled_d: pathD(svgA, a.mainLink.id),
    enabled_d: pathD(svgB, b.mainLink.id),
    disabledHasCurve: /C/.test(pathD(svgA, a.mainLink.id) || ''),
    enabledHasCurve: /C/.test(pathD(svgB, b.mainLink.id) || ''),
  };
}

// ===========================================================================
// S6: two crossings closer than 2×size — overlapping jumps
// ===========================================================================
function s6_closeCrossings() {
  const W = 640, H = 320;
  const stage = cell('s6', 'S6 — Two crossings 14px apart, jump size=12 (cut half-width 12 → overlap). Path should not double back');
  const engine = makeEngine();
  const diagram = engine.createDiagram('s6');
  addNode(diagram, 'A', 10, 130, { w: 60, h: 40, ports: [{ id: 's6-a-r', side: 'right', type: 'output' }] });
  addNode(diagram, 'B', 560, 130, { w: 60, h: 40, ports: [{ id: 's6-b-l', side: 'left', type: 'input' }] });
  const mainLink = makeLink(diagram, 's6-a-r', 's6-b-l', 'direct', {
    jumpPoints: { enabled: true, size: 12, style: 'arc', detectMode: 'all', threshold: 45 },
  });
  [300, 314].forEach((x, i) => {
    addNode(diagram, '', x - 30, 5, { w: 60, h: 30, ports: [{ id: `s6-c${i}-b`, side: 'bottom', type: 'output' }] });
    addNode(diagram, '', x - 30, 280, { w: 60, h: 30, ports: [{ id: `s6-d${i}-t`, side: 'top', type: 'input' }] });
    makeLink(diagram, `s6-c${i}-b`, `s6-d${i}-t`, 'direct', { stroke: '#0891b2' });
  });
  const svg = renderTwice(engine, stage, W, H);
  const d = pathD(svg, mainLink.id) || '';
  // check x-monotonicity of L/A command endpoints along the left-to-right main link
  const cmdRe = /([LA])\s*((?:-?[\d.]+[\s,]*)+)/g;
  const xs: number[] = [];
  let m;
  while ((m = cmdRe.exec(d))) {
    const nums = m[2].trim().split(/[\s,]+/).map(Number);
    xs.push(m[1] === 'L' ? nums[0] : nums[5]);
  }
  let backtracks = 0;
  for (let i = 1; i < xs.length; i++) if (xs[i] < xs[i - 1] - 0.01) backtracks++;
  PROBES.s6_closeCrossings = { pathD: d, xSequence: xs.map(x => +x.toFixed(1)), backtracks };
}

// ===========================================================================
// S7: stale link.points — move a node, jumps stay at old crossing
// ===========================================================================
function s7_stalePoints() {
  const W = 640, H = 320;
  const engine = makeEngine();
  const diagram = engine.createDiagram('s7');
  addNode(diagram, 'A', 10, 130, { w: 60, h: 40, ports: [{ id: 's7-a-r', side: 'right', type: 'output' }] });
  addNode(diagram, 'B', 560, 130, { w: 60, h: 40, ports: [{ id: 's7-b-l', side: 'left', type: 'input' }] });
  const mainLink = makeLink(diagram, 's7-a-r', 's7-b-l', 'direct', {
    jumpPoints: { enabled: true, size: 12, style: 'arc', detectMode: 'all', threshold: 45 },
  });
  const topNode = addNode(diagram, 'V', 270, 5, { w: 60, h: 30, ports: [{ id: 's7-c-b', side: 'bottom', type: 'output' }] });
  const botNode = addNode(diagram, '', 270, 280, { w: 60, h: 30, ports: [{ id: 's7-d-t', side: 'top', type: 'input' }] });
  const vlink = makeLink(diagram, 's7-c-b', 's7-d-t', 'direct', { stroke: '#0891b2' });

  const stageA = cell('s7a', 'S7a — settled render: vertical link crosses at x≈300, jump drawn there');
  const svgA = renderTwice(engine, stageA, W, H);
  const dBefore = pathD(svgA, mainLink.id) || '';

  // move the vertical link's nodes +160px right, render again (fresh renderer, no cache)
  topNode.setPosition(430, 5);
  botNode.setPosition(430, 280);
  resetLogCount();
  const stageB = cell('s7b', 'S7b — after moving vertical link +160px and re-rendering: jump should move to x≈460');
  const svgB = renderInto(engine, stageB, W, H);
  const dAfter = pathD(svgB, mainLink.id) || '';
  const logsDuringRender = logCount;

  const arcAt = (d: string) => {
    const m = /L\s*(-?[\d.]+)\s+(-?[\d.]+)\s*A/.exec(d);
    return m ? +m[1] : null;
  };
  expectThat('S7 render hot path emits zero console.log', logsDuringRender === 0, `logs=${logsDuringRender}`);
  PROBES.s7_stalePoints = {
    jumpBeforeAtX: arcAt(dBefore),
    jumpAfterAtX: arcAt(dAfter),
    mainBefore_d: dBefore,
    mainAfter_d: dAfter,
    vlinkStalePoints: vlink.points,
    vlinkRendered_d: pathD(svgB, vlink.id),
    consoleLogsDuringOneRender: logsDuringRender,
    linksInDiagram: diagram.getLinks().length,
    nodesInDiagram: diagram.getNodes().length,
  };
}

// ===========================================================================
// S11: gap + bridge styles on a settled diagram
// ===========================================================================
function s11_gapBridge() {
  const build = (style: string, id: string) => {
    const stage = cell(id, `S11 — jump style '${style}' (size=12, 2nd render)`);
    const engine = makeEngine();
    const diagram = engine.createDiagram(id);
    addNode(diagram, 'A', 10, 130, { w: 60, h: 40, ports: [{ id: `${id}-a-r`, side: 'right', type: 'output' }] });
    addNode(diagram, 'B', 560, 130, { w: 60, h: 40, ports: [{ id: `${id}-b-l`, side: 'left', type: 'input' }] });
    const mainLink = makeLink(diagram, `${id}-a-r`, `${id}-b-l`, 'direct', {
      jumpPoints: { enabled: true, size: 12, style, detectMode: 'all', threshold: 45 },
    });
    addNode(diagram, '', 270, 5, { w: 60, h: 30, ports: [{ id: `${id}-c-b`, side: 'bottom', type: 'output' }] });
    addNode(diagram, '', 270, 250, { w: 60, h: 30, ports: [{ id: `${id}-d-t`, side: 'top', type: 'input' }] });
    makeLink(diagram, `${id}-c-b`, `${id}-d-t`, 'direct', { stroke: '#0891b2' });
    const svg = renderTwice(engine, stage, 640, 290);
    return pathD(svg, mainLink.id);
  };
  PROBES.s11_gapBridge = {
    gap_d: build('gap', 's11a'),
    bridge_d: build('bridge', 's11b'),
  };
}

// ===========================================================================
// S8: port positioning — index handling on rect + circle
// ===========================================================================
function s8_ports() {
  const stage = cell('s8', 'S8 — Multi-port positioning: rect ports idx 0-2 (left), circle ports idx 0-3 (right). Red = computed positions');
  const engine = makeEngine();
  const diagram = engine.createDiagram('s8');
  const rect = addNode(diagram, 'rect', 40, 60, {
    w: 140, h: 70, ports: [0, 1, 2].map(i => ({ id: `s8-r-${i}`, side: 'right' as const, type: 'output' as const, index: i })),
  });
  const circle = addNode(diagram, 'circle', 320, 40, {
    w: 120, h: 120, shape: 'circle', fill: '#fce7f3',
    ports: [0, 1, 2, 3].map(i => ({ id: `s8-c-${i}`, side: 'right' as const, type: 'output' as const, index: i })),
  });
  const svg = renderInto(engine, stage, 560, 220);
  const probe: any = { rect: [], circle: [] };
  rect.getPorts().forEach((p: any) => {
    const pos = getPortPositionForShape(p, rect);
    probe.rect.push({ index: p.index, x: +pos.x.toFixed(2), y: +pos.y.toFixed(2) });
    overlayDot(svg, rect.position.x + pos.x, rect.position.y + pos.y, '#dc2626', 3);
    overlayText(svg, rect.position.x + pos.x + 6, rect.position.y + pos.y + 4 + p.index * 10, `i${p.index}`, '#dc2626', 9);
  });
  circle.getPorts().forEach((p: any) => {
    const pos = getPortPositionForShape(p, circle);
    probe.circle.push({ index: p.index, x: +pos.x.toFixed(2), y: +pos.y.toFixed(2) });
    overlayDot(svg, circle.position.x + pos.x, circle.position.y + pos.y, '#dc2626', 3);
    overlayText(svg, circle.position.x + pos.x + 6, circle.position.y + pos.y + 4 + p.index * 9, `i${p.index}`, '#dc2626', 9);
  });
  PROBES.s8_ports = probe;
}

// ===========================================================================
// S9: relative-path commands parsed as absolute (unit-level, real JumpPointRenderer)
// ===========================================================================
function s9_relativePath() {
  const stage = cell('s9', 'S9 — JumpPointRenderer on a RELATIVE path (green dashed = browser truth, red = reconstructed by library)');
  const svg = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
  svg.setAttribute('width', '560'); svg.setAttribute('height', '220');
  stage.appendChild(svg);
  const dRel = 'm 20 40 l 200 0 l 0 120 l 260 0';
  const truth = document.createElementNS(SVG_NS, 'path');
  truth.setAttribute('d', dRel);
  truth.setAttribute('fill', 'none'); truth.setAttribute('stroke', '#16a34a');
  truth.setAttribute('stroke-width', '5'); truth.setAttribute('stroke-dasharray', '8,4');
  truth.setAttribute('opacity', '0.6');
  svg.appendChild(truth);
  const jr = new JumpPointRenderer();
  const out: any = jr.renderWithJumpPoints(
    dRel,
    [{ point: { x: 120, y: 40 }, angle: 90, t1: 0.5, t2: 0.5, segmentIndex: 0 } as any],
    { enabled: true, size: 10, style: 'arc' } as any,
    { stroke: '#dc2626', strokeWidth: 2, fill: 'none' }
  );
  svg.appendChild(vnodeToDom(out));
  // absolute truth of the relative input: (20,40) → (220,40) → (220,160) → (480,160)
  const nums = (out.props.d.match(/-?[\d.]+/g) || []).map(Number);
  const endX = nums[nums.length - 2], endY = nums[nums.length - 1];
  expectThat('S9 legacy parser resolves relative commands (endpoint)',
    Math.abs(endX - 480) <= 0.1 && Math.abs(endY - 160) <= 0.1, `end=(${endX},${endY})`);
  PROBES.s9_relativePath = { input: dRel, output: out.props.d };
}

// ===========================================================================
// S10: detector unit probes — mode equivalence + endpoint touching
// ===========================================================================
function s10_detectorProbes() {
  const det = new JumpPointDetector();
  // (a) shared endpoint: A ends exactly where B starts
  const A = { id: 'A', points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] };
  const B = { id: 'B', points: [{ x: 100, y: 0 }, { x: 100, y: 100 }] };
  const touching = det.detectIntersections(A, [B], 'all', 45);
  // (b) mode equivalence on a 30° crossing with threshold 25
  const H_ = { id: 'H', points: [{ x: 0, y: 50 }, { x: 200, y: 50 }] };
  const D = { id: 'D', points: [{ x: 0, y: 0 }, { x: 200, y: 115 }] }; // ~30°
  const perp = det.detectIntersections(H_, [D], 'perpendicular', 25);
  const thresh = det.detectIntersections(H_, [D], 'threshold', 25);
  PROBES.s10_detector = {
    sharedEndpointDetectedAsCrossing: touching.length > 0,
    sharedEndpointT: touching[0] ? { t1: touching[0].t1, t2: touching[0].t2 } : null,
    perpendicularModeCount: perp.length,
    thresholdModeCount: thresh.length,
    modesIdentical: JSON.stringify(perp) === JSON.stringify(thresh),
  };
}

// Sample the rendered path every 2px and measure how much of it runs INSIDE
// node bodies (rect inset by 2px so port-touch on the border doesn't count).
// Inside samples are overlaid in red so screenshots show the penetration.
function pathPenetration(svg: SVGSVGElement, linkId: string, nodes: any[], markSvg = true) {
  const g = svg.querySelector(`[data-vnode-key="link-${linkId}"]`);
  const p = g?.querySelector('path') as SVGPathElement | null;
  if (!p) return null;
  const inset = 2, step = 2;
  const rects = nodes.map(n => ({
    label: n.getMetadata('label') || n.id,
    x: n.position.x + inset, y: n.position.y + inset,
    X: n.position.x + n.size.width - inset, Y: n.position.y + n.size.height - inset,
    inside: 0,
  }));
  const total = p.getTotalLength();
  for (let d = 0; d <= total; d += step) {
    const pt = p.getPointAtLength(d);
    for (const r of rects) {
      if (pt.x > r.x && pt.x < r.X && pt.y > r.y && pt.y < r.Y) {
        r.inside += step;
        if (markSvg) overlayDot(svg, pt.x, pt.y, 'rgba(220,38,38,0.55)', 1.6);
      }
    }
  }
  return {
    pathLength: +total.toFixed(1),
    perNode: rects.map(r => ({ node: r.label, insidePx: +r.inside.toFixed(0) })),
  };
}

// ===========================================================================
// S12: switching pathType on an existing (settled) link
// ===========================================================================
function s12_pathTypeSwitch() {
  const transitions: Array<[string, string, string]> = [
    ['direct', 'orthogonal', 's12a'],
    ['orthogonal', 'smooth', 's12b'],
    ['orthogonal', 'direct', 's12c'],
    ['smooth', 'orthogonal', 's12d'],
  ];
  const probe: any = {};
  for (const [from, to, id] of transitions) {
    const engine = makeEngine();
    const diagram = engine.createDiagram(id);
    addNode(diagram, 'A', 20, 200, { w: 70, h: 40, ports: [{ id: `${id}-a-r`, side: 'right', type: 'output' }] });
    addNode(diagram, 'B', 430, 30, { w: 70, h: 40, ports: [{ id: `${id}-b-l`, side: 'left', type: 'input' }] });
    const link = makeLink(diagram, `${id}-a-r`, `${id}-b-l`, from);

    // settle: two renders so link.points is populated with the FROM route
    const tmp = document.createElement('div');
    renderInto(engine, tmp, 560, 280); renderInto(engine, tmp, 560, 280); tmp.remove();
    const pointsBeforeSwitch = link.points.map((p: any) => ({ ...p }));

    // switch type, render what the user would now see
    link.setPathType(to as any);
    const stage = cell(id, `S12 — pathType '${from}' → '${to}' (switch after settled render)`);
    const svg = renderInto(engine, stage, 560, 280);
    const d = pathD(svg, link.id) || '';
    probe[id] = {
      from, to,
      pointsAtSwitch: pointsBeforeSwitch.length,
      rendered_d: d,
      hasCurve: /C/.test(d),
      hasBend: /Q/.test(d),
      lineSegments: (d.match(/L/g) || []).length,
    };
  }
  PROBES.s12_pathTypeSwitch = probe;
}

// ===========================================================================
// S13: hub with one link of each type; move the hub; do lines follow?
// ===========================================================================
function s13_moveHub() {
  const W = 720, H = 420;
  const engine = makeEngine();
  const diagram = engine.createDiagram('s13');
  const hub = addNode(diagram, 'HUB', 40, 170, {
    w: 90, h: 60, fill: '#fef3c7',
    ports: [
      { id: 's13-h-1', side: 'right', type: 'output', index: 0 },
      { id: 's13-h-2', side: 'top', type: 'output', index: 0 },
      { id: 's13-h-3', side: 'bottom', type: 'output', index: 0 },
    ],
  });
  addNode(diagram, 'direct', 560, 40, { w: 90, h: 40, ports: [{ id: 's13-t1-l', side: 'left', type: 'input' }] });
  addNode(diagram, 'smooth', 560, 190, { w: 90, h: 40, ports: [{ id: 's13-t2-l', side: 'left', type: 'input' }] });
  addNode(diagram, 'orthogonal', 560, 340, { w: 90, h: 40, ports: [{ id: 's13-t3-l', side: 'left', type: 'input' }] });
  const lDirect = makeLink(diagram, 's13-h-2', 's13-t1-l', 'direct', { stroke: '#2563eb', arrowHead: { type: 'arrow', size: 10, filled: true, color: '#2563eb' } });
  const lSmooth = makeLink(diagram, 's13-h-1', 's13-t2-l', 'smooth', { stroke: '#059669', arrowHead: { type: 'arrow', size: 10, filled: true, color: '#059669' } });
  const lOrtho = makeLink(diagram, 's13-h-3', 's13-t3-l', 'orthogonal', { stroke: '#475569', arrowHead: { type: 'arrow', size: 10, filled: true, color: '#475569' } });

  const stageA = cell('s13a', 'S13a — settled: hub connected via direct (blue), smooth (green), orthogonal (grey)');
  renderTwice(engine, stageA, W, H);
  const orthoPointsBefore = lOrtho.points.map((p: any) => ({ ...p }));

  // user drags the hub down-right
  hub.setPosition(160, 60);
  const stageB = cell('s13b', 'S13b — hub moved to (160,60) and re-rendered: which links follow?');
  const svgB = renderInto(engine, stageB, W, H);

  const startOf = (d: string) => {
    const m = /M\s*(-?[\d.]+)[ ,]+(-?[\d.]+)/.exec(d);
    return m ? { x: +m[1], y: +m[2] } : null;
  };
  const hubPortWorld = (portId: string) => {
    const port = hub.getPorts().find((p: any) => p.id === portId);
    const local = getPortPositionForShape(port, hub);
    return { x: hub.position.x + local.x, y: hub.position.y + local.y };
  };
  PROBES.s13_moveHub = {
    hubMovedTo: { x: 160, y: 60 },
    direct: { rendered_d: pathD(svgB, lDirect.id), pathStart: startOf(pathD(svgB, lDirect.id) || ''), expectedStart: hubPortWorld('s13-h-2') },
    smooth: { rendered_d: pathD(svgB, lSmooth.id), pathStart: startOf(pathD(svgB, lSmooth.id) || ''), expectedStart: hubPortWorld('s13-h-1') },
    orthogonal: {
      rendered_d: pathD(svgB, lOrtho.id),
      pathStart: startOf(pathD(svgB, lOrtho.id) || ''),
      expectedStart: hubPortWorld('s13-h-3'),
      stalePointsUsed: JSON.stringify(lOrtho.points) === JSON.stringify(orthoPointsBefore),
      linkPoints: lOrtho.points,
    },
  };
}

// ===========================================================================
// S14: inverted geometry — target sits BEHIND the source's port.
// Should the line ever cross its own endpoint nodes? (industry answer: no)
// ===========================================================================
function s14_endpointCrossing() {
  const types = ['direct', 'smooth', 'bezier', 'orthogonal'];
  const probe: any = {};
  for (const t of types) {
    const id = `s14-${t}`;
    const stage = cell(id, `S14 — '${t}': target placed LEFT of source (right port → left port). Red dots = line inside a node body`);
    const engine = makeEngine();
    const diagram = engine.createDiagram(id);
    const src = addNode(diagram, 'SRC', 300, 110, { w: 110, h: 50, fill: '#fef3c7', ports: [{ id: `${id}-a-r`, side: 'right', type: 'output' }] });
    const tgt = addNode(diagram, 'TGT', 60, 110, { w: 110, h: 50, ports: [{ id: `${id}-b-l`, side: 'left', type: 'input' }] });
    const link = makeLink(diagram, `${id}-a-r`, `${id}-b-l`, t, {
      arrowHead: { type: 'arrow', size: 10, filled: true, color: '#475569' },
    });
    const svg = renderTwice(engine, stage, 560, 270);
    probe[t] = pathPenetration(svg, link.id, [src, tgt]);
  }
  PROBES.s14_endpointCrossing = probe;
}

// ===========================================================================
// S15: the reported move flows
//  a/b — valid smooth link, then target dragged to the far side of the source
//  c   — orthogonal link frozen by F16: target dragged ONTO its own old path
// ===========================================================================
function s15_moveCrossing() {
  {
    const engine = makeEngine();
    const diagram = engine.createDiagram('s15ab');
    const src = addNode(diagram, 'SRC', 200, 110, { w: 110, h: 50, fill: '#fef3c7', ports: [{ id: 's15-a-r', side: 'right', type: 'output' }] });
    const tgt = addNode(diagram, 'TGT', 440, 110, { w: 110, h: 50, ports: [{ id: 's15-b-l', side: 'left', type: 'input' }] });
    const link = makeLink(diagram, 's15-a-r', 's15-b-l', 'smooth', {
      arrowHead: { type: 'arrow', size: 10, filled: true, color: '#475569' },
    });
    const stageA = cell('s15a', 'S15a — smooth link with arrow, valid layout (settled)');
    renderTwice(engine, stageA, 600, 270);
    tgt.setPosition(20, 110); // dragged to the far side of SRC, same row
    const stageB = cell('s15b', 'S15b — TGT dragged to the far side of SRC (same row) and re-rendered');
    const svgB = renderInto(engine, stageB, 600, 270);
    PROBES.s15_smoothMove = pathPenetration(svgB, link.id, [src, tgt]);
  }
  {
    const engine = makeEngine();
    const diagram = engine.createDiagram('s15c');
    const src = addNode(diagram, 'SRC', 20, 230, { w: 90, h: 50, fill: '#fef3c7', ports: [{ id: 's15c-a-r', side: 'right', type: 'output' }] });
    const tgt = addNode(diagram, 'TGT', 480, 40, { w: 90, h: 50, ports: [{ id: 's15c-b-l', side: 'left', type: 'input' }] });
    const link = makeLink(diagram, 's15c-a-r', 's15c-b-l', 'orthogonal', {
      arrowHead: { type: 'arrow', size: 10, filled: true, color: '#475569' },
    });
    const tmp = document.createElement('div');
    renderInto(engine, tmp, 640, 320); renderInto(engine, tmp, 640, 320); tmp.remove();
    // drag the TARGET onto the middle of its own (now frozen, F16) route
    tgt.setPosition(240, 230);
    const stageC = cell('s15c', 'S15c — orthogonal link: TGT dragged onto its own frozen route (F16) and re-rendered');
    const svgC = renderInto(engine, stageC, 640, 320);
    PROBES.s15_orthoMoveOntoPath = pathPenetration(svgC, link.id, [src, tgt]);
  }
}

// ===========================================================================
// S16: third node sitting on the path — avoidObstacles:true is passed for
// every link; which line types actually avoid it?
// ===========================================================================
function s16_obstacleCrossing() {
  const types = ['direct', 'smooth', 'orthogonal'];
  const probe: any = {};
  for (const t of types) {
    const id = `s16-${t}`;
    const stage = cell(id, `S16 — '${t}': unrelated node OBST sits between SRC and TGT (avoidObstacles is on)`);
    const engine = makeEngine();
    const diagram = engine.createDiagram(id);
    addNode(diagram, 'SRC', 30, 110, { w: 90, h: 50, fill: '#fef3c7', ports: [{ id: `${id}-a-r`, side: 'right', type: 'output' }] });
    addNode(diagram, 'TGT', 460, 110, { w: 90, h: 50, ports: [{ id: `${id}-b-l`, side: 'left', type: 'input' }] });
    const obst = addNode(diagram, 'OBST', 235, 100, { w: 110, h: 70, fill: '#fee2e2', ports: [] });
    const link = makeLink(diagram, `${id}-a-r`, `${id}-b-l`, t, {
      arrowHead: { type: 'arrow', size: 10, filled: true, color: '#475569' },
    });
    const svg = renderTwice(engine, stage, 600, 280);
    probe[t] = pathPenetration(svg, link.id, [obst]);
  }
  PROBES.s16_obstacleCrossing = probe;
}

// sample the rendered path and return min distance to a point (world coords)
function pathDistanceToPoint(svg: SVGSVGElement, linkId: string, pt: { x: number; y: number }): number {
  const g = svg.querySelector(`[data-vnode-key="link-${linkId}"]`);
  const p = g?.querySelector('path') as SVGPathElement | null;
  if (!p) return Infinity;
  const total = p.getTotalLength();
  let min = Infinity;
  for (let d = 0; d <= total; d += 1.5) {
    const s = p.getPointAtLength(d);
    min = Math.min(min, Math.hypot(s.x - pt.x, s.y - pt.y));
  }
  return min;
}
function pathEndpoints(svg: SVGSVGElement, linkId: string) {
  const g = svg.querySelector(`[data-vnode-key="link-${linkId}"]`);
  const p = g?.querySelector('path') as SVGPathElement | null;
  if (!p) return null;
  const total = p.getTotalLength();
  return { start: p.getPointAtLength(0), end: p.getPointAtLength(total) };
}
// world position of a specific port, via the library's own positioning
// (NodeModel auto-creates default ports, so same-side spread must be computed,
// never hand-derived from the node centre)
function portWorld(node: any, portId: string) {
  const port = node.getPorts().find((p: any) => p.id === portId);
  const local = getPortPositionForShape(port, node);
  return { x: node.position.x + local.x, y: node.position.y + local.y };
}

// ===========================================================================
// S17: manual-waypoint lifecycle through the REAL InteractionHandlerService —
// add → drag → node move (endpoints must follow, waypoint must survive) →
// remove (flag must clear, auto-routing must resume)
// ===========================================================================
function s17_manualWaypointFlow() {
  // --- direct link: full lifecycle including the flag-clear branch ---------
  {
    const engine = makeEngine();
    const diagram = engine.createDiagram('s17');
    const src = addNode(diagram, 'SRC', 30, 60, { w: 90, h: 50, fill: '#fef3c7', ports: [{ id: 's17-a-r', side: 'right', type: 'output' }] });
    const tgt = addNode(diagram, 'TGT', 470, 60, { w: 90, h: 50, ports: [{ id: 's17-b-l', side: 'left', type: 'input' }] });
    const link = makeLink(diagram, 's17-a-r', 's17-b-l', 'direct', {
      arrowHead: { type: 'arrow', size: 10, filled: true, color: '#475569' },
    });
    const tmp = document.createElement('div');
    renderInto(engine, tmp, 620, 330); tmp.remove();
    expectThat('S17 settled auto link has no manual flag', link.getMetadata('hasManualWaypoints') !== true);

    const svc = new InteractionHandlerService();
    const mid = { x: (link.points[0].x + link.points[1].x) / 2, y: link.points[0].y };
    expectThat('S17 service.addWaypoint accepts click on path', svc.addWaypoint(mid.x, mid.y, link) === true);
    expectThat('S17 flag set by real service on add', link.getMetadata('hasManualWaypoints') === true);
    expectThat('S17 waypoint inserted', link.points.length === 3);

    // real drag lifecycle
    svc.startWaypointDrag(1, link);
    const dragTo = { x: mid.x + 30, y: mid.y + 90 };
    expectThat('S17 service.moveWaypoint during drag', svc.moveWaypoint(dragTo.x, dragTo.y, engine) === true);

    const stageA = cell('s17a', 'S17a — waypoint added + dragged via real InteractionHandlerService (red dot = waypoint)');
    const svgA = renderInto(engine, stageA, 620, 330);
    overlayDot(svgA, dragTo.x, dragTo.y, '#dc2626', 4);
    expectThat('S17 rendered path honors dragged waypoint',
      pathDistanceToPoint(svgA, link.id, dragTo) <= 2,
      `distance=${pathDistanceToPoint(svgA, link.id, dragTo).toFixed(1)}px`);

    // node move: endpoints must follow while the waypoint stays
    src.setPosition(30, 250);
    const stageB = cell('s17b', 'S17b — SRC moved: manual waypoint kept, endpoint follows the node');
    const svgB = renderInto(engine, stageB, 620, 380);
    overlayDot(svgB, dragTo.x, dragTo.y, '#dc2626', 4);
    const ends = pathEndpoints(svgB, link.id)!;
    const newPort = portWorld(src, 's17-a-r');
    expectThat('S17 manual link endpoint follows moved node',
      Math.hypot(ends.start.x - newPort.x, ends.start.y - newPort.y) <= 2,
      `start=(${ends.start.x.toFixed(1)},${ends.start.y.toFixed(1)}) expected=(${newPort.x.toFixed(1)},${newPort.y.toFixed(1)})`);
    expectThat('S17 waypoint survives node move', pathDistanceToPoint(svgB, link.id, dragTo) <= 2);
    expectThat('S17 flag survives node move', link.getMetadata('hasManualWaypoints') === true);

    // remove the waypoint → back to 2 points → flag clears, auto-route resumes
    expectThat('S17 service.removeWaypoint', svc.removeWaypoint(1, link) === true);
    expectThat('S17 flag cleared when waypoints gone', link.getMetadata('hasManualWaypoints') === false);
    const stageC = cell('s17c', 'S17c — waypoint removed: flag cleared, auto-routing resumes');
    const svgC = renderInto(engine, stageC, 620, 380);
    const endsC = pathEndpoints(svgC, link.id)!;
    const tgtPort = portWorld(tgt, 's17-b-l');
    expectThat('S17 auto-routing resumed after removal',
      Math.hypot(endsC.start.x - newPort.x, endsC.start.y - newPort.y) <= 2 &&
      Math.hypot(endsC.end.x - tgtPort.x, endsC.end.y - tgtPort.y) <= 2,
      `end=(${endsC.end.x.toFixed(1)},${endsC.end.y.toFixed(1)}) expected=(${tgtPort.x.toFixed(1)},${tgtPort.y.toFixed(1)})`);
    PROBES.s17_direct = { finalPoints: link.points, flag: link.getMetadata('hasManualWaypoints') };
  }

  // --- orthogonal link: the manual fast-path branch under a node move ------
  {
    const engine = makeEngine();
    const diagram = engine.createDiagram('s17o');
    const src = addNode(diagram, 'SRC', 30, 60, { w: 90, h: 50, fill: '#fef3c7', ports: [{ id: 's17o-a-r', side: 'right', type: 'output' }] });
    addNode(diagram, 'TGT', 470, 230, { w: 90, h: 50, ports: [{ id: 's17o-b-l', side: 'left', type: 'input' }] });
    const link = makeLink(diagram, 's17o-a-r', 's17o-b-l', 'orthogonal', {
      arrowHead: { type: 'arrow', size: 10, filled: true, color: '#475569' },
    });
    const tmp = document.createElement('div');
    renderInto(engine, tmp, 640, 400); tmp.remove();

    const svc = new InteractionHandlerService();
    // longest segment midpoint is a safe add spot (≥30px from endpoints)
    const pts = link.points;
    let segIdx = 0, best = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const L = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
      if (L > best) { best = L; segIdx = i; }
    }
    const mid = { x: (pts[segIdx].x + pts[segIdx + 1].x) / 2, y: (pts[segIdx].y + pts[segIdx + 1].y) / 2 };
    expectThat('S17o addWaypoint on orthogonal link', svc.addWaypoint(mid.x, mid.y, link) === true);
    const wpIdx = link.points.findIndex(p => Math.hypot(p.x - mid.x, p.y - mid.y) < 1);
    svc.startWaypointDrag(wpIdx, link);
    const dragTo = { x: mid.x + 25, y: mid.y + 55 };
    expectThat('S17o moveWaypoint on orthogonal link', svc.moveWaypoint(dragTo.x, dragTo.y, engine) === true);

    const stageA = cell('s17d', 'S17d — ORTHOGONAL manual waypoint (red dot), rendered through the manual fast path');
    const svgA = renderInto(engine, stageA, 640, 400);
    overlayDot(svgA, dragTo.x, dragTo.y, '#dc2626', 4);
    expectThat('S17o orthogonal path honors waypoint', pathDistanceToPoint(svgA, link.id, dragTo) <= 2);

    src.setPosition(30, 300);
    const stageB = cell('s17e', 'S17e — SRC moved: orthogonal manual link follows, waypoint kept');
    const svgB = renderInto(engine, stageB, 640, 420);
    overlayDot(svgB, dragTo.x, dragTo.y, '#dc2626', 4);
    const ends = pathEndpoints(svgB, link.id)!;
    const newPort = portWorld(src, 's17o-a-r');
    expectThat('S17o orthogonal manual link follows moved node',
      Math.hypot(ends.start.x - newPort.x, ends.start.y - newPort.y) <= 2,
      `start=(${ends.start.x.toFixed(1)},${ends.start.y.toFixed(1)}) expected=(${newPort.x.toFixed(1)},${newPort.y.toFixed(1)})`);
    expectThat('S17o waypoint survives orthogonal node move', pathDistanceToPoint(svgB, link.id, dragTo) <= 2);
    PROBES.s17_orthogonal = { points: link.points };
  }
}

// ===========================================================================
// S18: two crossings closer than the jump size — the merge branch must emit
// ONE arc spanning both, with no backtracking
// ===========================================================================
function s18_mergedJumps() {
  const stage = cell('s18', 'S18 — crossings 8px apart, size 12: overlapping cuts must merge into ONE arc');
  const engine = makeEngine();
  const diagram = engine.createDiagram('s18');
  addNode(diagram, 'A', 10, 130, { w: 60, h: 40, ports: [{ id: 's18-a-r', side: 'right', type: 'output' }] });
  addNode(diagram, 'B', 560, 130, { w: 60, h: 40, ports: [{ id: 's18-b-l', side: 'left', type: 'input' }] });
  const mainLink = makeLink(diagram, 's18-a-r', 's18-b-l', 'direct', {
    jumpPoints: { enabled: true, size: 12, style: 'arc', detectMode: 'all', threshold: 45 },
  });
  [300, 308].forEach((x, i) => {
    addNode(diagram, '', x - 30, 5, { w: 60, h: 30, ports: [{ id: `s18-c${i}-b`, side: 'bottom', type: 'output' }] });
    addNode(diagram, '', x - 30, 280, { w: 60, h: 30, ports: [{ id: `s18-d${i}-t`, side: 'top', type: 'input' }] });
    makeLink(diagram, `s18-c${i}-b`, `s18-d${i}-t`, 'direct', { stroke: '#0891b2' });
  });
  const svg = renderTwice(engine, stage, 640, 320);
  const d = pathD(svg, mainLink.id) || '';
  const arcs = [...d.matchAll(/L (-?[\d.]+) (-?[\d.]+) A (-?[\d.]+) [\d.-]+ \d \d \d (-?[\d.]+) (-?[\d.]+)/g)]
    .map(m => ({ x1: +m[1], r: +m[3], x2: +m[4] }));
  expectThat('S18 overlapping cuts merged into one arc', arcs.length === 1, `arcs=${arcs.length} d=${d}`);
  if (arcs.length === 1) {
    const chord = arcs[0].x2 - arcs[0].x1;
    expectThat('S18 merged chord spans both crossings (≈20px)', Math.abs(chord - 20) <= 0.5, `chord=${chord.toFixed(1)}`);
    expectThat('S18 arc radius matches chord (no SVG auto-scaling)', Math.abs(arcs[0].r - chord / 2) <= 0.1, `r=${arcs[0].r}`);
  }
  // monotonic x along the whole path: for M/L the 1st number is x, for A the
  // endpoint x is the 6th number
  const xs = [...d.matchAll(/([MLA])\s*((?:-?[\d.]+[ ,]*)+)/g)].map(m => {
    const n = m[2].trim().split(/[\s,]+/).map(Number);
    return m[1] === 'A' ? n[5] : n[0];
  });
  let backtracks = 0;
  for (let i = 1; i < xs.length; i++) if (xs[i] < xs[i - 1] - 0.01) backtracks++;
  expectThat('S18 no backtracking with sub-size crossing spacing', backtracks === 0, `xs=${xs.join(',')}`);
  PROBES.s18_mergedJumps = { d, arcs };
}

// ===========================================================================
// S19: arrow TAILS — tips must land on the source port for every anchor family
// ===========================================================================
function s19_arrowTails() {
  const types = ['arrow', 'diamond', 'circle', 'one', 'crow-foot', 'oval'];
  const ROW = 52, W = 560, H = types.length * ROW + 20;
  const stage = cell('s19', 'S19 — arrow TAILS (size=16): red line = source node edge, tail tip must touch it');
  const engine = makeEngine();
  const diagram = engine.createDiagram('s19');
  const rows: Array<{ type: string; link: any; src: any }> = [];
  types.forEach((t, i) => {
    const y = 10 + i * ROW;
    const src = addNode(diagram, t, 20, y, { w: 110, h: 36, ports: [{ id: `s19-src-${i}`, side: 'right', type: 'output' }] });
    addNode(diagram, '', 440, y, { w: 90, h: 36, ports: [{ id: `s19-dst-${i}`, side: 'left', type: 'input' }] });
    const link = makeLink(diagram, `s19-src-${i}`, `s19-dst-${i}`, 'direct', {
      arrowHead: { type: 'arrow', size: 16, filled: true, color: '#1d4ed8', width: 1.5 },
      arrowTail: { type: t, size: 16, filled: true, color: '#b91c1c', width: 1.5 },
    });
    rows.push({ type: t, link, src });
  });
  const svg = renderInto(engine, stage, W, H);
  const results: any[] = [];
  rows.forEach(row => {
    const portX = row.src.position.x + row.src.size.width;
    const portY = row.src.position.y + row.src.size.height / 2;
    overlayLine(svg, portX, portY - 22, portX, portY + 22);
    const g = svg.querySelector(`[data-vnode-key="link-${row.link.id}"]`);
    const arrows = g ? Array.from(g.querySelectorAll(':scope > .arrow, :scope > g.arrow')) : [];
    // head is rendered first, tail second
    const tailEl = arrows[1] as SVGGraphicsElement | undefined;
    let gap: number | null = null;
    if (tailEl) {
      const bbox = worldBBox(svg, tailEl);
      gap = bbox.minX - portX; // >0 means the tail floats away from the node
      overlayText(svg, portX + 6, portY - 8, `gap=${gap.toFixed(1)}px`, '#b91c1c', 10);
    }
    expectThat(`S19 tail '${row.type}' tip on source port`, gap !== null && Math.abs(gap) <= 1.2, `gap=${gap?.toFixed(2)}px`);
    results.push({ type: row.type, tailGapPx: gap !== null ? +gap.toFixed(2) : null });
  });
  PROBES.s19_arrowTails = results;
}

// ===========================================================================
// S20: hexagon + ellipse multi-port spread — unique, symmetric, on the shape
// ===========================================================================
function s20_hexEllipsePorts() {
  const stage = cell('s20', 'S20 — hexagon 3 top ports + ellipse 4 right ports (red = computed positions)');
  const engine = makeEngine();
  const diagram = engine.createDiagram('s20');
  const hex = addNode(diagram, 'hexagon', 40, 60, {
    w: 160, h: 80, shape: 'hexagon', fill: '#dcfce7',
    ports: [0, 1, 2].map(i => ({ id: `s20-h-${i}`, side: 'top' as const, type: 'output' as const, index: i })),
  });
  const ell = addNode(diagram, 'ellipse', 330, 50, {
    w: 160, h: 80, shape: 'ellipse', fill: '#fce7f3',
    ports: [0, 1, 2, 3].map(i => ({ id: `s20-e-${i}`, side: 'right' as const, type: 'output' as const, index: i })),
  });
  const svg = renderInto(engine, stage, 560, 220);

  const hexPos = hex.getPorts().filter((p: any) => p.id.startsWith('s20-h')).map((p: any) => getPortPositionForShape(p, hex));
  hexPos.forEach((pos: any, i: number) => {
    overlayDot(svg, hex.position.x + pos.x, hex.position.y + pos.y, '#dc2626', 3);
    overlayText(svg, hex.position.x + pos.x - 6, hex.position.y + pos.y - 6, `i${i}`, '#dc2626', 9);
  });
  const hxs = hexPos.map((p: any) => p.x);
  expectThat('S20 hexagon top ports all distinct', new Set(hxs.map((x: number) => x.toFixed(1))).size === 3, `xs=${hxs.join(',')}`);
  expectThat('S20 hexagon ports on the flat top edge (y=0, inside slant)',
    hexPos.every((p: any) => p.y === 0 && p.x >= 160 * 0.25 && p.x <= 160 * 0.75), `xs=${hxs.join(',')}`);
  // symmetry holds over ALL top-side ports (NodeModel auto-creates a default
  // top port, so the full set is default + the 3 declared ones)
  const allTop = hex.getPorts()
    .filter((p: any) => p.alignment?.side === 'top')
    .map((p: any) => getPortPositionForShape(p, hex).x)
    .sort((a: number, b: number) => a - b);
  const topSymmetric = allTop.every((x: number, i: number) => Math.abs(x + allTop[allTop.length - 1 - i] - 160) <= 0.1);
  expectThat('S20 hexagon full port set symmetric about centre', topSymmetric, `all=${allTop.map((x: number) => x.toFixed(1)).join(',')}`);

  const ellPos = ell.getPorts().filter((p: any) => p.id.startsWith('s20-e')).map((p: any) => getPortPositionForShape(p, ell));
  ellPos.forEach((pos: any, i: number) => {
    overlayDot(svg, ell.position.x + pos.x, ell.position.y + pos.y, '#dc2626', 3);
    overlayText(svg, ell.position.x + pos.x + 5, ell.position.y + pos.y + 3, `i${i}`, '#dc2626', 9);
  });
  const uniq = new Set(ellPos.map((p: any) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`));
  expectThat('S20 ellipse right ports all distinct (no rank collision)', uniq.size === 4, [...uniq].join(' | '));
  const onPerimeter = ellPos.every((p: any) => {
    const v = ((p.x - 80) / 80) ** 2 + ((p.y - 40) / 40) ** 2;
    return Math.abs(v - 1) <= 0.02;
  });
  expectThat('S20 ellipse ports lie on the perimeter', onPerimeter);
  // symmetry over ALL right-side ports (default + 4 declared)
  const allRight = ell.getPorts()
    .filter((p: any) => p.alignment?.side === 'right')
    .map((p: any) => getPortPositionForShape(p, ell).y)
    .sort((a: number, b: number) => a - b);
  const rightSymmetric = allRight.every((y: number, i: number) => Math.abs(y + allRight[allRight.length - 1 - i] - 80) <= 0.5);
  expectThat('S20 ellipse full fan symmetric about the side axis', rightSymmetric,
    `all=${allRight.map((y: number) => y.toFixed(1)).join(',')}`);
  expectThat('S20 ellipse ports on the right half', ellPos.every((p: any) => p.x > 80));

  // shape ↔ port consistency: the RENDERED ellipse geometry must match the node
  // size the port math uses (guards the borderRadius-rx style leak)
  const renderedEllipse = Array.from(svg.querySelectorAll('ellipse'))
    .find(e => e.getAttribute('class') !== 'node-shadow' && e.getAttribute('fill') === '#fce7f3');
  expectThat('S20 rendered ellipse geometry matches node size',
    !!renderedEllipse &&
    renderedEllipse.getAttribute('rx') === '80' && renderedEllipse.getAttribute('ry') === '40',
    renderedEllipse ? `rx=${renderedEllipse.getAttribute('rx')} ry=${renderedEllipse.getAttribute('ry')}` : 'ellipse element not found');
  PROBES.s20_ports = { hexagon: hexPos, ellipse: ellPos };
}

// ===========================================================================
// AUDIT PACK (A1-A11): visual edge-case sweep, probe-only (no hard assertions
// so the run always completes; findings are judged from screenshots + probes)
// ===========================================================================

function a1_verticalSmooth() {
  const stage = cell('a1', 'A1 — smooth links on vertical ports: down (bottom→top) and up (top→bottom)');
  const engine = makeEngine();
  const diagram = engine.createDiagram('a1');
  addNode(diagram, 'A', 60, 30, { w: 90, h: 44, ports: [{ id: 'a1-a-b', side: 'bottom', type: 'output' }] });
  addNode(diagram, 'B', 200, 240, { w: 90, h: 44, ports: [{ id: 'a1-b-t', side: 'top', type: 'input' }] });
  const down = makeLink(diagram, 'a1-a-b', 'a1-b-t', 'smooth', { arrowHead: { type: 'arrow', size: 10, filled: true, color: '#2563eb' } });
  addNode(diagram, 'C', 400, 240, { w: 90, h: 44, ports: [{ id: 'a1-c-t', side: 'top', type: 'output' }] });
  addNode(diagram, 'D', 540, 30, { w: 90, h: 44, ports: [{ id: 'a1-d-b', side: 'bottom', type: 'input' }] });
  const up = makeLink(diagram, 'a1-c-t', 'a1-d-b', 'smooth', { arrowHead: { type: 'arrow', size: 10, filled: true, color: '#059669' } });
  const svg = renderTwice(engine, stage, 680, 320);

  const rotationOf = (link: any) => {
    const g = svg.querySelector(`[data-vnode-key="link-${link.id}"]`);
    const tr = g?.querySelector('.arrow')?.getAttribute('transform') || '';
    return +(/rotate\((-?[\d.]+)/.exec(tr)?.[1] ?? NaN);
  };
  const norm = (a: number) => ((a % 360) + 360) % 360;
  const rotDown = rotationOf(down);
  const rotUp = rotationOf(up);
  expectThat('A1 arrow into TOP port points down (90°)', Math.abs(norm(rotDown) - 90) <= 2, `rotate=${rotDown}`);
  expectThat('A1 arrow into BOTTOM port points up (270°)', Math.abs(norm(rotUp) - 270) <= 2, `rotate=${rotUp}`);
  PROBES.a1_arrowRotations = { down: rotDown, up: rotUp };
}

function a2_sameSidePorts() {
  const stage = cell('a2', 'A2 — same-side ports (right→right): orthogonal (top pair) and smooth (bottom pair)');
  const engine = makeEngine();
  const diagram = engine.createDiagram('a2');
  const o1 = addNode(diagram, 'A', 40, 40, { w: 90, h: 44, ports: [{ id: 'a2-a-r', side: 'right', type: 'output' }] });
  const o2 = addNode(diagram, 'B', 320, 40, { w: 90, h: 44, ports: [{ id: 'a2-b-r', side: 'right', type: 'input' }] });
  const l1 = makeLink(diagram, 'a2-a-r', 'a2-b-r', 'orthogonal', { arrowHead: { type: 'arrow', size: 10, filled: true, color: '#475569' } });
  const s1 = addNode(diagram, 'C', 40, 200, { w: 90, h: 44, ports: [{ id: 'a2-c-r', side: 'right', type: 'output' }] });
  const s2 = addNode(diagram, 'D', 320, 200, { w: 90, h: 44, ports: [{ id: 'a2-d-r', side: 'right', type: 'input' }] });
  const l2 = makeLink(diagram, 'a2-c-r', 'a2-d-r', 'smooth', { arrowHead: { type: 'arrow', size: 10, filled: true, color: '#059669' } });
  const svg = renderTwice(engine, stage, 620, 300);
  PROBES.a2_sameSide = {
    orthogonal: pathPenetration(svg, l1.id, [o1, o2]),
    smooth: pathPenetration(svg, l2.id, [s1, s2]),
  };
}

function a3_shortLinks() {
  const types = ['direct', 'smooth', 'orthogonal'];
  const stage = cell('a3', 'A3 — very short links (24px gap between nodes)');
  const engine = makeEngine();
  const diagram = engine.createDiagram('a3');
  const probe: any = {};
  types.forEach((t, i) => {
    const y = 20 + i * 80;
    addNode(diagram, t, 40, y, { w: 110, h: 44, ports: [{ id: `a3-${t}-r`, side: 'right', type: 'output' }] });
    addNode(diagram, '', 174, y, { w: 110, h: 44, ports: [{ id: `a3-${t}-l`, side: 'left', type: 'input' }] });
    const link = makeLink(diagram, `a3-${t}-r`, `a3-${t}-l`, t, { arrowHead: { type: 'arrow', size: 10, filled: true, color: '#475569' } });
    probe[t] = link;
  });
  const svg = renderTwice(engine, stage, 400, 270);
  PROBES.a3_short = Object.fromEntries(Object.entries(probe).map(([t, l]: any) => [t, pathD(svg, l.id)]));
  // short left→right orthogonal route must never travel backwards
  const opts = (probe as any).orthogonal.points as Array<{ x: number; y: number }>;
  const backtracks = opts.slice(1).filter((p, i) => p.x < opts[i].x - 0.01).length;
  expectThat('A3 short orthogonal link has no backtracking', backtracks === 0, JSON.stringify(opts));
}

function a4_overlappingNodes() {
  const stage = cell('a4', 'A4 — target overlaps source: smooth (top) and orthogonal (bottom)');
  const engine = makeEngine();
  const diagram = engine.createDiagram('a4');
  addNode(diagram, 'A', 100, 30, { w: 110, h: 50, fill: '#fef3c7', ports: [{ id: 'a4-a-r', side: 'right', type: 'output' }] });
  addNode(diagram, 'B', 160, 55, { w: 110, h: 50, ports: [{ id: 'a4-b-l', side: 'left', type: 'input' }] });
  makeLink(diagram, 'a4-a-r', 'a4-b-l', 'smooth', { arrowHead: { type: 'arrow', size: 10, filled: true, color: '#475569' } });
  addNode(diagram, 'C', 100, 200, { w: 110, h: 50, fill: '#fef3c7', ports: [{ id: 'a4-c-r', side: 'right', type: 'output' }] });
  addNode(diagram, 'D', 160, 225, { w: 110, h: 50, ports: [{ id: 'a4-d-l', side: 'left', type: 'input' }] });
  makeLink(diagram, 'a4-c-r', 'a4-d-l', 'orthogonal', { arrowHead: { type: 'arrow', size: 10, filled: true, color: '#475569' } });
  renderTwice(engine, stage, 560, 320);
}

function a5_jumpNearCorner() {
  const stage = cell('a5', 'A5 — crossing 10px before an orthogonal corner (cut must clamp clear of the bend)');
  const engine = makeEngine();
  const diagram = engine.createDiagram('a5');
  addNode(diagram, 'A', 10, 240, { w: 70, h: 40, ports: [{ id: 'a5-a-r', side: 'right', type: 'output' }] });
  addNode(diagram, 'B', 540, 40, { w: 70, h: 40, ports: [{ id: 'a5-b-l', side: 'left', type: 'input' }] });
  const main = makeLink(diagram, 'a5-a-r', 'a5-b-l', 'orthogonal', {
    jumpPoints: { enabled: true, size: 12, style: 'arc', detectMode: 'all', threshold: 45 },
  });
  // settle once to learn the corner x, then place the crossing 10px before it
  const tmp = document.createElement('div');
  renderInto(engine, tmp, 640, 320); tmp.remove();
  const cornerX = main.points[2]?.x ?? 300;
  addNode(diagram, '', cornerX - 10 - 30, 5, { w: 60, h: 30, ports: [{ id: 'a5-c-b', side: 'bottom', type: 'output' }] });
  addNode(diagram, '', cornerX - 10 - 30, 290, { w: 60, h: 30, ports: [{ id: 'a5-d-t', side: 'top', type: 'input' }] });
  makeLink(diagram, 'a5-c-b', 'a5-d-t', 'direct', { stroke: '#0891b2' });
  const svg = renderTwice(engine, stage, 640, 330);
  const d5 = pathD(svg, main.id) || '';
  const arcCount5 = (d5.match(/A /g) || []).length;
  expectThat('A5 crossing near a corner still gets a jump', arcCount5 >= 1, d5);
  PROBES.a5_jumpNearCorner = { cornerX, mainD: d5, arcCount: arcCount5 };
}

function a6_jumpNearArrow() {
  const stage = cell('a6', 'A6 — crossing 16px before the target port: jump cut vs arrowhead');
  const engine = makeEngine();
  const diagram = engine.createDiagram('a6');
  addNode(diagram, 'A', 10, 130, { w: 70, h: 40, ports: [{ id: 'a6-a-r', side: 'right', type: 'output' }] });
  addNode(diagram, 'B', 480, 130, { w: 70, h: 40, ports: [{ id: 'a6-b-l', side: 'left', type: 'input' }] });
  const main = makeLink(diagram, 'a6-a-r', 'a6-b-l', 'direct', {
    arrowHead: { type: 'arrow', size: 12, filled: true, color: '#475569' },
    jumpPoints: { enabled: true, size: 12, style: 'arc', detectMode: 'all', threshold: 45 },
  });
  addNode(diagram, '', 434, 5, { w: 60, h: 30, ports: [{ id: 'a6-c-b', side: 'bottom', type: 'output' }] });
  addNode(diagram, '', 434, 260, { w: 60, h: 30, ports: [{ id: 'a6-d-t', side: 'top', type: 'input' }] });
  makeLink(diagram, 'a6-c-b', 'a6-d-t', 'direct', { stroke: '#0891b2' });
  const svg = renderTwice(engine, stage, 620, 300);
  const d6 = pathD(svg, main.id) || '';
  const arcXs = [...d6.matchAll(/A [\d.]+ [\d.]+ \d \d \d (-?[\d.]+)/g)].map(m => +m[1]);
  expectThat('A6 crossing near the target still gets a jump', arcXs.length >= 1, d6);
  // arrowhead (size 12, tip at portX=480) occupies [468, 480] — the arc must clear it
  expectThat('A6 jump arc clears the arrowhead zone', arcXs.every(x => x <= 468), `arcEndXs=${arcXs.join(',')}`);
  PROBES.a6_jumpNearArrow = { mainD: d6, arcEndXs: arcXs };
}

function a7_labels() {
  const types = ['direct', 'smooth', 'orthogonal'];
  const stage = cell('a7', 'A7 — link labels (metadata label): where do they land vs the path midpoint?');
  const engine = makeEngine();
  const diagram = engine.createDiagram('a7');
  const links: any = {};
  types.forEach((t, i) => {
    const y = 20 + i * 85;
    addNode(diagram, t, 30, y, { w: 100, h: 44, ports: [{ id: `a7-${t}-r`, side: 'right', type: 'output' }] });
    addNode(diagram, '', 440, y + 25, { w: 100, h: 44, ports: [{ id: `a7-${t}-l`, side: 'left', type: 'input' }] });
    const link = makeLink(diagram, `a7-${t}-r`, `a7-${t}-l`, t);
    link.setMetadata('label', `${t}-label`);
    links[t] = link;
  });
  const svg = renderTwice(engine, stage, 620, 320);
  const probe: any = {};
  for (const t of types) {
    const g = svg.querySelector(`[data-vnode-key="link-${links[t].id}"]`);
    // labels are positioned by a transform on the label group — measure the
    // RENDERED text box, not x/y attributes
    const texts = Array.from(g?.querySelectorAll('text') ?? []).map(el => {
      const bb = worldBBox(svg, el as unknown as SVGGraphicsElement);
      return { cx: +((bb.minX + bb.maxX) / 2).toFixed(1), cy: +((bb.minY + bb.maxY) / 2).toFixed(1), text: el.textContent };
    });
    // true path midpoint for comparison
    const p = g?.querySelector('path') as SVGPathElement | null;
    const mid = p ? p.getPointAtLength(p.getTotalLength() / 2) : null;
    probe[t] = { labels: texts, pathMidpoint: mid ? { x: +mid.x.toFixed(1), y: +mid.y.toFixed(1) } : null };
    expectThat(`A7 '${t}' link label renders at default zoom`, texts.length >= 1, JSON.stringify(texts));
    if (texts.length && probe[t].pathMidpoint) {
      const m = probe[t].pathMidpoint;
      expectThat(`A7 '${t}' label sits near the path midpoint`,
        Math.hypot(texts[0].cx - m.x, texts[0].cy - m.y) <= 40, `label=(${texts[0].cx},${texts[0].cy}) mid=(${m.x},${m.y})`);
    }
  }
  PROBES.a7_labels = probe;
}

function a8_dashedJumps() {
  const stage = cell('a8', 'A8 — dashed link with a jump arc (dash continuity across the arc)');
  const engine = makeEngine();
  const diagram = engine.createDiagram('a8');
  addNode(diagram, 'A', 10, 130, { w: 70, h: 40, ports: [{ id: 'a8-a-r', side: 'right', type: 'output' }] });
  addNode(diagram, 'B', 520, 130, { w: 70, h: 40, ports: [{ id: 'a8-b-l', side: 'left', type: 'input' }] });
  makeLink(diagram, 'a8-a-r', 'a8-b-l', 'direct', {
    strokeDasharray: '8,5',
    jumpPoints: { enabled: true, size: 12, style: 'arc', detectMode: 'all', threshold: 45 },
  });
  addNode(diagram, '', 270, 5, { w: 60, h: 30, ports: [{ id: 'a8-c-b', side: 'bottom', type: 'output' }] });
  addNode(diagram, '', 270, 260, { w: 60, h: 30, ports: [{ id: 'a8-d-t', side: 'top', type: 'input' }] });
  makeLink(diagram, 'a8-c-b', 'a8-d-t', 'direct', { stroke: '#0891b2' });
  renderTwice(engine, stage, 640, 300);
}

function a9_diagonalArrows() {
  const stage = cell('a9', 'A9 — diagonal direct links: arrow rotation + tip anchoring at 30°/45°');
  const engine = makeEngine();
  const diagram = engine.createDiagram('a9');
  addNode(diagram, 'A', 30, 30, { w: 90, h: 44, ports: [{ id: 'a9-a-r', side: 'right', type: 'output' }] });
  addNode(diagram, 'B', 420, 220, { w: 90, h: 44, ports: [{ id: 'a9-b-l', side: 'left', type: 'input' }] });
  makeLink(diagram, 'a9-a-r', 'a9-b-l', 'direct', {
    arrowHead: { type: 'arrow', size: 14, filled: true, color: '#2563eb' },
    arrowTail: { type: 'diamond', size: 14, filled: true, color: '#b91c1c' },
  });
  addNode(diagram, 'C', 30, 220, { w: 90, h: 44, ports: [{ id: 'a9-c-r', side: 'right', type: 'output' }] });
  addNode(diagram, 'D', 420, 30, { w: 90, h: 44, ports: [{ id: 'a9-d-l', side: 'left', type: 'input' }] });
  makeLink(diagram, 'a9-c-r', 'a9-d-l', 'direct', {
    arrowHead: { type: 'hollow-diamond', size: 14, color: '#059669' },
    arrowTail: { type: 'circle', size: 14, filled: false, color: '#059669' },
  });
  renderTwice(engine, stage, 560, 300);
}

function a10_lod() {
  for (const zoom of [1.0, 0.4, 0.15]) {
    const stage = cell(`a10-${String(zoom).replace('.', '_')}`, `A10 — LOD at zoom ${zoom} (arrow/label gating)`);
    const engine = makeEngine();
    const diagram = engine.createDiagram(`a10-${zoom}`);
    addNode(diagram, 'A', 30, 60, { w: 100, h: 44, ports: [{ id: `a10${zoom}-a-r`, side: 'right', type: 'output' }] });
    addNode(diagram, 'B', 400, 120, { w: 100, h: 44, ports: [{ id: `a10${zoom}-b-l`, side: 'left', type: 'input' }] });
    const link = makeLink(diagram, `a10${zoom}-a-r`, `a10${zoom}-b-l`, 'smooth', {
      arrowHead: { type: 'arrow', size: 12, filled: true, color: '#2563eb' },
    });
    link.setMetadata('label', 'lod-label');
    const renderer = new SVGRenderer(engine, { enableCaching: false, useCSSMode: false }, LIGHT_THEME);
    renderer.render({ x: 0, y: 0, width: 560, height: 240 }, zoom); // settle
    const vnode = renderer.render({ x: 0, y: 0, width: 560, height: 240 }, zoom);
    const dom = vnodeToDom(vnode) as SVGSVGElement;
    dom.setAttribute('width', '560'); dom.setAttribute('height', '240');
    stage.appendChild(dom);
    PROBES[`a10_lod_${zoom}`] = {
      lod: engine.getDiagram()?.getLODLevel(zoom),
      hasArrow: !!dom.querySelector('.arrow'),
      hasLabel: !!Array.from(dom.querySelectorAll('text')).find(t => t.textContent?.includes('lod-label')),
    };
    if (zoom === 1.0) {
      expectThat('A10 default zoom (1.0) reaches HIGH detail', PROBES[`a10_lod_${zoom}`].lod === 'high', `lod=${PROBES[`a10_lod_${zoom}`].lod}`);
      expectThat('A10 labels visible at default zoom', PROBES[`a10_lod_${zoom}`].hasLabel === true);
    }
  }
}

function a11_orthoAxisAligned() {
  // Orthogonal routes must be strictly axis-aligned — the small slanted stubs
  // seen at port exits would show up here as diagonal L segments.
  const stage = cell('a11', 'A11 — orthogonal axis-alignment probe (diagonal segments are defects)');
  const engine = makeEngine();
  const diagram = engine.createDiagram('a11');
  addNode(diagram, 'A', 20, 230, { w: 90, h: 50, ports: [{ id: 'a11-a-r', side: 'right', type: 'output' }] });
  addNode(diagram, 'B', 480, 40, { w: 90, h: 50, ports: [{ id: 'a11-b-l', side: 'left', type: 'input' }] });
  const link = makeLink(diagram, 'a11-a-r', 'a11-b-l', 'orthogonal', { arrowHead: { type: 'arrow', size: 10, filled: true, color: '#475569' } });
  const svg = renderTwice(engine, stage, 620, 330);
  const pts = link.points;
  const diagonalSegs: any[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const dx = Math.abs(pts[i + 1].x - pts[i].x);
    const dy = Math.abs(pts[i + 1].y - pts[i].y);
    if (dx > 0.01 && dy > 0.01) diagonalSegs.push({ i, from: pts[i], to: pts[i + 1], dx: +dx.toFixed(1), dy: +dy.toFixed(1) });
  }
  diagonalSegs.forEach(s => {
    overlayDot(svg, s.from.x, s.from.y, '#dc2626', 4);
    overlayText(svg, s.from.x + 6, s.from.y - 6, `diag ${s.dx}x${s.dy}`, '#dc2626', 10);
  });
  expectThat('A11 orthogonal route is strictly axis-aligned', diagonalSegs.length === 0, JSON.stringify(diagonalSegs));
  PROBES.a11_orthoAxisAligned = { points: pts, diagonalSegments: diagonalSegs, d: pathD(svg, link.id) };
}

// ===========================================================================
// A12: self-penetration sweep — the target node is placed on a grid of
// positions around (and overlapping) the source; for EVERY line type the
// rendered path must never run through either endpoint node's body.
// ===========================================================================
function a12_penetrationSweep() {
  const types: Array<'direct' | 'smooth' | 'bezier' | 'orthogonal'> = ['direct', 'smooth', 'bezier', 'orthogonal'];
  type Side = 'left' | 'right' | 'top' | 'bottom';
  const combos: Array<[Side, Side]> = [
    ['right', 'left'],   // classic facing
    ['bottom', 'top'],   // vertical facing
    ['top', 'bottom'],   // vertical reversed
    ['right', 'right'],  // same side
    ['bottom', 'bottom'],// same side vertical
    ['left', 'right'],   // facing away
  ];
  const offsets: Array<[number, number]> = [];
  for (const dx of [-220, -80, 80, 220]) {
    for (const dy of [-160, -80, 0, 80, 160]) {
      offsets.push([dx, dy]);
    }
  }

  const failures: any[] = [];
  let worst: any = null;

  for (const t of types) {
    for (const [srcSide, tgtSide] of combos) {
      for (const [dx, dy] of offsets) {
        const engine = makeEngine();
        const diagram = engine.createDiagram(`a12-${t}-${srcSide}-${tgtSide}-${dx}-${dy}`);
        const src = addNode(diagram, 'S', 420, 280, { w: 120, h: 56, ports: [{ id: 'a12-s', side: srcSide, type: 'output' }] });
        const tgt = addNode(diagram, 'T', 420 + dx, 280 + dy, { w: 120, h: 56, ports: [{ id: 'a12-t', side: tgtSide, type: 'input' }] });
        const link = makeLink(diagram, 'a12-s', 'a12-t', t, {
          arrowHead: { type: 'arrow', size: 10, filled: true, color: '#475569' },
        });
        const tmp = document.createElement('div');
        const svg = renderInto(engine, tmp, 1100, 700);
        const pen = pathPenetration(svg, link.id, [src, tgt], false);
        tmp.remove();
        const inside = (pen?.perNode ?? []).reduce((a: number, n: any) => a + n.insidePx, 0);
        // When the two node BODIES overlap, the ports sit inside the other
        // node and some penetration is geometrically unavoidable — those
        // placements are tracked separately (minimized, not zero)
        const bodiesOverlap = Math.abs(dx) < 120 && Math.abs(dy) < 56;
        if (inside > 2) { // small tolerance: stroke sampling jitter at the port
          failures.push({ type: t, srcSide, tgtSide, dx, dy, insidePx: inside, bodiesOverlap });
          if (!bodiesOverlap && (!worst || inside > worst.insidePx)) worst = { type: t, srcSide, tgtSide, dx, dy, insidePx: inside };
        }
      }
    }
  }

  // Visual cell: re-render the worst offender so the failure is visible
  const stage = cell('a12', `A12 — self-penetration sweep (${types.length * combos.length * offsets.length} placements). Red samples = line inside its own nodes`);
  {
    const w = worst ?? { type: 'smooth', srcSide: 'right', tgtSide: 'left', dx: -130, dy: 100 };
    const engine = makeEngine();
    const diagram = engine.createDiagram('a12-vis');
    const src = addNode(diagram, 'S', 420, 280, { w: 120, h: 56, fill: '#fef3c7', ports: [{ id: 'a12v-s', side: w.srcSide, type: 'output' }] });
    const tgt = addNode(diagram, 'T', 420 + w.dx, 280 + w.dy, { w: 120, h: 56, ports: [{ id: 'a12v-t', side: w.tgtSide, type: 'input' }] });
    const link = makeLink(diagram, 'a12v-s', 'a12v-t', w.type, {
      arrowHead: { type: 'arrow', size: 10, filled: true, color: '#475569' },
    });
    const svg = renderInto(engine, stage, 1100, 700);
    pathPenetration(svg, link.id, [src, tgt], true);
    overlayText(svg, 20, 24, worst
      ? `worst: ${w.type} ${w.srcSide}→${w.tgtSide} at (${w.dx},${w.dy}) — ${w.insidePx}px inside`
      : 'sweep clean — sample placement shown', worst ? '#dc2626' : '#16a34a', 13);
  }

  const hardFailures = failures.filter(f => !f.bodiesOverlap);
  const overlapCases = failures.filter(f => f.bodiesOverlap);
  expectThat('A12 no line type ever crosses its own nodes (non-overlapping placements)',
    hardFailures.length === 0,
    `${hardFailures.length} failing placements; worst=${JSON.stringify(worst)}; sample=${JSON.stringify(hardFailures.slice(0, 8))}`);
  // overlapping bodies: penetration is unavoidable but must stay minimal —
  // the own-node-obstacle retry must beat a straight slash through both
  const worstOverlap = overlapCases.reduce((m, f) => Math.max(m, f.insidePx), 0);
  expectThat('A12 overlapping-body placements keep penetration minimal (<120px, no straight slash)',
    worstOverlap < 120,
    `worst overlap penetration=${worstOverlap}px across ${overlapCases.length} unavoidable cases`);
  PROBES.a12_penetrationSweep = {
    placements: offsets.length * types.length * combos.length,
    hardFailures,
    overlapCases: overlapCases.length,
    worstOverlapPx: worstOverlap,
  };
}

// ===========================================================================
// run all
// ===========================================================================
const failures: any[] = [];
for (const [name, fn] of Object.entries({
  s1_arrowAnchoring, s2_darkTheme, s3_jumpSizeAndSweep, s4_jumpOrthogonal,
  s5_jumpBezier, s6_closeCrossings, s7_stalePoints, s8_ports, s9_relativePath, s10_detectorProbes,
  s11_gapBridge, s12_pathTypeSwitch, s13_moveHub,
  s14_endpointCrossing, s15_moveCrossing, s16_obstacleCrossing,
  s17_manualWaypointFlow, s18_mergedJumps, s19_arrowTails, s20_hexEllipsePorts,
  a1_verticalSmooth, a2_sameSidePorts, a3_shortLinks, a4_overlappingNodes,
  a5_jumpNearCorner, a6_jumpNearArrow, a7_labels, a8_dashedJumps,
  a9_diagonalArrows, a10_lod, a11_orthoAxisAligned, a12_penetrationSweep,
})) {
  try {
    (fn as any)();
  } catch (e: any) {
    failures.push({ scenario: name, error: String(e && e.stack || e) });
    origLog('SCENARIO FAILED', name, e);
  }
}
PROBES.__failures = failures;
(window as any).__DONE__ = true;
