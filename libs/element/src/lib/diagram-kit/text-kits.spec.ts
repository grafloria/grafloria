/**
 * C9 (docs review v3): Mermaid ER and class text loaded onto a canvas lost its
 * notation. `loadText('erDiagram …')` drew plain boxes joined by a plain arrow — no
 * columns, no crow's foot — and `classDiagram` drew plain boxes whose inheritance
 * arrow was filled and pointed at the CHILD. The kit cards and markers existed all
 * along (erDiagram()/umlDiagram()); the text path just never went through them.
 *
 * Driven through the real public entry: `@grafloria/element`'s index (whose import
 * registers the kits) → render() → loadText(). And the round trip must survive:
 * exportText() still writes the same Mermaid back.
 */
import { render } from '../../index';
import type { DiagramInstance } from '@grafloria/renderer';

function host(): HTMLElement {
  const el = document.createElement('div');
  Object.defineProperty(el, 'clientWidth', { value: 1200 });
  Object.defineProperty(el, 'clientHeight', { value: 800 });
  el.getBoundingClientRect = () =>
    ({ x: 0, y: 0, top: 0, left: 0, right: 1200, bottom: 800, width: 1200, height: 800 }) as DOMRect;
  document.body.appendChild(el);
  return el;
}

const ER_TEXT = `erDiagram
    CUSTOMER {
        int id PK
        string email
    }
    ORDER {
        int id PK
        int customer_id FK
    }
    CUSTOMER ||--o{ ORDER : "places"
    ORDER }|..|| CUSTOMER : "billed to"`;

const CLASS_TEXT = `classDiagram
    class Animal {
        +String name
        +eat() void
    }
    class Dog {
        +bark() void
    }
    Animal <|-- Dog
    Dog *-- Tail
    Dog "1" --> "*" Bone : buries`;

describe('C9 — Mermaid ER / class text loads as the kit cards and markers', () => {
  let api: DiagramInstance;
  afterEach(() => api?.dispose());

  function load(text: string): DiagramInstance {
    api = render({ nodes: [], edges: [] }, host());
    api.loadText(text);
    api.renderNow();
    return api;
  }

  const linkBetween = (a: DiagramInstance, from: string, to: string) =>
    a.getModel().getLinks().find((l) => l.sourceNodeId === from && l.targetNodeId === to)!;

  it('ER: entities become table cards with their columns', () => {
    const a = load(ER_TEXT);
    const customer = a.getModel().getNode('CUSTOMER')!;
    // The card content the kit writes (the same object erDiagram() puts there).
    expect(customer.getMetadata('html')).toMatchObject({ interactive: true });
    expect(customer.getMetadata('kitEntity')).toMatchObject({ id: 'CUSTOMER' });
    // …drawn: the card is in the DOM, not a bare rectangle.
    const card = a.container.querySelector('[data-node-id="CUSTOMER"] .axk-entity');
    expect(card).not.toBeNull();
    expect(card!.textContent).toContain('email');
    expect(card!.textContent).toContain('id');
  });

  it("ER: relationships carry their cardinality markers (crow's foot), dashed when non-identifying", () => {
    const a = load(ER_TEXT);
    const places = linkBetween(a, 'CUSTOMER', 'ORDER');
    expect(places.style.arrowTail?.type).toBe('one');
    expect(places.style.arrowHead?.type).toBe('zero-or-many');
    expect(places.style.strokeDasharray).toBeUndefined();
    const billed = linkBetween(a, 'ORDER', 'CUSTOMER');
    expect(billed.style.arrowTail?.type).toBe('one-or-many');
    expect(billed.style.arrowHead?.type).toBe('one');
    expect(billed.style.strokeDasharray).toBeTruthy();
  });

  it('ER: exportText round-trips the same Mermaid after the kit look is applied', () => {
    const a = load(ER_TEXT);
    const out = a.exportText();
    expect(out).toMatch(/^erDiagram/);
    expect(out).toContain('CUSTOMER ||--o{ ORDER : "places"');
    expect(out).toContain('ORDER }|..|| CUSTOMER : "billed to"');
    expect(out).toMatch(/string email/);
  });

  it('class: classes become UML cards with their members', () => {
    const a = load(CLASS_TEXT);
    const animal = a.getModel().getNode('Animal')!;
    expect(animal.getMetadata('kitClass')).toMatchObject({ id: 'Animal' });
    expect(a.container.querySelector('[data-node-id="Animal"] .axk-uml')).not.toBeNull();
  });

  it('class: inheritance is a HOLLOW triangle at the PARENT end (Animal <|-- Dog)', () => {
    const a = load(CLASS_TEXT);
    // Mermaid writes the parent first: the link runs Animal → Dog, so the
    // generalization marker belongs on its SOURCE end (Animal), hollow.
    const inh = linkBetween(a, 'Animal', 'Dog');
    expect(inh.style.arrowTail?.type).toBe('generalization');
    expect(inh.style.arrowTail?.filled).toBe(false);
    expect(inh.style.arrowHead?.type ?? 'none').toBe('none');
  });

  it('class: composition puts the filled diamond on the whole; multiplicities become chips', () => {
    const a = load(CLASS_TEXT);
    const comp = linkBetween(a, 'Dog', 'Tail');
    expect(comp.style.arrowTail?.type).toBe('filled-diamond');
    const bone = linkBetween(a, 'Dog', 'Bone');
    expect(bone.style.arrowHead?.type).toBe('open-arrow');
    const chips = (bone.labels ?? []).map((l: { text?: string }) => l.text);
    expect(chips).toEqual(expect.arrayContaining(['1', '*']));
  });

  it('class: exportText round-trips the operators', () => {
    const a = load(CLASS_TEXT);
    const out = a.exportText();
    expect(out).toContain('Animal <|-- Dog');
    expect(out).toContain('Dog *-- Tail');
    expect(out).toMatch(/Dog "1" --> "\*" Bone : buries/);
  });
});
