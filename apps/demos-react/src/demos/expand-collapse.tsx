import { useRef, useState } from 'react';
import { GrafloriaFlow } from '@grafloria/react';
import type { DiagramInstance } from '@grafloria/react';
import { GroupModel, GroupCollapseService } from '@grafloria/element';
import { markReady } from '../ready';

// A container of three members, plus an external node wired to two of them across
// the boundary. Collapse hides the members, shrinks the group to a placeholder,
// and re-homes the boundary edges onto an aggregated proxy; expand restores it.
const nodes = [
  { id: 'ext', position: { x: 480, y: 60 }, size: { width: 100, height: 44 }, label: 'external' },
  { id: 'c1', position: { x: 60, y: 40 }, size: { width: 90, height: 40 }, label: 'c1' },
  { id: 'c2', position: { x: 60, y: 110 }, size: { width: 90, height: 40 }, label: 'c2' },
  { id: 'c3', position: { x: 60, y: 180 }, size: { width: 90, height: 40 }, label: 'c3' },
];
const edges = [
  { id: 'e1', source: 'c1', target: 'c2' },
  { id: 'e2', source: 'c1', target: 'ext' },
  { id: 'e3', source: 'c2', target: 'ext' },
  { id: 'e4', source: 'ext', target: 'c3' },
];

/** Collapse a container to a placeholder — members hide, boundary edges
 *  aggregate onto a proxy — then expand it back, lossless, through the real
 *  GroupCollapseService. */
export default function ExpandCollapseDemo() {
  const inst = useRef<DiagramInstance | null>(null);
  const group = useRef<InstanceType<typeof GroupModel> | null>(null);
  const collapser = useRef<InstanceType<typeof GroupCollapseService> | null>(null);
  const [readout, setReadout] = useState('');

  const refresh = () => {
    const api = inst.current, g = group.current;
    if (!api || !g) return;
    api.renderNow();
    const model = api.getModel();
    const visible = model.getNodes().filter((n: any) => n.state.visible !== false).length;
    setReadout(`visible=${visible}  nodes=${model.getNodes().length}  links=${model.getLinks().length}  collapsed=${g.isCollapsed}`);
  };

  const onInit = (instance: DiagramInstance) => {
    inst.current = instance;
    (async () => {
      const model = instance.getModel();
      const g = new GroupModel({ id: 'box', name: 'Service' });
      model.addGroup(g);
      g.padding = 14;
      for (const id of ['c1', 'c2', 'c3']) g.addMember(id, model);
      group.current = g;
      collapser.current = new GroupCollapseService(model);

      await instance.getEngine().layout('dagre', { direction: 'TB', nodeSpacing: 30, rankSpacing: 50 });
      instance.renderNow();
      instance.fitView(60);
      refresh();
      markReady();
    })();
  };

  const collapse = () => { if (group.current) { collapser.current?.collapse(group.current); refresh(); } };
  const expand = () => { if (group.current) { collapser.current?.expand(group.current); refresh(); } };

  const btn = { padding: '5px 12px', borderRadius: 6, border: '1px solid rgba(127,127,127,.4)', background: 'transparent', color: 'inherit', cursor: 'pointer', font: 'inherit' } as const;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <div style={{ display: 'flex', gap: 8, padding: '10px 24px', borderBottom: '1px solid rgba(127,127,127,.25)', alignItems: 'center' }}>
        <button style={btn} onClick={collapse}>collapse</button>
        <button style={btn} onClick={expand}>expand</button>
        <span style={{ marginLeft: 'auto', font: '12px/1.4 ui-monospace, monospace', opacity: 0.8 }}>{readout}</span>
      </div>
      <div style={{ flex: 1 }}>
        <GrafloriaFlow defaultNodes={nodes} defaultEdges={edges} onInit={onInit} />
      </div>
    </div>
  );
}
