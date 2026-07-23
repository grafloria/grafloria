import { useEffect } from 'react';
import { GrafloriaDiagram } from '@grafloria/react';
import { erDiagram } from '@grafloria/element';
import { markReady } from '../ready';

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
    { id: 'ORDERS', name: 'Orders', position: { x: 460, y: 200 }, columns: [
      { name: 'id', type: 'int', pk: true },
      { name: 'product_id', type: 'int', fk: true },
      { name: 'customer_id', type: 'int', fk: true },
      { name: 'total', type: 'decimal' },
    ] },
  ],
  relationships: [
    { from: 'PRODUCTS', to: 'ORDERS', cardinality: 'one-to-many' },
    { from: 'CUSTOMERS', to: 'ORDERS', cardinality: 'one-to-many' },
  ],
});

/** An editable ER diagram from the erDiagram() kit: entity tables with PK/FK
 *  badges, crow's-foot relationships, in-canvas editing. */
export default function ErdEditorDemo() {
  useEffect(() => markReady(), []);
  return (
    <div style={{ height: '100vh' }}>
      <GrafloriaDiagram spec={spec} />
    </div>
  );
}
