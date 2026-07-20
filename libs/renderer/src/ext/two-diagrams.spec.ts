/**
 * ============================================================================
 * TWO DIAGRAMS ON ONE PAGE — the registry-isolation contract
 * ============================================================================
 *
 * The renderer's contribution registries (shapes, named styles, edge templates,
 * markers, the link pipeline, tools) were MODULE-SCOPE `Map`s. One process, one
 * vocabulary. That is invisible while a page holds one diagram and catastrophic
 * the moment it holds two, which is an ordinary requirement — a widget editor
 * beside its live preview, a palette beside a canvas, two tabs of the same app.
 *
 * Two distinct failures, and the second is the worse one:
 *
 *   1. LAST WRITER WINS. Diagram A registers `badge` as a circle; diagram B
 *      registers `badge` as an ellipse. BOTH diagrams draw an ellipse. A is
 *      repainted into B's vocabulary without A, B or the embedder doing anything
 *      wrong.
 *
 *   2. TEARDOWN BLEEDS. `ExtensionHost.dispose()` RESTORES what was in the
 *      registry before that extension registered — correct for one diagram,
 *      destructive for two. Unloading A's extension restores "no badge at all",
 *      so B — which never disposed anything — silently loses its shape and falls
 *      back to a plain rect. A closing panel corrupts the diagram next to it.
 *
 * WHY THESE TESTS ASSERT ON RENDERED OUTPUT, not on registry contents. A
 * registry can be perfectly partitioned and still be read by the wrong instance:
 * partitioning the storage and routing the READ are two different bugs, and only
 * the pixels prove both. So every assertion below reaches into the diagram's own
 * DOM and asks what element the node actually drew.
 *
 * WHY THE TWO DIAGRAMS REGISTER CONFLICTING ENTRIES. Two diagrams that register
 * compatible things pass this file with the registries still fully shared — the
 * test would prove nothing. Every pair here collides on the SAME KEY with
 * DIFFERENT VALUES, so shared state cannot produce a right answer.
 */

import { createDiagram } from '../instance/create-diagram';
import type { DiagramInstance } from '../instance/create-diagram';
import type { NodeSpec, EdgeSpec } from '../instance/model-input';
import { createExtensionHost } from './extension-host';
import type { Extension, ExtensionHost } from './extension-host';
import type { OutlineSpec, ShapeDefinition } from '../svg/shape-registry';
import { unregisterShape } from '../svg/shape-registry';
import { clearStyles } from '../themes/style-registry';

const W = 800;
const H = 600;

/** jsdom lays nothing out — give the container a real rect. */
function makeContainer(): HTMLElement {
  const el = document.createElement('div');
  el.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: W, height: H, right: W, bottom: H }) as DOMRect;
  document.body.appendChild(el);
  return el;
}

/** One node, asking for the CONTESTED shape name. */
const BADGE_NODES: NodeSpec[] = [
  {
    id: 'n1',
    position: { x: 100, y: 100 },
    size: { width: 120, height: 60 },
    shape: { type: 'badge' },
  },
];

/**
 * A shape whose outline is a DIFFERENT SVG ELEMENT per diagram.
 *
 * Element identity, not a colour or a number, because the fallback for an
 * unknown shape name is `rect` — so "A drew a circle, B drew an ellipse, and
 * neither drew a rect" distinguishes all three states this test cares about:
 * my shape, the other diagram's shape, and no shape at all.
 */
function badgeShape(el: 'circle' | 'ellipse'): Omit<ShapeDefinition, 'type'> {
  return {
    outline: (w: number, h: number): OutlineSpec =>
      el === 'circle'
        ? { el: 'circle', geom: { cx: w / 2, cy: h / 2, r: Math.min(w, h) / 2 } }
        : { el: 'ellipse', geom: { cx: w / 2, cy: h / 2, rx: w / 2, ry: h / 2 } },
    boundaryPoint: () => null,
    portAnchor: (w: number, h: number) => ({ x: w / 2, y: h / 2 }),
  };
}

function badgeExtension(id: string, el: 'circle' | 'ellipse'): Extension<'shapes'> {
  return {
    manifest: {
      id,
      version: '1.0.0',
      engines: { grafloria: '^1.0.0' },
      capabilities: ['shapes'],
    },
    activate({ capabilities }) {
      capabilities.shapes.register('badge', badgeShape(el));
    },
  };
}

/**
 * The tag name the node's BODY was drawn with, read out of that diagram's own
 * DOM. `.diagram-node` is the body element's class in CSS mode (the default).
 */
function bodyTag(diagram: DiagramInstance): string {
  const body = diagram.container.querySelector('.diagram-node');
  if (!body) throw new Error('no node body was rendered');
  return body.tagName.toLowerCase();
}

describe('two diagrams on one page — contribution registries must not be shared', () => {
  const containers: HTMLElement[] = [];
  const diagrams: DiagramInstance[] = [];
  const hosts: ExtensionHost[] = [];

  function mount(options: Parameters<typeof createDiagram>[1] = {}): DiagramInstance {
    const container = makeContainer();
    containers.push(container);
    const diagram = createDiagram(container, options);
    diagrams.push(diagram);
    return diagram;
  }

  function hostFor(diagram: DiagramInstance): ExtensionHost {
    const host = createExtensionHost({
      engine: diagram.getEngine(),
      root: diagram.container,
      requestRender: () => diagram.renderNow(),
      // The diagram's own registry partition. Without it a host writes to the
      // process-global registries and this whole file goes red.
      registry: diagram.registry,
    });
    hosts.push(host);
    return host;
  }

  afterEach(() => {
    for (const host of hosts) host.disposeAll();
    hosts.length = 0;
    for (const diagram of diagrams) diagram.dispose();
    diagrams.length = 0;
    for (const container of containers) container.remove();
    containers.length = 0;
    // The process-global registries are shared across tests in this file, so a
    // leaked global registration would make a later test pass for the wrong
    // reason. Put them back.
    unregisterShape('badge');
    clearStyles();
  });

  // -- shapes ---------------------------------------------------------------

  it('gives each diagram its OWN `badge` when both extensions claim the name', () => {
    const a = mount({ nodes: BADGE_NODES });
    const b = mount({ nodes: BADGE_NODES });

    hostFor(a).register(badgeExtension('ext.a', 'circle'));
    hostFor(b).register(badgeExtension('ext.b', 'ellipse'));

    a.renderNow();
    b.renderNow();

    // A must NOT have been repainted into B's vocabulary by B's later registration.
    expect(bodyTag(a)).toBe('circle');
    expect(bodyTag(b)).toBe('ellipse');
  });

  it("does not let A's extension teardown strip the shape out from under B", () => {
    const a = mount({ nodes: BADGE_NODES });
    const b = mount({ nodes: BADGE_NODES });

    const hostA = hostFor(a);
    hostA.register(badgeExtension('ext.a', 'circle'));
    hostFor(b).register(badgeExtension('ext.b', 'ellipse'));

    b.renderNow();
    expect(bodyTag(b)).toBe('ellipse');

    // A unloads its plugin. Its disposer RESTORES the pre-registration state —
    // which, shared, meant "no badge exists" for everyone.
    hostA.dispose('ext.a');

    a.renderNow();
    b.renderNow();

    // B never disposed anything and must be untouched.
    expect(bodyTag(b)).toBe('ellipse');
    // …and A really did give its own shape back: unknown shape ⇒ rect fallback.
    expect(bodyTag(a)).toBe('rect');
  });

  it("survives disposing diagram A entirely while B keeps rendering", () => {
    const a = mount({ nodes: BADGE_NODES });
    const b = mount({ nodes: BADGE_NODES });

    const hostA = hostFor(a);
    hostA.register(badgeExtension('ext.a', 'circle'));
    hostFor(b).register(badgeExtension('ext.b', 'ellipse'));

    hostA.disposeAll();
    a.dispose();

    b.renderNow();
    expect(bodyTag(b)).toBe('ellipse');
  });

  // -- named styles ---------------------------------------------------------

  const STYLED_NODES: NodeSpec[] = [
    {
      id: 'n1',
      position: { x: 100, y: 100 },
      size: { width: 120, height: 60 },
      style: { styleClass: 'critical' },
    },
  ];

  it('resolves the same `styleClass` name to each diagram\'s OWN definition', () => {
    const a = mount({ nodes: STYLED_NODES });
    const b = mount({ nodes: STYLED_NODES });

    a.registry.defineStyle('critical', { stroke: 'rgb(1, 1, 1)' });
    b.registry.defineStyle('critical', { stroke: 'rgb(2, 2, 2)' });

    a.renderNow();
    b.renderNow();

    const strokeOf = (d: DiagramInstance): string =>
      d.container.querySelector('.diagram-node')?.getAttribute('style') ?? '';

    expect(strokeOf(a)).toContain('rgb(1, 1, 1)');
    expect(strokeOf(a)).not.toContain('rgb(2, 2, 2)');
    expect(strokeOf(b)).toContain('rgb(2, 2, 2)');
    expect(strokeOf(b)).not.toContain('rgb(1, 1, 1)');
  });

  it('does not let one diagram clearing its styles blank the other', () => {
    const a = mount({ nodes: STYLED_NODES });
    const b = mount({ nodes: STYLED_NODES });

    a.registry.defineStyle('critical', { stroke: 'rgb(1, 1, 1)' });
    b.registry.defineStyle('critical', { stroke: 'rgb(2, 2, 2)' });

    a.registry.clearStyles();

    b.renderNow();
    expect(b.container.querySelector('.diagram-node')?.getAttribute('style') ?? '').toContain(
      'rgb(2, 2, 2)'
    );
  });

  // -- markers (edge templates) ---------------------------------------------

  const LINKED: { nodes: NodeSpec[]; edges: EdgeSpec[] } = {
    nodes: [
      { id: 'n1', position: { x: 50, y: 100 }, size: { width: 80, height: 40 } },
      { id: 'n2', position: { x: 400, y: 100 }, size: { width: 80, height: 40 } },
    ],
    edges: [
      {
        id: 'e1',
        source: 'n1',
        target: 'n2',
        style: { arrowHead: { type: 'spike', size: 14 } } as EdgeSpec['style'],
      },
    ],
  };

  function markerExtension(id: string, path: string): Extension<'links'> {
    return {
      manifest: {
        id,
        version: '1.0.0',
        engines: { grafloria: '^1.0.0' },
        capabilities: ['links'],
      },
      activate({ capabilities }) {
        capabilities.links.registerMarker('spike', {
          render: () => ({ type: 'path', props: { d: path } }),
          tipOffset: 10,
        });
      },
    };
  }

  const SPIKE_A = 'M0,0 L10,5 L0,10 Z';
  const SPIKE_B = 'M9,9 L1,5 L9,1 Z';

  it('gives each diagram its own `spike` marker geometry', () => {
    const a = mount(LINKED);
    const b = mount(LINKED);

    hostFor(a).register(markerExtension('ext.a', SPIKE_A));
    hostFor(b).register(markerExtension('ext.b', SPIKE_B));

    a.renderNow();
    b.renderNow();

    // A registered marker is painted as an INLINE path in the link's own frame
    // (the VNode its `render` returned), not as an SVG `<marker>` def — so read
    // every path `d` and look for the exact geometry each extension contributed.
    const markerPaths = (d: DiagramInstance): string =>
      Array.from(d.container.querySelectorAll('path'))
        .map((p) => p.getAttribute('d') ?? '')
        .join('|');

    expect(markerPaths(a)).toContain(SPIKE_A);
    expect(markerPaths(a)).not.toContain(SPIKE_B);
    expect(markerPaths(b)).toContain(SPIKE_B);
    expect(markerPaths(b)).not.toContain(SPIKE_A);
  });

  // -- the single-diagram path must not move --------------------------------

  it('still reads the PROCESS-GLOBAL registry when a diagram contributed nothing', () => {
    // Backwards compatibility: an embedder who called the module-level
    // `registerShape()` at import time — which is every existing embedder and
    // all 104 demos — must still see their shape.
    const { registerShape } = jest.requireActual<typeof import('../svg/shape-registry')>(
      '../svg/shape-registry'
    );
    registerShape('badge', badgeShape('circle'));

    const a = mount({ nodes: BADGE_NODES });
    a.renderNow();

    expect(bodyTag(a)).toBe('circle');
  });

  it('lets a diagram OVERRIDE a global shape without mutating the global one', () => {
    const { registerShape, getShapeDefinition } = jest.requireActual<
      typeof import('../svg/shape-registry')
    >('../svg/shape-registry');
    registerShape('badge', badgeShape('circle'));

    const a = mount({ nodes: BADGE_NODES });
    const b = mount({ nodes: BADGE_NODES });

    hostFor(b).register(badgeExtension('ext.b', 'ellipse'));

    a.renderNow();
    b.renderNow();

    expect(bodyTag(a)).toBe('circle'); // still the global
    expect(bodyTag(b)).toBe('ellipse'); // its own override
    // …and the global definition itself was never touched.
    expect(getShapeDefinition('badge')?.outline(10, 10).el).toBe('circle');
  });
});
