/**
 * Mermaid compatibility — the target matrix (Phase 0 + Phase 1).
 *
 * Written from the empirical gap analysis (docs/MERMAID-GAP-ANALYSIS.md). Each
 * row was a documented failure of "reads real flowcharts": glued arrows, chains,
 * multi-edge, four shapes, subgraphs, and — the footgun — unsupported input
 * succeeding into garbage nodes. These lock the fixes.
 *
 * Entry point is `importDiagramText` (pure Mermaid, no sidecar → DSL parse),
 * because that is what a visitor pasting Mermaid actually hits.
 */
import { importDiagramText } from '../serialization/TextFormat';
import { DSL } from './DSL';

const imp = (text: string) => importDiagramText(text);
const nodeIds = (d: ReturnType<typeof imp>['diagram']) => d.getNodes().map((n) => n.id).sort();
const linkPairs = (d: ReturnType<typeof imp>['diagram']) =>
  d.getLinks().map((l) => `${l.sourceNodeId}->${l.targetNodeId}`).sort();
// A garbage node is one whose id is a directive keyword or carries syntax debris.
const GARBAGE = /^(f9f|f00|ff3|fff|style|classDef|class|linkStyle|click|href|fill|stroke|subgraph|end|sequenceDiagram|gantt|pie)$/i;
const hasGarbage = (d: ReturnType<typeof imp>['diagram']) =>
  d.getNodes().some((n) => GARBAGE.test(n.id.trim()) || /[#:|]/.test(n.id));

describe('Mermaid compat — Phase 0: safe failure (never garbage)', () => {
  const UNSUPPORTED = [
    ['sequenceDiagram', 'sequenceDiagram\n  Alice->>Bob: Hi\n  Bob-->>Alice: Yo'],
    ['gantt', 'gantt\n  title A\n  section S\n  Task :a1, 2024-01-01, 30d'],
    ['pie', 'pie title Pets\n  "Dogs" : 386\n  "Cats" : 85'],
    ['journey', 'journey\n  title My day\n  section Go\n  Wake: 5: Me'],
    ['gitGraph', 'gitGraph\n  commit\n  commit'],
    ['mindmap', 'mindmap\n  root((r))\n    child'],
    ['timeline', 'timeline\n  title H\n  2021: a\n  2022: b'],
    ['quadrantChart', 'quadrantChart\n  title R\n  A: [0.3, 0.6]'],
    // NB: `stateDiagram-v2` used to live in this list. Phase 3 gave it a real
    // parser — see mermaid-graph-types.spec.ts. A type only belongs here while
    // we genuinely cannot read it.
  ] as const;

  it.each(UNSUPPORTED)('%s → explicit unsupported signal, no garbage diagram', (type, text) => {
    const r = imp(text);
    expect(r.unsupported).toBe(type);
    // The whole point: NOT a plausible-but-wrong flowchart.
    expect(hasGarbage(r.diagram)).toBe(false);
    expect(r.diagram.getNodes().length).toBe(0);
  });

  it('a flowchart with a styling directive keeps its nodes and does NOT nodify the directive', () => {
    // style/classDef/class/linkStyle/click are the Phase-2 extension channel;
    // Phase 0 must at minimum NOT turn `fill:#f9f` into a node called `f9f`.
    for (const directive of [
      'flowchart LR\n  a --> b\n  style a fill:#f9f',
      'flowchart LR\n  a --> b\n  classDef hot fill:#f00\n  class a hot',
      'flowchart LR\n  a --> b\n  linkStyle 0 stroke:#ff3',
      'flowchart LR\n  a --> b\n  click a "http://example.com"',
    ]) {
      const r = imp(directive);
      expect(nodeIds(r.diagram)).toEqual(['a', 'b']);
      expect(hasGarbage(r.diagram)).toBe(false);
    }
  });

  it('a single un-parseable line does not abort the whole diagram', () => {
    const r = imp('flowchart LR\n  a --> b\n  !!! garbage line !!!\n  b --> c');
    // The good edges survive; the junk line is skipped, not nodified.
    expect(linkPairs(r.diagram)).toContain('a->b');
    expect(linkPairs(r.diagram)).toContain('b->c');
  });
});

describe('Mermaid compat — Phase 1: flowchart base', () => {
  it('glued arrows: a-->b (no spaces) parses', () => {
    const r = imp('flowchart LR\n  a-->b');
    expect(nodeIds(r.diagram)).toEqual(['a', 'b']);
    expect(linkPairs(r.diagram)).toEqual(['a->b']);
  });

  it('hyphenated ids survive (the - is only an arrow when doubled)', () => {
    const r = imp('flowchart LR\n  my-node --> other-node');
    expect(nodeIds(r.diagram)).toEqual(['my-node', 'other-node']);
  });

  it('variable arrow length: a ---> b and a ----> b', () => {
    for (const arrow of ['-->', '--->', '---->']) {
      const r = imp(`flowchart LR\n  a ${arrow} b`);
      expect(linkPairs(r.diagram)).toEqual(['a->b']);
    }
  });

  it.each([
    ['stadium', 'a([A])', 'stadium'],
    ['subroutine', 'a[[A]]', 'subroutine'],
    ['parallelogram', 'a[/A/]', 'parallelogram'], // was read as a trapezoid: Mermaid's slashes name the shape
    ['trapezoid', 'a[/A\\]', 'trapezoid'],
  ])('shape %s parses (was a lexer throw: no compound close token)', (_name, token, shape) => {
    const r = imp(`flowchart LR\n  ${token} --> b`);
    expect(r.diagram.getNode('a')).toBeTruthy();
    expect(r.diagram.getNode('a')!.getMetadata('dslShape')).toBe(shape);
    expect(linkPairs(r.diagram)).toEqual(['a->b']);
  });

  it('the shapes that already worked still work', () => {
    for (const [token, shape] of [
      ['a(A)', 'rounded-rectangle'], ['a((A))', 'circle'], ['a[(A)]', 'cylindrical'],
      ['a{A}', 'rhombus'], ['a{{A}}', 'hexagon'], ['a>A]', 'asymmetric'], ['a[A]', 'rectangle'],
    ] as const) {
      const r = imp(`flowchart LR\n  ${token} --> b`);
      expect(r.diagram.getNode('a')!.getMetadata('dslShape')).toBe(shape);
    }
  });

  it('CHAIN: a --> b --> c yields TWO links', () => {
    const r = imp('flowchart LR\n  a --> b --> c');
    expect(nodeIds(r.diagram)).toEqual(['a', 'b', 'c']);
    expect(linkPairs(r.diagram)).toEqual(['a->b', 'b->c']);
  });

  it('CHAIN with shapes and labels', () => {
    const r = imp('flowchart LR\n  Start([Start]) --> Work[Work] --> Done((Done))');
    expect(linkPairs(r.diagram)).toEqual(['Start->Work', 'Work->Done']);
    expect(r.diagram.getNode('Start')!.getMetadata('dslShape')).toBe('stadium');
  });

  it('MULTI source: a & b --> c yields a->c and b->c', () => {
    const r = imp('flowchart LR\n  a & b --> c');
    expect(linkPairs(r.diagram)).toEqual(['a->c', 'b->c']);
  });

  it('MULTI target: a --> b & c yields a->b and a->c', () => {
    const r = imp('flowchart LR\n  a --> b & c');
    expect(linkPairs(r.diagram)).toEqual(['a->b', 'a->c']);
  });

  it('MULTI both sides: a & b --> c & d yields the 2x2 cross product', () => {
    const r = imp('flowchart LR\n  a & b --> c & d');
    expect(linkPairs(r.diagram)).toEqual(['a->c', 'a->d', 'b->c', 'b->d']);
  });

  it('self-loop: a --> a', () => {
    const r = imp('flowchart LR\n  a --> a');
    expect(nodeIds(r.diagram)).toEqual(['a']);
    expect(r.diagram.getLinks().length).toBe(1);
  });

  it('a realistic decision flow parses end to end', () => {
    const r = imp(
      'flowchart TD\n  Start([Start]) --> Check{OK?}\n  Check -->|yes| Done[Done]\n  Check -->|no| Start'
    );
    expect(nodeIds(r.diagram)).toEqual(['Check', 'Done', 'Start']);
    expect(linkPairs(r.diagram)).toEqual(['Check->Done', 'Check->Start', 'Start->Check'].sort());
    const yes = r.diagram.getLinks().find((l) => l.getMetadata('label') === 'yes');
    expect(yes).toBeTruthy();
  });

  it('SUBGRAPH becomes a GroupModel with its members', () => {
    const r = imp('flowchart TB\n  subgraph one\n    a --> b\n  end\n  b --> c');
    expect(linkPairs(r.diagram)).toEqual(['a->b', 'b->c']);
    expect(r.diagram.getGroups().length).toBe(1);
    const group = r.diagram.getGroups()[0];
    // a and b are inside the subgraph; c is not.
    expect([...group.members].sort()).toEqual(['a', 'b']);
  });

  it('v11 node metadata: a@{ shape: rect, label: "Hi" }', () => {
    const r = imp('flowchart LR\n  a@{ shape: rect, label: "Hi" }\n  a --> b');
    expect(r.diagram.getNode('a')).toBeTruthy();
    expect(r.diagram.getNode('a')!.getLabel()).toBe('Hi');
    expect(linkPairs(r.diagram)).toEqual(['a->b']);
  });
});

describe('Mermaid compat — generator symmetry (body round-trips)', () => {
  // What the generator emits must parse back through the strengthened parser:
  // every shape's compound brackets (`([])`, `[[]]`, `[/…/]`) are now readable,
  // so a Mermaid body is lossless through the BODY, not only via the sidecar.
  it('parse → generate → re-parse preserves structure and shapes', () => {
    const source =
      'flowchart TD\n' +
      '  Start([Start]) --> Load[(Load)]\n' +
      '  Load --> Check{OK?}\n' +
      '  Check --> Sub[[Work]] --> Done((Done))\n' +
      '  Check --> Alt[/Alt/]';
    const first = imp(source).diagram;

    const dsl = new DSL({ autoLayout: false });
    const body = dsl.generate(first, { preserveIds: true, includeComments: false });
    const second = dsl.parse(body);

    expect(second.getNodes().map((n) => n.id).sort()).toEqual(first.getNodes().map((n) => n.id).sort());
    expect(
      second.getLinks().map((l) => `${l.sourceNodeId}->${l.targetNodeId}`).sort()
    ).toEqual(first.getLinks().map((l) => `${l.sourceNodeId}->${l.targetNodeId}`).sort());
    for (const id of ['Start', 'Load', 'Sub', 'Done', 'Alt', 'Check']) {
      expect(second.getNode(id)!.getMetadata('dslShape')).toBe(first.getNode(id)!.getMetadata('dslShape'));
    }
  });
});

// P1-6 (Atloria brief 2026-10-19): valid Mermaid, found in real pages, that
// Grafloria REFUSED. Each must get Mermaid's verdict — it parses, every line.
describe('Mermaid compat — valid Mermaid that used to be refused', () => {
  const clean = (text: string) => {
    const r = imp(text);
    expect(r.errors).toEqual([]);
    expect(new DSL({ autoLayout: false }).validate(text)).toEqual({ valid: true, errors: [] });
    return r.diagram;
  };

  it('`End` is a node id — only lowercase `end` is reserved (was "Expected target node after link")', () => {
    const d = clean('flowchart LR\n  Handler --> End[Timing middleware records elapsed time]');
    expect(nodeIds(d)).toEqual(['End', 'Handler']);
    expect(d.getNode('End')!.getLabel()).toBe('Timing middleware records elapsed time');
    // …and `END` too, as in Mermaid's own docs; lowercase `end` still closes a subgraph.
    expect(nodeIds(clean('flowchart LR\n  A --> END'))).toEqual(['A', 'END']);
    const sub = clean('flowchart LR\n  subgraph S\n    A --> End\n  end\n  End --> B');
    expect([...sub.getGroups()[0].members].sort()).toEqual(['A', 'End']);
  });

  it("an apostrophe inside [ ] is text (was \"the quote ' is never closed\")", () => {
    const d = clean("flowchart LR\n  D --> E[418 I'm a Teapot Response]");
    expect(d.getNode('E')!.getLabel()).toBe("418 I'm a Teapot Response");
    expect(clean("flowchart LR\n  A[it's Bob's] --> B").getNode('A')!.getLabel()).toBe("it's Bob's");
  });

  it('a slash before ] is text (was `"[" is never closed`)', () => {
    const d = clean('flowchart LR\n  D --> E[Join segments with /]');
    expect(d.getNode('E')!.getLabel()).toBe('Join segments with /');
    expect(clean('flowchart LR\n  A[C:\\Temp\\] --> B').getNode('A')!.getLabel()).toBe('C:\\Temp\\');
    // The slash shapes are untouched.
    expect(clean('flowchart LR\n  a[/In or out/] --> b').getNode('a')!.getMetadata('dslShape')).toBe('parallelogram');
  });

  it('YAML frontmatter is read, not refused (was \'Unexpected "---"\'); its title is metadata', () => {
    const d = clean('---\ntitle: Order flow\n---\nflowchart LR\n  A --> B');
    expect(nodeIds(d)).toEqual(['A', 'B']);
    expect(linkPairs(d)).toEqual(['A->B']);
    expect(d.getMetadata('title')).toBe('Order flow');
    expect(new DSL({ autoLayout: false }).parseDetailed('---\ntitle: x\n---\nflowchart LR\n  A --> B').ast.direction).toBe('LR');
    // A frontmatter with a config block, and errors still name the ORIGINAL line.
    const v = new DSL({ autoLayout: false }).validate('---\ntitle: T\nconfig:\n  theme: dark\n---\nflowchart LR\n  A --> B\n  B -->');
    expect(v.errors).toHaveLength(1);
    expect(v.errors[0]).toMatch(/line 8\b/i);
  });
});
