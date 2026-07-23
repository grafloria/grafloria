import { useEffect, useRef } from 'react';
import { GrafloriaFlow } from '@grafloria/react';
import type { DiagramInstance } from '@grafloria/react';
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

const midpoint = (pts: { x: number; y: number }[]) => {
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) total += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
  let half = total / 2;
  for (let i = 0; i < pts.length - 1; i++) {
    const seg = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
    if (half <= seg) { const t = half / (seg || 1); return { x: pts[i].x + (pts[i + 1].x - pts[i].x) * t, y: pts[i].y + (pts[i + 1].y - pts[i].y) * t }; }
    half -= seg;
  }
  return pts[0];
};

/** A floating toolbar anchored to the edge via createViewportPortal() — sits at
 *  the path midpoint and re-anchors every frame when the route moves. */
export default function EdgeToolbarDemo() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const cleanup = useRef<(() => void) | null>(null);

  useEffect(() => () => cleanup.current?.(), []);

  const onInit = (instance: DiagramInstance) => {
    const model = instance.getModel();
    const htmlLayer = rootRef.current?.querySelector('.grafloria-html-layer') as HTMLElement | null;
    if (!htmlLayer) { markReady(); return; }

    const portal = createViewportPortal(htmlLayer, { className: 'edge-tb' });
    portal.element.style.cssText += ';display:flex;gap:4px;transform:translate(-50%,-50%);background:#1f2937;border-radius:8px;padding:4px 6px;box-shadow:0 4px 14px rgba(0,0,0,.3);';
    portal.element.innerHTML =
      '<button title="toggle dashed" style="border:0;background:#374151;color:#fff;border-radius:5px;width:26px;height:26px;cursor:pointer;font:13px system-ui">✎</button>' +
      '<button title="delete edge" style="border:0;background:#374151;color:#fff;border-radius:5px;width:26px;height:26px;cursor:pointer;font:13px system-ui">🗑</button>';

    let raf = 0;
    const buttons = portal.element.querySelectorAll('button');
    const editBtn = buttons[0] as HTMLButtonElement;
    const deleteBtn = buttons[1] as HTMLButtonElement;
    editBtn.addEventListener('click', () => {
      const link = model.getLink('e1') as any;
      if (!link) return;
      const dashed = link.style?.strokeDasharray;
      link.updateStyle({ strokeDasharray: dashed ? undefined : '8 5' });
      instance.renderNow();
    });
    deleteBtn.addEventListener('click', async () => {
      if (!model.getLink('e1')) return;
      await instance.getEngine().removeLink('e1');
      cancelAnimationFrame(raf);
      portal.dispose();
      instance.renderNow();
    });

    const reanchor = () => {
      const link = model.getLink('e1') as any;
      if (!link) return;
      const m = midpoint(link.points);
      portal.setPosition(m.x, m.y);
    };
    const loop = () => { reanchor(); raf = requestAnimationFrame(loop); };
    loop();

    // Boot the edge selected so its toolbar reads as "active".
    const link = model.getLink('e1') as any;
    if (link) ((model as any).selectLink ? (model as any).selectLink(link) : link.setSelected?.(true));
    instance.renderNow();

    cleanup.current = () => { cancelAnimationFrame(raf); portal.dispose(); };
    markReady();
  };

  return (
    <div ref={rootRef} style={{ height: '100vh' }}>
      <GrafloriaFlow defaultNodes={nodes} defaultEdges={edges} onInit={onInit} />
    </div>
  );
}
