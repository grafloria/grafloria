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
