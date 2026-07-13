import { DiagramEngine } from '@grafloria/engine';
import { renderToStaticSVG } from './render-to-static';
import { serializeVNode } from '../export/vnode-serializer';

// The SSR snapshot is the unified serializer in DOM fidelity (see SerializeFidelity).
const serializeVNodeToSVG = (vnode: any, options: any = {}) =>
  serializeVNode(vnode, { ...options, fidelity: 'dom' as const });
import { createDiagram } from '../instance/create-diagram';
import { applyEdges, applyNodes } from '../instance/model-input';
import type { EdgeSpec, NodeSpec } from '../instance/model-input';
import { SVGRenderer } from '../svg/svg-renderer';
import { VNodePatcher } from '../vnode/patch';
import { DARK_THEME } from '../themes';

const WIDTH = 800;
const HEIGHT = 600;

const NODES: NodeSpec[] = [
  { id: 'a', position: { x: 80, y: 90 }, size: { width: 140, height: 60 }, label: 'Start' },
  { id: 'b', position: { x: 420, y: 260 }, size: { width: 140, height: 60 }, label: 'End' },
];
const EDGES: EdgeSpec[] = [
  { id: 'e1', source: 'a', target: 'b', type: 'orthogonal', label: 'next' },
];

function makeContainer(): HTMLElement {
  const el = document.createElement('div');
  el.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: WIDTH, height: HEIGHT, right: WIDTH, bottom: HEIGHT }) as DOMRect;
  document.body.appendChild(el);
  return el;
}

/** Structural DOM comparison: tag, attributes, text and child order. */
function describeDom(node: Node): unknown {
  if (node.nodeType === Node.TEXT_NODE) return { text: node.nodeValue };
  const el = node as Element;
  const attrs: Record<string, string> = {};
  for (const attr of Array.from(el.attributes)) attrs[attr.name] = attr.value;
  return {
    tag: el.tagName.toLowerCase(),
    attrs,
    children: Array.from(el.childNodes).map(describeDom),
  };
}

/** Parse an SVG string into a live element (jsdom has no SVG parser shortcuts). */
function parseSvg(svg: string): Element {
  const host = document.createElement('div');
  host.innerHTML = svg;
  return host.firstElementChild!;
}

describe('SSR — renderToStaticSVG', () => {
  // The "it runs with NO DOM at all" proof lives in render-to-static.node.spec.ts,
  // which Jest runs under the `node` environment — a far stronger statement than
  // deleting `document` out from under jsdom.

  it('is deterministic: the same spec renders byte-identically twice', () => {
    const first = renderToStaticSVG({ nodes: NODES, edges: EDGES });
    const second = renderToStaticSVG({ nodes: NODES, edges: EDGES });
    expect(first.svg).toBe(second.svg);
    expect(first.snapshot).toEqual(second.snapshot);
  });

  it('emits the layer skeleton the client mounts, plus a snapshot', () => {
    const { html, snapshot } = renderToStaticSVG({
      nodes: NODES,
      width: 640,
      height: 480,
      zoom: 1.5,
      instanceId: 'grafloria-x',
    });

    expect(html).toContain('class="grafloria-diagram-root"');
    expect(html).toContain('class="grafloria-svg-layer"');
    expect(html).toContain('class="grafloria-html-layer"');
    expect(snapshot).toEqual({
      instanceId: 'grafloria-x',
      width: 640,
      height: 480,
      zoom: 1.5,
      viewport: { x: 0, y: 0 },
    });
  });

  it('fitView on the server frames the content', () => {
    const { snapshot } = renderToStaticSVG({ nodes: NODES, fitView: true });
    expect(snapshot.zoom).toBeGreaterThan(0);
    expect(snapshot.viewport.x).not.toBe(0);
  });

  it('returns the stylesheet (the theme lives in CSS variables, not in the SVG)', () => {
    const light = renderToStaticSVG({ nodes: NODES });
    const dark = renderToStaticSVG({ nodes: NODES, theme: DARK_THEME });

    expect(light.svg).toBe(dark.svg); // geometry is theme-independent
    expect(light.css).not.toBe(dark.css); // the theme is entirely in the CSS
  });

  it('standalone adds an xmlns so the string is a valid .svg file', () => {
    const { svg } = renderToStaticSVG({ nodes: NODES, standalone: true });
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
  });
});

describe('the serializer agrees with the patcher', () => {
  // If these two disagree by even one attribute, hydration would rewrite the DOM
  // — which is exactly the flash we are eliminating.
  it('serializeVNodeToSVG(vnode) is structurally identical to the DOM the patcher builds', () => {
    const engine = new DiagramEngine();
    const model = engine.createDiagram('t');
    applyNodes(model, NODES);
    applyEdges(model, EDGES);

    const renderer = new SVGRenderer(engine, { instanceId: 'grafloria-cmp' });
    const vnode = renderer.render({ x: 0, y: 0, width: WIDTH, height: HEIGHT }, 1);

    const fromString = parseSvg(serializeVNodeToSVG(vnode));

    const container = document.createElement('div');
    new VNodePatcher({ document }).reconcile(container, vnode);
    const fromPatcher = container.firstElementChild!;

    expect(describeDom(fromString)).toEqual(describeDom(fromPatcher));

    renderer.dispose();
    engine.destroy();
  });
});

describe('hydration — no flash, no re-layout', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = makeContainer();
  });
  afterEach(() => container.remove());

  it('the client VNode tree matches the server snapshot exactly', () => {
    const server = renderToStaticSVG({
      nodes: NODES,
      edges: EDGES,
      width: WIDTH,
      height: HEIGHT,
      instanceId: 'grafloria-h1',
    });

    container.innerHTML = server.html;
    const serverSvg = container.querySelector('svg')!;
    const serverDom = describeDom(serverSvg);

    const diagram = createDiagram(container, {
      nodes: NODES,
      edges: EDGES,
      hydrate: server.snapshot,
    });

    // The DOM after hydration must be IDENTICAL to what the server sent.
    expect(describeDom(container.querySelector('svg')!)).toEqual(serverDom);
    diagram.dispose();
  });

  it('hydration creates and removes ZERO DOM nodes (the no-flash proof)', () => {
    const server = renderToStaticSVG({
      nodes: NODES,
      edges: EDGES,
      width: WIDTH,
      height: HEIGHT,
      instanceId: 'grafloria-h2',
    });
    container.innerHTML = server.html;

    const serverSvgElement = container.querySelector('svg');
    const serverRoot = container.querySelector('.grafloria-diagram-root');

    const diagram = createDiagram(container, {
      nodes: NODES,
      edges: EDGES,
      hydrate: server.snapshot,
    });

    expect(diagram.patcher.stats.created).toBe(0);
    expect(diagram.patcher.stats.removed).toBe(0);

    // The very DOM objects the server sent are still the live ones — nothing was
    // torn down and rebuilt underneath the user.
    expect(container.querySelector('svg')).toBe(serverSvgElement);
    expect(container.querySelector('.grafloria-diagram-root')).toBe(serverRoot);

    diagram.dispose();
  });

  it('the hydrated instance is INTERACTIVE and patches in place afterwards', () => {
    const server = renderToStaticSVG({
      nodes: NODES,
      edges: EDGES,
      width: WIDTH,
      height: HEIGHT,
      instanceId: 'grafloria-h3',
    });
    container.innerHTML = server.html;

    const diagram = createDiagram(container, {
      nodes: NODES,
      edges: EDGES,
      hydrate: server.snapshot,
    });

    const svgBefore = container.querySelector('svg');
    const nodeABefore = container.querySelector('[data-vnode-key="node-a"]');

    diagram.setNodes([...NODES, { id: 'c', position: { x: 600, y: 60 } }]);
    diagram.renderNow();

    // Patched, not remounted: the same <svg> and the same untouched node element.
    expect(container.querySelector('svg')).toBe(svgBefore);
    expect(container.querySelector('[data-vnode-key="node-a"]')).toBe(nodeABefore);
    expect(container.querySelector('[data-vnode-key="node-c"]')).toBeTruthy();

    diagram.dispose();
  });

  it('reuses the server camera, so the first client frame does not re-layout', () => {
    const server = renderToStaticSVG({
      nodes: NODES,
      width: WIDTH,
      height: HEIGHT,
      fitView: true,
      instanceId: 'grafloria-h4',
    });
    container.innerHTML = server.html;
    const serverViewBox = container.querySelector('svg')!.getAttribute('viewBox');

    const diagram = createDiagram(container, { nodes: NODES, hydrate: server.snapshot });

    expect(diagram.viewport.getZoom()).toBe(server.snapshot.zoom);
    expect(container.querySelector('svg')!.getAttribute('viewBox')).toBe(serverViewBox);

    diagram.dispose();
  });

  it('falls back to a clean mount when the server markup is missing', () => {
    const { snapshot } = renderToStaticSVG({ nodes: NODES, width: WIDTH, height: HEIGHT });

    // Nothing in the container: hydration must still produce a working diagram.
    const diagram = createDiagram(container, { nodes: NODES, hydrate: snapshot });

    expect(container.querySelector('[data-vnode-key="node-a"]')).toBeTruthy();
    diagram.dispose();
  });
});
