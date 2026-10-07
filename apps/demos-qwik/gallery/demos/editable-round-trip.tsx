import { component$, $, useSignal } from '@builder.io/qwik';
import { GrafloriaFlow, type DiagramInstance, type NodeSpec, type EdgeSpec } from '@grafloria/qwik';
import { importDiagram, isEditableArtifact } from '@grafloria/element';
import { markReady } from '../ready';

/** Editable round-trip: the model rides INSIDE the exported file — an SVG
 *  <metadata> block. Re-open that file and you get an editable diagram back,
 *  not a flat picture. Pane A is the original; pane B is re-opened purely from
 *  pane A's exported bytes. */
const WHEN = '2020-01-01T00:00:00Z';

const nodesA = [
  { id: 'a', label: 'Author',  position: { x: 60,  y: 90 },  size: { width: 150, height: 66 } },
  { id: 'b', label: 'Review',  position: { x: 300, y: 90 },  size: { width: 150, height: 66 } },
  { id: 'c', label: 'Publish', position: { x: 300, y: 230 }, size: { width: 150, height: 66 } },
];
const edgesA = [{ id: 'e1', source: 'a', target: 'b' }, { id: 'e2', source: 'b', target: 'c' }];

const badge = { position: 'absolute', top: '8px', left: '8px', zIndex: '2', font: '11px ui-monospace,Menlo,monospace', background: 'rgba(37,99,235,.85)', color: '#fff', padding: '2px 8px', borderRadius: '4px' } as const;

export default component$(() => {
  // Plain spec data — serializable, so ordinary signals feed pane B's controlled props.
  const nodesB = useSignal<NodeSpec[]>([]);
  const edgesB = useSignal<EdgeSpec[]>([]);
  const status = useSignal('exporting…');

  return (
    <div>
      <div style={{ fontSize: '12px', opacity: '.8', padding: '10px 24px', borderBottom: '1px solid rgba(127,127,127,.25)' }}>
        The model rides inside the exported file. Re-open it and you get an editable diagram back — {status.value}
      </div>
      <div style={{ display: 'flex', height: 'calc(100vh - 45px)' }}>
        <div style={{ flex: '1', minWidth: '0', position: 'relative', borderRight: '2px solid rgba(127,127,127,.35)' }}>
          <span style={badge}>original</span>
          <GrafloriaFlow defaultNodes={nodesA} defaultEdges={edgesA} style={{ display: 'block', height: '100%' }}
            onInit$={$(async (instance: DiagramInstance) => {
              try {
                const svg = await instance.export('svg', { embedModel: true, embedModelCreatedAt: WHEN } as never);
                const editable = isEditableArtifact(svg);
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const model = importDiagram(svg) as any;
                if (model) {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  nodesB.value = model.getNodes().map((n: any) => ({
                    id: n.id, label: n.getMetadata('label'),
                    position: { x: n.position.x, y: n.position.y },
                    size: { width: n.size.width, height: n.size.height },
                  }));
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  edgesB.value = model.getLinks().map((l: any) => ({ id: l.id, source: l.sourceNodeId, target: l.targetNodeId }));
                  status.value = `re-opened ${model.getNodes().length} nodes from an ${editable ? 'editable' : 'unrecognised'} artifact.`;
                } else {
                  status.value = 'the exported artifact carried no embedded model.';
                }
              } catch (e) {
                status.value = 'export failed: ' + (e as Error).message;
              }
              markReady();
            })} />
        </div>
        <div style={{ flex: '1', minWidth: '0', position: 'relative' }}>
          <span style={badge}>re-opened from the exported file</span>
          <GrafloriaFlow nodes={nodesB.value} edges={edgesB.value} style={{ display: 'block', height: '100%' }} />
        </div>
      </div>
    </div>
  );
});
