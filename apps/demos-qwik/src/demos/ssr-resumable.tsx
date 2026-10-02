import { component$, useSignal, useTask$ } from '@builder.io/qwik';
import {
  GrafloriaFlow,
  renderToStaticSVG,
  type EdgeSpec,
  type HydrationSnapshot,
  type NodeSpec,
} from '@grafloria/qwik';

/**
 * The reason the Qwik binding exists.
 *
 * `renderToStaticSVG()` runs the REAL engine and the REAL SVG renderer in Node,
 * with no DOM. `useTask$` executes on the server during SSR, so the markup
 * below is in the first byte of the response — view source and the diagram is
 * already there, laid out, before any JavaScript runs.
 *
 * The result (`html` + `snapshot`) is plain JSON, so Qwik serializes it into
 * the resumability state and the client never recomputes it. When the visible
 * task finally runs it calls `createDiagram({ hydrate: snapshot })`, which
 * ADOPTS the DOM already on the page instead of rebuilding it: no flash, no
 * re-layout, and — because Qwik resumes rather than hydrates — no component
 * JavaScript at all until you touch the canvas.
 */
const nodes: NodeSpec[] = [
  { id: 'edge-cdn', position: { x: 40, y: 140 }, size: { width: 170, height: 68 }, label: 'CDN' },
  { id: 'ssr', position: { x: 300, y: 60 }, size: { width: 190, height: 68 }, label: 'SSR render' },
  { id: 'resume', position: { x: 300, y: 220 }, size: { width: 190, height: 68 }, label: 'Resume' },
  { id: 'interactive', position: { x: 590, y: 140 }, size: { width: 190, height: 68 }, label: 'Interactive' },
];

const edges: EdgeSpec[] = [
  { id: 'e1', source: 'edge-cdn', target: 'ssr', sourceHandle: 'right', targetHandle: 'left' },
  { id: 'e2', source: 'ssr', target: 'resume', sourceHandle: 'bottom', targetHandle: 'top' },
  { id: 'e3', source: 'resume', target: 'interactive', sourceHandle: 'right', targetHandle: 'left' },
];

export default component$(() => {
  const html = useSignal('');
  const css = useSignal('');
  const snapshot = useSignal<HydrationSnapshot>();

  useTask$(() => {
    const result = renderToStaticSVG({ nodes, edges, width: 900, height: 420, fitView: true });
    html.value = result.html;
    css.value = result.css;
    snapshot.value = result.snapshot;
  });

  return (
    <>
      {/* The server's stylesheet. The client re-injects identical content under
          the same ids, so nothing repaints on resume. */}
      <style dangerouslySetInnerHTML={css.value} />
      <GrafloriaFlow
        defaultNodes={nodes}
        defaultEdges={edges}
        ssr={snapshot.value ? { html: html.value, snapshot: snapshot.value } : undefined}
      />
    </>
  );
});
