// T3 (Visio build plan) — Align & Distribute as single undoable steps.

import { DiagramModel } from '../../models/DiagramModel';
import { NodeModel } from '../../models/NodeModel';
import { CommandContext } from '../Command';
import { AlignCommand, DistributeCommand } from './AlignCommands';

describe('Align & Distribute commands', () => {
  let diagram: DiagramModel;
  let context: CommandContext;

  const add = (id: string, x: number, y: number, w = 100, h = 40) => {
    const n = new NodeModel({ id, type: 'box', position: { x, y }, size: { width: w, height: h } });
    diagram.addNode(n);
    return n;
  };
  const pos = (id: string) => {
    const n = diagram.getNode(id)!;
    return { x: n.position.x, y: n.position.y };
  };

  beforeEach(() => {
    diagram = new DiagramModel();
    context = { diagram, eventBus: { emit: jest.fn() } } as unknown as CommandContext;
  });

  it('aligns left to the minimum x, and undo restores every node', () => {
    add('a', 10, 0); add('b', 50, 20); add('c', 200, 60);
    const cmd = new AlignCommand(['a', 'b', 'c'], 'left');
    cmd.execute(context);
    expect(pos('a').x).toBe(10);
    expect(pos('b').x).toBe(10);
    expect(pos('c').x).toBe(10);
    // y is untouched
    expect(pos('c').y).toBe(60);
    cmd.undo(context);
    expect(pos('b').x).toBe(50);
    expect(pos('c').x).toBe(200);
  });

  it('aligns right to the max right edge (accounts for width)', () => {
    add('a', 0, 0, 100); add('b', 0, 0, 40); // right edges 100 vs 40 → max 100
    new AlignCommand(['a', 'b'], 'right').execute(context);
    expect(pos('a').x).toBe(0);      // 100 - 100
    expect(pos('b').x).toBe(60);     // 100 - 40
  });

  it('center-x centres every node on the group mid-line', () => {
    add('a', 0, 0, 100);   // spans 0..100
    add('b', 0, 0, 20);    // width 20
    // group bbox x: 0..100 → centre 50; b → 50 - 10 = 40
    new AlignCommand(['a', 'b'], 'center-x').execute(context);
    expect(pos('a').x).toBe(0);   // 50 - 50
    expect(pos('b').x).toBe(40);  // 50 - 10
  });

  it('distributes horizontally with equal gaps, anchoring first & last', () => {
    // three 100-wide boxes; outer span 0..500 (a at 0, c at 400)
    add('a', 0, 0, 100); add('c', 400, 0, 100); add('b', 120, 0, 100);
    new DistributeCommand(['a', 'b', 'c'], 'horizontal').execute(context);
    // total size 300, span 500 → 2 gaps of 100; b sits at 0+100+100 = 200
    expect(pos('a').x).toBe(0);
    expect(pos('b').x).toBe(200);
    expect(pos('c').x).toBe(400);
  });

  it('distribute undo restores the interior node', () => {
    add('a', 0, 0, 100); add('c', 400, 0, 100); add('b', 120, 0, 100);
    const cmd = new DistributeCommand(['a', 'b', 'c'], 'horizontal');
    cmd.execute(context);
    cmd.undo(context);
    expect(pos('b').x).toBe(120);
  });

  it('guards: align needs ≥2 nodes, distribute needs ≥3', () => {
    add('a', 0, 0);
    expect(new AlignCommand(['a'], 'left').canExecute(context)).toBe(false);
    add('b', 10, 0);
    expect(new AlignCommand(['a', 'b'], 'left').canExecute(context)).toBe(true);
    expect(new DistributeCommand(['a', 'b'], 'horizontal').canExecute(context)).toBe(false);
    add('c', 20, 0);
    expect(new DistributeCommand(['a', 'b', 'c'], 'horizontal').canExecute(context)).toBe(true);
  });

  it('skips locked nodes (they neither move nor get snapshotted)', () => {
    add('a', 10, 0); add('b', 50, 0); const c = add('c', 200, 0);
    c.state.locked = true;
    new AlignCommand(['a', 'b', 'c'], 'left').execute(context);
    expect(pos('a').x).toBe(10);
    expect(pos('b').x).toBe(10);
    expect(pos('c').x).toBe(200); // locked → untouched
  });
});
