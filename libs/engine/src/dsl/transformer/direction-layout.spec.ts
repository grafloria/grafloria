// The direction keyword must reach the layout.
//
// `flowchart TD` parsed fine and was stored as `diagram.metadata.direction`,
// but auto-placement always stepped in x — so TD, TB and LR all produced the
// identical left-to-right chain. Parsing a value nothing reads is the same as
// not supporting it.

import { DSL } from '../DSL';

const parse = (text: string) => new DSL().parse(text);

/** Bounding spread of the laid-out nodes, per axis. */
function spread(diagram: any): { x: number; y: number } {
  const nodes = diagram.getNodes();
  const xs = nodes.map((n: any) => n.position.x);
  const ys = nodes.map((n: any) => n.position.y);
  return { x: Math.max(...xs) - Math.min(...xs), y: Math.max(...ys) - Math.min(...ys) };
}

const CHAIN = (dir: string) =>
  [`flowchart ${dir}`, '  A[One] --> B[Two]', '  B --> C[Three]', '  C --> D[Four]'].join('\n');

describe('flowchart direction drives auto-layout', () => {
  it('LR lays the chain out HORIZONTALLY', () => {
    const s = spread(parse(CHAIN('LR')));
    expect(s.x).toBeGreaterThan(s.y);
  });

  it('TD lays the chain out VERTICALLY', () => {
    const s = spread(parse(CHAIN('TD')));
    expect(s.y).toBeGreaterThan(s.x);
  });

  it('TB behaves like TD', () => {
    const s = spread(parse(CHAIN('TB')));
    expect(s.y).toBeGreaterThan(s.x);
  });

  it('TD and LR do NOT produce the same geometry', () => {
    const td = spread(parse(CHAIN('TD')));
    const lr = spread(parse(CHAIN('LR')));
    expect(`${td.x},${td.y}`).not.toBe(`${lr.x},${lr.y}`);
  });

  it('the direction is still recorded on the diagram', () => {
    expect(parse(CHAIN('TD')).getMetadata('direction')).toBe('TD');
  });
});
