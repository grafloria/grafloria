export {
  erDiagram,
  erRowCenterY,
  ER_ROW_H,
  ER_HEAD_H,
  type ErColumn,
  type ErEntitySpec,
  type ErRelationshipSpec,
  type ErCardinality,
  type ErSide,
  type ErDiagramOptions,
} from './er';
export {
  umlDiagram,
  type UmlClassSpec,
  type UmlRelationshipSpec,
  type UmlRelationKind,
  type UmlSide,
  type UmlDiagramOptions,
} from './uml';
export { ensureDiagramKitStyles, DIAGRAM_KIT_STYLE_ID } from './styles';
export { bindRowInteractions, type RowRef, type RowInteractionsHandle } from './rows';
export {
  updateEntity,
  updateClass,
  addColumnAt,
  removeColumnAt,
  renameColumnAt,
  type ErEntityDelta,
  type UmlClassDelta,
} from './update';
export { bindCardEditing, type CardEditingHandle } from './editing';
export { matchColumns, rowIndexFromY } from './card';
// The card CONTENT builders — shared with the stencil palette so a dropped
// "Entity"/"Class" is the identical card erDiagram()/umlDiagram() produce.
export { entityCardContent, entityAutoHeight, classCardContent, classAutoHeight } from './card';
// Live join guidance — score every other table's columns against a connection
// drag's source column and tint the kit rows by fit (the query-builder story).
export {
  scoreMatch,
  matchTier,
  assignTiers,
  singularize,
  bindJoinGuidance,
  ensureJoinGuidanceStyles,
  JOIN_GUIDANCE_STYLE_ID,
  type JoinColumn,
  type JoinEnd,
  type MatchTier,
  type JoinGuidanceApi,
  type JoinGuidanceOptions,
  type JoinGuidanceHandle,
} from './join-guidance';
export {
  erTable,
  umlClass,
  erTables,
  umlClasses,
  CardHandle,
  ErTable,
  ErField,
  ErColumnList,
  UmlClass,
  UmlMemberList,
  type HandleApi,
} from './handles';
