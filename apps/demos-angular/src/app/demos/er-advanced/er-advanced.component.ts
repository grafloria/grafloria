import { AfterViewInit, Component } from '@angular/core';
import { GrafloriaDiagramComponent } from '@grafloria/renderer-angular';
import { erDiagram } from '@grafloria/element';
import { markReady } from '../demo-ready';

// The advanced ER shapes, all from ONE erDiagram() call: two relationships
// between the SAME pair of tables on different FK columns, a self-reference, a
// many-to-many junction, and optional-vs-mandatory crow's-foot cardinality.
const SPEC = erDiagram({
  entities: [
    { id: 'WAREHOUSE', name: 'Warehouse', position: { x: 80, y: 70 }, columns: [
      { name: 'id', type: 'int', pk: true },
      { name: 'code', type: 'varchar' },
      { name: 'city', type: 'varchar' },
    ]},
    { id: 'SHIPMENT', name: 'Shipment', position: { x: 400, y: 150 }, columns: [
      { name: 'id', type: 'int', pk: true },
      { name: 'from_warehouse_id', type: 'int', fk: true },
      { name: 'to_warehouse_id', type: 'int', fk: true },
      { name: 'shipped_at', type: 'date' },
    ]},
    { id: 'EMPLOYEE', name: 'Employee', position: { x: 850, y: 90 }, columns: [
      { name: 'id', type: 'int', pk: true },
      { name: 'name', type: 'varchar' },
      { name: 'manager_id', type: 'int', fk: true },
    ]},
    { id: 'STUDENT', name: 'Student', position: { x: 80, y: 370 }, columns: [
      { name: 'id', type: 'int', pk: true },
      { name: 'name', type: 'varchar' },
      { name: 'email', type: 'varchar' },
    ]},
    { id: 'ENROLLMENT', name: 'Enrollment', position: { x: 430, y: 345 }, columns: [
      { name: 'id', type: 'int', pk: true },
      { name: 'student_id', type: 'int', fk: true },
      { name: 'course_id', type: 'int', fk: true },
      { name: 'grade', type: 'varchar' },
    ]},
    { id: 'COURSE', name: 'Course', position: { x: 800, y: 395 }, columns: [
      { name: 'id', type: 'int', pk: true },
      { name: 'title', type: 'varchar' },
      { name: 'credits', type: 'int' },
    ]},
  ],
  relationships: [
    { id: 'ships-to', from: 'WAREHOUSE.id', to: 'SHIPMENT.to_warehouse_id', label: 'ships to', color: '#d97706' },
    { id: 'ships-from', from: 'WAREHOUSE.id', to: 'SHIPMENT.from_warehouse_id', label: 'ships from', color: '#0d9488' },
    { id: 'reports-to', from: 'EMPLOYEE.id', to: 'EMPLOYEE.manager_id', label: 'reports to', fromSide: 'right', toSide: 'right' },
    { id: 'has', from: 'STUDENT.id', to: 'ENROLLMENT.student_id', label: 'has', cardinality: 'one-to-zero-or-many' },
    { id: 'for', from: 'COURSE.id', to: 'ENROLLMENT.course_id', label: 'for', cardinality: 'one-to-one-or-many', fromSide: 'left', toSide: 'right' },
  ],
});

// Every table takes part in a field-level join, which drops each card's default
// side ports — hand each one back an ordinary bottom connection point.
for (const n of SPEC.nodes) ((n as { ports?: unknown[] }).ports ??= []).push({ id: `${n.id}__wire__bottom`, side: 'bottom' });

@Component({
  standalone: true,
  imports: [GrafloriaDiagramComponent],
  template: `<grafloria-diagram [spec]="spec" style="display:block; height:100vh" />`,
})
export class ErAdvancedComponent implements AfterViewInit {
  spec = SPEC;
  ngAfterViewInit() { markReady(); }
}
