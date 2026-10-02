import { component$, $ } from '@builder.io/qwik';
import { GrafloriaFlow, type DiagramInstance } from '@grafloria/qwik';
import { portTypeRegistry } from '@grafloria/element';
import { markReady } from '../ready';

/** Ports coloured by data type, refusing a mismatched connection —
 *  number→number is allowed, number→string is rejected before it is made.
 *  Compatibility comes entirely from the registered types. */
const PORT_TYPES = [
  { name: 'number', color: '#2563eb', compatibleWith: ['number'] },
  { name: 'string', color: '#9333ea', compatibleWith: ['string'] },
];

const nodes = [
  { id: 'src', position: { x: 120, y: 260 }, size: { width: 130, height: 70 }, label: 'number src',
    ports: [{ id: 'out', side: 'right' as const, type: 'output', dataType: 'number', shape: { shape: 'circle', size: 13 } }] },
  { id: 'num', position: { x: 640, y: 140 }, size: { width: 130, height: 70 }, label: 'number in',
    ports: [{ id: 'nin', side: 'left' as const, type: 'input', dataType: 'number', shape: { shape: 'circle', size: 13 } }] },
  { id: 'str', position: { x: 640, y: 400 }, size: { width: 130, height: 70 }, label: 'string in',
    ports: [{ id: 'sin', side: 'left' as const, type: 'input', dataType: 'string', shape: { shape: 'circle', size: 13 } }] },
];
const edges: never[] = [];

export default component$(() => (
  <div style={{ height: '100vh' }}>
    <GrafloriaFlow defaultNodes={nodes as never} defaultEdges={edges} onInit$={$((instance: DiagramInstance) => {
      // Registered here, not at module top level (no top-level side effects in a
      // Qwik module); the repaint picks the colours up.
      portTypeRegistry.registerAll(PORT_TYPES as never);
      instance.getEngine().setInteractionConfig({ portVisibility: 'always' as never });
      instance.renderNow();
      markReady();
    })} />
  </div>
));
