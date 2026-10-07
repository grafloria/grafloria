/**
 * Mermaid graph-family diagram types beyond the flowchart (Phase 3).
 *
 * Each type is a matched TRIPLE — parser, model builder, generator — because a
 * type that parses but cannot re-emit itself loses everything the grammar
 * cannot say on the first save (gap-analysis §7).
 */
export {
  parseMermaidEr,
  erModelToDiagram,
  erModelFromDiagram,
  generateMermaidEr,
  generateErFromDiagram,
  erSpecFrom,
  erMarkers,
  type MermaidErModel,
  type MermaidErEntity,
  type MermaidErAttribute,
  type MermaidErRelationship,
  type ErCardinalityMarker,
  type ErSpec,
} from './MermaidER';

export {
  parseMermaidClass,
  classModelToDiagram,
  classModelFromDiagram,
  generateMermaidClass,
  generateClassFromDiagram,
  umlSpecFrom,
  umlRelationKind,
  type MermaidClassModel,
  type MermaidClassDef,
  type MermaidClassMember,
  type MermaidClassRelationship,
  type UmlOperator,
  type UmlLeftMarker,
  type UmlRightMarker,
  type UmlLineType,
  type UmlKind,
  type UmlSpec,
} from './MermaidClass';

export {
  parseMermaidState,
  stateModelToDiagram,
  stateModelFromDiagram,
  generateMermaidState,
  generateStateFromDiagram,
  type MermaidStateModel,
  type MermaidStateNode,
  type MermaidStateTransition,
  type StateKind,
} from './MermaidState';

export {
  parseMermaidBlock,
  blockModelToFlowchart,
  applyBlockGrid,
  generateBlockFromDiagram,
  type MermaidBlockModel,
  type BlockCell,
  type BlockGridSpec,
} from './MermaidBlock';

export {
  parseMermaidArchitecture,
  architectureModelToFlowchart,
  applyArchitectureModel,
  generateArchitectureFromDiagram,
  ARCHITECTURE_ICONS,
  type MermaidArchitectureModel,
  type MermaidArchGroup,
  type MermaidArchService,
  type MermaidArchJunction,
  type MermaidArchEdge,
  type ArchSide,
} from './MermaidArchitecture';

// The diagram-level keys the grammars write and read back — what a host loading text
// INTO an existing model must carry across for the text to export as it came in.
export { TEXT_GRAMMAR_METADATA_KEYS, adoptTextGrammarMetadata } from './text-metadata';
