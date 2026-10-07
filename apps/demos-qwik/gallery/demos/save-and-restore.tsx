import { component$, $, noSerialize, useSignal, type NoSerialize } from '@builder.io/qwik';
import { GrafloriaFlow, type DiagramInstance } from '@grafloria/qwik';
import { Replica, DiagramSerializer } from '@grafloria/element';
import { markReady } from '../ready';

/* eslint-disable @typescript-eslint/no-explicit-any */
const nodes = [
  { id: 'n1', position: { x: 80, y: 100 }, size: { width: 120, height: 48 }, label: 'n1' },
  { id: 'n2', position: { x: 320, y: 100 }, size: { width: 120, height: 48 }, label: 'n2' },
];
const edges = [{ id: 'e', source: 'n1', target: 'n2' }];

interface Ctx { api: any; model: any; serializer: DiagramSerializer; saved: any; captured: any[]; peer1: Replica }

const btn = { padding: '5px 12px', borderRadius: '6px', border: '1px solid rgba(127,127,127,.4)', background: 'transparent', color: 'inherit', cursor: 'pointer', font: 'inherit' };

/** Save a document as (snapshot + op-log tail), then restore it into a fresh
 *  peer that RESUMES its Lamport clock — a reloaded collaborator rejoins without
 *  clobbering history. */
export default component$(() => {
  const ctx = useSignal<NoSerialize<Ctx>>();
  const readout = useSignal('');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <div style={{ display: 'flex', gap: '8px', padding: '10px 24px', borderBottom: '1px solid rgba(127,127,127,.25)' }}>
        <button style={btn} onClick$={() => {
          const c = ctx.value;
          if (!c) return;
          c.saved = { doc: c.serializer.serialize(c.model), tail: [...(c.peer1 as any).history()] };
          readout.value = `saved: ${c.model.getNodes().length} nodes + ${c.saved.tail.length} ops in the tail\nnow move a node, then restore`;
        }}>save</button>
        <button style={btn} onClick$={() => {
          const c = ctx.value;
          if (!c) return;
          if (!c.saved) { readout.value = 'nothing saved yet — click save first'; return; }
          const doc = (c.serializer as any).deserialize(structuredClone(c.saved.doc));
          c.api.setNodes(doc.getNodes().map((n: any) => ({
            id: n.id, position: { x: n.position.x, y: n.position.y }, size: { ...n.size }, label: n.getLabel?.() ?? n.getMetadata('label'),
          })));
          c.api.renderNow();
          readout.value = `restored the saved snapshot (${doc.getNodes().length} nodes) — edits after save are gone`;
        }}>restore into fresh peer</button>
      </div>
      <div style={{ padding: '8px 24px', font: '12px/1.5 ui-monospace, monospace', opacity: '0.85',
        borderBottom: '1px solid rgba(127,127,127,.25)', whiteSpace: 'pre' }}>{readout.value}</div>
      <div style={{ flex: '1' }}>
        <GrafloriaFlow defaultNodes={nodes} defaultEdges={edges} onInit$={$((instance: DiagramInstance) => {
          const model = instance.getModel() as any;
          const captured: any[] = [];
          ctx.value = noSerialize({
            api: instance, model, serializer: new DiagramSerializer(), saved: null, captured,
            peer1: new Replica(model, { actor: 'peer1', onLocalOp: (op: any) => captured.push(op) }),
          });
          readout.value = 'peer1 live, capturing ops — drag a node, save, drag again, restore';
          markReady();
        })} />
      </div>
    </div>
  );
});
