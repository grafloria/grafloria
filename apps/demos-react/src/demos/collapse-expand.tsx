import { useRef } from 'react';
import { GrafloriaFlow } from '@grafloria/react';
import type { DiagramInstance } from '@grafloria/react';
import { markReady } from '../ready';

const nodes = [
  { id: 'ext1', position: { x: 60, y: 80 }, size: { width: 120, height: 60 }, label: 'ext 1' },
  { id: 'ext2', position: { x: 60, y: 300 }, size: { width: 120, height: 60 }, label: 'ext 2' },
  { id: 'm1', position: { x: 420, y: 80 }, size: { width: 120, height: 60 }, label: 'member 1' },
  { id: 'm2', position: { x: 420, y: 200 }, size: { width: 120, height: 60 }, label: 'member 2' },
  { id: 'm3', position: { x: 420, y: 320 }, size: { width: 120, height: 60 }, label: 'member 3' },
];
const edges = [
  { id: 'a', source: 'ext1', target: 'm1' },
  { id: 'b', source: 'ext1', target: 'm2' },
  { id: 'c', source: 'ext2', target: 'm3' },
  { id: 'd', source: 'm1', target: 'm2' },
];

/** Collapse a group through the engine: members hide and the boundary links are
 *  replaced by ONE aggregated proxy link to the collapsed placeholder; expand
 *  restores every one. Two external nodes each feed two members. */
export default function CollapseExpandDemo() {
  const inst = useRef<DiagramInstance | null>(null);
  const groupId = useRef<string | undefined>(undefined);

  const collapse = async () => {
    const engine = inst.current?.getEngine() as any;
    if (engine && groupId.current) await engine.collapseGroup(groupId.current, { proxyLabel: (i: { count: number }) => `${i.count}×` });
  };
  const expand = async () => {
    const engine = inst.current?.getEngine() as any;
    if (engine && groupId.current) await engine.expandGroup(groupId.current);
  };

  const onInit = (instance: DiagramInstance) => {
    inst.current = instance;
    const engine = instance.getEngine() as any;
    (async () => {
      const g = await engine.addGroup({ name: 'Service' });
      g.setFrame({ x: 400, y: 60, width: 180, height: 340 });
      for (const id of ['m1', 'm2', 'm3']) await engine.addToGroup(g.id, id);
      groupId.current = g.id;
      instance.renderNow();
      markReady();
    })();
  };

  const btn = { padding: '5px 12px', borderRadius: 6, border: '1px solid rgba(127,127,127,.4)', background: 'transparent', color: 'inherit', cursor: 'pointer', font: 'inherit' } as const;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <div style={{ display: 'flex', gap: 8, padding: '10px 24px', borderBottom: '1px solid rgba(127,127,127,.25)' }}>
        <button style={btn} onClick={() => void collapse()}>collapse group</button>
        <button style={btn} onClick={() => void expand()}>expand group</button>
      </div>
      <div style={{ flex: 1 }}>
        <GrafloriaFlow defaultNodes={nodes} defaultEdges={edges} onInit={onInit} style={{ height: '100%' }} />
      </div>
    </div>
  );
}
