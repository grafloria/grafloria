import { component$, $ } from '@builder.io/qwik';
import { GrafloriaDiagram, type DiagramInstance } from '@grafloria/qwik';
import { erDiagram } from '@grafloria/element';
import { markReady } from '../ready';

// The SAME erDiagram() kit as table-er, but with `editable: true`: double-click
// a header or a column to rename it, "＋ add column" and a per-row × — every
// change one undoable step, with the field ports and their FK→PK edges
// reconciled so an edge never points at the wrong row. The data is the JS
// page's: a FIELD-LEVEL FK edge (Orders.customer_id → Customers.id) that stays
// glued when the row above it ("status") is deleted, plus a table-level edge.
const spec = erDiagram({
  editable: true,
  entities: [
    { id: 'PRODUCTS', name: 'Products', position: { x: 80, y: 96 }, columns: [
      { name: 'id', type: 'int', pk: true },
      { name: 'sku', type: 'varchar' },
      { name: 'price', type: 'decimal' },
    ] },
    { id: 'CUSTOMERS', name: 'Customers', position: { x: 80, y: 360 }, columns: [
      { name: 'id', type: 'int', pk: true },
      { name: 'name', type: 'varchar' },
      { name: 'email', type: 'varchar' },
    ] },
    { id: 'ORDERS', name: 'Orders', position: { x: 500, y: 150 }, columns: [
      { name: 'id', type: 'int', pk: true },
      { name: 'status', type: 'varchar' },
      { name: 'customer_id', type: 'int', fk: true },
      { name: 'total', type: 'decimal' },
    ] },
  ],
  relationships: [
    // A field-level FK→PK edge — the one whose gluing this page proves.
    { from: 'ORDERS.customer_id', to: 'CUSTOMERS.id', id: 'fk_customer', fromSide: 'left', toSide: 'right' },
    // A table-level edge (side handles, no field ports on PRODUCTS).
    { from: 'PRODUCTS', to: 'ORDERS', label: 'ordered as', fromSide: 'right', toSide: 'left' },
  ],
});

/** An editable ER diagram from the erDiagram() kit: entity tables with PK/FK
 *  badges, crow's-foot relationships, in-canvas editing. */
export default component$(() => (
  <div style={{ height: '100vh' }}>
    <GrafloriaDiagram spec={spec} onReady$={$((api: DiagramInstance) => { api.fitView(40); markReady(); })} />
  </div>
));
