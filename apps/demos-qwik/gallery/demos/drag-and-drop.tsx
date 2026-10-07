import { component$, $, sync$, useSignal } from '@builder.io/qwik';
import { GrafloriaFlow, type DiagramInstance } from '@grafloria/qwik';
import { markReady } from '../ready';

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Screen → WORLD, through the live viewport, so a drop lands under the cursor
 *  after any pan or zoom. */
function clientToWorld(api: DiagramInstance, host: HTMLElement, clientX: number, clientY: number) {
  const rect = host.getBoundingClientRect();
  const vp = (api as any).viewport;
  const zoom = vp.getZoom();
  const v = vp.getViewport();
  return { x: v.x + (clientX - rect.left) / zoom, y: v.y + (clientY - rect.top) / zoom };
}

/** Create a node of `kind` centred on the drop point; returns the node count. */
async function dropAt(api: DiagramInstance, host: HTMLElement, kind: string, clientX: number, clientY: number): Promise<string> {
  const engine = api.getEngine() as any;
  const w = clientToWorld(api, host, clientX, clientY);
  const node = await engine.addNode({ type: 'rect', position: { x: w.x - 55, y: w.y - 22 }, size: { width: 110, height: 44 } });
  node.data = { kind };
  node.setMetadata('label', kind);
  api.renderNow();
  return `${api.getModel().getNodes().length} nodes`;
}

/** The drag payload type: the kind rides on the drag itself. */
const KIND_MIME = 'application/x-grafloria-kind';

const chip = { padding: '10px', border: '1px dashed rgba(127,127,127,.5)', borderRadius: '8px', textAlign: 'center' as const,
  cursor: 'grab', userSelect: 'none' as const, font: '13px/1.2 system-ui, sans-serif' };

/** Drag a node type from the palette and drop it on the canvas: it is created
 *  at the drop point in WORLD space, so it lands under the cursor even after the
 *  camera has panned or zoomed. */
export default component$(() => {
  const canvas = useSignal<HTMLElement>();
  const readout = useSignal('');

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', height: '100vh' }}>
      <div style={{ borderRight: '1px solid rgba(127,127,127,.25)', padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {['source', 'filter', 'sink'].map((k) => (
          // sync$, not a plain onDragStart$: a lazily loaded handler can still be
          // in flight when a quick drag drops, and the drop found no kind (seen
          // in the drive script). sync$ runs in the event, like React's onDragStart.
          <div key={k} style={chip} draggable data-kind={k}
            onDragStart$={sync$((e: DragEvent, el: HTMLElement) => {
              e.dataTransfer?.setData('application/x-grafloria-kind', el.dataset.kind || '');
            })}>
            {k[0]!.toUpperCase() + k.slice(1)}
          </div>
        ))}
      </div>
      <div ref={canvas} style={{ height: '100%', position: 'relative' }}>
        <span style={{ position: 'absolute', right: '10px', top: '8px', zIndex: '5', font: '12px/1.4 ui-monospace, monospace', opacity: '0.75' }}>{readout.value}</span>
        <GrafloriaFlow defaultNodes={[]} defaultEdges={[]} onInit$={$(async (instance: DiagramInstance) => {
          const host = canvas.value!;
          // dragover/drop must preventDefault synchronously — plain DOM listeners.
          host.addEventListener('dragover', (e) => e.preventDefault());
          host.addEventListener('drop', (e) => {
            e.preventDefault();
            const kind = e.dataTransfer?.getData(KIND_MIME);
            if (kind) dropAt(instance, host, kind, e.clientX, e.clientY).then((r) => { readout.value = r; });
          });
          // Seed two nodes so the canvas is populated on load (the same drop path).
          const rect = host.getBoundingClientRect();
          readout.value = await dropAt(instance, host, 'source', rect.left + 260, rect.top + 180);
          readout.value = await dropAt(instance, host, 'filter', rect.left + 460, rect.top + 300);
          markReady();
        })} />
      </div>
    </div>
  );
});
