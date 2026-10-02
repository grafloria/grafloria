import { component$, $, noSerialize, useSignal, useVisibleTask$, type NoSerialize } from '@builder.io/qwik';
import { GrafloriaFlow, type DiagramInstance } from '@grafloria/qwik';
import { createViewportPortal } from '@grafloria/element';
import { markReady } from '../ready';

// An edge toolbar anchored to the PATH, built the way the package documents:
// createViewportPortal() drops your own DOM into the world layer that tracks the
// camera. The toolbar sits at the edge's midpoint and re-anchors when the route
// changes — the model's stale `segments` would lie, so we read the LIVE points.
const nodes = [
  { id: 'a', position: { x: 120, y: 140 }, size: { width: 130, height: 60 }, label: 'A' },
  { id: 'b', position: { x: 660, y: 140 }, size: { width: 130, height: 60 }, label: 'B' },
];
const edges = [{ id: 'e1', source: 'a', target: 'b', type: 'smooth' as const }];

type Pt = { x: number; y: number };
const midpoint = (pts: Pt[]) => {
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) total += Math.hypot(pts[i + 1]!.x - pts[i]!.x, pts[i + 1]!.y - pts[i]!.y);
  let half = total / 2;
  for (let i = 0; i < pts.length - 1; i++) {
    const seg = Math.hypot(pts[i + 1]!.x - pts[i]!.x, pts[i + 1]!.y - pts[i]!.y);
    if (half <= seg) { const t = half / (seg || 1); return { x: pts[i]!.x + (pts[i + 1]!.x - pts[i]!.x) * t, y: pts[i]!.y + (pts[i + 1]!.y - pts[i]!.y) * t }; }
    half -= seg;
  }
  return pts[0]!;
};

/** Mount the toolbar into the canvas' HTML layer; returns its teardown. Plain
 *  DOM, so it lives at module level (a Qwik `$` closure may call it). */
function mountToolbar(htmlLayer: HTMLElement, instance: DiagramInstance): () => void {
  const model = instance.getModel();
  const portal = createViewportPortal(htmlLayer, { className: 'edge-tb' });
  portal.element.style.cssText += ';display:flex;gap:4px;transform:translate(-50%,-50%);background:#1f2937;border-radius:8px;padding:4px 6px;box-shadow:0 4px 14px rgba(0,0,0,.3);';
  portal.element.innerHTML =
    '<button title="toggle dashed" style="border:0;background:#374151;color:#fff;border-radius:5px;width:26px;height:26px;cursor:pointer;font:13px system-ui">✎</button>' +
    '<button title="delete edge" style="border:0;background:#374151;color:#fff;border-radius:5px;width:26px;height:26px;cursor:pointer;font:13px system-ui">🗑</button>';

  let raf = 0;
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(raf);
    portal.dispose();
  };
  const buttons = portal.element.querySelectorAll('button');
  buttons[0]!.addEventListener('click', () => {
    const link = model.getLink('e1') as unknown as { style?: { strokeDasharray?: string }; updateStyle(s: object): void } | undefined;
    if (!link) return;
    const dashed = link.style?.strokeDasharray;
    link.updateStyle({ strokeDasharray: dashed ? undefined : '8 5' });
    instance.renderNow();
  });
  buttons[1]!.addEventListener('click', async () => {
    if (!model.getLink('e1')) return;
    await instance.getEngine().removeLink('e1');
    dispose();
    instance.renderNow();
  });

  // Track the route every frame; tolerate the link vanishing underneath
  // (select it and press Delete and the engine removes it without this toolbar).
  const reanchor = () => {
    const link = model.getLink('e1') as unknown as { points: Pt[] } | undefined;
    if (!link) return;
    const m = midpoint(link.points);
    portal.setPosition(m.x, m.y);
  };
  const loop = () => { reanchor(); raf = requestAnimationFrame(loop); };
  loop();
  return dispose;
}

/** A floating toolbar anchored to the edge via createViewportPortal() — sits at
 *  the path midpoint and re-anchors every frame when the route moves. */
export default component$(() => {
  const root = useSignal<HTMLDivElement>();
  const teardown = useSignal<NoSerialize<() => void>>();
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ cleanup }) => cleanup(() => teardown.value?.()));

  return (
    <div ref={root} style={{ height: '100vh' }}>
      <GrafloriaFlow defaultNodes={nodes} defaultEdges={edges} onInit$={$((instance: DiagramInstance) => {
        const htmlLayer = root.value?.querySelector('.grafloria-html-layer') as HTMLElement | null;
        if (!htmlLayer) { markReady(); return; }
        teardown.value = noSerialize(mountToolbar(htmlLayer, instance));

        // Boot the edge selected so its toolbar reads as "active".
        const model = instance.getModel() as unknown as { selectLink?(l: unknown): void; getLink(id: string): unknown };
        const link = model.getLink('e1') as { setSelected?(v: boolean): void } | undefined;
        if (link) (model.selectLink ? model.selectLink(link) : link.setSelected?.(true));
        instance.renderNow();
        markReady();
      })} />
    </div>
  );
});
