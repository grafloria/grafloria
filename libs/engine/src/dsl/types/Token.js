/**
 * Token Types for DSL Lexer
 *
 * Defines all token types used in Mermaid-compatible diagram syntax
 */
export var TokenType;
(function (TokenType) {
    // Keywords
    TokenType["FLOWCHART"] = "FLOWCHART";
    TokenType["GRAPH"] = "GRAPH";
    TokenType["DIRECTION"] = "DIRECTION";
    TokenType["SUBGRAPH"] = "SUBGRAPH";
    TokenType["END"] = "END";
    // Diagram types
    TokenType["BPMN"] = "BPMN";
    TokenType["ERD"] = "ERD";
    TokenType["CLASSDIAAGRAM"] = "CLASSDIAGRAM";
    // Direction indicators
    TokenType["TD"] = "TD";
    TokenType["TB"] = "TB";
    TokenType["BT"] = "BT";
    TokenType["RL"] = "RL";
    TokenType["LR"] = "LR";
    // Node shapes (bracket patterns)
    TokenType["SQUARE_OPEN"] = "SQUARE_OPEN";
    TokenType["SQUARE_CLOSE"] = "SQUARE_CLOSE";
    TokenType["ROUND_OPEN"] = "ROUND_OPEN";
    TokenType["ROUND_CLOSE"] = "ROUND_CLOSE";
    TokenType["STADIUM_OPEN"] = "STADIUM_OPEN";
    TokenType["STADIUM_CLOSE"] = "STADIUM_CLOSE";
    TokenType["SUBROUTINE_OPEN"] = "SUBROUTINE_OPEN";
    TokenType["SUBROUTINE_CLOSE"] = "SUBROUTINE_CLOSE";
    TokenType["CYLINDRICAL_OPEN"] = "CYLINDRICAL_OPEN";
    TokenType["CYLINDRICAL_CLOSE"] = "CYLINDRICAL_CLOSE";
    TokenType["CIRCLE_OPEN"] = "CIRCLE_OPEN";
    TokenType["CIRCLE_CLOSE"] = "CIRCLE_CLOSE";
    TokenType["ASYMMETRIC_OPEN"] = "ASYMMETRIC_OPEN";
    TokenType["ASYMMETRIC_CLOSE"] = "ASYMMETRIC_CLOSE";
    TokenType["RHOMBUS_OPEN"] = "RHOMBUS_OPEN";
    TokenType["RHOMBUS_CLOSE"] = "RHOMBUS_CLOSE";
    TokenType["HEXAGON_OPEN"] = "HEXAGON_OPEN";
    TokenType["HEXAGON_CLOSE"] = "HEXAGON_CLOSE";
    TokenType["TRAPEZOID_OPEN"] = "TRAPEZOID_OPEN";
    TokenType["TRAPEZOID_CLOSE"] = "TRAPEZOID_CLOSE";
    // Link/Edge types
    TokenType["ARROW"] = "ARROW";
    TokenType["LINE"] = "LINE";
    TokenType["DOTTED_ARROW"] = "DOTTED_ARROW";
    TokenType["DOTTED_LINE"] = "DOTTED_LINE";
    TokenType["THICK_ARROW"] = "THICK_ARROW";
    TokenType["THICK_LINE"] = "THICK_LINE";
    TokenType["BIDIRECTIONAL"] = "BIDIRECTIONAL";
    TokenType["CIRCLE_EDGE"] = "CIRCLE_EDGE";
    TokenType["CROSS_EDGE"] = "CROSS_EDGE";
    // Literals
    TokenType["IDENTIFIER"] = "IDENTIFIER";
    TokenType["STRING"] = "STRING";
    TokenType["NUMBER"] = "NUMBER";
    // Operators
    TokenType["COLON"] = "COLON";
    TokenType["TRIPLE_COLON"] = "TRIPLE_COLON";
    TokenType["SEMICOLON"] = "SEMICOLON";
    TokenType["COMMA"] = "COMMA";
    TokenType["PIPE"] = "PIPE";
    TokenType["AMPERSAND"] = "AMPERSAND";
    TokenType["AT"] = "AT";
    // Special
    TokenType["NEWLINE"] = "NEWLINE";
    TokenType["WHITESPACE"] = "WHITESPACE";
    TokenType["COMMENT"] = "COMMENT";
    TokenType["EOF"] = "EOF";
    TokenType["UNKNOWN"] = "UNKNOWN";
})(TokenType || (TokenType = {}));
/**
 * Helper to create tokens
 */
export function createToken(type, value, line, column, startIndex, endIndex) {
    return { type, value, line, column, startIndex, endIndex };
}
//# sourceMappingURL=Token.js.map