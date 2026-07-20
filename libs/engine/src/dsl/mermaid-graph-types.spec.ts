/**
 * Mermaid compatibility — Phase 3: the graph-family types beyond the flowchart.
 *
 * `erDiagram`, `classDiagram` and `stateDiagram[-v2]`. Every row below was a
 * documented failure of the scaffolding this replaces (docs/MERMAID-GAP-ANALYSIS.md §3):
 *   - erDiagram    → ONE node, literally named `CUSTOMER ||--o`, zero links
 *   - classDiagram → ZERO nodes on canonical input
 *   - stateDiagram → no parser at all (Phase 0 downgraded it to "unsupported")
 *
 * Entry point is `importDiagramText` — what a visitor pasting Mermaid hits —
 * plus the parser/generator functions directly where the assertion is about the
 * text form. The exported bodies are additionally validated against REAL
 * mermaid v11 by demos/e2e/mermaid-oracle-run.mjs; these tests lock the
 * STRUCTURE, the oracle locks the VALIDITY.
 */
import { importDiagramText } from '../serialization/TextFormat';
import { DSL } from './DSL';
import {
  parseMermaidEr,
  generateMermaidEr,
  erSpecFrom,
  erMarkers,
  parseMermaidClass,
  generateMermaidClass,
  umlSpecFrom,
  parseMermaidState,
  generateMermaidState,
  umlRelationKind,
} from './mermaid';

const imp = (text: string) => importDiagramText(text);
const nodeIds = (d: ReturnType<typeof imp>['diagram']) => d.getNodes().map((n) => n.id).sort();
const linkPairs = (d: ReturnType<typeof imp>['diagram']) =>
  d.getLinks().map((l) => `${l.sourceNodeId}->${l.targetNodeId}`).sort();
const dsl = new DSL({ autoLayout: false });

// ═══════════════════════════════════════════════════════════════════════════
describe('Mermaid compat — Phase 3: erDiagram', () => {
  it('the canonical relationship parses (was ONE garbage node, zero links)', () => {
    const r = imp('erDiagram\n    CUSTOMER ||--o{ ORDER : places');
    expect(r.unsupported).toBeUndefined();
    expect(nodeIds(r.diagram)).toEqual(['CUSTOMER', 'ORDER']);
    expect(linkPairs(r.diagram)).toEqual(['CUSTOMER->ORDER']);
    expect(r.diagram.getLinks()[0].getMetadata('label')).toBe('places');
  });

  // The cardinality pair is the ONE thing an ER diagram must get right: it maps
  // onto the renderer's marker vocabulary, and getting a side backwards draws a
  // different (wrong) data model.
  it.each([
    ['||--||', 'one', 'one'],
    ['|o--o|', 'zero-or-one', 'zero-or-one'],
    ['}o--o{', 'zero-or-many', 'zero-or-many'],
    ['}|--|{', 'one-or-many', 'one-or-many'],
    ['||--o{', 'one', 'zero-or-many'],
    ['}o--||', 'zero-or-many', 'one'],
    ['||--|{', 'one', 'one-or-many'],
    ['|o--o{', 'zero-or-one', 'zero-or-many'],
  ])('cardinality %s → tail=%s head=%s', (token, tail, head) => {
    const model = parseMermaidEr(`erDiagram\n  A ${token} B : "r"`);
    expect(model.relationships).toHaveLength(1);
    expect(erMarkers(model.relationships[0])).toEqual({ tail, head });
  });

  it('identifying (--) vs non-identifying (..) survives', () => {
    expect(parseMermaidEr('erDiagram\n A ||--o{ B : "r"').relationships[0].identifying).toBe(true);
    expect(parseMermaidEr('erDiagram\n A ||..o{ B : "r"').relationships[0].identifying).toBe(false);
  });

  it('attribute blocks: type, name, PK/FK/UK keys and the "comment"', () => {
    const model = parseMermaidEr(
      'erDiagram\n' +
        '  CUSTOMER {\n' +
        '    string name\n' +
        '    string custNumber PK\n' +
        '    int regionId FK\n' +
        '    string email UK "must be unique"\n' +
        '    int both PK, FK\n' +
        '  }\n' +
        '  CUSTOMER ||--o{ ORDER : "places"'
    );
    const customer = model.entities.find((e) => e.id === 'CUSTOMER')!;
    expect(customer.attributes.map((a) => [a.type, a.name, a.keys.join('+')])).toEqual([
      ['string', 'name', ''],
      ['string', 'custNumber', 'PK'],
      ['int', 'regionId', 'FK'],
      ['string', 'email', 'UK'],
      ['int', 'both', 'PK+FK'],
    ]);
    expect(customer.attributes[3].comment).toBe('must be unique');
    // Mentioned but never blocked — still a real entity, with no columns.
    expect(model.entities.find((e) => e.id === 'ORDER')!.attributes).toEqual([]);
  });

  it('GLUED relationship (no spaces) parses — Mermaid accepts it, so must we', () => {
    const r = imp('erDiagram\n  CUSTOMER||--o{ORDER : "places"');
    expect(nodeIds(r.diagram)).toEqual(['CUSTOMER', 'ORDER']);
    expect(linkPairs(r.diagram)).toEqual(['CUSTOMER->ORDER']);
  });

  it('hyphenated entity ids (LINE-ITEM) are ids, not arrows', () => {
    const r = imp('erDiagram\n  ORDER ||--|{ LINE-ITEM : contains');
    expect(nodeIds(r.diagram)).toEqual(['LINE-ITEM', 'ORDER']);
  });

  it('a quoted multi-word label keeps its spaces', () => {
    const model = parseMermaidEr('erDiagram\n  A ||--o{ B : "places an order"');
    expect(model.relationships[0].label).toBe('places an order');
  });

  it('directives we do not model are IGNORED, never nodified (invariant #1)', () => {
    const r = imp(
      'erDiagram\n' +
        '  direction LR\n' +
        '  CUSTOMER ||--o{ ORDER : places\n' +
        '  style CUSTOMER fill:#f9f\n' +
        '  classDef hot fill:#f00'
    );
    expect(nodeIds(r.diagram)).toEqual(['CUSTOMER', 'ORDER']);
    expect(r.diagram.getMetadata('direction')).toBe('LR');
  });

  it('erSpec projects onto the diagram kit: columns with pk/fk flags + markers', () => {
    const spec = erSpecFrom(
      parseMermaidEr(
        'erDiagram\n  ORDER {\n    int id PK\n    int custId FK\n  }\n  CUSTOMER ||--o{ ORDER : places'
      )
    );
    expect(spec.entities.find((e) => e.id === 'ORDER')!.columns).toEqual([
      { name: 'id', type: 'int', pk: true },
      { name: 'custId', type: 'int', fk: true },
    ]);
    expect(spec.relationships[0]).toEqual({
      from: 'CUSTOMER',
      to: 'ORDER',
      label: 'places',
      cardinality: { tail: 'one', head: 'zero-or-many' },
    });
  });

  it('the kit spec rides on the imported diagram (no re-derivation needed)', () => {
    const r = imp('erDiagram\n  CUSTOMER ||--o{ ORDER : places');
    const spec = r.diagram.getMetadata('erSpec') as ReturnType<typeof erSpecFrom>;
    expect(spec.entities.map((e) => e.id)).toEqual(['CUSTOMER', 'ORDER']);
  });

  // ── export ────────────────────────────────────────────────────────────────
  it('EXPORT always quotes the label — `one`/`many` are ER cardinality KEYWORDS', () => {
    // Found by the real-Mermaid oracle: `A ||--|| B : one` is a PARSE ERROR in
    // mermaid 11.16 (the lexer reads `one` as ONLY_ONE). Quoting is always legal,
    // so we quote unconditionally rather than maintain a keyword blacklist.
    const body = generateMermaidEr(parseMermaidEr('erDiagram\n  A ||--|| B : "one"'));
    expect(body).toContain('A ||--|| B : "one"');
  });

  it('EXPORT writes `: ""` for an unlabelled relationship (the label is required)', () => {
    const body = generateMermaidEr(parseMermaidEr('erDiagram\n  A ||--o{ B : ""'));
    expect(body).toContain('A ||--o{ B : ""');
  });

  it('ROUND-TRIP: parse → generate → parse preserves entities, attributes, cardinality', () => {
    const source =
      'erDiagram\n' +
      '  CUSTOMER ||--o{ ORDER : "places"\n' +
      '  ORDER }|..|{ LINE-ITEM : "contains"\n' +
      '  CUSTOMER {\n' +
      '    string name\n' +
      '    string custNumber PK\n' +
      '  }\n' +
      '  ORDER {\n' +
      '    int orderId PK\n' +
      '    string custNumber FK\n' +
      '  }';
    const first = parseMermaidEr(source);
    const second = parseMermaidEr(generateMermaidEr(first));
    expect(second.entities).toEqual(first.entities);
    expect(second.relationships).toEqual(first.relationships);
  });

  it('ROUND-TRIP through the DiagramModel (import → DSL.generate → import)', () => {
    const source =
      'erDiagram\n  CUSTOMER ||--o{ ORDER : "places"\n  CUSTOMER {\n    string custNumber PK\n  }';
    const first = imp(source).diagram;
    const body = dsl.generate(first);
    // The generator must speak ER, not flowchart — handing an ER model to the
    // flowchart generator emits valid Mermaid of the WRONG TYPE.
    expect(body.startsWith('erDiagram')).toBe(true);
    const second = imp(body).diagram;
    expect(second.getNodes().map((n) => n.id).sort()).toEqual(['CUSTOMER', 'ORDER']);
    expect(second.getLinks()).toHaveLength(1);
    expect(second.getLinks()[0].getMetadata('erCardinality')).toEqual({
      tail: 'one',
      head: 'zero-or-many',
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Mermaid compat — Phase 3: classDiagram', () => {
  it('the canonical inheritance line parses (was ZERO nodes)', () => {
    const r = imp('classDiagram\n    Animal <|-- Duck');
    expect(r.unsupported).toBeUndefined();
    expect(nodeIds(r.diagram)).toEqual(['Animal', 'Duck']);
    expect(linkPairs(r.diagram)).toEqual(['Animal->Duck']);
  });

  // The operator table IS the feature. `reversed` is the subtle half: Mermaid
  // writes the arrowhead end FIRST for `<|--` / `<--` / `<..`, so the kit's
  // from→to must be flipped or every inheritance arrow points at the child.
  it.each([
    ['A <|-- B', 'inheritance', 'B', 'A'],
    ['A --|> B', 'inheritance', 'A', 'B'],
    ['A <|.. B', 'realization', 'B', 'A'],
    ['A ..|> B', 'realization', 'A', 'B'],
    ['A *-- B', 'composition', 'A', 'B'],
    ['A --* B', 'composition', 'B', 'A'],
    ['A o-- B', 'aggregation', 'A', 'B'],
    ['A --o B', 'aggregation', 'B', 'A'],
    ['A --> B', 'directed-association', 'A', 'B'],
    ['A <-- B', 'directed-association', 'B', 'A'],
    ['A ..> B', 'dependency', 'A', 'B'],
    ['A <.. B', 'dependency', 'B', 'A'],
    ['A -- B', 'association', 'A', 'B'],
    ['A .. B', 'association', 'A', 'B'],
  ])('%s → kit kind %s, from=%s to=%s', (line, kind, from, to) => {
    const spec = umlSpecFrom(parseMermaidClass(`classDiagram\n  ${line}`));
    expect(spec.relationships).toHaveLength(1);
    expect(spec.relationships[0]).toMatchObject({ kind, from, to });
  });

  it('members: both the `Class : member` form and the `class X { … }` block', () => {
    const model = parseMermaidClass(
      'classDiagram\n' +
        '  Animal : +int age\n' +
        '  Animal : +isMammal()\n' +
        '  class Duck {\n' +
        '    +String beakColor\n' +
        '    -int secret\n' +
        '    #protectedThing\n' +
        '    ~pkg\n' +
        '    +swim()\n' +
        '    +quack() void\n' +
        '  }'
    );
    const animal = model.classes.find((c) => c.id === 'Animal')!;
    expect(animal.attributes.map((a) => a.raw)).toEqual(['+int age']);
    expect(animal.methods.map((m) => m.raw)).toEqual(['+isMammal()']);
    const duck = model.classes.find((c) => c.id === 'Duck')!;
    expect(duck.attributes.map((a) => a.visibility)).toEqual(['+', '-', '#', '~']);
    expect(duck.methods.map((m) => m.raw)).toEqual(['+swim()', '+quack() void']);
    // A member with `(` is a METHOD — that is the only classifier Mermaid gives us.
    expect(duck.attributes.every((a) => !a.isMethod)).toBe(true);
  });

  it('the member name is read from BOTH spellings Mermaid accepts', () => {
    const model = parseMermaidClass('classDiagram\n  A : +String beakColor\n  A : +age: int');
    expect(model.classes[0].attributes.map((a) => a.name)).toEqual(['beakColor', 'age']);
  });

  it.each([
    ['in-block', 'classDiagram\n  class Shape {\n    <<interface>>\n    draw()\n  }'],
    ['standalone', 'classDiagram\n  class Shape\n  <<interface>> Shape'],
  ])('<<interface>> annotation (%s) becomes the stereotype', (_name, text) => {
    const model = parseMermaidClass(text);
    expect(model.classes.find((c) => c.id === 'Shape')!.stereotype).toBe('interface');
    // …and the kit renders interface/abstract names in italics.
    expect(umlSpecFrom(model).classes[0].abstract).toBe(true);
  });

  it('multiplicity + label, and the pair FLIPS with a reversed operator', () => {
    const forward = umlSpecFrom(parseMermaidClass('classDiagram\n  Vehicle "1" *-- "1..*" Wheel : has'));
    expect(forward.relationships[0]).toMatchObject({
      from: 'Vehicle', to: 'Wheel', kind: 'composition', label: 'has', multiplicity: ['1', '1..*'],
    });
    // `--*` puts the diamond on the RIGHT operand, so the kit ends swap — and
    // the chips must swap with them or they label the wrong class.
    const reversed = umlSpecFrom(parseMermaidClass('classDiagram\n  Wheel "1..*" --* "1" Vehicle : has'));
    expect(reversed.relationships[0]).toMatchObject({
      from: 'Vehicle', to: 'Wheel', kind: 'composition', multiplicity: ['1', '1..*'],
    });
  });

  it.each([
    ['A <--> B', 'directed-association'],
    ['A <|--|> B', 'inheritance'],
    ['A <..> B', 'dependency'],
  ])('TWO-WAY %s keeps both classes and the link (it used to drop the whole line)', (line, kind) => {
    // Real Mermaid accepts all three. Skipping the line made BOTH classes
    // vanish — a silent empty diagram, worse than a lossy one. We render the
    // closest one-way notation and keep the literal operator for re-export.
    const r = imp(`classDiagram\n  ${line}`);
    expect(nodeIds(r.diagram)).toEqual(['A', 'B']);
    expect(r.diagram.getLinks()).toHaveLength(1);
    expect(r.diagram.getLinks()[0].getMetadata('umlKind')).toBe(kind);
    // …and the exported body says `<-->` again, not `-->`.
    expect(generateMermaidClass(parseMermaidClass(`classDiagram\n  ${line}`))).toContain(line);
  });

  it('generics: class Square~Shape~ is the class Square', () => {
    const model = parseMermaidClass('classDiagram\n  class Square~Shape~\n  Square~Shape~ --> Form');
    expect(model.classes.map((c) => c.id).sort()).toEqual(['Form', 'Square']);
    expect(model.classes.find((c) => c.id === 'Square')!.generic).toBe('Shape');
  });

  it('notes and unknown directives are kept/ignored, never turned into classes', () => {
    const model = parseMermaidClass(
      'classDiagram\n' +
        '  direction RL\n' +
        '  class A\n' +
        '  note for A "watch out"\n' +
        '  cssClass "A" someStyle\n' +
        '  click A call go()'
    );
    expect(model.classes.map((c) => c.id)).toEqual(['A']);
    expect(model.notes).toEqual([{ for: 'A', text: 'watch out' }]);
    expect(model.direction).toBe('RL');
  });

  it('ROUND-TRIP: parse → generate → parse preserves classes, members, operators', () => {
    const source =
      'classDiagram\n' +
      '  class Shape {\n' +
      '    <<interface>>\n' +
      '    +int sides\n' +
      '    +area() float\n' +
      '  }\n' +
      '  Shape <|.. Circle\n' +
      '  Vehicle "1" *-- "1..*" Wheel : has\n' +
      '  Client ..> Service : uses';
    const first = parseMermaidClass(source);
    const second = parseMermaidClass(generateMermaidClass(first));
    expect(second.classes).toEqual(first.classes);
    expect(second.relationships).toEqual(first.relationships);
  });

  it('ROUND-TRIP through the DiagramModel keeps the relationship KIND', () => {
    const first = imp('classDiagram\n  Animal <|-- Duck\n  Client ..> Service : uses').diagram;
    const body = dsl.generate(first);
    expect(body.startsWith('classDiagram')).toBe(true);
    const second = imp(body).diagram;
    const kinds = second.getLinks().map((l) => l.getMetadata('umlKind')).sort();
    expect(kinds).toEqual(['dependency', 'inheritance']);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// The operator set is Mermaid's `relationType? lineType relationType?` grammar —
// 72 spellings, all of which mermaid 11.16 accepts. The hand-written table this
// replaces listed 17; a line using any of the other 55 matched NO rule, so it
// was skipped and both of its classes vanished with it. An EMPTY DIAGRAM, with
// no error. That is the failure mode this whole module exists to prevent.
describe('Mermaid compat — classDiagram: the full operator grammar', () => {
  const LEFT = ['', '<|', '*', 'o', '<', '()'] as const;
  const RIGHT = ['', '|>', '*', 'o', '>', '()'] as const;
  const LINE = ['--', '..'] as const;
  const ALL: string[] = [];
  for (const l of LEFT) for (const li of LINE) for (const r of RIGHT) ALL.push(`${l}${li}${r}`);

  it('there are exactly 72 spellings, and the sweep below covers all of them', () => {
    expect(ALL).toHaveLength(72);
    expect(new Set(ALL).size).toBe(72);
  });

  it.each(ALL.map((op) => [op]))('`A %s B` yields two classes and one link', (op) => {
    const r = imp(`classDiagram\n  A ${op} B`);
    expect(r.unsupported).toBeUndefined();
    expect(nodeIds(r.diagram)).toEqual(['A', 'B']);
    expect(r.diagram.getLinks()).toHaveLength(1);
    // …and the author's own operator comes back out, character for character.
    expect(generateMermaidClass(parseMermaidClass(`classDiagram\n  A ${op} B`)))
      .toContain(`A ${op} B`);
  });

  // LOLLIPOP — the ball-and-socket notation. `bar ()-- foo` reads "foo provides
  // interface bar": Mermaid's own `addRelation` calls `addInterface(id1, id2)`
  // when the `()` is on the LEFT, making the near operand the interface and the
  // far one the implementing class. The long spelling of that sentence is
  // `foo ..|> bar`, so the kit kind is REALIZATION pointing at the interface.
  it.each([
    ['bar ()-- foo', 'foo', 'bar'],
    ['foo --() bar', 'foo', 'bar'],
    ['bar ().. foo', 'foo', 'bar'],
    ['foo ..() bar', 'foo', 'bar'],
  ])('lollipop `%s` → realization from the class (%s) to the interface (%s)', (line, from, to) => {
    const spec = umlSpecFrom(parseMermaidClass(`classDiagram\n  ${line}`));
    expect(spec.relationships).toHaveLength(1);
    expect(spec.relationships[0]).toMatchObject({ kind: 'realization', from, to });
  });

  it('a lollipop line used to produce a SILENTLY EMPTY diagram', () => {
    const r = imp('classDiagram\n    bar ()-- foo');
    expect(nodeIds(r.diagram)).toEqual(['bar', 'foo']);
    expect(r.diagram.getLinks()).toHaveLength(1);
    expect(r.diagram.getLinks()[0].getMetadata('umlKind')).toBe('realization');
  });

  it('lollipop survives the DiagramModel round-trip with its `()` intact', () => {
    const body = dsl.generate(imp('classDiagram\n  bar ()-- foo').diagram);
    expect(body).toContain('bar ()-- foo');
    expect(imp(body).diagram.getLinks()[0].getMetadata('umlKind')).toBe('realization');
  });

  // The direction rule, stated once: a triangle/arrow marks the TARGET, so
  // Mermaid writing it FIRST means the kit's ends are reversed — but a diamond
  // marks the WHOLE, i.e. the source, so the diamond kinds are the mirror.
  it.each([
    ['<|--', 'inheritance', true],
    ['--|>', 'inheritance', false],
    ['<|..', 'realization', true],
    ['..|>', 'realization', false],
    ['()--', 'realization', true],
    ['--()', 'realization', false],
    ['*--', 'composition', false],
    ['--*', 'composition', true],
    ['o--', 'aggregation', false],
    ['--o', 'aggregation', true],
    ['-->', 'directed-association', false],
    ['<--', 'directed-association', true],
    ['..>', 'dependency', false],
    ['<..', 'dependency', true],
    ['--', 'association', false],
    ['..', 'association', false],
  ])('%s → kind %s, reversed=%s', (op, kind, reversed) => {
    expect(umlRelationKind(op)).toEqual({ kind, reversed });
  });

  // MIXED operators (a marker at each end). The kit has no both-ends kind, so
  // the RIGHT marker wins and the left glyph is lost — lossy, documented, and
  // vastly better than dropping the line.
  it.each([
    ['A <|--* B', 'composition'],
    ['A o--|> B', 'inheritance'],
    ['A *--o B', 'aggregation'],
    ['A ()--|> B', 'inheritance'],
    ['A <..> B', 'dependency'],
    ['A <|--|> B', 'inheritance'],
    ['A <--> B', 'directed-association'],
  ])('mixed `%s` keeps the line, taking its kind from the right marker (%s)', (line, kind) => {
    const r = imp(`classDiagram\n  ${line}`);
    expect(nodeIds(r.diagram)).toEqual(['A', 'B']);
    expect(r.diagram.getLinks()[0].getMetadata('umlKind')).toBe(kind);
  });

  it('an operator with no marker at all is a plain association, either line type', () => {
    expect(umlRelationKind('--')).toEqual({ kind: 'association', reversed: false });
    expect(umlRelationKind('..')).toEqual({ kind: 'association', reversed: false });
  });

  it('multiplicity + label still work on a lollipop', () => {
    const model = parseMermaidClass('classDiagram\n  bar "1" ()-- "*" foo : provides');
    expect(model.relationships[0]).toMatchObject({
      operator: '()--', label: 'provides', multiplicity: ['1', '*'],
    });
    expect(generateMermaidClass(model)).toContain('bar "1" ()-- "*" foo : provides');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Mermaid compat — Phase 3: stateDiagram-v2', () => {
  it('parses (it was an explicit Phase-0 "unsupported" before)', () => {
    const r = imp('stateDiagram-v2\n  [*] --> Still\n  Still --> [*]');
    expect(r.unsupported).toBeUndefined();
    expect(r.diagram.getNodes().length).toBeGreaterThan(0);
  });

  it('`[*]` becomes DISTINCT start and end pseudo-states, not one shared node', () => {
    const r = imp('stateDiagram-v2\n  [*] --> Still\n  Still --> [*]');
    expect(nodeIds(r.diagram)).toEqual(['Still', '__end__', '__start__']);
    expect(linkPairs(r.diagram)).toEqual(['Still->__end__', '__start__->Still']);
    expect(r.diagram.getNode('__start__')!.getMetadata('stateNode')).toMatchObject({ kind: 'start' });
    expect(r.diagram.getNode('__end__')!.getMetadata('stateNode')).toMatchObject({ kind: 'end' });
  });

  it('v1 `stateDiagram` shares the grammar (v2 is a layout engine, not a syntax)', () => {
    const r = imp('stateDiagram\n  [*] --> Still\n  Still --> [*]');
    expect(r.unsupported).toBeUndefined();
    expect(nodeIds(r.diagram)).toEqual(['Still', '__end__', '__start__']);
  });

  it('transition labels', () => {
    const model = parseMermaidState('stateDiagram-v2\n  Idle --> Running : start\n  Running --> Idle : stop');
    expect(model.transitions.map((t) => t.label)).toEqual(['start', 'stop']);
  });

  it('a COMPOSITE state becomes a group, and its `[*]` is scoped to it', () => {
    const r = imp(
      'stateDiagram-v2\n' +
        '  [*] --> First\n' +
        '  state First {\n' +
        '    [*] --> second\n' +
        '    second --> third\n' +
        '  }\n' +
        '  First --> [*]'
    );
    expect(r.diagram.getGroups()).toHaveLength(1);
    const group = r.diagram.getGroups()[0];
    expect([...group.members].sort()).toEqual(['First.__start__', 'second', 'third']);
    // The composite's own entry is NOT the diagram's entry.
    expect(r.diagram.getNode('__start__')).toBeTruthy();
    expect(r.diagram.getNode('First.__start__')).toBeTruthy();
  });

  it('descriptions: `state "…" as id` and `id : …`', () => {
    const model = parseMermaidState(
      'stateDiagram-v2\n  state "A long description" as s2\n  [*] --> s2\n  s2 : replaced'
    );
    expect(model.states.find((s) => s.id === 's2')!.label).toBe('replaced');
  });

  it.each([['fork'], ['join'], ['choice']])('`state x <<%s>>` keeps its kind', (kind) => {
    const model = parseMermaidState(`stateDiagram-v2\n  state x <<${kind}>>\n  A --> x`);
    expect(model.states.find((s) => s.id === 'x')!.kind).toBe(kind);
  });

  it('a multi-line `note … end note` body does NOT become a state (Phase-0 footgun)', () => {
    // The block form has no `: text`, so its prose lines fell through to the
    // bare-state rule: `note right of A / hello / end note` minted a state
    // literally called "hello".
    const r = imp('stateDiagram-v2\n  A --> B\n  note right of A\n    hello\n  end note');
    expect(nodeIds(r.diagram)).toEqual(['A', 'B']);
    expect(parseMermaidState('stateDiagram-v2\n  A --> B\n  note right of A\n    hello\n  end note').notes)
      .toEqual([{ position: 'right of', target: 'A', text: 'hello' }]);
  });

  it('EXPORT writes `[*]` back — never the internal `__start__` id', () => {
    const body = generateMermaidState(
      parseMermaidState('stateDiagram-v2\n  [*] --> Still\n  Still --> [*]')
    );
    expect(body).toContain('[*] --> Still');
    expect(body).toContain('Still --> [*]');
    expect(body).not.toContain('__start__');
    expect(body).not.toContain('__end__');
  });

  it('ROUND-TRIP: parse → generate → parse preserves states, kinds and composites', () => {
    const source =
      'stateDiagram-v2\n' +
      '  [*] --> First\n' +
      '  state First {\n' +
      '    [*] --> second\n' +
      '    second --> third\n' +
      '  }\n' +
      '  First --> [*]\n' +
      '  state fork_state <<fork>>\n' +
      '  state "A description" as s2';
    const first = parseMermaidState(source);
    const second = parseMermaidState(generateMermaidState(first));
    expect(second.states.map((s) => `${s.id}:${s.kind}:${s.label}`).sort()).toEqual(
      first.states.map((s) => `${s.id}:${s.kind}:${s.label}`).sort()
    );
    expect(second.transitions.length).toBe(first.transitions.length);
  });

  it('ROUND-TRIP through the DiagramModel emits stateDiagram-v2, not flowchart', () => {
    const first = imp('stateDiagram-v2\n  [*] --> Still\n  Still --> Moving : go').diagram;
    const body = dsl.generate(first);
    expect(body.startsWith('stateDiagram-v2')).toBe(true);
    const second = imp(body).diagram;
    expect(second.getNodes().map((n) => n.id).sort()).toEqual(['Moving', 'Still', '__start__']);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CONCURRENCY. A `--` line inside a composite splits its body into orthogonal
// regions that run at the same time. The separator used to be ignored, so the
// regions merged into ONE composite — and because `[*]` is scoped to its body,
// every region's entry point fused into a single start node. A two-region
// keyboard (NumLock ∥ CapsLock) was read as one machine with one start and two
// outgoing initial transitions: not lossy, WRONG.
describe('Mermaid compat — stateDiagram-v2: concurrent regions', () => {
  const KEYBOARD =
    'stateDiagram-v2\n' +
    '  [*] --> Active\n' +
    '  state Active {\n' +
    '    [*] --> NumLockOff\n' +
    '    NumLockOff --> NumLockOn : EvNumLockPressed\n' +
    '    --\n' +
    '    [*] --> CapsLockOff\n' +
    '    CapsLockOff --> CapsLockOn : EvCapsLockPressed\n' +
    '  }';

  it('each region gets its OWN start pseudo-state (they used to be one node)', () => {
    const r = imp(KEYBOARD);
    expect(r.unsupported).toBeUndefined();
    expect(nodeIds(r.diagram)).toEqual([
      'Active', 'Active.region1', 'Active.region1.__start__',
      'Active.region2', 'Active.region2.__start__',
      'CapsLockOff', 'CapsLockOn', 'NumLockOff', 'NumLockOn', '__start__',
    ]);
    expect(linkPairs(r.diagram)).toContain('Active.region1.__start__->NumLockOff');
    expect(linkPairs(r.diagram)).toContain('Active.region2.__start__->CapsLockOff');
  });

  it('the regions are SEPARATE groups, nested inside the composite`s group', () => {
    const r = imp(KEYBOARD);
    const ids = r.diagram.getGroups().map((g) => g.id).sort();
    expect(ids).toEqual(['group-Active', 'group-Active.region1', 'group-Active.region2']);
    const region1 = r.diagram.getGroup('group-Active.region1')!;
    const region2 = r.diagram.getGroup('group-Active.region2')!;
    // Containment is real, not just naming: the nesting tree must resolve.
    expect(region1.parentGroupId).toBe('group-Active');
    expect(region2.parentGroupId).toBe('group-Active');
    // …and each region owns only its own states.
    expect([...region1.members].sort()).toEqual(['Active.region1.__start__', 'NumLockOff', 'NumLockOn']);
    expect([...region2.members].sort()).toEqual(['Active.region2.__start__', 'CapsLockOff', 'CapsLockOn']);
  });

  it('EXPORT puts the `--` back, and never writes a region as a nested state', () => {
    const body = generateMermaidState(parseMermaidState(KEYBOARD));
    expect(body).toContain('    --\n');
    expect(body).not.toContain('region1');
    expect(body).not.toContain('region2');
    // Both regions still start from `[*]`, inside the one composite.
    expect(body.match(/\[\*\] --> /g)).toHaveLength(3); // two regions + the outer entry
  });

  it('ROUND-TRIP: parse → generate → parse preserves the region split', () => {
    const first = parseMermaidState(KEYBOARD);
    const second = parseMermaidState(generateMermaidState(first));
    expect(second.states.map((s) => `${s.id}:${s.kind}:${s.region ?? false}`).sort()).toEqual(
      first.states.map((s) => `${s.id}:${s.kind}:${s.region ?? false}`).sort()
    );
    // Order-independent: the generator emits composite bodies before the root
    // transitions, so `[*] --> Active` moves to the end. The SET is what has to
    // survive — each region's entry must still point at its own first state.
    const key = (t: { from: string; to: string; label?: string }) => `${t.from}->${t.to}:${t.label ?? ''}`;
    expect(second.transitions.map(key).sort()).toEqual(first.transitions.map(key).sort());
  });

  it('ROUND-TRIP through the DiagramModel keeps the regions apart', () => {
    const body = dsl.generate(imp(KEYBOARD).diagram);
    expect(body).toContain('--');
    const again = imp(body).diagram;
    expect(again.getNode('Active.region1.__start__')).toBeTruthy();
    expect(again.getNode('Active.region2.__start__')).toBeTruthy();
  });

  it('three regions → three groups, in source order', () => {
    const r = imp('stateDiagram-v2\n  state A {\n    [*] --> a\n    --\n    [*] --> b\n    --\n    [*] --> c\n  }');
    expect(r.diagram.getGroups().map((g) => g.id)).toEqual([
      'group-A', 'group-A.region1', 'group-A.region2', 'group-A.region3',
    ]);
  });

  // Mermaid's lexer reads the separator as a REPEATED `--`, so an EVEN run of
  // dashes separates and an odd one is a lexical error. Confirmed against
  // mermaid 11.16 token by token — `-{2,}` would be wrong on both counts.
  it.each([['--', 2], ['----', 2], ['------', 2], ['-----', 1], ['-------', 1]])(
    'a run of %s dashes yields %i region(s)',
    (sep, regions) => {
      const model = parseMermaidState(
        `stateDiagram-v2\n  state A {\n    [*] --> a\n    ${sep}\n    [*] --> b\n  }`
      );
      // One region means "not concurrent": no synthetic regions at all.
      expect(model.states.filter((s) => s.region)).toHaveLength(regions === 1 ? 0 : regions);
      // An odd run is not valid Mermaid; ignore it, never nodify it.
      expect(model.states.some((s) => /^-+$/.test(s.id))).toBe(false);
    }
  );

  it('a composite with NO separator stays a single body (no synthetic regions)', () => {
    const model = parseMermaidState('stateDiagram-v2\n  state A {\n    [*] --> b\n  }');
    expect(model.states.some((s) => s.region)).toBe(false);
    expect(model.states.find((s) => s.id === 'A')!.concurrent).toBeUndefined();
  });

  it('a `--` at the TOP level is skipped, never turned into a state', () => {
    // Real Mermaid rejects it outright there; we ignore it rather than nodify
    // a run of dashes (invariant #1).
    const r = imp('stateDiagram-v2\n  [*] --> a\n  --\n  [*] --> b');
    expect(nodeIds(r.diagram)).toEqual(['__start__', 'a', 'b']);
  });

  it('a composite nested INSIDE a region belongs to that region', () => {
    const model = parseMermaidState(
      'stateDiagram-v2\n  state Outer {\n    [*] --> x\n    --\n    state Inner {\n      [*] --> y\n    }\n  }'
    );
    expect(model.states.find((s) => s.id === 'Inner')!.parent).toBe('Outer.region2');
    expect(model.states.find((s) => s.id === 'y')!.parent).toBe('Inner');
  });

  it('a nested composite`s `--` does not make its PARENT concurrent', () => {
    // The pre-scan must count braces: the separator below belongs to Inner.
    const model = parseMermaidState(
      'stateDiagram-v2\n  state Outer {\n    state Inner {\n      [*] --> x\n      --\n      [*] --> y\n    }\n  }'
    );
    expect(model.states.find((s) => s.id === 'Outer')!.concurrent).toBeUndefined();
    expect(model.states.find((s) => s.id === 'Inner')!.concurrent).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Three more silent-wrong readings found in the same file while fixing the two
// above. Each produced a plausible diagram that said something the author did
// not write.
describe('Mermaid compat — stateDiagram-v2: silent misreadings', () => {
  it('`state "desc" as X {` opens a composite (it used to match NOTHING)', () => {
    // The regex demanded end-of-line after the id, so the whole line was
    // ignored: the composite vanished, its children leaked into the enclosing
    // scope, and the orphaned `}` popped a scope it never pushed.
    const r = imp('stateDiagram-v2\n  state "the desc" as A {\n    [*] --> b\n  }\n  A --> [*]');
    expect(r.diagram.getGroups().map((g) => g.id)).toEqual(['group-A']);
    expect(r.diagram.getNode('A.__start__')).toBeTruthy();
    expect(parseMermaidState('stateDiagram-v2\n  state "the desc" as A {\n    [*] --> b\n  }')
      .states.find((s) => s.id === 'b')!.parent).toBe('A');
    // …and it re-exports as itself, label and body intact.
    const body = generateMermaidState(
      parseMermaidState('stateDiagram-v2\n  state "the desc" as A {\n    [*] --> b\n  }')
    );
    expect(body).toContain('state "the desc" as A {');
  });

  it('`direction` inside a composite is the COMPOSITE`s, not the diagram`s', () => {
    // It used to be hoisted onto the model and re-emitted at top level, which
    // silently re-oriented the entire diagram.
    const model = parseMermaidState('stateDiagram-v2\n  state A {\n    direction LR\n    [*] --> b\n  }');
    expect(model.direction).toBeUndefined();
    expect(model.states.find((s) => s.id === 'A')!.direction).toBe('LR');
    const body = generateMermaidState(model);
    expect(body).toContain('state A {\n        direction LR');
    expect(body.startsWith('stateDiagram-v2\n    state A')).toBe(true);
  });

  it.each([
    ['[H]', 'history', '__history__'],
    ['[H*]', 'deep-history', '__deep_history__'],
  ])('history state %s is a scoped pseudo-state (the line used to be dropped)', (token, kind, slug) => {
    const model = parseMermaidState(`stateDiagram-v2\n  state A {\n    [*] --> b\n    b --> ${token}\n  }`);
    const history = model.states.find((s) => s.kind === kind)!;
    expect(history.id).toBe(`A.${slug}`);
    expect(history.parent).toBe('A');
    expect(model.transitions).toContainEqual({ from: 'b', to: `A.${slug}` });
    // …and it is written back as the bracket token, never as the internal id.
    const body = generateMermaidState(model);
    expect(body).toContain(`b --> ${token}`);
    expect(body).not.toContain(slug);
  });

  it.each([
    ['target', 'stateDiagram-v2\n  [*] --> A:::hot'],
    ['source', 'stateDiagram-v2\n  A:::hot --> B'],
    ['bare line', 'stateDiagram-v2\n  A:::hot\n  A --> B'],
    ['declaration', 'stateDiagram-v2\n  state A:::hot\n  A --> B'],
  ])('`A:::hot` (%s) is the state A with a style hook, NOT a label `::hot`', (_where, text) => {
    // `:::cssClass` is Mermaid's inline style hook. The description rule ate it
    // first, so the state came out LABELLED `::hot` and export then wrote
    // `[*] --> A : ::hot` — a transition label the author never typed.
    const model = parseMermaidState(text);
    const a = model.states.find((s) => s.id === 'A')!;
    expect(a).toBeTruthy();
    expect(a.label).toBe('A');
    expect(a.cssClass).toBe('hot');
    expect(model.states.map((s) => s.id)).not.toContain('A:::hot');
    expect(generateMermaidState(model)).not.toContain('::hot');
  });

  it('a real description is still a description (the lookahead is not too greedy)', () => {
    const model = parseMermaidState('stateDiagram-v2\n  A : a plain description');
    expect(model.states.find((s) => s.id === 'A')!.label).toBe('a plain description');
  });

  it('a transition CROSSING two composites is emitted once, at the root', () => {
    // Matching on either endpoint put this line inside BOTH composites — a
    // duplicate edge on re-import, and one that visually adopts the far state.
    const source =
      'stateDiagram-v2\n' +
      '  state A {\n    a1 --> a2\n  }\n' +
      '  state B {\n    b1 --> b2\n  }\n' +
      '  a2 --> b1';
    const body = generateMermaidState(parseMermaidState(source));
    expect(body.match(/a2 --> b1/g)).toHaveLength(1);
    // Root indent (4), not nested inside a composite body (8).
    expect(body).toContain('\n    a2 --> b1');
    // …and every transition survives the round-trip exactly once.
    const again = parseMermaidState(body);
    expect(again.transitions).toHaveLength(3);
  });
});
