import { useEffect } from 'react';
import { GrafloriaFlow } from '@grafloria/react';
import type { DiagramInstance } from '@grafloria/react';
import { registerConnectionValidator, clearConnectionValidators } from '@grafloria/element';
import { markReady } from '../ready';

/** A registered validator vetoes an invalid connection before it is made:
 *  output→output is rejected (with a reason), output→input is allowed. */
const nodes = [
  { id: 'a', position: { x: 120, y: 260 }, size: { width: 120, height: 70 }, label: 'A (out)',
    ports: [{ id: 'ao', side: 'right' as const, type: 'output', shape: { shape: 'triangle', size: 13 } }] },
  { id: 'b', position: { x: 640, y: 140 }, size: { width: 120, height: 70 }, label: 'B (in)',
    ports: [{ id: 'bi', side: 'left' as const, type: 'input', shape: { shape: 'circle', size: 13 } }] },
  { id: 'c', position: { x: 640, y: 400 }, size: { width: 120, height: 70 }, label: 'C (out)',
    ports: [{ id: 'co', side: 'left' as const, type: 'output', shape: { shape: 'triangle', size: 13 } }] },
];
const edges: never[] = [];

export default function ConnectionValidationDemo() {
  useEffect(() => {
    clearConnectionValidators();
    const dispose = registerConnectionValidator(({ sourcePort, targetPort }: any) => {
      if (!sourcePort || !targetPort) return true;
      if (sourcePort.type === 'output' && targetPort.type === 'output') return 'an output cannot feed another output';
      return true;
    });
    return () => { (dispose as () => void)?.(); clearConnectionValidators(); };
  }, []);

  const onInit = (instance: DiagramInstance) => {
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
