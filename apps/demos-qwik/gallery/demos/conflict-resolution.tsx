import { component$, $, noSerialize, useSignal, type NoSerialize } from '@builder.io/qwik';
import { GrafloriaFlow, type DiagramInstance, type GrafloriaCollabOptions } from '@grafloria/qwik';
import { MemoryHub } from '@grafloria/element';
import { markReady } from '../ready';

/** Conflict resolution: two peers edit the SAME node at the SAME time — one
 *  moves it, the other renames it — offline from each other (batched with a
 *  huge interval so nothing crosses the wire until ⇄ Exchange flushes both op
 *  logs). Both converge with BOTH edits intact, because a per-property CRDT
 *  keeps position and label as different registers. */
const nodeSpec = () => [{ id: 'n1', label: 'Draft', position: { x: 120, y: 120 }, size: { width: 160, height: 70 } }];

type Session = { flush: () => void };
type View = { statA: string; statB: string; verdict: string };

/** One in-page hub, two peers whose op logs only cross on an explicit flush. */
function makeCollab() {
  const hub = new MemoryHub();
  const a = { transport: hub.connect('ana'), actor: 'ana', batch: { intervalMs: 1_000_000 } };
  const b = { transport: hub.connect('bo'), actor: 'bo', batch: { intervalMs: 1_000_000 } };
  return { collabA: noSerialize(a as unknown as GrafloriaCollabOptions), collabB: noSerialize(b as unknown as GrafloriaCollabOptions) };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const nodeOf = (i: DiagramInstance | undefined): any => (i?.getModel() as any)?.getNode('n1');
const stateOf = (i: DiagramInstance | undefined) => {
  const n = nodeOf(i);
  return n ? { label: n.getMetadata('label'), x: Math.round(n.position.x), w: n.size.width } : { label: '?', x: 0, w: 0 };
};

/** Both peers' chips and the verdict, with every disagreeing value in red. */
function viewOf(A: DiagramInstance | undefined, B: DiagramInstance | undefined): View {
  const a = stateOf(A);
  const b = stateOf(B);
  const d = { lbl: a.label !== b.label, x: a.x !== b.x, w: a.w !== b.w };
  const chip = (s: { label: string; x: number; w: number }) =>
    `label <b${d.lbl ? ' style="color:#e0245e"' : ''}>"${s.label}"</b> · x <b${d.x ? ' style="color:#e0245e"' : ''}>${s.x}</b> · w <b${d.w ? ' style="color:#e0245e"' : ''}>${s.w}</b>`;
  const converged = !d.lbl && !d.x && !d.w;
  const edited = !(a.label === 'Draft' && a.x === 120 && a.w === 160);
  return {
    statA: chip(a),
    statB: chip(b),
    verdict: !converged
      ? '<span style="color:#b45309">● diverged — the peers hold different values until you ⇄ Exchange</span>'
      : edited
        ? '<span style="color:#16a34a;font-weight:600">✓ converged — every edit survived on BOTH peers</span>'
        : 'in sync — both peers agree (boot state)',
  };
}

const btn = { padding: '5px 11px', borderRadius: '6px', border: '1px solid rgba(127,127,127,.4)', background: 'transparent', color: 'inherit', cursor: 'pointer', fontSize: '12px' };
const chipLabel = { font: '11px ui-monospace,Menlo,monospace', background: 'rgba(37,99,235,.85)', color: '#fff', padding: '2px 8px', borderRadius: '4px' };
const statStyle = { marginLeft: 'auto', font: '12px ui-monospace,Menlo,monospace', opacity: '.85' };
const bar = { display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', borderBottom: '1px solid rgba(127,127,127,.25)' };

export default component$(() => {
  const instA = useSignal<NoSerialize<DiagramInstance>>();
  const instB = useSignal<NoSerialize<DiagramInstance>>();
  const sessionA = useSignal<NoSerialize<Session>>();
  const sessionB = useSignal<NoSerialize<Session>>();
  const collab = useSignal(makeCollab);
  const name = useSignal('Final');
  const view = useSignal<View>({ statA: '', statB: '', verdict: '' });

  return (
    <div>
      <div style={{ fontSize: '12px', opacity: '.8', padding: '10px 14px', borderBottom: '1px solid rgba(127,127,127,.25)' }}>
        Peer A moves n1, peer B renames it — offline. Their chips disagree until ⇄ Exchange, then both converge with both edits intact.
      </div>
      <div style={{ display: 'flex', height: 'calc(100vh - 150px)' }}>
        <div style={{ flex: '1', minWidth: '0', display: 'flex', flexDirection: 'column', borderRight: '2px solid rgba(127,127,127,.35)' }}>
          <div style={bar}>
            <span style={chipLabel}>peer A — moves it</span>
            <button style={btn} onClick$={() => {
              nodeOf(instA.value)?.setPosition(360, 250);
              view.value = viewOf(instA.value, instB.value);
            }}>⤢ Move node</button>
            <span style={statStyle} dangerouslySetInnerHTML={view.value.statA} />
          </div>
          <GrafloriaFlow defaultNodes={nodeSpec()} defaultEdges={[]} collab={collab.value.collabA}
            style={{ display: 'block', flex: '1' }}
            onInit$={$((i: DiagramInstance) => { instA.value = noSerialize(i); view.value = viewOf(instA.value, instB.value); markReady(); })}
            onCollabReady$={$((s: unknown) => { sessionA.value = noSerialize(s as Session); })} />
        </div>
        <div style={{ flex: '1', minWidth: '0', display: 'flex', flexDirection: 'column' }}>
          <div style={bar}>
            <span style={chipLabel}>peer B — renames it</span>
            <input value={name.value} onInput$={(_, el) => { name.value = el.value; }}
              style={{ fontSize: '12px', padding: '4px 7px', width: '90px', border: '1px solid rgba(127,127,127,.4)', borderRadius: '6px', background: 'transparent', color: 'inherit' }} />
            <button style={btn} onClick$={() => {
              nodeOf(instB.value)?.setMetadata('label', (name.value || 'Final').trim() || 'Final');
              view.value = viewOf(instA.value, instB.value);
            }}>✎ Rename</button>
            <span style={statStyle} dangerouslySetInnerHTML={view.value.statB} />
          </div>
          <GrafloriaFlow defaultNodes={nodeSpec()} defaultEdges={[]} collab={collab.value.collabB}
            style={{ display: 'block', flex: '1' }}
            onInit$={$((i: DiagramInstance) => { instB.value = noSerialize(i); view.value = viewOf(instA.value, instB.value); })}
            onCollabReady$={$((s: unknown) => { sessionB.value = noSerialize(s as Session); })} />
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 14px', borderTop: '1px solid rgba(127,127,127,.3)' }}>
        <button style={{ ...btn, border: '1px solid rgba(37,99,235,.6)', fontWeight: '600' }} onClick$={() => {
          sessionA.value?.flush();
          sessionB.value?.flush();
          requestAnimationFrame(() => {
            instA.value?.renderNow();
            instB.value?.renderNow();
            view.value = viewOf(instA.value, instB.value);
          });
        }}>⇄ Exchange / Sync</button>
        <button style={btn} onClick$={() => {
          for (const i of [instA.value, instB.value]) {
            const n = nodeOf(i);
            if (n) { n.setPosition(120, 120); n.setSize(160, 70); n.setMetadata('label', 'Draft'); }
          }
          sessionA.value?.flush();
          sessionB.value?.flush();
          requestAnimationFrame(() => {
            instA.value?.renderNow();
            instB.value?.renderNow();
            name.value = 'Final';
            view.value = viewOf(instA.value, instB.value);
          });
        }}>↺ Reset</button>
        <button style={btn} onClick$={() => {
          nodeOf(instA.value)?.setSize(220, 90);
          view.value = viewOf(instA.value, instB.value);
        }}>＋ Resize n1</button>
        <span style={{ marginLeft: '8px', fontSize: '13px' }} dangerouslySetInnerHTML={view.value.verdict} />
      </div>
    </div>
  );
});
