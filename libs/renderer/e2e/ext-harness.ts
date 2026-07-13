// E2E harness for the WAVE-6 EXTENSION LAYER (Cards 0/2/5/6/7).
//
// Deliberately SEPARATE from run.mjs (the SVG line-algorithm suite, 185 fixed
// expectations) and canvas-run.mjs (27) — those are fixed contracts and must not
// move. This drives the things unit tests structurally cannot:
//
//   * the Background grid as REAL DOM (an <svg> with a live <pattern>), and the
//     pattern offset actually following the camera when you pan/zoom;
//   * the MiniMap as REAL DOM, its viewBox tracking real content bounds, its
//     camera rect tracking the real viewport, and a real click PANNING the canvas
//     (that needs a real getBoundingClientRect, which jsdom does not give you);
//   * Controls buttons driving real zoom;
//   * the ExtensionHost registering a shape/connector that a REAL render emits;
//   * the store flags (gridEnabled / showMinimap) actually showing/hiding.
//
// Usage:  node libs/renderer/e2e/ext-run.mjs

import { DiagramEngine, LinkModel, NodeModel, PortModel } from '@grafloria/engine';
import {
  attachCanvasPlugins,
  createDiagram,
  createExtensionHost,
  LIGHT_THEME,
} from '@grafloria/renderer';

const EXPECT: Array<{ name: string; pass: boolean; detail: string }> = [];
(window as any).__EXPECTATIONS__ = EXPECT;

function expect(name: string, pass: boolean, detail = ''): void {
  EXPECT.push({ name, pass: !!pass, detail });
}

const near = (a: number, b: number, tol = 1.5): boolean => Math.abs(a - b) <= tol;

function makeStage(id: string, w = 900, h = 600): HTMLElement {
  const host = document.createElement('div');
  host.id = id;
  host.style.cssText = `position:relative;width:${w}px;height:${h}px;`;
  document.getElementById('stage')!.appendChild(host);
  return host;
}

/** Three nodes + two links, spread out so content bounds are non-trivial. */
function seed(engine: DiagramEngine) {
  const diagram = engine.createDiagram('Ext E2E')!;

  const mk = (id: string, x: number, y: number): NodeModel => {
    const n = new NodeModel({ id, type: 'basic', position: { x, y } });
    n.size = { width: 120, height: 70 };
    n.addPort(new PortModel({ id: `${id}-out`, type: 'output', side: 'right' }));
    n.addPort(new PortModel({ id: `${id}-in`, type: 'input', side: 'left' }));
    diagram.addNode(n);
    return n;
  };

  mk('a', 100, 100);
  mk('b', 500, 260);
  mk('c', 900, 120);

  diagram.addLink(new LinkModel('a-out', 'b-in'));
  diagram.addLink(new LinkModel('b-out', 'c-in'));

  return diagram;
}

async function main(): Promise<void> {
  // =========================================================================
  // 1. BACKGROUND — the grid gap. Prove real pixels, and that it tracks the camera.
  // =========================================================================
  {
    const host = makeStage('bg');
    const engine = new DiagramEngine();
    seed(engine);

    const diagram = createDiagram(host, { engine, theme: LIGHT_THEME });
    const plugins = attachCanvasPlugins(diagram, {
      background: { variant: 'lines', gap: 25, color: '#c3ccd8' },
    });

    const bgSvg = host.querySelector('.grafloria-background-layer svg');
    expect('background: an <svg> grid layer is in the DOM', !!bgSvg);

    // The layer must sit UNDER the diagram, or it would cover the nodes.
    const layer = host.querySelector('.grafloria-background-layer');
    const svgLayer = host.querySelector('.grafloria-svg-layer');
    const order =
      layer && svgLayer
        ? layer.compareDocumentPosition(svgLayer) & Node.DOCUMENT_POSITION_FOLLOWING
        : 0;
    expect('background: painted BENEATH the diagram (precedes the svg layer)', !!order);

    const pattern = bgSvg?.querySelector('pattern');
    expect('background: a <pattern> defines the grid tile', !!pattern);

    // zoom 1, gap 25 ⇒ tile 25.
    const tile0 = Number(pattern?.getAttribute('width'));
    expect('background: tile = gap × zoom (25 @ zoom 1)', near(tile0, 25), `tile=${tile0}`);

    const transform0 = pattern?.getAttribute('patternTransform') ?? '';

    // PAN. The pattern offset must move with the camera — otherwise the grid
    // would slide under the nodes and the whole thing is a decal, not a grid.
    diagram.viewport.pan(37, 11);
    diagram.renderNow();
    const transform1 = pattern?.getAttribute('patternTransform') ?? '';
    expect(
      'background: the pattern offset FOLLOWS the camera on pan',
      transform0 !== transform1,
      `${transform0} -> ${transform1}`
    );

    // The offset is the sub-tile remainder: -(-37 * 1) mod 25 → wait, pan(37,11)
    // moves the world origin, so offset = ((-37 % 25) + 25) % 25 = 13.
    const mx = /translate\(([-\d.]+),/.exec(transform1);
    expect(
      'background: the offset is the SUB-TILE remainder (infinite grid, no precision loss)',
      mx ? near(Number(mx[1]), 13) : false,
      `transform=${transform1}`
    );

    // ZOOM. The tile must scale, or the grid would not stay registered with the
    // content it is measuring.
    diagram.viewport.setZoom(2);
    diagram.renderNow();
    const tile2 = Number(pattern?.getAttribute('width'));
    expect('background: the tile SCALES with zoom (25 → 50 @ 2×)', near(tile2, 50), `tile=${tile2}`);

    // Below minZoom the grid must suppress itself rather than turn to mud.
    diagram.viewport.setZoom(0.1);
    diagram.renderNow();
    const hidden = (bgSvg as SVGElement | null)?.style.display === 'none';
    expect('background: suppressed below minZoom (not visual mud)', !!hidden);

    diagram.viewport.setZoom(1);
    diagram.renderNow();

    // ---- the DEAD CONFIG fix: DiagramStore.gridEnabled now MEANS something ----
    const store = engine.getStore();
    store.set('gridEnabled', false);
    const offAfterFlag = (bgSvg as SVGElement | null)?.style.display === 'none';
    expect(
      'DEAD CONFIG FIXED: store.gridEnabled=false HIDES the grid (it had zero consumers)',
      !!offAfterFlag
    );

    store.set('gridEnabled', true);
    const onAfterFlag = (bgSvg as SVGElement | null)?.style.display !== 'none';
    expect('DEAD CONFIG FIXED: store.gridEnabled=true shows it again', !!onAfterFlag);

    plugins.dispose();
    expect(
      'background: dispose() removes the layer entirely',
      !host.querySelector('.grafloria-background-layer')
    );
    diagram.dispose();
  }

  // =========================================================================
  // 2. MINIMAP — the overview gap. Real geometry + real interaction.
  // =========================================================================
  {
    const host = makeStage('mm');
    const engine = new DiagramEngine();
    const model = seed(engine);

    const diagram = createDiagram(host, { engine, theme: LIGHT_THEME });
    const plugins = attachCanvasPlugins(diagram, { minimap: { width: 220, height: 160 } });

    const mm = host.querySelector('.grafloria-minimap');
    const mmSvg = mm?.querySelector('svg');
    expect('minimap: the panel is in the DOM', !!mm);
    expect('minimap: it renders an <svg>', !!mmSvg);

    // It lives in the SCREEN layer, so it must NOT be inside the camera-
    // transformed html layer (or it would pan away with the content).
    const inScreenLayer = !!mm?.closest('.grafloria-screen-layer');
    const inHtmlLayer = !!mm?.closest('.grafloria-html-layer');
    expect('minimap: lives in SCREEN space, not world space', inScreenLayer && !inHtmlLayer);

    const rects = mmSvg?.querySelectorAll('.grafloria-minimap-nodes rect') ?? [];
    expect('minimap: one rect per node (3)', rects.length === 3, `rects=${rects.length}`);

    // viewBox must be the real content bounds (+ padding 40).
    // Nodes span x:100..1020, y:100..330 ⇒ padded 60,60 1000×310.
    const viewBox = mmSvg?.getAttribute('viewBox') ?? '';
    const [vx, vy, vw, vh] = viewBox.split(/\s+/).map(Number);
    expect(
      'minimap: viewBox is the real CONTENT bounds + padding',
      near(vx, 60) && near(vy, 60) && near(vw, 1000) && near(vh, 310),
      `viewBox=${viewBox}`
    );

    // The camera rect must track the real viewport.
    const cam = mmSvg?.querySelector('.grafloria-minimap-viewport');
    const camX0 = Number(cam?.getAttribute('x'));
    diagram.viewport.pan(120, 60);
    diagram.renderNow();
    const camX1 = Number(cam?.getAttribute('x'));
    expect(
      'minimap: the camera rect FOLLOWS the viewport',
      near(camX1 - camX0, 120),
      `${camX0} -> ${camX1}`
    );

    // A new node must appear (model change ⇒ node layer rebuild).
    const d = new NodeModel({ id: 'd', type: 'basic', position: { x: 200, y: 500 } });
    d.size = { width: 120, height: 70 };
    model.addNode(d);
    diagram.renderNow();
    const rects2 = mmSvg?.querySelectorAll('.grafloria-minimap-nodes rect') ?? [];
    expect('minimap: refreshes on model change (4 nodes now)', rects2.length === 4, `rects=${rects2.length}`);

    // ---- INTERACTION: clicking the minimap must PAN the canvas ----
    // This is the assertion that needs a real browser: it depends on a real
    // getBoundingClientRect + the SVG letterbox inversion.
    const box = (mmSvg as SVGSVGElement).getBoundingClientRect();
    const before = diagram.viewport.getViewport();

    mmSvg!.dispatchEvent(
      new PointerEvent('pointerdown', {
        clientX: box.left + box.width * 0.8,
        clientY: box.top + box.height * 0.5,
        bubbles: true,
        pointerId: 1,
      })
    );
    diagram.renderNow();
    const after = diagram.viewport.getViewport();

    expect(
      'minimap: a CLICK pans the canvas (real hit-test through the letterboxed viewBox)',
      after.x !== before.x,
      `x ${before.x} -> ${after.x}`
    );
    // Clicking right-of-centre must move the camera RIGHT, not anywhere.
    expect(
      'minimap: the click pans in the RIGHT DIRECTION',
      after.x > before.x,
      `x ${before.x} -> ${after.x}`
    );

    // ---- the DEAD CONFIG fix: DiagramStore.showMinimap now MEANS something ----
    const store = engine.getStore();
    store.set('showMinimap', false);
    const mmHidden = (mm as HTMLElement).style.display === 'none';
    expect(
      'DEAD CONFIG FIXED: store.showMinimap=false HIDES the minimap (it had zero consumers)',
      mmHidden
    );
    store.set('showMinimap', true);
    expect(
      'DEAD CONFIG FIXED: store.showMinimap=true shows it again',
      (mm as HTMLElement).style.display !== 'none'
    );

    plugins.dispose();
    expect('minimap: dispose() removes the panel', !host.querySelector('.grafloria-minimap'));
    diagram.dispose();
  }

  // =========================================================================
  // 3. CONTROLS
  // =========================================================================
  {
    const host = makeStage('ctl');
    const engine = new DiagramEngine();
    seed(engine);
    const diagram = createDiagram(host, { engine, theme: LIGHT_THEME });
    const plugins = attachCanvasPlugins(diagram, { controls: { showLock: true } });

    const buttons = host.querySelectorAll('.grafloria-controls button');
    expect('controls: 4 buttons (zoom in/out, fit, lock)', buttons.length === 4, `n=${buttons.length}`);

    const zoom0 = diagram.viewport.getZoom();
    (buttons[0] as HTMLButtonElement).click();
    const zoom1 = diagram.viewport.getZoom();
    expect('controls: "zoom in" really zooms the camera', zoom1 > zoom0, `${zoom0} -> ${zoom1}`);

    (buttons[1] as HTMLButtonElement).click();
    expect('controls: "zoom out" reverses it', near(diagram.viewport.getZoom(), zoom0, 0.01));

    // Fit view must frame the content.
    diagram.viewport.setZoom(4);
    (buttons[2] as HTMLButtonElement).click();
    expect('controls: "fit view" reframes (zoom returns below 4)', diagram.viewport.getZoom() < 4);

    // Lock writes through to the engine's own flag rather than a second source of truth.
    (buttons[3] as HTMLButtonElement).click();
    expect(
      'controls: the lock button writes through to store.locked',
      engine.getStore().get('locked') === true
    );
    expect(
      'controls: lock is exposed to AT via aria-pressed',
      buttons[3].getAttribute('aria-pressed') === 'true'
    );

    plugins.dispose();
    diagram.dispose();
  }

  // =========================================================================
  // 4. PORTALS — screen space vs world space
  // =========================================================================
  {
    const host = makeStage('portal');
    const engine = new DiagramEngine();
    seed(engine);
    const diagram = createDiagram(host, { engine, theme: LIGHT_THEME });

    const hostRoot = host.querySelector('.grafloria-diagram-root') as HTMLElement;
    const htmlLayer = host.querySelector('.grafloria-html-layer') as HTMLElement;

    const { createPortal, createViewportPortal } = await import('@grafloria/renderer');

    const screenPanel = createPortal(hostRoot, { placement: 'top-right' });
    screenPanel.element.textContent = 'screen';
    const worldPanel = createViewportPortal(htmlLayer, { x: 500, y: 260 });
    worldPanel.element.textContent = 'world';

    const screenBox0 = screenPanel.element.getBoundingClientRect();
    const worldBox0 = worldPanel.element.getBoundingClientRect();

    // PAN the camera. The screen portal must NOT move; the world one MUST.
    diagram.viewport.pan(150, 90);
    diagram.renderNow();

    const screenBox1 = screenPanel.element.getBoundingClientRect();
    const worldBox1 = worldPanel.element.getBoundingClientRect();

    expect(
      'portal (screen space): pinned to the viewport — does NOT move on pan',
      near(screenBox0.left, screenBox1.left) && near(screenBox0.top, screenBox1.top),
      `${screenBox0.left} -> ${screenBox1.left}`
    );
    expect(
      'portal (world space): pans WITH the canvas',
      near(worldBox1.left - worldBox0.left, -150) && near(worldBox1.top - worldBox0.top, -90),
      `dx=${worldBox1.left - worldBox0.left} dy=${worldBox1.top - worldBox0.top}`
    );

    screenPanel.dispose();
    worldPanel.dispose();
    expect(
      'portal: dispose() removes both elements',
      !hostRoot.querySelector('.grafloria-portal') && !htmlLayer.querySelector('.grafloria-world-portal')
    );
    diagram.dispose();
  }

  // =========================================================================
  // 5. EXTENSION HOST — a capability-scoped plugin whose contribution RENDERS
  // =========================================================================
  {
    const host = makeStage('ext');
    const engine = new DiagramEngine();
    seed(engine);
    const diagram = createDiagram(host, { engine, theme: LIGHT_THEME });

    const extHost = createExtensionHost({
      engine,
      root: host.querySelector('.grafloria-diagram-root') as HTMLElement,
      requestRender: () => diagram.renderNow(),
    });

    let granted: string[] = [];

    const dispose = extHost.register({
      manifest: {
        id: 'e2e.zigzag',
        version: '1.0.0',
        engines: { grafloria: '^1.0.0' },
        capabilities: ['links'],
        contributes: { connectors: ['zigzag'] },
      },
      activate({ capabilities }) {
        granted = Object.keys(capabilities);
        capabilities.links.registerConnector('zigzag', ({ points }) => {
          // An unmistakable signature: a Z between the endpoints.
          const a = points[0];
          const b = points[points.length - 1];
          const mx = (a.x + b.x) / 2;
          return `M ${a.x} ${a.y} L ${mx} ${a.y} L ${mx} ${b.y} L ${b.x} ${b.y}`;
        });
      },
    });

    expect(
      'ExtensionHost: the manifest grant is ENFORCED (only `links` materialised)',
      granted.length === 1 && granted[0] === 'links',
      `granted=${granted.join(',')}`
    );

    // Apply it to a real link and prove the RENDERER emits the connector's path.
    const link = engine.getDiagram()!.getLinks()[0];
    link.setConnector('zigzag');
    diagram.renderNow();

    // Recompute the EXACT `d` the connector must have produced, from the link's
    // own routed points — an exact string match, not a shape heuristic (an
    // orthogonal fallback route also has three `L` commands, so counting them
    // would pass for the wrong reason).
    const pts = link.points;
    const a = pts[0];
    const b = pts[pts.length - 1];
    const mx = (a.x + b.x) / 2;
    const expectedD = `M ${a.x} ${a.y} L ${mx} ${a.y} L ${mx} ${b.y} L ${b.x} ${b.y}`;

    const paths = [...host.querySelectorAll('path')].map((p) => p.getAttribute('d') ?? '');
    expect(
      'ExtensionHost: a plugin-contributed CONNECTOR reaches the real rendered DOM',
      paths.includes(expectedD),
      `want=${expectedD} got=${paths.slice(0, 3).join(' | ')}`
    );

    // Unload it. The connector's exact path must be GONE, and the link must fall
    // back to a built-in and still render — an unloaded plugin must not blank it.
    dispose();
    diagram.renderNow();
    const after = [...host.querySelectorAll('path')].map((p) => p.getAttribute('d') ?? '');
    expect(
      'ExtensionHost: unloading the plugin removes its connector',
      !after.includes(expectedD)
    );
    expect(
      'ExtensionHost: the link still renders after its connector is unloaded',
      after.some((d) => d.startsWith('M '))
    );

    extHost.disposeAll();
    diagram.dispose();
  }

  (window as any).__DONE__ = true;
}

main().catch((error) => {
  expect('harness ran to completion', false, String(error));
  (window as any).__DONE__ = true;
});
