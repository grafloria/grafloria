/**
 * DSL Module - Mermaid-compatible diagram text parsing
 *
 * Provides complete text-to-diagram conversion pipeline:
 * - Lexical analysis (Lexer)
 * - Syntax parsing (Parser)
 * - AST transformation (ASTTransformer)
 * - Layout detection (LayoutDetector)
 *
 * @example
 * ```typescript
 * import { DSL } from '@grafloria/engine/dsl';
 *
 * const dsl = new DSL({ autoLayout: true });
 * const diagram = dsl.parse(`
 *   flowchart LR
 *     A[Start] --> B[Process]
 *     B --> C[End]
 * `);
 *
 * console.log(diagram.getNodes().length); // 3 nodes
 * ```
 */
// Main DSL interface
export { DSL } from './DSL';
// Core components
export { Lexer } from './lexer/Lexer';
export { Parser, ParseError } from './parser/Parser';
export { ASTTransformer } from './transformer/ASTTransformer';
export { LayoutDetector } from './detector/LayoutDetector';
// Generator components (Phase 1.3)
export { DSLGenerator } from './generator/DSLGenerator';
export { DSLFormatter } from './generator/DSLFormatter';
export { DiagramAnalyzer } from './generator/DiagramAnalyzer';
// Sync components (Phase 2)
export * from './sync';
// Mermaid graph-family types beyond the flowchart (Phase 3):
// erDiagram / classDiagram / stateDiagram-v2 — parser + generator + the
// diagram-kit spec projections (erSpecFrom / umlSpecFrom).
export * from './mermaid';
// Type definitions
export { TokenType, createToken, } from './types/Token';
export { isNodeDefinition, isEdgeDefinition, isSubgraph, isStyleNode, isClassDef, } from './types/ASTNode';
//# sourceMappingURL=index.js.map