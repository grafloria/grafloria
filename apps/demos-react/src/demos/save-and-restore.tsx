import { useRef } from 'react';
import type { DiagramInstance } from '@grafloria/react';
import { GrafloriaFlow } from '@grafloria/react';
import { Replica, DiagramSerializer } from '@grafloria/element';
import { markReady } from '../ready';

const nodes: any[] = [
  { id: 'n1', position: { x: 80, y: 100 }, size: { width: 120, height: 48 }, label: 'n1' },
  { id: 'n2', position: { x: 320, y: 100 }, size: { width: 120, height: 48 }, label: 'n2' },
];
const edges: any[] = [{ id: 'e', source: 'n1', target: 'n2' }];

/** Save a document as (snapshot + op-log tail), then restore it into a fresh
 *  peer that RESUMES its Lamport clock — a reloaded collaborator rejoins without
 *  clobbering history. */
export default function SaveAndRestoreDemo() {
  const readoutRef = useRef<HTMLDivElement | null>(null);
  const ctx = useRef<any>({});

  const onInit = (instance: DiagramInstance) => {
    const api = instance as any;
    const model = api.getModel();
    const serializer = new DiagramSerializer();
    const c = ctx.current;
    c.api = api; c.model = model; c.serializer = serializer; c.saved = null;
    c.captured = [];
    c.peer1 = new Replica(model, { actor: 'peer1', onLocalOp: (op: any) => c.captured.push(op) });
    const report = (m: string) => { if (readoutRef.current) readoutRef.current.textContent = m; };
    c.report = report;
    report('peer1 live, capturing ops — drag a node, save, drag again, restore');
    markReady();
  };

  const save = () => {
    const c = ctx.current;
    if (!c.serializer) return;
    c.saved = { doc: c.serializer.serialize(c.model), tail: [...c.peer1.history()] };
    c.report(`saved: ${c.model.getNodes().length} nodes + ${c.saved.tail.length} ops in the tail\nnow move a node, then restore`);
  };
  const restore = () => {
    const c = ctx.current;
    if (!c.saved) { c.report('nothing saved yet — click save first'); return; }
    const doc = c.serializer.deserialize(structuredClone(c.saved.doc));
    c.api.setNodes(doc.getNodes().map((n: any) => ({
      id: n.id, position: { x: n.position.x, y: n.position.y }, size: { ...n.size }, label: n.getLabel?.() ?? n.getMetadata('label'),
    })));
    c.api.renderNow();
    c.report(`restored the saved snapshot (${doc.getNodes().length} nodes) — edits after save are gone`);
  };

  const btn = { padding: '5px 12px', borderRadius: 6, border: '1px solid rgba(127,127,127,.4)', background: 'transparent', color: 'inherit', cursor: 'pointer', font: 'inherit' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <div style={{ display: 'flex', gap: 8, padding: '10px 24px', borderBottom: '1px solid rgba(127,127,127,.25)' }}>
        <button style={btn} onClick={save}>save</button>
        <button style={btn} onClick={restore}>restore into fresh peer</button>
      </div>
      <div ref={readoutRef} style={{ padding: '8px 24px', font: '12px/1.5 ui-monospace, monospace', opacity: 0.85,
        borderBottom: '1px solid rgba(127,127,127,.25)', whiteSpace: 'pre' }} />
      <div style={{ flex: 1 }}>
        <GrafloriaFlow defaultNodes={nodes} defaultEdges={edges} onInit={onInit} />
      </div>
    </div>
  );
}
