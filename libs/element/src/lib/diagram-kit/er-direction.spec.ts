/**
 * S14 — which end of an ER relationship is the "many" end.
 *
 * The semantics: a named cardinality reads `from` → `to`, as its name does and
 * as Mermaid's `CUSTOMER ||--o{ ORDER` does — `one-to-many` puts the "one" bar
 * at `from` and the crow's foot at `to`.
 *
 * But the natural way to write a foreign key is FROM the FK column TO the key it
 * references (`from: 'ORDER.customer_id', to: 'CUSTOMER.id'`), and that drew the
 * crow's foot on CUSTOMER — backwards. So when no cardinality is given and the
 * ends are columns, the FK/PK flags decide: the FK column is the "many" end.
 * An explicit cardinality always wins.
 */
import { erDiagram, type ErRelationshipSpec } from './er';

const entities = [
  { id: 'CUSTOMER', columns: [{ name: 'id', type: 'int', pk: true }] },
  { id: 'ORDER', columns: [{ name: 'id', type: 'int', pk: true }, { name: 'customer_id', type: 'int', fk: true }] },
];

function markers(rel: ErRelationshipSpec): { atFrom: string; atTo: string } {
  const spec = erDiagram({ entities, relationships: [rel] });
  const style = (spec.edges![0] as { style: { arrowTail: { type: string }; arrowHead: { type: string } } }).style;
  return { atFrom: style.arrowTail.type, atTo: style.arrowHead.type };
}

describe('ER relationship direction (S14)', () => {
  it('one-to-many reads from → to: the "one" end at `from`, the crow\'s foot at `to` (Mermaid order)', () => {
    expect(markers({ from: 'CUSTOMER.id', to: 'ORDER.customer_id' })).toEqual({ atFrom: 'one', atTo: 'crow-foot' });
    expect(markers({ from: 'CUSTOMER', to: 'ORDER' })).toEqual({ atFrom: 'one', atTo: 'crow-foot' });
  });

  it('written FK → PK with no cardinality, the FK column is still the "many" end', () => {
    expect(markers({ from: 'ORDER.customer_id', to: 'CUSTOMER.id' })).toEqual({ atFrom: 'crow-foot', atTo: 'one' });
  });

  it('an explicit cardinality always wins over the flags', () => {
    expect(markers({ from: 'ORDER.customer_id', to: 'CUSTOMER.id', cardinality: 'one-to-many' })).toEqual({ atFrom: 'one', atTo: 'crow-foot' });
    expect(markers({ from: 'ORDER.customer_id', to: 'CUSTOMER.id', cardinality: 'one-to-zero-or-many' })).toEqual({ atFrom: 'one', atTo: 'zero-or-many' });
  });

  it('no inference without flags to go on (whole-entity ends, or a column that is both PK and FK)', () => {
    expect(markers({ from: 'ORDER', to: 'CUSTOMER' })).toEqual({ atFrom: 'one', atTo: 'crow-foot' });
    expect(markers({ from: 'ORDER.id', to: 'CUSTOMER.id' })).toEqual({ atFrom: 'one', atTo: 'crow-foot' });
  });
});
