// Flowchart placement must tell the truth about the GRAPH, not reading order.
//
// The chain-wrap placer stepped along the flow axis in the order nodes were
// read, so a BRANCH rendered as a straight line: `Check -->|no| Order` read as
// Pick→Order. Rank-based placement (dsl/mermaid/layout.ts) makes a fork read
// as a fork: rank along the flow axis, siblings spread on the cross axis.

import { DSL } from '../DSL';
import { assignRanks, placeByRank } from '../mermaid/layout';

const parse = (text: string) => new DSL().parse(text);

const DIAMOND = (dir: string) =>
  [
    `flowchart ${dir}`,
    '  A[Start] --> B[Left]',
    '  A --> C[Right]',
    '  B --> D[End]',
    '  C --> D',
  ].join('\n');

describe('flowchart rank placement', () => {
  it('a diamond forks: B and C share a rank and separate on the cross axis (TD)', () => {
    const diagram = parse(DIAMOND('TD'));
    const [a, b, c, d] = ['A', 'B', 'C', 'D'].map((id) => diagram.getNode(id)!);

    // Same rank ⇒ same band along the flow axis (y for TD)…
    const centerY = (n: typeof a) => n.position.y + n.size.height / 2;
    expect(centerY(b)).toBeCloseTo(centerY(c), 5);
    // …and separated on the cross axis.
    expect(Math.abs(b.position.x - c.position.x)).toBeGreaterThan(1);

    // Ranks strictly advance: A above {B,C} above D.
    expect(a.position.y).toBeLessThan(b.position.y);
    expect(b.position.y).toBeLessThan(d.position.y);
  });

  it('the same diamond in LR forks on Y and ranks on X', () => {
    const diagram = parse(DIAMOND('LR'));
    const [a, b, c, d] = ['A', 'B', 'C', 'D'].map((id) => diagram.getNode(id)!);

    const centerX = (n: typeof a) => n.position.x + n.size.width / 2;
    expect(centerX(b)).toBeCloseTo(centerX(c), 5);
    expect(Math.abs(b.position.y - c.position.y)).toBeGreaterThan(1);
    expect(a.position.x).toBeLessThan(b.position.x);
    expect(b.position.x).toBeLessThan(d.position.x);
  });

  it('a labelled back-edge does not drag the target below its rank', () => {
    // `Check -->|no| Start` closes a cycle; broken at the back-edge, Start
    // keeps rank 0 instead of ranking below Check.
    const diagram = parse(
      [
        'flowchart TD',
        '  Start([Go]) --> Check{OK?}',
        '  Check -->|yes| Done[Ship]',
        '  Check -->|no| Start',
      ].join('\n')
    );
    const start = diagram.getNode('Start')!;
    const check = diagram.getNode('Check')!;
    const done = diagram.getNode('Done')!;
    expect(start.position.y).toBeLessThan(check.position.y);
    expect(check.position.y).toBeLessThan(done.position.y);
  });

  it('parsing is deterministic: the same text places identically twice', () => {
    const coords = (text: string) =>
      parse(text)
        .getNodes()
        .map((n) => [n.id, n.position.x, n.position.y]);
    expect(coords(DIAMOND('TD'))).toEqual(coords(DIAMOND('TD')));
  });
});

describe('rank machinery (shared helper)', () => {
  it('assignRanks: longest path wins over BFS shortcuts', () => {
    // a→b→c→d plus a shortcut a→d: d must sit BELOW c, not beside b.
    const ranks = assignRanks(
      ['a', 'b', 'c', 'd'],
      [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'c' },
        { from: 'c', to: 'd' },
        { from: 'a', to: 'd' },
      ]
    );
    expect(ranks.get('a')).toBe(0);
    expect(ranks.get('d')).toBe(3);
  });

  it('assignRanks: a cycle breaks at the back-edge, deterministically', () => {
    const edges = [
      { from: 'a', to: 'b' },
      { from: 'b', to: 'c' },
      { from: 'c', to: 'a' }, // back-edge
    ];
    const ranks = assignRanks(['a', 'b', 'c'], edges);
    expect([ranks.get('a'), ranks.get('b'), ranks.get('c')]).toEqual([0, 1, 2]);
  });

  it('placeByRank: BT reverses the band order without going negative', () => {
    const nodes = [
      { id: 'a', size: { width: 100, height: 50 } },
      { id: 'b', size: { width: 100, height: 50 } },
    ];
    const ranks = new Map([
      ['a', 0],
      ['b', 1],
    ]);
    const positions = placeByRank(nodes, ranks, {
      direction: 'BT',
      start: { x: 0, y: 0 },
      rankGap: 20,
      crossGap: 20,
    });
    expect(positions.get('b')!.y).toBeLessThan(positions.get('a')!.y);
    expect(positions.get('b')!.y).toBeGreaterThanOrEqual(0);
  });
});
