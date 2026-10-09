import { flowLayout, placeFlowNodes } from './flow-layout';
import type { FlowBox, FlowEdge } from './flow-layout';

const box = (id: string, w = 120, h = 60, x?: number, y?: number): FlowBox => ({ id, width: w, height: h, x, y });
const noOverlap = (pos: Map<string, { x: number; y: number }>, boxes: FlowBox[]) => {
  const list = boxes.map((b) => ({ ...pos.get(b.id)!, w: b.width, h: b.height, id: b.id }));
  for (let i = 0; i < list.length; i++)
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i]!;
      const b = list[j]!;
      const hit = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
      if (hit) throw new Error(`${a.id} overlaps ${b.id}`);
    }
};

describe('flowLayout — a tidy flow that respects output PORT order', () => {
  it('an If: the true branch above the false branch, whatever order the edges arrive in', () => {
    const boxes = [box('trigger'), box('if'), box('yes'), box('no')];
    const edges: FlowEdge[] = [
      { source: 'trigger', target: 'if' },
      { source: 'if', target: 'no', order: 1 }, // listed first, but port 1 (false)
      { source: 'if', target: 'yes', order: 0 },
    ];
    const pos = flowLayout(boxes, edges);
    expect(pos.get('yes')!.y).toBeLessThan(pos.get('no')!.y);
    expect(pos.get('yes')!.x).toBe(pos.get('no')!.x);
    expect(pos.get('if')!.x).toBeGreaterThan(pos.get('trigger')!.x);
    // the If sits between its two branches
    const mid = (pos.get('yes')!.y + pos.get('no')!.y) / 2;
    expect(pos.get('if')!.y).toBeCloseTo(mid);
    noOverlap(pos, boxes);
  });

  it('a Switch: its outputs top to bottom in port order', () => {
    const boxes = [box('sw'), box('c'), box('a'), box('d'), box('b')];
    const edges: FlowEdge[] = [
      { source: 'sw', target: 'c', order: 2 },
      { source: 'sw', target: 'a', order: 0 },
      { source: 'sw', target: 'd', order: 3 },
      { source: 'sw', target: 'b', order: 1 },
    ];
    const pos = flowLayout(boxes, edges);
    const ys = ['a', 'b', 'c', 'd'].map((id) => pos.get(id)!.y);
    expect([...ys].sort((p, q) => p - q)).toEqual(ys);
    noOverlap(pos, boxes);
  });

  it('a merge sits to the right of every branch that feeds it', () => {
    const boxes = [box('s'), box('long1'), box('long2'), box('short'), box('merge')];
    const edges: FlowEdge[] = [
      { source: 's', target: 'long1', order: 0 },
      { source: 'long1', target: 'long2' },
      { source: 'long2', target: 'merge' },
      { source: 's', target: 'short', order: 1 },
      { source: 'short', target: 'merge' },
    ];
    const pos = flowLayout(boxes, edges);
    expect(pos.get('merge')!.x).toBeGreaterThan(pos.get('long2')!.x);
    noOverlap(pos, boxes);
  });

  it('nothing overlaps on a busy flow with cards of different sizes, and a cycle does not hang it', () => {
    const boxes = Array.from({ length: 30 }, (_, i) => box(`n${i}`, 100 + (i % 3) * 40, 50 + (i % 4) * 20));
    const edges: FlowEdge[] = [];
    for (let i = 1; i < 30; i++) edges.push({ source: `n${Math.floor((i - 1) / 2)}`, target: `n${i}`, order: i % 2 });
    edges.push({ source: 'n20', target: 'n3' }, { source: 'n29', target: 'n0' }); // a merge and a loop back
    const pos = flowLayout(boxes, edges);
    expect(pos.size).toBe(30);
    noOverlap(pos, boxes);
  });

  it('keeps clear of an obstacle (a sticky note) the flow would otherwise run over', () => {
    const boxes = [box('a', 120, 60, 0, 0), box('b'), box('c')];
    const edges: FlowEdge[] = [{ source: 'a', target: 'b' }, { source: 'b', target: 'c' }];
    const note = { x: 180, y: -20, width: 200, height: 120 };
    const pos = flowLayout(boxes, edges, { obstacles: [note] });
    for (const b of boxes) {
      const p = pos.get(b.id)!;
      const hit = p.x < note.x + note.width && note.x < p.x + b.width && p.y < note.y + note.height && note.y < p.y + b.height;
      expect(hit).toBe(false);
    }
  });

  it('TB: the flow runs downward and siblings go left to right in port order', () => {
    const pos = flowLayout([box('s'), box('l'), box('r')], [{ source: 's', target: 'r', order: 1 }, { source: 's', target: 'l', order: 0 }], { direction: 'TB' });
    expect(pos.get('l')!.y).toBeGreaterThan(pos.get('s')!.y);
    expect(pos.get('l')!.x).toBeLessThan(pos.get('r')!.x);
  });

  it('starts where the flow already is (the tidy does not throw it across the canvas)', () => {
    const pos = flowLayout([box('a', 120, 60, 500, 300), box('b', 120, 60, 900, 900)], [{ source: 'a', target: 'b' }]);
    expect(pos.get('a')).toEqual({ x: 500, y: 300 });
  });
});

describe('placeFlowNodes — only the new nodes move', () => {
  it('a new child goes one step right of its parent, everything else stays', () => {
    const boxes = [box('a', 120, 60, 0, 0), box('b', 120, 60, 200, 0), box('n')];
    const edges: FlowEdge[] = [{ source: 'a', target: 'b' }, { source: 'b', target: 'n' }];
    const pos = placeFlowNodes(['n'], boxes, edges);
    expect([...pos.keys()]).toEqual(['n']);
    expect(pos.get('n')).toEqual({ x: 400, y: 0 });
  });

  it('a new false branch goes BELOW the existing true branch (its port slot), clear of it', () => {
    const boxes = [box('if', 120, 60, 0, 100), box('yes', 120, 60, 200, 50), box('no')];
    const edges: FlowEdge[] = [
      { source: 'if', target: 'yes', order: 0 },
      { source: 'if', target: 'no', order: 1 },
    ];
    const pos = placeFlowNodes(['no'], boxes, edges);
    expect(pos.get('no')!.x).toBe(200);
    expect(pos.get('no')!.y).toBeGreaterThanOrEqual(50 + 60 + 20); // below yes, with half a gap
  });

  it('`after` names the parent outright; a box with no parent keeps its place', () => {
    const boxes = [box('a', 120, 60, 0, 0), box('free', 100, 40, 700, 700), box('n')];
    const pos = placeFlowNodes(['n', 'free'], boxes, [], { after: 'a' });
    expect(pos.get('n')).toEqual({ x: 200, y: 0 });
    expect(placeFlowNodes(['free'], boxes, []).get('free')).toEqual({ x: 700, y: 700 });
  });
});
