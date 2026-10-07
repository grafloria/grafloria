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
  width: 100%; height: 100%; box-sizing: border-box;
  display: flex; flex-direction: column; }
.axk-entity-body { flex: 1; min-height: 0; overflow-y: hidden; }
.axk-entity-body.axk-scroll { overflow-y: auto; scrollbar-width: thin; }
/* The head is sized by entityAutoWidth, but a title past the auto-width ceiling
   still has to degrade VISIBLY: this rule used to be absent entirely, so a long
   table name ran off the card and was cut by .axk-entity's overflow:hidden with
   nothing to show for it (measured: 305px of name in a 180px head — 125px gone,
   no ellipsis, no hint). nowrap also keeps the head exactly ER_HEAD_H tall,
   which entityAutoHeight's row math depends on. */
.axk-entity-head { background: #334155; color: #fff; font-weight: 600;
  letter-spacing: .3px; padding: 5px 10px; text-transform: uppercase; font-size: 11px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.axk-row { display: flex; align-items: center; gap: 8px; padding: 3px 10px;
  border-top: 1px solid #e2e8f0; }
.axk-key { width: 22px; font-size: 9px; font-weight: 700; color: #b45309; }
.axk-key.axk-fk { color: #6d28d9; }
/* ONE LINE PER COLUMN, ALWAYS — this rule is load-bearing for the card's HEIGHT.
   entityAutoHeight allocates exactly ER_ROW_H per column, and .axk-entity-body is
   overflow-y:hidden, so a name that wrapped to a second line pushed the last row
   past the card's bottom edge and it silently vanished (measured: a 40px row
   against the 25px the height math had reserved — 14px of the final column gone,
   with no scrollbar to hint at it). Long identifiers ellipsis instead, so the
   ROW always survives even when the text does not fit; an author who needs the
   whole identifier visible sets an explicit width on the entity. (No title
   attribute: the HTML-node contract deliberately passes text through
   textContent and no attributes, and a tooltip is not worth widening it.)
   min-width:0 is what lets a flex child shrink below its content. */
.axk-col { flex: 1; min-width: 0; color: #0f172a;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.axk-ty {
  color: #64748b; font-size: 11px;
  /* A new column starts with an EMPTY type, which collapsed the cell to zero
     width — there was nothing to double-click, so a type could never be set on
     a field you just added. Reserve a target and hint that it is editable. */
  min-width: 52px; text-align: right; cursor: text;
  /* Same contract as .axk-col: a long type must not wrap the row either.
     It keeps its reserved width and never shrinks away. */
  flex: 0 0 auto; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  max-width: 45%;
}
.axk-ty:empty::before { content: 'type'; color: #cbd5e1; font-style: italic; }
.axk-ty:hover { color: #0f172a; }
.axk-row.axk-pk .axk-col { font-weight: 600; }

/* ===== UML class cards ===== */
.axk-uml { font: 12px/1.5 system-ui, sans-serif; border: 1px solid #475569;
  border-radius: 4px; overflow: hidden; background: #fff;
  width: 100%; height: 100%; box-sizing: border-box;
  display: flex; flex-direction: column; }
.axk-uml-body { flex: 1; min-height: 0; overflow-y: hidden; }
.axk-uml-body.axk-scroll { overflow-y: auto; scrollbar-width: thin; }
/* Same one-line contract as .axk-entity-head: UML_NAME_H is what
   classAutoHeight reserves, so a wrapped class name would push the first
   compartment past the card's bottom edge. */
.axk-uml-name { text-align: center; font-weight: 700; padding: 5px 10px;
  background: #eef2ff; color: #1e1b4b;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.axk-uml-name.axk-abstract { font-style: italic; }
.axk-uml-stereo { display: block; font-size: 10px; font-weight: 500; opacity: .8; }
.axk-uml-comp { border-top: 1px solid #475569; padding: 3px 0; }
.axk-uml-comp.axk-empty { min-height: 8px; }
/* Members already refused to wrap, but with no ellipsis they were cut
   MID-GLYPH by the card's overflow:hidden — a method signature needing 487px
   in a 190px card lost 297px of itself silently, on the one line a class
   diagram exists to show. classAutoWidth now widens the card to fit; past its
   ceiling this ellipsis says so. min-width:0 lets the editable flex variant
   shrink. */
.axk-member { padding: 1px 10px; font: 11px/1.5 ui-monospace, Menlo, monospace;
  color: #0f172a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  min-width: 0; }

/* ===== Row interactivity (cards are interactive; drag stays geometric) ===== */
.axk-entity, .axk-uml { user-select: none; -webkit-user-select: none; }
.axk-row:hover { background: rgba(37, 99, 235, .07); }
.axk-member:hover { background: rgba(79, 70, 229, .07); }
.axk-row-selected, .axk-row-selected:hover { background: rgba(37, 99, 235, .16);
  box-shadow: inset 2px 0 0 #2563eb; }
.axk-member.axk-row-selected, .axk-member.axk-row-selected:hover {
  background: rgba(79, 70, 229, .16); box-shadow: inset 2px 0 0 #4f46e5; }

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

/* ===== In-canvas editing chrome (only present when editable) ===== */
.axk-col-del { width: 14px; text-align: center; color: #94a3b8; cursor: pointer;
  font-weight: 700; opacity: 0; transition: opacity .1s; flex: 0 0 auto; }
.axk-row:hover .axk-col-del, .axk-member:hover .axk-col-del { opacity: 1; }
.axk-col-del:hover { color: #dc2626; }
/* Only editable members (which wrap their text in .axk-mtext) go flex — a
   read-only member stays a plain text div, so its golden never shifts. */
.axk-member:has(.axk-mtext) { display: flex; align-items: center; }
.axk-member .axk-mtext { flex: 1; min-width: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.axk-entity-add, .axk-uml-add { padding: 3px 10px; font-size: 11px; font-weight: 600;
  color: #2563eb; cursor: pointer; border-top: 1px dashed #cbd5e1; user-select: none; }
.axk-uml-add { color: #4f46e5; border-top: 1px dashed #c7d2fe; text-align: left; }
.axk-entity-add:hover, .axk-uml-add:hover { background: rgba(37, 99, 235, .08); }
.axk-edit-input { font: 12px/1.4 system-ui, sans-serif; box-sizing: border-box;
  border: 1px solid #2563eb; border-radius: 3px; padding: 1px 6px; margin: 0;
  background: #fff; color: #0f172a; outline: none; box-shadow: 0 1px 4px rgba(0,0,0,.2); }

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
