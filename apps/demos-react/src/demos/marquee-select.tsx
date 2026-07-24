import { useRef } from 'react';
import type { DiagramInstance } from '@grafloria/react';
import { GrafloriaFlow } from '@grafloria/react';
import { registerTool } from '@grafloria/element';
import { markReady } from '../ready';

const nodes: any[] = [
  { id: 'n1', position: { x: 120, y: 110 }, size: { width: 120, height: 60 }, label: 'n1' },
  { id: 'n2', position: { x: 300, y: 110 }, size: { width: 120, height: 60 }, label: 'n2' },
  { id: 'n3', position: { x: 120, y: 230 }, size: { width: 120, height: 60 }, label: 'n3' },
  { id: 'n4', position: { x: 560, y: 120 }, size: { width: 120, height: 60 }, label: 'n4' },
  { id: 'n5', position: { x: 560, y: 300 }, size: { width: 120, height: 60 }, label: 'n5' },
  { id: 'n6', position: { x: 330, y: 410 }, size: { width: 120, height: 60 }, label: 'n6' },
];
const edges: any[] = [
  { id: 'e1', source: 'n1', target: 'n2' },
  { id: 'e2', source: 'n1', target: 'n3' },
  { id: 'e3', source: 'n4', target: 'n5' },
];

function worldBounds(node: any) {
  const p = typeof node.getWorldPosition === 'function' ? node.getWorldPosition() : node.position;
  return { x: p.x, y: p.y, w: node.size.width, h: node.size.height };
}
function nodesInRect(model: any, rect: any) {
  const x1 = Math.min(rect.ax, rect.bx), y1 = Math.min(rect.ay, rect.by);
  const x2 = Math.max(rect.ax, rect.bx), y2 = Math.max(rect.ay, rect.by);
  return model.getNodes().filter((n: any) => {
    const b = worldBounds(n);
    return b.x >= x1 && b.y >= y1 && b.x + b.w <= x2 && b.y + b.h <= y2;
  });
}

/** Marquee (rubber-band) box-selection — the gesture the binder leaves to the
 *  host — assembled from the public registerTool + viewport + selection seams.
 *  Shift adds to the selection. */
export default function MarqueeSelectDemo() {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const dispose = useRef<(() => void) | undefined>();

  const onInit = (instance: DiagramInstance) => {
    const host = wrapRef.current!;
    const api = instance as any;
    const model = api.getModel();
    host.style.position = host.style.position || 'relative';

    let overlay: HTMLDivElement | null = null;
    let start: any = null;
    let baseSelection = new Set<string>();

    const showBox = (aScreen: any, bScreen: any) => {
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'marquee-box';
        overlay.style.cssText = 'position:absolute;pointer-events:none;z-index:20;border:1px dashed #3b82f6;background:rgba(59,130,246,.15);border-radius:2px;';
        host.appendChild(overlay);
      }
      const x = Math.min(aScreen.x, bScreen.x), y = Math.min(aScreen.y, bScreen.y);
      overlay.style.left = x + 'px'; overlay.style.top = y + 'px';
      overlay.style.width = Math.abs(bScreen.x - aScreen.x) + 'px';
      overlay.style.height = Math.abs(bScreen.y - aScreen.y) + 'px';
    };
    const clearBox = () => { overlay?.remove(); overlay = null; };
    const applySelection = (worldRect: any, additive: boolean) => {
      const hit = new Set(nodesInRect(model, worldRect).map((n: any) => n.id));
      for (const n of model.getNodes()) n.setSelected(hit.has(n.id) || (additive && baseSelection.has(n.id)));
      api.renderNow();
    };

    dispose.current = registerTool({
      id: 'marquee',
      priority: 1,
      hitTest: (_ev: any, hit: any) => !!hit.empty,
      onPointerDown: (ev: any) => {
        start = { world: { ...ev.world }, screen: { ...ev.screen } };
        const additive = ev.modifiers.shift || ev.modifiers.ctrl || ev.modifiers.meta;
        baseSelection = new Set(model.getSelectedNodes().map((n: any) => n.id));
        if (!additive) { model.clearSelection(); baseSelection.clear(); }
      },
      onPointerMove: (ev: any) => {
        if (!start) return;
        showBox(start.screen, ev.screen);
        const additive = ev.modifiers.shift || ev.modifiers.ctrl || ev.modifiers.meta;
        applySelection({ ax: start.world.x, ay: start.world.y, bx: ev.world.x, by: ev.world.y }, additive);
      },
      onPointerUp: (ev: any) => {
        if (start) {
          const additive = ev.modifiers.shift || ev.modifiers.ctrl || ev.modifiers.meta;
          applySelection({ ax: start.world.x, ay: start.world.y, bx: ev.world.x, by: ev.world.y }, additive);
        }
        start = null; clearBox();
      },
      onCancel: () => { start = null; clearBox(); },
    } as any) as unknown as () => void;
    markReady();
  };

  return (
    <div ref={wrapRef} style={{ height: '100vh', position: 'relative' }}>
      <GrafloriaFlow defaultNodes={nodes} defaultEdges={edges} onInit={onInit} />
    </div>
  );
}
