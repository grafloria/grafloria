/**
 * A text note is words on the canvas, not a wall.
 *
 * The engine registers every node as a routing obstacle, and every route is
 * planned against those plus the renderer's own list. A note (shape 'text')
 * draws no box, yet a line detoured round its invisible rectangle — in the
 * AI-style demo the red dashed line took a long trip round the "if someone swaps
 * the link…" note.
 */
import { DiagramEngine } from './DiagramEngine';
import { NodeModel } from '../models/NodeModel';
import { GroupModel } from '../models/GroupModel';

describe('a text note is not a routing obstacle', () => {
  let engine: DiagramEngine;
  const ids = () => engine.getRoutingEngine().getObstacles().map((o) => o.id).sort();
  const note = (id: string, x: number) => {
    const n = new NodeModel({ id, type: 'text', position: { x, y: 0 }, size: { width: 240, height: 24 } });
    n.setMetadata('shape', { type: 'text' });
    return n;
  };

  beforeEach(async () => {
    engine = new DiagramEngine();
    await engine.createDiagram('notes');
  });

  it('a note is never registered; a box is', async () => {
    await engine.addNode(new NodeModel({ id: 'box', type: 'rect', position: { x: 0, y: 0 }, size: { width: 100, height: 40 } }));
    await engine.addNode(note('note', 200));
    expect(ids()).toEqual(['box']);
  });

  it('a note that moves stays out of the map', async () => {
    await engine.addNode(note('note', 200));
    engine.getDiagram()!.getNode('note')!.setPosition(300, 50);
    expect(ids()).toEqual([]);
  });

  it('a box that BECOMES a note leaves the map, and comes back when it is a box again', async () => {
    await engine.addNode(new NodeModel({ id: 'n', type: 'rect', position: { x: 0, y: 0 }, size: { width: 100, height: 40 } }));
    const n = engine.getDiagram()!.getNode('n')!; // the diagram's own node
    expect(ids()).toEqual(['n']);
    n.setMetadata('shape', { type: 'text' });
    expect(ids()).toEqual([]);
    n.setMetadata('shape', { type: 'rect' });
    expect(ids()).toEqual(['n']);
  });

  it('a diagram with zones keeps its notes out too (the group reconcile re-registers every visible node)', async () => {
    await engine.addNode(new NodeModel({ id: 'box', type: 'rect', position: { x: 0, y: 0 }, size: { width: 100, height: 40 } }));
    await engine.addNode(note('note', 200));
    const g = new GroupModel({ name: 'zone' });
    engine.getDiagram()!.addGroup(g);
    engine.refreshGroupObstacles();
    expect(ids()).toEqual(['box']);
  });
});
