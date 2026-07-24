import { AfterViewInit, Component } from '@angular/core';
import { GrafloriaDiagramComponent } from '@grafloria/angular';
import { erDiagram, umlDiagram } from '@grafloria/element';
import { markReady } from '../demo-ready';

// A card with far more rows than it should stretch to: give the ER entity OR the
// UML class a fixed `height` and the kit body scrolls. Both shown here — a
// 21-column ER table and a 26-member UML class, each capped and scrolling.
const COLUMNS = [
  { name: 'id', type: 'int', pk: true },
  { name: 'sku', type: 'varchar' },
  { name: 'name', type: 'varchar' },
  { name: 'description', type: 'text' },
  { name: 'category', type: 'varchar' },
  { name: 'supplier_id', type: 'int', fk: true },
  { name: 'unit_cost', type: 'decimal' },
  { name: 'list_price', type: 'decimal' },
  { name: 'currency', type: 'char(3)' },
  { name: 'weight_kg', type: 'decimal' },
  { name: 'width_cm', type: 'decimal' },
  { name: 'height_cm', type: 'decimal' },
  { name: 'depth_cm', type: 'decimal' },
  { name: 'stock_on_hand', type: 'int' },
  { name: 'stock_reserved', type: 'int' },
  { name: 'reorder_level', type: 'int' },
  { name: 'reorder_qty', type: 'int' },
  { name: 'barcode', type: 'varchar' },
  { name: 'is_active', type: 'bool' },
  { name: 'created_at', type: 'timestamp' },
  { name: 'updated_at', type: 'timestamp' },
];

const er = erDiagram({
  entities: [
    { id: 'SUPPLIER', name: 'Supplier', position: { x: 120, y: 90 }, columns: [
      { name: 'id', type: 'int', pk: true },
      { name: 'name', type: 'varchar' },
    ]},
    { id: 'ITEM', name: 'Warehouse Item', position: { x: 460, y: 60 }, height: 260, columns: COLUMNS },
  ],
  relationships: [{ from: 'SUPPLIER', to: 'ITEM', label: 'supplies' }],
});

const uml = umlDiagram({
  classes: [
    { id: 'Repo', name: 'Repository', position: { x: 460, y: 400 }, height: 240,
      attributes: Array.from({ length: 16 }, (_, i) => `- field${i + 1}: string`),
      methods: Array.from({ length: 10 }, (_, i) => `+ op${i + 1}(): void`) },
    { id: 'Entity', name: 'Entity', position: { x: 120, y: 440 },
      attributes: ['- id: int'], methods: ['+ save(): void'] },
  ],
  relationships: [{ from: 'Entity', to: 'Repo', kind: 'association' }],
});

const SPEC = { nodes: [...er.nodes, ...uml.nodes], edges: [...er.edges, ...uml.edges] };

@Component({
  standalone: true,
  imports: [GrafloriaDiagramComponent],
  template: `<grafloria-diagram [spec]="spec" style="display:block; height:100vh" />`,
})
export class ScrollableCardsComponent implements AfterViewInit {
  spec = SPEC;
  ngAfterViewInit() { markReady(); }
}
