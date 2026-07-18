/**
 * Diagram-kit stylesheet — injected once, on first use of any kit builder.
 *
 * Everything is prefixed `axk-` and the selection overrides are scoped with
 * `:has(...)` to kit cards only, so embedding the kit can never restyle a
 * host's own nodes. The rules encode the lessons the diagrams/* demos learned
 * the hard way:
 *  - the card fills the node and draws the ONLY border (the node's own rect is
 *    hidden by the builders, and suppressed again on selection because the
 *    theme paints `.selected` with an accent stroke that overrides inline
 *    transparency);
 *  - the default `.selection-highlight` outline (a dashed rect a few px
 *    OUTSIDE the node) reads as a second floating box around a bordered card —
 *    the kit hides it and rings the card itself instead.
 */

export const DIAGRAM_KIT_STYLE_ID = 'grafloria-diagram-kit-styles';

const CSS = `
/* ===== ER entity (table) cards ===== */
.axk-entity { font: 12px/1.5 system-ui, sans-serif; border: 1px solid #64748b;
  border-radius: 6px; overflow: hidden; background: #fff;
  width: 100%; height: 100%; box-sizing: border-box; }
.axk-entity-head { background: #334155; color: #fff; font-weight: 600;
  letter-spacing: .3px; padding: 5px 10px; text-transform: uppercase; font-size: 11px; }
.axk-row { display: flex; align-items: center; gap: 8px; padding: 3px 10px;
  border-top: 1px solid #e2e8f0; }
.axk-key { width: 22px; font-size: 9px; font-weight: 700; color: #b45309; }
.axk-key.axk-fk { color: #6d28d9; }
.axk-col { flex: 1; color: #0f172a; }
.axk-ty { color: #64748b; font-size: 11px; }
.axk-row.axk-pk .axk-col { font-weight: 600; }

/* ===== UML class cards ===== */
.axk-uml { font: 12px/1.5 system-ui, sans-serif; border: 1px solid #475569;
  border-radius: 4px; overflow: hidden; background: #fff;
  width: 100%; height: 100%; box-sizing: border-box; }
.axk-uml-name { text-align: center; font-weight: 700; padding: 5px 10px;
  background: #eef2ff; color: #1e1b4b; }
.axk-uml-name.axk-abstract { font-style: italic; }
.axk-uml-stereo { display: block; font-size: 10px; font-weight: 500; opacity: .8; }
.axk-uml-comp { border-top: 1px solid #475569; padding: 3px 0; }
.axk-uml-comp.axk-empty { min-height: 8px; }
.axk-member { padding: 1px 10px; font: 11px/1.5 ui-monospace, Menlo, monospace;
  color: #0f172a; white-space: nowrap; }

/* ===== Selection: ring the CARD, never a detached rectangle ===== */
g.node-group:has(.axk-entity) .selection-highlight,
g.node-group:has(.axk-uml) .selection-highlight { display: none; }
g.node-group[data-selected="true"] .axk-entity {
  border-color: #2563eb; box-shadow: 0 0 0 2px rgba(37, 99, 235, .45); }
g.node-group[data-selected="true"] .axk-uml {
  border-color: #4f46e5; box-shadow: 0 0 0 2px rgba(79, 70, 229, .45); }
g.node-group[data-selected="true"]:has(.axk-entity) rect.diagram-node,
g.node-group[data-selected="true"]:has(.axk-uml) rect.diagram-node {
  stroke: transparent !important; fill: none !important; }

/* ===== Dark mode ===== */
@media (prefers-color-scheme: dark) {
  .axk-entity { background: #1e293b; border-color: #475569; }
  .axk-row { border-top-color: #334155; }
  .axk-col { color: #e2e8f0; }
  .axk-uml { background: #1e293b; border-color: #64748b; }
  .axk-uml-name { background: #312e81; color: #e0e7ff; }
  .axk-uml-comp { border-top-color: #64748b; }
  .axk-member { color: #e2e8f0; }
}
`;

/** Inject the kit stylesheet once. Safe to call repeatedly and in SSR. */
export function ensureDiagramKitStyles(doc: Document | undefined = typeof document !== 'undefined' ? document : undefined): void {
  if (!doc) return;
  if (doc.getElementById(DIAGRAM_KIT_STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = DIAGRAM_KIT_STYLE_ID;
  style.textContent = CSS;
  doc.head.appendChild(style);
}
