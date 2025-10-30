/**
 * Abstract Syntax Tree (AST) Node Definitions
 *
 * Represents the parsed structure of diagram DSL code
 */

export type Direction = 'TD' | 'TB' | 'BT' | 'RL' | 'LR';

export type DiagramType = 'flowchart' | 'bpmn' | 'erd' | 'classDiagram';

/**
 * Node shape type mapping to Mermaid syntax
 */
export type NodeShape =
  | 'rectangle'          // [text]
  | 'rounded-rectangle'  // (text)
  | 'stadium'            // ([text])
  | 'subroutine'         // [[text]]
  | 'cylindrical'        // [(text)]
  | 'circle'             // ((text))
  | 'asymmetric'         // >text]
  | 'rhombus'            // {text}
  | 'hexagon'            // {{text}}
  | 'trapezoid'          // [/text/]
  | 'trapezoid-alt';     // [\text\]

/**
 * Link/Edge type mapping
 */
export type LinkType =
  | 'arrow'              // -->
  | 'line'               // ---
  | 'dotted-arrow'       // -.->
  | 'dotted-line'        // -.-
  | 'thick-arrow'        // ==>
  | 'thick-line'         // ===
  | 'bidirectional'      // <-->
  | 'circle-edge'        // --o
  | 'cross-edge';        // --x

/**
 * Base AST Node
 */
export interface ASTNode {
  type: string;
  location?: SourceLocation;
}

/**
 * Source location in the original text
 */
export interface SourceLocation {
  start: Position;
  end: Position;
}

export interface Position {
  line: number;
  column: number;
  index: number;
}

/**
 * Root diagram node
 */
export interface DiagramNode extends ASTNode {
  type: 'Diagram';
  diagramType: DiagramType;
  direction?: Direction;
  statements: StatementNode[];
}

/**
 * Statement types
 */
export type StatementNode =
  | NodeDefinitionNode
  | EdgeDefinitionNode
  | SubgraphNode
  | StyleNode
  | ClassDefNode;

/**
 * Node definition: A[Label]
 */
export interface NodeDefinitionNode extends ASTNode {
  type: 'NodeDefinition';
  id: string;
  label?: string;
  shape: NodeShape;
  style?: StyleProperties;
}

/**
 * Edge/Link definition: A --> B
 */
export interface EdgeDefinitionNode extends ASTNode {
  type: 'EdgeDefinition';
  source: string;
  target: string;
  linkType: LinkType;
  label?: string;
  style?: StyleProperties;
  /**
   * Source node shape if specified inline (e.g., A[Label] --> B)
   */
  sourceShape?: NodeShape;
  /**
   * Source node label if specified inline (e.g., A[Label] --> B)
   */
  sourceLabel?: string;
  /**
   * Target node shape if specified inline (e.g., A --> B[Label])
   */
  targetShape?: NodeShape;
  /**
   * Target node label if specified inline (e.g., A --> B[Label])
   */
  targetLabel?: string;
}

/**
 * Subgraph definition
 */
export interface SubgraphNode extends ASTNode {
  type: 'Subgraph';
  id?: string;
  label?: string;
  direction?: Direction;
  statements: StatementNode[];
}

/**
 * Style definition: style A fill:#f9f,stroke:#333
 */
export interface StyleNode extends ASTNode {
  type: 'Style';
  targetId: string;
  properties: StyleProperties;
}

/**
 * Class definition: classDef className fill:#f9f
 */
export interface ClassDefNode extends ASTNode {
  type: 'ClassDef';
  className: string;
  properties: StyleProperties;
}

/**
 * Style properties
 */
export interface StyleProperties {
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  strokeDasharray?: string;
  color?: string;
  [key: string]: any;
}

/**
 * Type guard helpers
 */
export function isNodeDefinition(node: ASTNode): node is NodeDefinitionNode {
  return node.type === 'NodeDefinition';
}

export function isEdgeDefinition(node: ASTNode): node is EdgeDefinitionNode {
  return node.type === 'EdgeDefinition';
}

export function isSubgraph(node: ASTNode): node is SubgraphNode {
  return node.type === 'Subgraph';
}

export function isStyleNode(node: ASTNode): node is StyleNode {
  return node.type === 'Style';
}

export function isClassDef(node: ASTNode): node is ClassDefNode {
  return node.type === 'ClassDef';
}
