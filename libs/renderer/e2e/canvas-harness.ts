// E2E harness for the Canvas 2D backend (Wave 4).
//
// The jest suites run against a RECORDING 2D context: they prove the painter
// issues the right draw calls, but a recording context cannot rasterise, so they
// structurally CANNOT prove the thing the whole design rests on — that
// COLOUR-KEYED PIXEL PICKING actually works. That needs a real
// `CanvasRenderingContext2D`, a real `getImageData`, and a real devicePixelRatio.
//
// So this harness drives the real CanvasRenderer in headless Chromium and:
//   1. compares the PIXEL pick against the GEOMETRIC pick at thousands of points,
//   2. compares both against the engine's `getNodeAtPosition` (SVG mode's oracle),
//   3. reads real pixels back off the visible canvas to prove the theme colour
//      that lives ONLY in CSS was actually painted,
//   4. proves a dirty-region redraw leaves the untouched part of the canvas
//      byte-for-byte identical, and erases the region that changed,
//   5. proves the backing store is devicePixelRatio-sized,
//   6. drives the live SVG <-> Canvas switch and compares hit answers.
//
// Separate from `harness.ts` / `run.mjs` (the SVG line-algorithm suite) on
// purpose: that suite's 107 expectations are a fixed contract and must not move.

import { DiagramEngine, NodeModel, LinkModel } from '@grafloria/engine';
import { CanvasRenderer, DiagramRenderBackend, LIGHT_THEME } from '@grafloria/renderer';

const EXPECT: Array<{ name: string; pass: boolean; detail: string }> = [];
(window as any).__EXPECTATIONS__ = EXPECT;

function expect(name: string, pass: boolean, detail = ''): void {
  EXPECT.push({ name, pass: !!pass, detail });
}

const VIEWPORT = { x: 0, y: 0, width: 900, height: 650 };

function portOn(node: NodeModel, side: 'left' | 'right' | 'top' | 'bottom') {
  return node.getPorts().find((p) => p.side === side)!;
}

/** A diagram with one node per shape, plus a link. */
function buildDiagram() {
  const engine = new DiagramEngine();
  const diagram = engine.createDiagram('Canvas E2E')!;

  const specs = [
    { name: 'rect', shape: 'rect', x: 60, y: 60 },
    { name: 'circle', shape: 'circle', x: 300, y: 60 },
    { name: 'diamond', shape: 'diamond', x: 540, y: 60 },
    { name: 'hexagon', shape: 'hexagon', x: 60, y: 260 },
    { name: 'ellipse', shape: 'ellipse', x: 300, y: 260 },
  ];

  const nodes: Record<string, NodeModel> = {};
  for (const spec of specs) {
    const node = new NodeModel({
      type: 'basic',
      position: { x: spec.x, y: spec.y },
      size: { width: 160, height: 100 },
    });
    node.setMetadata('shape', { type: spec.shape });
    node.setMetadata('label', spec.name);
    diagram.addNode(node);
    nodes[spec.name] = node;
  }

  const link = new LinkModel(portOn(nodes['rect'], 'right').id, portOn(nodes['circle'], 'left').id);
  diagram.addLink(link);

  return { engine, diagram, nodes, link };
}

function stage(): HTMLElement {
  return document.getElementById('stage')!;
}

// ---------------------------------------------------------------------------
// 1-2. Picking: pixel vs geometric vs the engine's oracle
// ---------------------------------------------------------------------------

function testPicking(): void {
  const { engine, diagram, nodes } = buildDiagram();

  const canvas = document.createElement('canvas');
  stage().appendChild(canvas);

  const renderer = new CanvasRenderer(engine, { canvas, theme: LIGHT_THEME });
  renderer.render(VIEWPORT, 1);

  expect(
    'canvas: the offscreen hit canvas has a real 2D context',
    renderer.capabilities.supportsOffscreen,
    `supportsOffscreen=${renderer.capabilities.supportsOffscreen}`
  );

  let probed = 0;
  let inside = 0;
  const pixelVsGeometric: string[] = [];
  const canvasVsEngine: string[] = [];

  for (let x = 20; x < 880; x += 7) {
    for (let y = 20; y < 640; y += 7) {
      const engineNode = diagram.getNodeAtPosition(x, y);

      // Skip points within 2px of any outline: a RASTERISED edge and an ANALYTIC
      // inequality are allowed to disagree there (that is what antialiasing is).
      if (nearBoundary(diagram, x, y)) continue;

      probed++;
      if (engineNode) inside++;

      const pixel = renderer.pickPixel(x, y);
      const geometric = renderer.pickGeometric(x, y);

      const pixelId = pixel ? `${pixel.kind}:${pixel.id}` : 'none';
      const geomId = geometric ? `${geometric.kind}:${geometric.id}` : 'none';

      if (pixelId !== geomId && pixelVsGeometric.length < 8) {
        pixelVsGeometric.push(`(${x},${y}) pixel=${pixelId} geom=${geomId}`);
      }

      const expectedNode = engineNode ? `node:${engineNode.id}` : null;
      const actualNode = pixel?.kind === 'node' ? `node:${pixel.id}` : null;
      if (expectedNode !== actualNode && canvasVsEngine.length < 8) {
        // A point on the LINK, not on a node, legitimately picks the link.
        if (!(expectedNode === null && pixel?.kind === 'link')) {
          canvasVsEngine.push(
            `(${x},${y}) engine=${expectedNode ?? 'none'} canvas=${actualNode ?? 'none'}`
          );
        }
      }
    }
  }

  expect(
    'canvas: the sweep really covered the diagram',
    probed > 8000 && inside > 800,
    `probed=${probed} inside=${inside}`
  );

  expect(
    'canvas: COLOUR-KEY pixel pick == geometric pick, everywhere',
    pixelVsGeometric.length === 0,
    pixelVsGeometric.join(' | ')
  );

  expect(
    'canvas: pixel pick == engine getNodeAtPosition (the SVG-mode oracle)',
    canvasVsEngine.length === 0,
    canvasVsEngine.join(' | ')
  );

  // The link really is pickable by colour key, at the shared 5-unit tolerance.
  const points = diagram.getLinks()[0].points;
  const mid = {
    x: (points[0].x + points[points.length - 1].x) / 2,
    y: (points[0].y + points[points.length - 1].y) / 2,
  };
  const onLink = renderer.pickPixel(mid.x, mid.y);
  const offLink = renderer.pickPixel(mid.x, mid.y + 30);
  expect(
    'canvas: the link picks by colour key on the hit canvas',
    onLink?.kind === 'link' && offLink === null,
    `onLink=${onLink?.kind ?? 'none'} offLink=${offLink?.kind ?? 'none'}`
  );

  // The diamond's bbox corner is NOT the diamond — silhouette picking, not bbox.
  const diamond = nodes['diamond'];
  const corner = renderer.pickPixel(diamond.position.x + 4, diamond.position.y + 4);
  expect(
    'canvas: picks the silhouette, not the bounding box',
    corner === null,
    `corner pick = ${corner?.kind ?? 'none'}`
  );

  renderer.dispose();
}

// ---------------------------------------------------------------------------
// 3. The CSS seam: a colour that exists ONLY in the stylesheet is really painted
// ---------------------------------------------------------------------------

function testThemePaint(): void {
  const { engine, nodes } = buildDiagram();

  const canvas = document.createElement('canvas');
  stage().appendChild(canvas);

  const renderer = new CanvasRenderer(engine, { canvas, theme: LIGHT_THEME });
  renderer.render(VIEWPORT, 1);

  const ctx = canvas.getContext('2d')!;
  const dpr = renderer.getDevicePixelRatio();

  const node = nodes['rect'];
  const cx = Math.round((node.position.x + 80) * dpr);
  const cy = Math.round((node.position.y + 50) * dpr);
  const [r, g, b, a] = ctx.getImageData(cx, cy, 1, 1).data;

  const expectedHex = String(LIGHT_THEME.colors.node.default.fill).toLowerCase();
  const actualHex = `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;

  // The node body's fill in CSS mode comes from `.diagram-node { fill:
  // var(--grafloria-node-fill) }` — it is NOWHERE on the VNode. If the style resolver
  // were wrong, this pixel would be transparent or black.
  expect(
    'canvas: the theme fill that lives ONLY in CSS is really on the pixels',
    a === 255 && actualHex === expectedHex,
    `expected ${expectedHex}, got ${actualHex} (alpha ${a})`
  );

  // ...and the label, whose colour comes from `.diagram-label`, was drawn.
  const band = ctx.getImageData(cx - 30 * dpr, cy - 8 * dpr, 60 * dpr, 16 * dpr).data;
  let dark = 0;
  for (let i = 0; i < band.length; i += 4) {
    if (band[i] < 100 && band[i + 3] > 128) dark++;
  }
  expect('canvas: the label was rendered (dark glyph pixels present)', dark > 10, `darkPixels=${dark}`);

  renderer.dispose();
}

// ---------------------------------------------------------------------------
// 4. Dirty-region redraw: only the changed region's pixels move
// ---------------------------------------------------------------------------

function testDirtyRegions(): void {
  const { engine, nodes } = buildDiagram();

  const canvas = document.createElement('canvas');
  stage().appendChild(canvas);

  const renderer = new CanvasRenderer(engine, { canvas, theme: LIGHT_THEME });
  renderer.render(VIEWPORT, 1);

  const ctx = canvas.getContext('2d')!;
  const dpr = renderer.getDevicePixelRatio();

  const snapshot = (x: number, y: number, w: number, h: number): string => {
    const data = ctx.getImageData(x * dpr, y * dpr, w * dpr, h * dpr).data;
    let hash = 0;
    for (let i = 0; i < data.length; i++) hash = (hash * 31 + data[i]) | 0;
    return String(hash);
  };

  // A region far from the node we are about to move (the hexagon, bottom-left).
  const farBefore = snapshot(60, 260, 160, 100);
  // The region the ellipse currently occupies.
  const nearBefore = snapshot(290, 250, 190, 130);

  // A point INSIDE the ellipse now that will be OUTSIDE it after the move — i.e.
  // a pixel that MUST be erased. (Ellipse is centred (380,310) r=(80,50); after
  // moving to (320,280) it is centred (400,330), and 90px left of that is out.)
  // Assert it is painted AND pickable NOW, so the "no ghost" check below cannot
  // pass by testing empty canvas.
  const ghost = { x: 310, y: 310 };
  const before = ctx.getImageData(Math.round(ghost.x * dpr), Math.round(ghost.y * dpr), 1, 1).data;
  expect('canvas: the ghost probe is painted before the move', before[3] > 0, `alpha=${before[3]}`);
  expect(
    'canvas: the ghost probe is pickable before the move',
    renderer.pickPixel(ghost.x, ghost.y)?.id === nodes['ellipse'].id,
    `pick=${renderer.pickPixel(ghost.x, ghost.y)?.id ?? 'none'}`
  );

  // Second frame with NOTHING changed: must repaint nothing at all.
  renderer.render(VIEWPORT, 1);
  const idle = renderer.getFrameStats();
  expect(
    'canvas: an unchanged frame repaints ZERO elements',
    idle.painted === 0 && !idle.fullRepaint,
    JSON.stringify(idle)
  );

  // Now move ONE node.
  nodes['ellipse'].setPosition(320, 280);
  renderer.render(VIEWPORT, 1);

  const stats = renderer.getFrameStats();
  expect(
    'canvas: moving one node is a PARTIAL repaint',
    !stats.fullRepaint && stats.dirtyRects > 0 && stats.changedEntities === 1 && stats.culled > 0,
    JSON.stringify(stats)
  );

  expect(
    'canvas: pixels OUTSIDE the dirty rect are byte-identical',
    snapshot(60, 260, 160, 100) === farBefore,
    ''
  );
  expect(
    'canvas: pixels INSIDE the dirty rect were repainted',
    snapshot(290, 250, 190, 130) !== nearBefore,
    ''
  );

  const after = ctx.getImageData(Math.round(ghost.x * dpr), Math.round(ghost.y * dpr), 1, 1).data;
  expect(
    'canvas: no ghost left at the old position (the dirty rect spanned old+new)',
    after[3] === 0,
    `alpha=${after[3]} rgb=${after[0]},${after[1]},${after[2]}`
  );

  // Picking still agrees after a partial repaint — i.e. the HIT canvas was
  // repaired too, and the stable colour keys did not alias onto a stale record.
  const pick = renderer.pickPixel(400, 330);
  expect(
    'canvas: picking is still correct after a partial repaint',
    pick?.kind === 'node' && pick.id === nodes['ellipse'].id,
    `pick=${pick?.kind}:${pick?.id ?? 'none'}`
  );
  const stale = renderer.pickPixel(ghost.x, ghost.y);
  expect(
    'canvas: the hit canvas has no stale key at the old position',
    stale === null,
    `stale=${stale?.kind}:${stale?.id ?? 'none'}`
  );

  renderer.dispose();
}

// ---------------------------------------------------------------------------
// 5. High-DPI
// ---------------------------------------------------------------------------

function testHighDPI(): void {
  const { engine } = buildDiagram();

  const canvas = document.createElement('canvas');
  stage().appendChild(canvas);

  const renderer = new CanvasRenderer(engine, { canvas, theme: LIGHT_THEME });
  renderer.render(VIEWPORT, 1);

  const dpr = window.devicePixelRatio;
  expect(
    'canvas: backing store is devicePixelRatio-sized, element is CSS-sized',
    canvas.width === Math.round(VIEWPORT.width * dpr) && canvas.style.width === `${VIEWPORT.width}px`,
    `dpr=${dpr} backing=${canvas.width}x${canvas.height} css=${canvas.style.width}`
  );
  expect(
    'canvas: the renderer picked up the real devicePixelRatio',
    renderer.getDevicePixelRatio() === dpr,
    `${renderer.getDevicePixelRatio()} vs ${dpr}`
  );

  renderer.dispose();
}

// ---------------------------------------------------------------------------
// 6. The live backend switch
// ---------------------------------------------------------------------------

function testBackendSwitch(): void {
  const { engine, nodes } = buildDiagram();

  const host = document.createElement('div');
  host.style.width = '900px';
  host.style.height = '650px';
  stage().appendChild(host);

  const backend = new DiagramRenderBackend(engine, host, { mode: 'svg', theme: LIGHT_THEME });
  backend.render(VIEWPORT, 1);

  const svgEl = host.querySelector('svg');
  const svgNodes = svgEl?.querySelectorAll('.node-group').length ?? 0;
  expect('switch: SVG mode mounts a populated <svg>', !!svgEl && svgNodes === 5, `nodes=${svgNodes}`);

  const probes: Array<[number, number]> = [
    [140, 110],
    [380, 110],
    [620, 110],
    [140, 310],
    [380, 310],
    [545, 65],
    [850, 600],
  ];
  const pickAll = () =>
    probes.map(([x, y]) => {
      const p = backend.hitTest(x, y);
      return p ? `${p.kind}:${p.id}` : 'none';
    });

  const svgPicks = pickAll();

  backend.setMode('canvas');
  const canvasEl = host.querySelector('canvas');
  expect(
    'switch: canvas mode swaps the <svg> for a <canvas>',
    !!canvasEl && !host.querySelector('svg'),
    `canvas=${!!canvasEl} svg=${!!host.querySelector('svg')}`
  );

  const canvasPicks = pickAll();
  expect(
    'switch: hit-testing gives the SAME answer in both backends',
    JSON.stringify(svgPicks) === JSON.stringify(canvasPicks),
    `svg=${JSON.stringify(svgPicks)} canvas=${JSON.stringify(canvasPicks)}`
  );
  expect(
    'switch: the probe set is meaningful (some hits, some misses)',
    svgPicks.filter((p) => p !== 'none').length >= 4 && svgPicks.includes('none'),
    JSON.stringify(svgPicks)
  );

  const ctx = (canvasEl as HTMLCanvasElement).getContext('2d')!;
  const dpr = window.devicePixelRatio;
  const px = ctx.getImageData(Math.round(140 * dpr), Math.round(110 * dpr), 1, 1).data;
  expect('switch: the canvas is actually painted after the switch', px[3] > 0, `alpha=${px[3]}`);

  backend.setMode('svg');
  expect(
    'switch: switching back restores the SVG DOM',
    !!host.querySelector('svg') && !host.querySelector('canvas'),
    ''
  );
  expect(
    'switch: hit-testing survives a round trip',
    JSON.stringify(pickAll()) === JSON.stringify(svgPicks),
    ''
  );

  // The scene was never rebuilt: the node models are the same objects.
  expect(
    'switch: the model is untouched by the switch',
    engine.getDiagram()!.getNodes().includes(nodes['rect']),
    ''
  );

  backend.dispose();
}

// ---------------------------------------------------------------------------

function nearBoundary(diagram: any, x: number, y: number): boolean {
  const eps = 2;
  const inside = (px: number, py: number) => !!diagram.getNodeAtPosition(px, py);
  const here = inside(x, y);
  return (
    inside(x + eps, y) !== here ||
    inside(x - eps, y) !== here ||
    inside(x, y + eps) !== here ||
    inside(x, y - eps) !== here
  );
}

try {
  testPicking();
  testThemePaint();
  testDirtyRegions();
  testHighDPI();
  testBackendSwitch();
} catch (err) {
  expect('harness ran without throwing', false, String((err as Error)?.stack ?? err));
}

(window as any).__DONE__ = true;
