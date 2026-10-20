// What fitView fits: every box, every routed waypoint, every group frame — and
// every edge label, which can hang past them all (a state diagram's leftmost
// rank: "deliver all active orders" drew as "ver all active orders").
import { DiagramModel, NodeModel, PortModel, LinkModel } from '@grafloria/engine';
import { contentBounds } from './content-bounds';
import { LabelRenderer } from '../svg/LabelRenderer';

function twoBoxes(): { model: DiagramModel; link: LinkModel } {
  const model = new DiagramModel();
  for (const [id, x] of [['a', 0], ['b', 0]] as const) {
    const node = new NodeModel({ id, type: 'rect', position: { x, y: id === 'a' ? 0 : 200 }, size: { width: 60, height: 40 } });
    node.addPort(new PortModel({ id: `${id}-p`, type: 'bi', side: 'bottom' }));
    model.addNode(node);
  }
  const link = new LinkModel('a-p', 'b-p');
  link.setPoints([{ x: 30, y: 40 }, { x: 30, y: 200 }]);
  model.addLink(link);
  return { model, link };
}

describe('contentBounds', () => {
  it('a label wider than every box is inside what fitView fits', () => {
    const { model, link } = twoBoxes();
    const without = contentBounds(model)!;
    expect(without).toEqual({ x: 0, y: 0, width: 60, height: 240 });
    link.addLabel({ text: 'deliver all active orders', position: 0.5 });
    const box = new LabelRenderer().labelBox(link.labels[0], link);
    const fitted = contentBounds(model)!;
    expect(fitted.x).toBeCloseTo(30 - box.width / 2);
    expect(fitted.x + fitted.width).toBeCloseTo(30 + box.width / 2);
    expect(fitted.y).toBe(0);
    expect(fitted.height).toBe(240);
  });

  it('a label inside the boxes changes nothing', () => {
    const { model, link } = twoBoxes();
    link.addLabel({ text: 'go', position: 0.5 });
    expect(contentBounds(model)).toEqual({ x: 0, y: 0, width: 60, height: 240 });
  });
});

describe('DiagramInstance.getContentBounds', () => {
  it('is what fitView fits — boxes and the label hanging past them', async () => {
    const { createDiagram } = await import('./create-diagram');
    const container = document.createElement('div');
    container.getBoundingClientRect = () => ({ left: 0, top: 0, x: 0, y: 0, width: 400, height: 300, right: 400, bottom: 300, toJSON: () => ({}) }) as DOMRect;
    document.body.appendChild(container);
    const instance = createDiagram(container, {
      nodes: [
        { id: 'a', position: { x: 0, y: 0 }, size: { width: 60, height: 40 } },
        { id: 'b', position: { x: 0, y: 200 }, size: { width: 60, height: 40 } },
      ],
    });
    const model = instance.getModel();
    expect(instance.getContentBounds()).toEqual(contentBounds(model));
    expect(instance.getContentBounds()).toMatchObject({ x: 0, y: 0, width: 60, height: 240 });
    instance.dispose();
    container.remove();
  });
});
