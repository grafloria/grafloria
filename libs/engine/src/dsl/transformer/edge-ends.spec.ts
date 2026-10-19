// P1-10 (Atloria brief 2026-10-19): every Mermaid edge drew ONE triangle.
//
// `--o`, `--x`, `<-->` and `---` all parsed — and all rendered a single arrowhead
// at the target, so an undirected `---` stated a direction the author never wrote.
// Mermaid's rule (flowDb.destructLink): the LAST character names the target end
// (`>` arrow, `o` circle, `x` cross, anything else none) and a matching FIRST
// character (`<`, `o`, `x`) puts the same marker on the source end. The ends live
// on the link's style as `arrowHead` (target) and `arrowTail` (source) — what the
// renderer draws.
import { importDiagramText, exportDiagramText } from '../../serialization/TextFormat';
import type { DiagramModel } from '../../models/DiagramModel';

type End = 'arrow' | 'circle' | 'cross' | 'none';

/** The end markers the renderer will draw: an unset head is its default arrow. */
function ends(d: DiagramModel, from: string, to: string): { tail: End; head: End } {
  const link = d.getLinks().find((l) => l.sourceNodeId === from && l.targetNodeId === to);
  if (!link) throw new Error(`no link ${from}->${to}`);
  const kind = (style: { type: string } | undefined, unset: End): End =>
    style === undefined ? unset : (style.type as End);
  return { tail: kind(link.style.arrowTail, 'none'), head: kind(link.style.arrowHead, 'arrow') };
}

const load = (text: string) => {
  const r = importDiagramText(text);
  expect(r.errors).toEqual([]);
  return r.diagram;
};

describe('Mermaid edge ends — each edge kind draws its own markers', () => {
  const BRIEF = 'flowchart LR\n A --o B\n B --x C\n C <--> D\n D --- E\n E --> F>Flag]';

  it('the brief fence: circle, cross, both ends, none, and a plain arrow', () => {
    const d = load(BRIEF);
    expect(ends(d, 'A', 'B')).toEqual({ tail: 'none', head: 'circle' });
    expect(ends(d, 'B', 'C')).toEqual({ tail: 'none', head: 'cross' });
    expect(ends(d, 'C', 'D')).toEqual({ tail: 'arrow', head: 'arrow' });
    expect(ends(d, 'D', 'E')).toEqual({ tail: 'none', head: 'none' });
    expect(ends(d, 'E', 'F')).toEqual({ tail: 'none', head: 'arrow' });
  });

  it.each([
    ['A -.- B', 'none', 'none', 'dotted'],
    ['A === B', 'none', 'none', 'thick'],
    ['A -.-> B', 'none', 'arrow', 'dotted'],
    ['A ==> B', 'none', 'arrow', 'thick'],
    ['A o--o B', 'circle', 'circle', 'solid'],
    ['A x--x B', 'cross', 'cross', 'solid'],
    ['A <-.-> B', 'arrow', 'arrow', 'dotted'],
    ['A <==> B', 'arrow', 'arrow', 'thick'],
    ['A <---> B', 'arrow', 'arrow', 'solid'],
    ['A -.-o B', 'none', 'circle', 'dotted'],
    ['A ==x B', 'none', 'cross', 'thick'],
    ['A o-.-o B', 'circle', 'circle', 'dotted'],
    // Mermaid ignores a start marker that does not match the end.
    ['A o--> B', 'none', 'arrow', 'solid'],
    ['A ---|label| B', 'none', 'none', 'solid'],
    ['A -- text --o B', 'none', 'circle', 'solid'],
    ['A <-- text --> B', 'arrow', 'arrow', 'solid'],
  ] as const)('%s → tail %s, head %s, %s line', (edge, tail, head, stroke) => {
    const d = load(`flowchart LR\n  ${edge}`);
    expect(d.getNodes().map((n) => n.id).sort()).toEqual(['A', 'B']);
    expect(ends(d, 'A', 'B')).toEqual({ tail, head });
    const style = d.getLinks()[0].style;
    expect(stroke === 'dotted' ? !!style.strokeDasharray : !style.strokeDasharray).toBe(true);
    expect(stroke === 'thick' ? style.strokeWidth === 4 : style.strokeWidth !== 4).toBe(true);
  });

  it('a node called o or x is still a node', () => {
    const d = load('flowchart LR\n  o --> x\n  x --o o\n  A & x --> B');
    expect(d.getNodes().map((n) => n.id).sort()).toEqual(['A', 'B', 'o', 'x']);
    expect(ends(d, 'x', 'o')).toEqual({ tail: 'none', head: 'circle' });
  });

  it('`>text]` is the asymmetric (flag) shape, not a rectangle', () => {
    const f = load(BRIEF).getNode('F')!;
    expect(f.getMetadata('dslShape')).toBe('asymmetric');
    expect((f.getMetadata('shape') as { type: string }).type).toBe('asymmetric');
    expect(f.getLabel()).toBe('Flag');
    // Mermaid v11's name for it.
    expect((load('flowchart LR\n  a@{ shape: odd, label: "Flag" }').getNode('a')!.getMetadata('shape') as { type: string }).type).toBe('asymmetric');
  });

  it('export writes each edge kind back, labelled or not, and it re-imports to the same ends', () => {
    const source =
      'flowchart LR\n  A --o B\n  B --x C\n  C <--> D\n  D --- E\n  E -.- F\n  F === G\n  G o--o H\n  H x-.-x I\n' +
      '  I ---|plain| J\n  J --o|ball| K\n  K <-.->|both| L';
    const first = load(source);
    const body = exportDiagramText(first, { lossless: false });
    for (const syntax of ['A --o B', 'B --x C', 'C <--> D', 'D --- E', 'E -.- F', 'F === G', 'G o--o H', 'H x-.-x I', 'I ---|plain| J', 'J --o|ball| K', 'K <-.->|both| L']) {
      expect(body).toContain(syntax);
    }
    const back = load(body);
    for (const link of first.getLinks()) {
      expect(ends(back, link.sourceNodeId!, link.targetNodeId!)).toEqual(ends(first, link.sourceNodeId!, link.targetNodeId!));
    }
  });
});
