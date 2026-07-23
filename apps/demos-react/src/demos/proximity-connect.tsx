import { useRef } from 'react';
import type { DiagramInstance } from '@grafloria/react';
import { GrafloriaFlow } from '@grafloria/react';
import { SnapController } from '@grafloria/element';
import { markReady } from '../ready';

const nodes = [
  { id: 'a', position: { x: 150, y: 150 }, size: { width: 150, height: 80 }, label: 'drag me →' },
  { id: 'b', position: { x: 600, y: 150 }, size: { width: 150, height: 80 }, label: 'B' },
];
const edges: any[] = [];

/** Drag a node near another and a dashed wire proposes itself LIVE, then
 *  commits on drop — SnapController.findProximityConnection driven from host
 *  glue on node:moved, exactly like React Flow's onNodeDrag. */
export default function ProximityConnectDemo() {
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const onInit = (instance: DiagramInstance) => {
    const host = wrapRef.current;
    if (!host) { markReady(); return; }
    const model = instance.getModel() as any;
    const engine = instance.getEngine() as any;
    const snap = new SnapController();
    const viewport = (instance as any).viewport;

    const NS = 'http://www.w3.org/2000/svg';
    const overlay = document.createElementNS(NS, 'svg');
    overlay.setAttribute('style', 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible;z-index:5');
    const wire = document.createElementNS(NS, 'line');
    wire.setAttribute('class', 'proximity-temp-wire');
    wire.setAttribute('stroke', '#f59e0b');
    wire.setAttribute('stroke-width', '2');
    wire.setAttribute('stroke-dasharray', '7 5');
    wire.setAttribute('visibility', 'hidden');
    overlay.appendChild(wire);
    host.appendChild(overlay);
    const hideWire = () => wire.setAttribute('visibility', 'hidden');

    const paintProposal = (movedId: string) => {
      const cand = snap.findProximityConnection(engine, movedId);
      if (!cand) { hideWire(); return; }
      const rect = host.getBoundingClientRect();
      const end = (nodeId: string, port: any) => {
        const n = model.getNode(nodeId);
        const w = port.getAbsolutePosition(n.getBoundingBox());
        const c = viewport.worldToClient(w.x, w.y, rect);
        return { x: c.x - rect.left, y: c.y - rect.top };
      };
      const s = end(cand.sourceNodeId, cand.sourcePort);
      const t = end(cand.targetNodeId, cand.targetPort);
      wire.setAttribute('x1', String(s.x)); wire.setAttribute('y1', String(s.y));
      wire.setAttribute('x2', String(t.x)); wire.setAttribute('y2', String(t.y));
      wire.setAttribute('visibility', 'visible');
    };

    model.on('node:moved', ({ nodeId }: any) => paintProposal(nodeId));
    instance.on('nodes:change', () => {
      for (const n of model.getNodes()) {
        const cand = snap.findProximityConnection(engine, n.id);
        if (cand) {
          engine.commandManager.execute(snap.buildProximityLinkCommand(cand));
          break;
        }
      }
      hideWire();
    });
    markReady();
  };

  return (
    <div ref={wrapRef} style={{ height: '100vh', position: 'relative' }}>
      <GrafloriaFlow defaultNodes={nodes} defaultEdges={edges} onInit={onInit} />
    </div>
  );
}
