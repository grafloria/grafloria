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
