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

// Performance
export * from './performance';

// Utils
export * from './utils';

// Routing
export * from './routing';

// Layout
export * from './layout';

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
