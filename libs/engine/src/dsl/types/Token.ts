/**
 * Token Types for DSL Lexer
 *
 * Defines all token types used in Mermaid-compatible diagram syntax
 */

export enum TokenType {
  // Keywords
  FLOWCHART = 'FLOWCHART',
  GRAPH = 'GRAPH',
  DIRECTION = 'DIRECTION',
  SUBGRAPH = 'SUBGRAPH',
  END = 'END',

  // Diagram types
  BPMN = 'BPMN',
  ERD = 'ERD',
  CLASSDIAAGRAM = 'CLASSDIAGRAM',

  // Direction indicators
  TD = 'TD',    // Top Down
  TB = 'TB',    // Top Bottom (same as TD)
  BT = 'BT',    // Bottom Top
  RL = 'RL',    // Right Left
  LR = 'LR',    // Left Right

  // Node shapes (bracket patterns)
  SQUARE_OPEN = 'SQUARE_OPEN',           // [
  SQUARE_CLOSE = 'SQUARE_CLOSE',         // ]
  ROUND_OPEN = 'ROUND_OPEN',             // (
  ROUND_CLOSE = 'ROUND_CLOSE',           // )
  STADIUM_OPEN = 'STADIUM_OPEN',         // ([
  STADIUM_CLOSE = 'STADIUM_CLOSE',       // ])
  SUBROUTINE_OPEN = 'SUBROUTINE_OPEN',   // [[
  SUBROUTINE_CLOSE = 'SUBROUTINE_CLOSE', // ]]
  CYLINDRICAL_OPEN = 'CYLINDRICAL_OPEN', // [(
  CYLINDRICAL_CLOSE = 'CYLINDRICAL_CLOSE', // )]
  CIRCLE_OPEN = 'CIRCLE_OPEN',           // ((
  CIRCLE_CLOSE = 'CIRCLE_CLOSE',         // ))
  ASYMMETRIC_OPEN = 'ASYMMETRIC_OPEN',   // >
  ASYMMETRIC_CLOSE = 'ASYMMETRIC_CLOSE', // ]
  RHOMBUS_OPEN = 'RHOMBUS_OPEN',         // {
  RHOMBUS_CLOSE = 'RHOMBUS_CLOSE',       // }
  HEXAGON_OPEN = 'HEXAGON_OPEN',         // {{
  HEXAGON_CLOSE = 'HEXAGON_CLOSE',       // }}
  TRAPEZOID_OPEN = 'TRAPEZOID_OPEN',     // [/
  TRAPEZOID_CLOSE = 'TRAPEZOID_CLOSE',   // /]

  // Link/Edge types
  ARROW = 'ARROW',                       // -->
  LINE = 'LINE',                         // ---
  DOTTED_ARROW = 'DOTTED_ARROW',         // -.->
  DOTTED_LINE = 'DOTTED_LINE',           // -.-
  THICK_ARROW = 'THICK_ARROW',           // ==>
  THICK_LINE = 'THICK_LINE',             // ===
  BIDIRECTIONAL = 'BIDIRECTIONAL',       // <-->
  CIRCLE_EDGE = 'CIRCLE_EDGE',           // --o
  CROSS_EDGE = 'CROSS_EDGE',             // --x

  // Literals
  IDENTIFIER = 'IDENTIFIER',
  STRING = 'STRING',
  NUMBER = 'NUMBER',

  // Operators
  COLON = 'COLON',
  SEMICOLON = 'SEMICOLON',
  COMMA = 'COMMA',
  PIPE = 'PIPE',
  AMPERSAND = 'AMPERSAND',

  // Special
  NEWLINE = 'NEWLINE',
  WHITESPACE = 'WHITESPACE',
  COMMENT = 'COMMENT',
  EOF = 'EOF',
  UNKNOWN = 'UNKNOWN',
}

/**
 * Represents a single token from the lexical analysis
 */
export interface Token {
  type: TokenType;
  value: string;
  line: number;
  column: number;
  startIndex: number;
  endIndex: number;
}

/**
 * Helper to create tokens
 */
export function createToken(
  type: TokenType,
  value: string,
  line: number,
  column: number,
  startIndex: number,
  endIndex: number
): Token {
  return { type, value, line, column, startIndex, endIndex };
}
