import { component$, $, noSerialize, useSignal, type NoSerialize } from '@builder.io/qwik';
import { GrafloriaFlow, type DiagramInstance } from '@grafloria/qwik';
import { markReady } from '../ready';

const A = { id: 'a', position: { x: 80, y: 305 }, size: { width: 120, height: 60 }, label: 'A' };
const B = { id: 'b', position: { x: 840, y: 305 }, size: { width: 120, height: 60 }, label: 'B' };
const O = { id: 'o', position: { x: 430, y: 250 }, size: { width: 140, height: 170 }, label: 'obstacle' };
const nodes = [A, B, O];
const edges = [{ id: 'e1', source: 'a', target: 'b', router: 'orthogonal' }];

/** True when every segment of the polyline is horizontal or vertical. */
const isOrthogonal = (pts: { x: number; y: number }[]) =>
  pts.every((p, i) => i === 0 || Math.abs(p.x - pts[i - 1]!.x) < 0.5 || Math.abs(p.y - pts[i - 1]!.y) < 0.5);

/** The live readout: how many points the routed wire has, and whether it is Manhattan. */
const readoutOf = (instance: DiagramInstance) => {
  const pts = instance.getModel().getLinks()[0]?.points ?? [];
  return `${pts.length} points · ${isOrthogonal(pts) ? 'orthogonal' : 'DIAGONAL'}`;
};

const BTN = { padding: '5px 12px', borderRadius: '6px', border: '1px solid rgba(127,127,127,.4)',
  background: 'transparent', color: 'inherit', cursor: 'pointer', font: 'inherit' };

/** A Manhattan/orthogonal route that dodges an obstacle: the A→B edge declares
 *  router:'orthogonal' and bends in right-angle segments around the wall O that
 *  sits squarely on the straight line between them. Remove the wall and the
 *  wire snaps straight; the readout follows live, also while you drag O. */
export default component$(() => {
  const instance = useSignal<NoSerialize<DiagramInstance>>();
  const hasObstacle = useSignal(true);
  const readout = useSignal('');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <div style={{ display: 'flex', gap: '8px', padding: '10px 24px', alignItems: 'center',
        borderBottom: '1px solid rgba(127,127,127,.25)', font: '13px system-ui, sans-serif' }}>
        <button id="toggle" style={BTN} onClick$={() => {
          const api = instance.value;
          if (!api) return;
          hasObstacle.value = !hasObstacle.value;
          api.setNodes(hasObstacle.value ? [A, B, O] : [A, B]);
          api.renderNow();
          readout.value = readoutOf(api);
        }}>{hasObstacle.value ? 'remove the obstacle' : 'restore the obstacle'}</button>
        <span id="readout" style={{ marginLeft: 'auto', font: '12px/1.4 ui-monospace, monospace', opacity: '.8' }}>{readout.value}</span>
      </div>
      <div style={{ flex: '1' }}>
        <GrafloriaFlow defaultNodes={nodes} defaultEdges={edges} onInit$={$((api: DiagramInstance) => {
          instance.value = noSerialize(api);
          // The wire re-routes DURING an obstacle drag — keep the readout in step.
          api.on('nodes:change', () => requestAnimationFrame(() => { readout.value = readoutOf(api); }));
          api.renderNow();
          readout.value = readoutOf(api);
          markReady();
        })} />
      </div>
    </div>
  );
});
