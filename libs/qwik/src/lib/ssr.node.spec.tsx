/**
 * @jest-environment node
 *
 * Card 6, the Qwik half: `<GrafloriaFlow>` must RENDER ON THE SERVER.
 *
 * This file runs with no `window` and no `document`. The rule the component
 * follows (and this test enforces): every DOM touch — `createDiagram`,
 * listeners, measurement — happens inside `useVisibleTask$`, which is
 * browser-only and which Qwik never runs on the server.
 *
 * Qwik goes one step further than the React wrapper. React server-renders and
 * then HYDRATES: it walks the tree again on the client. Qwik RESUMES — the
 * server HTML carries the listener map, so the diagram below costs zero
 * component JavaScript until the user touches it.
 */
import { component$ } from '@builder.io/qwik';
import { renderToString } from '@builder.io/qwik/server';
import { renderToStaticSVG } from '@grafloria/renderer';
import type { NodeSpec } from '@grafloria/renderer';
import { GrafloriaFlow } from './grafloria-flow';
import { GrafloriaProvider, useSelection, useViewport } from './hooks';

const NODES: NodeSpec[] = [
  { id: 'a', position: { x: 100, y: 100 }, size: { width: 120, height: 60 }, label: 'A' },
  { id: 'b', position: { x: 400, y: 100 }, size: { width: 120, height: 60 }, label: 'B' },
];

/**
 * Render a fragment rather than a whole document — we only assert on markup.
 *
 * The `symbolMapper` is load-bearing. Qwik writes every QRL into the HTML as a
 * `chunk#symbol` pointer, and those chunk names are assigned by the Qwik
 * OPTIMIZER during a Vite build. Jest runs ts-jest, not Vite, so there is no
 * manifest and the real mapper cannot resolve a symbol (including Qwik's own
 * internal `_hW` task handler) — serialization throws before any markup comes
 * out. Handing back a synthetic chunk per symbol keeps the render honest about
 * everything this test actually checks: the MARKUP the server produces with no
 * DOM present. The pointers themselves are meaningless here, and verifying
 * that they resolve to real chunks requires a real build — that belongs in a
 * conformance harness, not a unit test.
 */
const html = async (node: Parameters<typeof renderToString>[0]): Promise<string> =>
  (
    await renderToString(node, {
      containerTagName: 'div',
      qwikLoader: { include: 'never' },
      symbolMapper: (symbolName) => [symbolName, `/test/${symbolName}.js`],
    })
  ).html;

describe('<GrafloriaFlow> on the server', () => {
  it('the environment really has no DOM', () => {
    expect(typeof window).toBe('undefined');
    expect(typeof document).toBe('undefined');
  });

  it('renders to a string without touching the DOM', async () => {
    expect(await html(<GrafloriaFlow nodes={NODES} />)).toContain('grafloria-flow');
  });

  it('emits the server-rendered SVG so the page is CORRECT before resume', async () => {
    const ssr = renderToStaticSVG({ nodes: NODES, width: 800, height: 600 });
    const out = await html(<GrafloriaFlow nodes={NODES} ssr={ssr} />);

    // The real diagram — nodes, labels, geometry — is in the server HTML.
    expect(out).toContain('<svg');
    expect(out).toContain('data-vnode-key="node-a"');
    expect(out).toContain('data-vnode-key="node-b"');
    expect(out).toContain('viewBox="0 0 800 600"');
  });

  it('renders inside a GrafloriaProvider on the server too', async () => {
    const out = await html(
      <GrafloriaProvider>
        <GrafloriaFlow nodes={NODES} />
      </GrafloriaProvider>
    );
    expect(out).toContain('grafloria-flow');
  });

  it('custom nodes are simply absent server-side (they are framework components)', () => {
    // Stated plainly rather than faked: the HTML layer is empty until the
    // client mounts the components into it.
    const ssr = renderToStaticSVG({
      nodes: [{ id: 'c', type: 'card', position: { x: 0, y: 0 }, custom: true }],
    });
    expect(ssr.html).toContain('grafloria-html-layer');
    expect(ssr.html).not.toContain('data-node-id="c"');
  });
});

describe('hooks outside a provider', () => {
  it('warn ONCE in development, naming the provider to add (and still render)', async () => {
    // A hook with no <GrafloriaProvider> above it falls back to a signal that never
    // fills — correct, but it used to say nothing, so a forgotten provider looked like
    // a broken toolbar.
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const Lost = component$(() => {
        useViewport();
        return <span>lost</span>;
      });
      const out = await html(<div><Lost /><Lost /></div>);
      expect(out).toContain('lost');
      const ours = warn.mock.calls.map((c) => String(c[0])).filter((m) => m.includes('useViewport()'));
      expect(ours).toHaveLength(1);
      expect(ours[0]).toContain('<GrafloriaProvider>');
      expect(ours[0]).toContain('@grafloria/qwik');
    } finally {
      warn.mockRestore();
    }
  });

  it('say nothing inside a GrafloriaProvider', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const Toolbar = component$(() => {
        useSelection();
        return <span>ok</span>;
      });
      await html(<GrafloriaProvider><Toolbar /><GrafloriaFlow nodes={NODES} /></GrafloriaProvider>);
      expect(warn.mock.calls.filter((c) => String(c[0]).includes('GrafloriaProvider'))).toEqual([]);
    } finally {
      warn.mockRestore();
    }
  });
});
