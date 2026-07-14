// Core library exports

// Types
export * from './types';

// Models
export * from './models';

// Events
export * from './events';

// Commands
export * from './commands';

// Plugins
export * from './plugins';

// Adapters
export * from './adapters';

// Validation
export * from './validation';

// State
export * from './state';

// Config
export * from './config';

// Engine
export * from './engine';

// Serialization
export { DiagramSerializer } from './serialization/Serializer';
export type { SerializedDiagram as SerializedDiagramData } from './serialization/Serializer';
export {
  DIAGRAM_SCHEMA_VERSION,
  registerDiagramMigration,
  getDiagramMigrations,
  runDiagramMigrations,
} from './serialization/DiagramMigrations';
export type { DiagramMigration } from './serialization/DiagramMigrations';
export {
  validateSerializedDiagram,
  DiagramValidationError,
} from './serialization/DiagramValidator';
export {
  DIAGRAM_ENVELOPE_FORMAT,
  DIAGRAM_ENVELOPE_VERSION,
  wrapDiagramDocument,
  unwrapDiagramDocument,
  isDiagramDocumentEnvelope,
  canonicalStringify,
  checksumOf,
  DiagramChecksumError,
} from './serialization/DocumentEnvelope';
export type {
  DiagramDocumentEnvelope,
  WrapOptions,
  UnwrapResult,
} from './serialization/DocumentEnvelope';
export {
  SUBGRAPH_FORMAT,
  serializeSubgraph,
  deserializeSubgraphInto,
} from './serialization/Subgraph';
export type {
  SerializedSubgraph,
  SubgraphSelection,
  DeserializeSubgraphOptions,
  DeserializedSubgraph,
} from './serialization/Subgraph';
export {
  INCREMENTAL_FORMAT,
  IncrementalCapture,
  beginIncrementalCapture,
} from './serialization/Incremental';
export type { DiagramIncremental } from './serialization/Incremental';
export {
  exportDiagramText,
  importDiagramText,
  stripGrafloriaSidecar,
  GRAFLORIA_DOC_PREFIX,
  GRAFLORIA_HASH_PREFIX,
} from './serialization/TextFormat';
export type {
  ExportTextOptions,
  ImportTextOptions,
  ImportTextResult,
} from './serialization/TextFormat';
export type {
  DiagramValidationFinding,
  DiagramValidationReport,
} from './serialization/DiagramValidator';

// Performance
export * from './performance';

// Utils
export * from './utils';

// Routing
export * from './routing';

// Layout
export * from './layout';

// Interaction (Wave-2: group drag-in/out membership)
export * from './interaction';

// Templates (Phase 2)
export * from './templates';

// Rendering (Phase 3.4)
export * from './rendering';

// Template Library (Phase 4)
export * from './template-library';

// Mobile Input (Phase 4)
export * from './lib/input';

// DSL (Phase 1.2)
// Explicitly export DSL exports to avoid conflicts with Position and Direction from other modules
export {
  DSL,
  type DSLOptions,
  type ParseResult,
  Lexer,
  Parser,
  ParseError,
  ASTTransformer,
  type TransformOptions,
  LayoutDetector,
  type LayoutSuggestion,
  type DiagramCharacteristics,
  DSLGenerator,
  type GeneratorOptions,
  DSLFormatter,
  type FormatterOptions,
  DiagramAnalyzer,
  type DiagramAnalysis,
  type Token,
  TokenType,
  createToken,
  type ASTNode,
  type DiagramNode,
  type StatementNode,
  type NodeDefinitionNode,
  type EdgeDefinitionNode,
  type SubgraphNode,
  type StyleNode,
  type ClassDefNode,
  type Direction as ASTDirection,
  type DiagramType,
  type NodeShape,
  type LinkType,
  type StyleProperties,
  type SourceLocation,
  type Position as ASTPosition,
  isNodeDefinition,
  isEdgeDefinition,
  isSubgraph,
  isStyleNode,
  isClassDef,
} from './dsl';
export * from './dsl/sync';

// Wave 6 (Ports & connections): groups, typed data-flow, the connection validator
export * from './ports';

// Wave 9 (Collaboration) — the op-log substrate (Card 0).
export * from './collab';

// Wave 9 (Collaboration) — the transport layer (Card 5): a transport-agnostic SyncAdapter
// (catch-up, causal readiness, batching, mesh relay), three real transports, and the
// awareness channel — which is separate from the op log, and must stay that way.
export * from './sync';
