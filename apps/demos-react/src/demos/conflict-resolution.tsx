import { useCallback, useMemo, useRef, useState } from 'react';
import { GrafloriaFlow } from '@grafloria/react';
import type { DiagramInstance } from '@grafloria/react';
import { MemoryHub } from '@grafloria/element';
import { markReady } from '../ready';

/** Conflict resolution: two peers edit the SAME node at the SAME time — one
 *  moves it, the other renames it — offline from each other (batched with a
 *  huge interval so nothing crosses the wire until ⇄ Exchange flushes both op
 *  logs). Both converge with BOTH edits intact, because a per-property CRDT
 *  keeps position and label as different registers. */
const nodeSpec = () => [{ id: 'n1', label: 'Draft', position: { x: 120, y: 120 }, size: { width: 160, height: 70 } }];

export default function ConflictResolutionDemo() {
  const instA = useRef<DiagramInstance | null>(null);
  const instB = useRef<DiagramInstance | null>(null);
  const sessionA = useRef<{ flush: () => void } | null>(null);
  const sessionB = useRef<{ flush: () => void } | null>(null);
  const [name, setName] = useState('Final');
  const [statA, setStatA] = useState('');
  const [statB, setStatB] = useState('');
  const [verdict, setVerdict] = useState('');

  const { collabA, collabB } = useMemo(() => {
    const hub = new MemoryHub();
    return {
      collabA: { transport: hub.connect('ana'), actor: 'ana', batch: { intervalMs: 1_000_000 } },
      collabB: { transport: hub.connect('bo'), actor: 'bo', batch: { intervalMs: 1_000_000 } },
    };
  }, []);

  const nodeOf = (i: DiagramInstance | null): any => (i?.getModel() as any)?.getNode('n1');
  const stateOf = (i: DiagramInstance | null) => {
    const n = nodeOf(i);
    return n ? { label: n.getMetadata('label'), x: Math.round(n.position.x), w: n.size.width } : { label: '?', x: 0, w: 0 };
  };

  const refresh = useCallback(() => {
    const a = stateOf(instA.current);
    const b = stateOf(instB.current);
    const d = { lbl: a.label !== b.label, x: a.x !== b.x, w: a.w !== b.w };
    const chip = (s: { label: string; x: number; w: number }) =>
      `label <b${d.lbl ? ' style="color:#e0245e"' : ''}>"${s.label}"</b> · x <b${d.x ? ' style="color:#e0245e"' : ''}>${s.x}</b> · w <b${d.w ? ' style="color:#e0245e"' : ''}>${s.w}</b>`;
    setStatA(chip(a));
    setStatB(chip(b));
    const converged = !d.lbl && !d.x && !d.w;
    const edited = !(a.label === 'Draft' && a.x === 120 && a.w === 160);
    setVerdict(!converged
      ? '<span style="color:#b45309">● diverged — the peers hold different values until you ⇄ Exchange</span>'
      : edited
        ? '<span style="color:#16a34a;font-weight:600">✓ converged — every edit survived on BOTH peers</span>'
        : 'in sync — both peers agree (boot state)');
  }, []);

  const moveA = () => { nodeOf(instA.current)?.setPosition(360, 250); refresh(); };
  const renameB = () => { nodeOf(instB.current)?.setMetadata('label', (name || 'Final').trim() || 'Final'); refresh(); };
  const resizeA = () => { nodeOf(instA.current)?.setSize(220, 90); refresh(); };
  const exchange = () => {
    sessionA.current?.flush();
    sessionB.current?.flush();
    requestAnimationFrame(() => { instA.current?.renderNow(); instB.current?.renderNow(); refresh(); });
  };
  const resetAll = () => {
    for (const i of [instA.current, instB.current]) {
      const n = nodeOf(i);
      if (n) { n.setPosition(120, 120); n.setSize(160, 70); n.setMetadata('label', 'Draft'); }
    }
    sessionA.current?.flush(); sessionB.current?.flush();
    requestAnimationFrame(() => { instA.current?.renderNow(); instB.current?.renderNow(); setName('Final'); refresh(); });
  };

  const btn = { padding: '5px 11px', borderRadius: 6, border: '1px solid rgba(127,127,127,.4)', background: 'transparent', color: 'inherit', cursor: 'pointer', fontSize: 12 } as const;
  const chipLabel = { font: '11px ui-monospace,Menlo,monospace', background: 'rgba(37,99,235,.85)', color: '#fff', padding: '2px 8px', borderRadius: 4 } as const;

  return (
    <div>
      <div style={{ fontSize: 12, opacity: .8, padding: '10px 14px', borderBottom: '1px solid rgba(127,127,127,.25)' }}>
        Peer A moves n1, peer B renames it — offline. Their chips disagree until ⇄ Exchange, then both converge with both edits intact.
      </div>
      <div style={{ display: 'flex', height: 'calc(100vh - 150px)' }}>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', borderRight: '2px solid rgba(127,127,127,.35)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderBottom: '1px solid rgba(127,127,127,.25)' }}>
            <span style={chipLabel}>peer A — moves it</span>
            <button onClick={moveA} style={btn}>⤢ Move node</button>
            <span style={{ marginLeft: 'auto', font: '12px ui-monospace,Menlo,monospace', opacity: .85 }} dangerouslySetInnerHTML={{ __html: statA }} />
          </div>
          <GrafloriaFlow defaultNodes={nodeSpec()} defaultEdges={[]} collab={collabA as never}
            style={{ display: 'block', flex: 1 }}
            onInit={(i) => { instA.current = i; refresh(); markReady(); }}
            onCollabReady={(s) => { sessionA.current = s as never; }} />
        </div>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderBottom: '1px solid rgba(127,127,127,.25)' }}>
            <span style={chipLabel}>peer B — renames it</span>
            <input value={name} onChange={(e) => setName(e.target.value)}
              style={{ fontSize: 12, padding: '4px 7px', width: 90, border: '1px solid rgba(127,127,127,.4)', borderRadius: 6, background: 'transparent', color: 'inherit' }} />
            <button onClick={renameB} style={btn}>✎ Rename</button>
            <span style={{ marginLeft: 'auto', font: '12px ui-monospace,Menlo,monospace', opacity: .85 }} dangerouslySetInnerHTML={{ __html: statB }} />
          </div>
          <GrafloriaFlow defaultNodes={nodeSpec()} defaultEdges={[]} collab={collabB as never}
            style={{ display: 'block', flex: 1 }}
            onInit={(i) => { instB.current = i; refresh(); }}
            onCollabReady={(s) => { sessionB.current = s as never; }} />
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderTop: '1px solid rgba(127,127,127,.3)' }}>
        <button onClick={exchange} style={{ ...btn, border: '1px solid rgba(37,99,235,.6)', fontWeight: 600 }}>⇄ Exchange / Sync</button>
        <button onClick={resetAll} style={btn}>↺ Reset</button>
        <button onClick={resizeA} style={btn}>＋ Resize n1</button>
        <span style={{ marginLeft: 8, fontSize: 13 }} dangerouslySetInnerHTML={{ __html: verdict }} />
      </div>
    </div>
  );
}
