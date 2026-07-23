import { GrafloriaFlow } from '@grafloria/react';
import type { DiagramInstance } from '@grafloria/react';
import { markReady } from '../ready';

const SHAPES = [
  { id: 'circle',   spec: { shape: 'circle', size: 16 } },
  { id: 'square',   spec: { shape: 'square', size: 16 } },
  { id: 'diamond',  spec: { shape: 'diamond', size: 16 } },
  { id: 'triangle', spec: { shape: 'triangle', size: 16 } },
  { id: 'path',     spec: { shape: 'path', size: 18, path: 'M0,-9 L9,0 L0,9 L-9,0 Z M0,-4 L4,0 L0,4 L-4,0 Z' } },
];

const nodes = SHAPES.map((s, i) => ({
  id: s.id, position: { x: 120 + i * 170, y: 240 }, size: { width: 120, height: 70 }, label: s.id,
  ports: [{ id: s.id + '-p', side: 'right' as const, shape: s.spec }],
}));
const edges: never[] = [];

/** Five ports, five different SVG primitives — including an author-supplied
 *  custom path. Always-visible via the interaction config. */
export default function PortShapesDemo() {
  const onInit = (instance: DiagramInstance) => {
    // 'always' is PortVisibilityStrategy.ALWAYS; the enum isn't in the public
    // barrel yet, so cast the literal (the lib's own config panel does the same).
    instance.getEngine().setInteractionConfig({ portVisibility: 'always' as never });
    instance.renderNow();
    markReady();
  };
  return (
    <div style={{ height: '100vh' }}>
      <GrafloriaFlow defaultNodes={nodes} defaultEdges={edges} onInit={onInit} />
    </div>
  );
}
