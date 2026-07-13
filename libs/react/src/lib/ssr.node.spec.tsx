/**
 * @jest-environment node
 *
 * Card 6, the React half: `<GrafloriaFlow>` must RENDER ON THE SERVER.
 *
 * This file runs with no `window` and no `document`. React Flow cannot do this
 * at all — it is `'use client'`-only, so a Next.js/Remix page that imports it
 * has to be a client component and ships an empty box until JS lands.
 *
 * The rule the component follows (and this test enforces): every DOM touch —
 * `createDiagram`, listeners, measurement — happens inside `useEffect`, which
 * React never runs on the server.
 */
import { renderToString } from 'react-dom/server';
import { renderToStaticSVG } from '@grafloria/renderer';
import type { NodeSpec } from '@grafloria/renderer';
import { GrafloriaFlow } from './grafloria-flow';
import { GrafloriaProvider } from './context';

const NODES: NodeSpec[] = [
  { id: 'a', position: { x: 100, y: 100 }, size: { width: 120, height: 60 }, label: 'A' },
  { id: 'b', position: { x: 400, y: 100 }, size: { width: 120, height: 60 }, label: 'B' },
];

describe('<GrafloriaFlow> on the server', () => {
  it('the environment really has no DOM', () => {
    expect(typeof window).toBe('undefined');
    expect(typeof document).toBe('undefined');
  });

  it('renders to a string without touching the DOM', () => {
    const html = renderToString(<GrafloriaFlow nodes={NODES} />);
    expect(html).toContain('grafloria-flow');
  });

  it('emits the server-rendered SVG so the page is CORRECT before hydration', () => {
    const ssr = renderToStaticSVG({ nodes: NODES, width: 800, height: 600 });
    const html = renderToString(<GrafloriaFlow nodes={NODES} ssr={ssr} />);

    // The real diagram — nodes, labels, geometry — is in the server HTML.
    expect(html).toContain('<svg');
    expect(html).toContain('data-vnode-key="node-a"');
    expect(html).toContain('data-vnode-key="node-b"');
    expect(html).toContain('viewBox="0 0 800 600"');
  });

  it('renders inside a GrafloriaProvider on the server too', () => {
    const html = renderToString(
      <GrafloriaProvider>
        <GrafloriaFlow nodes={NODES} />
      </GrafloriaProvider>
    );
    expect(html).toContain('grafloria-flow');
  });

  it('custom nodes are simply absent server-side (they are framework components)', () => {
    // Stated plainly rather than faked: the HTML layer is empty until hydration.
    const ssr = renderToStaticSVG({
      nodes: [{ id: 'c', type: 'card', position: { x: 0, y: 0 }, custom: true }],
    });
    expect(ssr.html).toContain('grafloria-html-layer');
    expect(ssr.html).not.toContain('data-node-id="c"');
  });
});
