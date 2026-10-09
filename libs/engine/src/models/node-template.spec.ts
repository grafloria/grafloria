import { DiagramEngine } from '../engine/DiagramEngine';
import { NodeModel } from './NodeModel';
import { PortModel } from './PortModel';
import { LinkModel } from './LinkModel';
import { SetNodeDataCommand } from '../commands/basic/SetNodeDataCommand';

/** A Switch: one output per rule, labelled from the data, 30 px taller per rule. */
const switchPorts = (node: NodeModel) => {
  const rules = (node.data?.['rules'] as string[] | undefined) ?? [];
  return {
    ports: [
      new PortModel({ id: `${node.id}:in`, type: 'input', side: 'left' }),
      ...rules.map((r, i) => new PortModel({ id: `${node.id}:out${i}`, type: 'output', side: 'right', index: i, label: { text: r } as never })),
    ],
    size: { width: 180, height: 40 + rules.length * 30 },
  };
};

function scene(withResolver = true) {
  const engine = new DiagramEngine();
  const model = engine.createDiagram('t');
  const sw = new NodeModel({ id: 'sw', type: 'switch', position: { x: 0, y: 0 }, size: { width: 180, height: 130 } });
  sw.ports.clear();
  sw.data = { rules: ['a', 'b', 'c'] };
  const target = new NodeModel({ id: 'x', type: 'step', position: { x: 400, y: 0 }, size: { width: 120, height: 60 } });
  target.ports.clear();
  target.addPort(new PortModel({ id: 'x:in', type: 'input', side: 'left' }));
  model.addNode(sw);
  model.addNode(target);
  if (withResolver) model.setNodeTemplateResolver((n) => (n.type === 'switch' ? switchPorts(n) : undefined));
  for (const p of switchPorts(sw).ports) sw.addPort(p);
  const link = LinkModel.fromJSON({ ...new LinkModel('sw:out2', 'x:in').serialize(), id: 'wire' });
  link.setLabels([{ id: 'l1', text: 'c items', position: 0.5, offset: { x: 0, y: 0 } }]);
  model.addLink(link);
  return { engine, model, sw };
}
const outs = (sw: NodeModel) => ([...sw.ports.values()] as PortModel[]).filter((p) => p.type === 'output').map((p) => p.id);

describe('data-driven node templates: data → ports + size, in the data edit\'s own undo step', () => {
  it('a Switch whose rules go from 3 to 4 gains a 4th output, labelled from the data, and grows', async () => {
    const { engine, sw } = scene();
    await engine.commandManager.execute(new SetNodeDataCommand('sw', { rules: ['a', 'b', 'c', 'd'] }));
    expect(outs(sw)).toEqual(['sw:out0', 'sw:out1', 'sw:out2', 'sw:out3']);
    expect((sw.getPort('sw:out3') as PortModel).label).toEqual({ text: 'd' });
    expect(sw.size.height).toBe(160);
  });

  it('dropping a rule removes its output AND the wire on it; ONE undo brings data, port and wire back', async () => {
    const { engine, model, sw } = scene();
    const wire = JSON.stringify(model.getLink('wire')!.serialize());
    await engine.commandManager.execute(new SetNodeDataCommand('sw', { rules: ['a', 'b'] }));
    expect(outs(sw)).toEqual(['sw:out0', 'sw:out1']);
    expect(model.getLink('wire')).toBeUndefined();
    expect(sw.size.height).toBe(100);

    await engine.undo();
    expect(sw.getData('rules')).toEqual(['a', 'b', 'c']);
    expect(outs(sw)).toEqual(['sw:out0', 'sw:out1', 'sw:out2']);
    expect(JSON.stringify(model.getLink('wire')!.serialize())).toBe(wire); // same id, same labels
    expect(model.getNodeByPortId('sw:out2')?.id).toBe('sw'); // the port index knows it again
    expect(sw.size.height).toBe(130);

    await engine.redo();
    expect(model.getLink('wire')).toBeUndefined();
    expect(outs(sw)).toEqual(['sw:out0', 'sw:out1']);
  });

  it('a renamed rule relabels its port in place: the wire on it stays', async () => {
    const { engine, model, sw } = scene();
    await engine.commandManager.execute(new SetNodeDataCommand('sw', { rules: ['a', 'b', 'C!'] }));
    expect((sw.getPort('sw:out2') as PortModel).label).toEqual({ text: 'C!' });
    expect(model.getLink('wire')).toBeDefined();
  });

  it('without a resolver a data edit touches only data (unchanged behaviour)', async () => {
    const { engine, model, sw } = scene(false);
    await engine.commandManager.execute(new SetNodeDataCommand('sw', { rules: ['a'] }));
    expect(outs(sw)).toEqual(['sw:out0', 'sw:out1', 'sw:out2']);
    expect(model.getLink('wire')).toBeDefined();
    expect(sw.size.height).toBe(130);
  });
});
