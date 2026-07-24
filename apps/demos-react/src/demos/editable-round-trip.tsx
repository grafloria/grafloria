import { useState } from 'react';
import { GrafloriaFlow } from '@grafloria/react';
import type { DiagramInstance } from '@grafloria/react';
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

const badge = { position: 'absolute', top: 8, left: 8, zIndex: 2, font: '11px ui-monospace,Menlo,monospace', background: 'rgba(37,99,235,.85)', color: '#fff', padding: '2px 8px', borderRadius: 4 } as const;

export default function EditableRoundTripDemo() {
  const [nodesB, setNodesB] = useState<unknown[]>([]);
  const [edgesB, setEdgesB] = useState<unknown[]>([]);
  const [status, setStatus] = useState('exporting…');

  const onInitA = async (instance: DiagramInstance) => {
    try {
      const svg = await instance.export('svg', { embedModel: true, embedModelCreatedAt: WHEN } as never);
      const editable = isEditableArtifact(svg);
      const model = importDiagram(svg) as any;
      if (model) {
        setNodesB(model.getNodes().map((n: any) => ({
          id: n.id, label: n.getMetadata('label'),
          position: { x: n.position.x, y: n.position.y },
          size: { width: n.size.width, height: n.size.height },
        })));
        setEdgesB(model.getLinks().map((l: any) => ({ id: l.id, source: l.sourceNodeId, target: l.targetNodeId })));
        setStatus(`re-opened ${model.getNodes().length} nodes from an ${editable ? 'editable' : 'unrecognised'} artifact.`);
      } else {
        setStatus('the exported artifact carried no embedded model.');
      }
    } catch (e) {
      setStatus('export failed: ' + (e as Error).message);
    }
    markReady();
  };

  return (
    <div>
      <div style={{ fontSize: 12, opacity: .8, padding: '10px 24px', borderBottom: '1px solid rgba(127,127,127,.25)' }}>
        The model rides inside the exported file. Re-open it and you get an editable diagram back — {status}
      </div>
      <div style={{ display: 'flex', height: 'calc(100vh - 45px)' }}>
        <div style={{ flex: 1, minWidth: 0, position: 'relative', borderRight: '2px solid rgba(127,127,127,.35)' }}>
          <span style={badge}>original</span>
          <GrafloriaFlow defaultNodes={nodesA} defaultEdges={edgesA} style={{ display: 'block', height: '100%' }} onInit={onInitA} />
        </div>
        <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
          <span style={badge}>re-opened from the exported file</span>
          <GrafloriaFlow nodes={nodesB as never} edges={edgesB as never} style={{ display: 'block', height: '100%' }} />
        </div>
      </div>
    </div>
  );
}
