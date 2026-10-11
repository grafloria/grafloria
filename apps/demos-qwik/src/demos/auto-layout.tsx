import { component$, useSignal } from '@builder.io/qwik';
import { GrafloriaFlow, type EdgeSpec, type NodeSpec } from '@grafloria/qwik';

/**
 * Declarative auto-layout: every node starts at the origin and the `layout`
 * prop arranges the tree. The wrapper tracks the prop by VALUE, so an inline
 * object literal does not re-run the layout on every render — and a relayout
 * never fights a drag in progress.
 */
const layoutFor = (direction: 'TB' | 'LR') => ({ name: 'dagre', options: { direction, nodeSpacing: 40, rankSpacing: 90 } });

const nodes: NodeSpec[] = ['root', 'a', 'b', 'a1', 'a2', 'b1', 'b2'].map((id) => ({
  id,
  position: { x: 0, y: 0 },
  size: { width: 130, height: 50 },
  label: id,
}));

const edges: EdgeSpec[] = [
  { id: 'e1', source: 'root', target: 'a', sourceHandle: 'bottom', targetHandle: 'top' },
  { id: 'e2', source: 'root', target: 'b', sourceHandle: 'bottom', targetHandle: 'top' },
  { id: 'e3', source: 'a', target: 'a1', sourceHandle: 'bottom', targetHandle: 'top' },
  { id: 'e4', source: 'a', target: 'a2', sourceHandle: 'bottom', targetHandle: 'top' },
  { id: 'e5', source: 'b', target: 'b1', sourceHandle: 'bottom', targetHandle: 'top' },
  { id: 'e6', source: 'b', target: 'b2', sourceHandle: 'bottom', targetHandle: 'top' },
];

export default component$(() => {
  // A live layout change re-arranges the SAME canvas (the prop is tracked by value).
  const direction = useSignal<'TB' | 'LR'>('TB');
  return (
    <>
      <div class="toolbar">
        <button type="button" id="toggle-direction" onClick$={() => (direction.value = direction.value === 'TB' ? 'LR' : 'TB')}>
          Direction: {direction.value}
        </button>
      </div>
      <div class="canvas">
        <GrafloriaFlow defaultNodes={nodes} defaultEdges={edges} layout={layoutFor(direction.value)} plugins={{ controls: true }} />
      </div>
    </>
  );
});
