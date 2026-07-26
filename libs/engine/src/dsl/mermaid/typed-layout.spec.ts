// Type-aware Mermaid layout — geometry, not counts.
//
// The gap analysis (§3a, "all three types") named the naive grid as a defect:
// "no type-aware layout (ER tables by FK dependency, class by inheritance
// depth, state by flow)". These specs lock the replacement the way
// direction-layout.spec.ts locks the flowchart direction: by asserting where
// nodes actually LAND.

import { DSL } from '../DSL';

const parse = (text: string) => new DSL().parse(text);

describe('erDiagram — FK-dependency ranking', () => {
  it('the referenced entity sits strictly before the referencing one', () => {
    const diagram = parse('erDiagram\n    CUSTOMER ||--o{ ORDER : places');
    const customer = diagram.getNode('CUSTOMER')!;
    const order = diagram.getNode('ORDER')!;
    // Default direction is TB: the layout axis is y, CUSTOMER above ORDER —
    // strictly: the whole card, not just the origin.
    expect(customer.position.y + customer.size.height).toBeLessThan(order.position.y);
  });

  it('written order does not matter — the ONE side leads either way', () => {
    const diagram = parse('erDiagram\n    ORDER }o--|| CUSTOMER : "placed by"');
    const customer = diagram.getNode('CUSTOMER')!;
    const order = diagram.getNode('ORDER')!;
    expect(customer.position.y + customer.size.height).toBeLessThan(order.position.y);
  });

  it('a chain of FKs makes three distinct ranks', () => {
    const diagram = parse(
      [
        'erDiagram',
        '    CUSTOMER ||--o{ ORDER : places',
        '    ORDER ||--|{ LINE_ITEM : contains',
      ].join('\n')
    );
    const y = (id: string) => diagram.getNode(id)!.position.y;
    expect(y('CUSTOMER')).toBeLessThan(y('ORDER'));
    expect(y('ORDER')).toBeLessThan(y('LINE_ITEM'));
  });

  it('direction LR ranks across the page instead', () => {
    const diagram = parse(
      'erDiagram\n    direction LR\n    CUSTOMER ||--o{ ORDER : places'
    );
    const customer = diagram.getNode('CUSTOMER')!;
    const order = diagram.getNode('ORDER')!;
    expect(customer.position.x + customer.size.width).toBeLessThan(order.position.x);
  });
});

describe('classDiagram — inheritance-depth ranking', () => {
  it('Animal <|-- Dog <|-- Puppy: three distinct descending ranks', () => {
    const diagram = parse(
      ['classDiagram', '    Animal <|-- Dog', '    Dog <|-- Puppy'].join('\n')
    );
    const animal = diagram.getNode('Animal')!;
    const dog = diagram.getNode('Dog')!;
    const puppy = diagram.getNode('Puppy')!;
    expect(animal.position.y + animal.size.height).toBeLessThan(dog.position.y);
    expect(dog.position.y + dog.size.height).toBeLessThan(puppy.position.y);
  });

  it('the flipped spelling ranks identically: Dog --|> Animal keeps Animal above', () => {
    const diagram = parse('classDiagram\n    Dog --|> Animal');
    expect(diagram.getNode('Animal')!.position.y).toBeLessThan(
      diagram.getNode('Dog')!.position.y
    );
  });

  it('realization ranks the interface above the implementing class', () => {
    const diagram = parse('classDiagram\n    Shape <|.. Circle');
    expect(diagram.getNode('Shape')!.position.y).toBeLessThan(
      diagram.getNode('Circle')!.position.y
    );
  });

  it('siblings under one parent share a rank and separate on the cross axis', () => {
    const diagram = parse(
      ['classDiagram', '    Animal <|-- Dog', '    Animal <|-- Cat'].join('\n')
    );
    const dog = diagram.getNode('Dog')!;
    const cat = diagram.getNode('Cat')!;
    expect(dog.position.y).toBeCloseTo(cat.position.y, 5);
    expect(Math.abs(dog.position.x - cat.position.x)).toBeGreaterThan(1);
  });

  it('association does NOT affect ranking — only inheritance/realization do', () => {
    const diagram = parse('classDiagram\n    Customer --> Address');
    // No inheritance: both classes sit at rank 0, side by side.
    expect(diagram.getNode('Customer')!.position.y).toBeCloseTo(
      diagram.getNode('Address')!.position.y,
      5
    );
  });

  it('mixed: association between ranked classes leaves the ranks alone', () => {
    const diagram = parse(
      [
        'classDiagram',
        '    Animal <|-- Dog',
        '    Dog --> Bone : chews',
      ].join('\n')
    );
    // Bone has no inheritance edge, so it stays at rank 0 next to Animal —
    // the association must not drag it below Dog.
    expect(diagram.getNode('Bone')!.position.y).toBeCloseTo(
      diagram.getNode('Animal')!.position.y,
      5
    );
    expect(diagram.getNode('Animal')!.position.y).toBeLessThan(
      diagram.getNode('Dog')!.position.y
    );
  });
});

describe('stateDiagram — flow ranking, containment and banding', () => {
  const bbox = (diagram: ReturnType<typeof parse>, id: string) => {
    const node = diagram.getNode(id)!;
    return {
      left: node.position.x,
      top: node.position.y,
      right: node.position.x + node.size.width,
      bottom: node.position.y + node.size.height,
    };
  };

  it('states rank by flow from the start pseudo-state', () => {
    const diagram = parse(
      [
        'stateDiagram-v2',
        '  [*] --> Still',
        '  Still --> Moving',
        '  Moving --> Still',
        '  Moving --> Crash',
        '  Crash --> [*]',
      ].join('\n')
    );
    const y = (id: string) => diagram.getNode(id)!.position.y;
    // start → Still → Moving → Crash → end, strictly down the page; the
    // Moving-->Still back-edge must not drag Still below Moving.
    expect(y('__start__')).toBeLessThan(y('Still'));
    expect(y('Still')).toBeLessThan(y('Moving'));
    expect(y('Moving')).toBeLessThan(y('Crash'));
    expect(y('Crash')).toBeLessThan(y('__end__'));
  });

  it('a composite is sized to CONTAIN its children', () => {
    const diagram = parse(
      [
        'stateDiagram-v2',
        '  [*] --> Working',
        '  state Working {',
        '    [*] --> Draft',
        '    Draft --> Review',
        '  }',
      ].join('\n')
    );
    const outer = bbox(diagram, 'Working');
    for (const id of ['Working.__start__', 'Draft', 'Review']) {
      const inner = bbox(diagram, id);
      expect(inner.left).toBeGreaterThanOrEqual(outer.left);
      expect(inner.top).toBeGreaterThanOrEqual(outer.top);
      expect(inner.right).toBeLessThanOrEqual(outer.right);
      expect(inner.bottom).toBeLessThanOrEqual(outer.bottom);
    }
    // …and the children flow INSIDE it.
    expect(diagram.getNode('Draft')!.position.y).toBeLessThan(
      diagram.getNode('Review')!.position.y
    );
  });

  it('concurrent regions: the two regions\' children occupy DISJOINT bands', () => {
    const diagram = parse(
      [
        'stateDiagram-v2',
        '  state Active {',
        '    s1 --> s2',
        '    --',
        '    t1 --> t2',
        '  }',
        '  [*] --> Active',
      ].join('\n')
    );
    const first = ['s1', 's2'].map((id) => bbox(diagram, id));
    const second = ['t1', 't2'].map((id) => bbox(diagram, id));
    const firstBottom = Math.max(...first.map((b) => b.bottom));
    const secondTop = Math.min(...second.map((b) => b.top));
    // Band 1 ends strictly above band 2 — the un-banded picture (both regions
    // interleaved) is the defect the gap analysis names.
    expect(firstBottom).toBeLessThan(secondTop);

    // The synthetic region nodes are the bands, stacked inside the composite.
    const band1 = bbox(diagram, 'Active.region1');
    const band2 = bbox(diagram, 'Active.region2');
    expect(band1.bottom).toBeLessThanOrEqual(band2.top);
    const composite = bbox(diagram, 'Active');
    for (const band of [band1, band2]) {
      expect(band.left).toBeGreaterThanOrEqual(composite.left);
      expect(band.right).toBeLessThanOrEqual(composite.right);
      expect(band.top).toBeGreaterThanOrEqual(composite.top);
      expect(band.bottom).toBeLessThanOrEqual(composite.bottom);
    }

    // And every child sits inside ITS band.
    for (const [ids, band] of [
      [['s1', 's2'], band1],
      [['t1', 't2'], band2],
    ] as const) {
      for (const id of ids) {
        const b = bbox(diagram, id);
        expect(b.top).toBeGreaterThanOrEqual(band.top);
        expect(b.bottom).toBeLessThanOrEqual(band.bottom);
      }
    }
  });

  it('the exported text is unchanged by layout (positions are not grammar)', () => {
    const src = [
      'stateDiagram-v2',
      '  state Active {',
      '    s1 --> s2',
      '    --',
      '    t1 --> t2',
      '  }',
      '  [*] --> Active',
    ].join('\n');
    const dsl = new DSL();
    const diagram = dsl.parse(src);
    const generated = dsl.generate(diagram);
    // Same body from a re-parse of the generated body: layout cannot leak into
    // the text form.
    expect(dsl.generate(dsl.parse(generated))).toBe(generated);
  });
});
