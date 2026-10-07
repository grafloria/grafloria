/**
 * `setNodes()` with a DIFFERENT live `NodeModel` under an id already on the
 * canvas swaps the model and keeps that node's links.
 *
 * The reported case: save with `DiagramSerializer`, load the document back
 * (`fromDocument(json).nodes` are live models of another diagram), hand them to
 * `setNodes()` — and every edge disappeared, because the swap was
 * `removeNode(id); addNode(next)` and the removal cascades the node's links.
 */
import { DiagramSerializer, NodeModel } from '@grafloria/engine';
import { createDiagram } from './create-diagram';
import type { DiagramInstance } from './create-diagram';

describe('setNodes() swapping live models keeps the links', () => {
  let container: HTMLElement;
  let diagram: DiagramInstance;

  beforeEach(() => {
    container = document.createElement('div');
    container.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    document.body.appendChild(container);
    diagram = createDiagram(container, {
      nodes: [
        { id: 'a', label: 'A', position: { x: 0, y: 0 } },
        { id: 'b', label: 'B', position: { x: 200, y: 0 } },
      ],
      edges: [{ id: 'e1', source: 'a', target: 'b' }],
    });
    diagram.renderNow();
  });

  afterEach(() => {
    diagram.dispose();
    container.remove();
  });

  const reloaded = (): NodeModel[] => {
    const json = JSON.stringify(new DiagramSerializer().serialize(diagram.getModel()));
    return new DiagramSerializer().deserialize(JSON.parse(json)).getNodes();
  };

  it('setNodes(reloaded document nodes) keeps e1, on the new models', () => {
    const next = reloaded();
    next[0].setMetadata('label', 'A2');
    diagram.setNodes(next);

    const model = diagram.getModel();
    expect(model.getNode('a')).toBe(next[0]);
    expect(model.getNode('a')!.getLabel()).toBe('A2');
    expect(model.getLinks().map((l) => l.id)).toEqual(['e1']);
    const e1 = model.getLink('e1')!;
    expect(model.getNodeByPortId(e1.sourcePortId)).toBe(next[0]);
    expect(model.getNodeByPortId(e1.targetPortId)).toBe(next[1]);
  });

  it('the swapped link is still drawn, and follows the new model', () => {
    const next = reloaded();
    next[1].setPosition(200, 300);
    diagram.setNodes(next);
    diagram.renderNow();

    const path = container.querySelector('[data-link-id="e1"] path');
    expect(path).not.toBeNull();
    // The line now ends down at b's new place (y ≈ 300+), not at its old y ≈ 0..50.
    const ys = (path!.getAttribute('d') ?? '').match(/-?\d+(\.\d+)?/g)!.map(Number).filter((_, i) => i % 2 === 1);
    expect(Math.max(...ys)).toBeGreaterThan(250);
  });

  it('a fresh model with new port ids: the link moves to the port on the same side', () => {
    const fresh = new NodeModel({ id: 'b', type: 'default', position: { x: 200, y: 0 }, size: { width: 150, height: 50 } });
    const before = diagram.getModel().getLink('e1')!;
    const oldSide = diagram.getModel().getPortById(before.targetPortId)!.side;
    diagram.setNodes([diagram.getModel().getNode('a')!, fresh]);

    const e1 = diagram.getModel().getLink('e1')!;
    expect(e1).toBeDefined();
    expect(diagram.getModel().getNodeByPortId(e1.targetPortId)).toBe(fresh);
    expect(diagram.getModel().getPortById(e1.targetPortId)!.side).toBe(oldSide);
  });

  it('nodes:change fires for the swap; edges:change does not when every link kept its port', () => {
    const seen: string[] = [];
    diagram.on('nodes:change', () => seen.push('nodes'));
    diagram.on('edges:change', () => seen.push('edges'));
    diagram.setNodes(reloaded());
    expect(seen).toContain('nodes');
    expect(seen).not.toContain('edges');
  });
});
