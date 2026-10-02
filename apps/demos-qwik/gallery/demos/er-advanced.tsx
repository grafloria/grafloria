import { component$, $, useStyles$ } from '@builder.io/qwik';
import { GrafloriaDiagram, type DiagramInstance } from '@grafloria/qwik';
import { erDiagram } from '@grafloria/element';
import { markReady } from '../ready';

// The advanced ER shapes, all from ONE erDiagram() call: two relationships
// between the SAME pair of tables on different FK columns, a self-reference, a
// many-to-many junction, and optional-vs-mandatory crow's-foot cardinality.
// Built in a function, not with a top-level loop: Qwik demo modules keep no
// top-level side effects.
function buildSpec() {
  const spec = erDiagram({
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
  for (const n of spec.nodes) ((n as { ports?: unknown[] }).ports ??= []).push({ id: `${n.id}__wire__bottom`, side: 'bottom' });
  return spec;
}

const SPEC = buildSpec();

// The page's garnish on the kit's own markup (FK rows tinted) and the corner
// cardinality legend — plain chrome, not part of the diagram model.
const CSS = `
  .er-advanced-page .axk-row:has(.axk-key.axk-fk) { background: #faf5ff; }
  .er-legend { position: fixed; left: 14px; bottom: 14px; z-index: 5;
    font: 11px/1.4 system-ui, sans-serif; background: rgba(255,255,255,.94);
    border: 1px solid #cbd5e1; border-radius: 8px; padding: 8px 11px;
    box-shadow: 0 4px 14px rgba(15,23,42,.12); color: #334155; }
  .er-legend b { display: block; margin-bottom: 5px; font-size: 10px; letter-spacing: .4px;
    text-transform: uppercase; color: #64748b; }
  .er-legend div { display: flex; align-items: center; gap: 7px; margin: 2px 0; }
  .er-legend svg { flex: none; }
  @media (prefers-color-scheme: dark) {
    .er-advanced-page .axk-row:has(.axk-key.axk-fk) { background: #2a2140; }
    .er-legend { background: rgba(30,41,59,.94); border-color: #475569; color: #e2e8f0; }
    .er-legend b { color: #94a3b8; }
  }
`;

const Icon = component$<{ d: string }>(({ d }) => (
  <svg width="42" height="18" viewBox="0 0 42 18" fill="none" stroke="#64748b" stroke-width="1.4"
    dangerouslySetInnerHTML={d} />
));

/** The advanced ER shapes from ONE erDiagram() call: dual FK relationships,
 *  self-reference, junction table and optional/mandatory crow's-foot ends. */
export default component$(() => {
  useStyles$(CSS);
  return (
    <div class="er-advanced-page" style={{ height: '100vh' }}>
      <GrafloriaDiagram spec={SPEC} onReady$={$((api: DiagramInstance) => { api.fitView(48); markReady(); })} />
      <div class="er-legend">
        <b>Cardinality</b>
        <div><Icon d={'<line x1="2" y1="9" x2="30" y2="9"/><line x1="24" y1="4" x2="24" y2="14"/>'} />exactly one</div>
        <div><Icon d={'<line x1="2" y1="9" x2="26" y2="9"/><line x1="26" y1="9" x2="40" y2="3"/><line x1="26" y1="9" x2="40" y2="9"/><line x1="26" y1="9" x2="40" y2="15"/>'} />many (crow's-foot)</div>
        <div><Icon d={'<circle cx="7" cy="9" r="4"/><line x1="11" y1="9" x2="26" y2="9"/><line x1="26" y1="9" x2="40" y2="3"/><line x1="26" y1="9" x2="40" y2="9"/><line x1="26" y1="9" x2="40" y2="15"/>'} />zero-or-many — optional</div>
        <div><Icon d={'<line x1="2" y1="9" x2="26" y2="9"/><line x1="9" y1="4" x2="9" y2="14"/><line x1="26" y1="9" x2="40" y2="3"/><line x1="26" y1="9" x2="40" y2="9"/><line x1="26" y1="9" x2="40" y2="15"/>'} />one-or-many — mandatory</div>
      </div>
    </div>
  );
});
