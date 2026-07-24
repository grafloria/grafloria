<script setup lang="ts">
import { onMounted } from 'vue';
import { GrafloriaDiagram } from '@grafloria/vue';
import { erDiagram } from '@grafloria/element';
import { markReady } from '../ready';

// A database entity-relationship diagram from PURE DATA via the reusable
// erDiagram() kit: HTML "table" nodes with typed columns and PK/FK badges,
// joined by crow's-foot cardinality — look, selection and routing all from
// the kit. This page just declares the schema.
const spec = erDiagram({
  entities: [
    { id: 'CUSTOMER', name: 'Customer', position: { x: 60, y: 76 }, columns: [
      { name: 'id', type: 'int', pk: true },
      { name: 'name', type: 'varchar' },
      { name: 'email', type: 'varchar' },
    ]},
    { id: 'ORDER', name: 'Order', position: { x: 400, y: 64 }, columns: [
      { name: 'id', type: 'int', pk: true },
      { name: 'customer_id', type: 'int', fk: true },
      { name: 'placed_at', type: 'date' },
      { name: 'total', type: 'decimal' },
    ]},
    { id: 'LINE_ITEM', name: 'Line Item', position: { x: 740, y: 64 }, columns: [
      { name: 'id', type: 'int', pk: true },
      { name: 'order_id', type: 'int', fk: true },
      { name: 'product_id', type: 'int', fk: true },
      { name: 'qty', type: 'int' },
    ]},
    { id: 'PRODUCT', name: 'Product', position: { x: 740, y: 380 }, columns: [
      { name: 'id', type: 'int', pk: true },
      { name: 'sku', type: 'varchar' },
      { name: 'price', type: 'decimal' },
    ]},
  ],
  relationships: [
    { from: 'CUSTOMER', to: 'ORDER', label: 'places' },
    { from: 'ORDER', to: 'LINE_ITEM', label: 'contains' },
    { from: 'PRODUCT', to: 'LINE_ITEM', label: 'appears in', fromSide: 'top', toSide: 'bottom' },
  ],
});

onMounted(() => markReady());
</script>

<template>
  <div style="height:100vh">
    <GrafloriaDiagram :spec="spec" />
  </div>
</template>
