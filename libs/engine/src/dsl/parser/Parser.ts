/**
 * DSL Parser - Converts token stream into Abstract Syntax Tree
 *
 * Parses Mermaid-compatible diagram syntax into structured AST
 */

import { Token, TokenType } from '../types/Token';
import {
  ASTNode,
  DiagramNode,
  StatementNode,
  NodeDefinitionNode,
  EdgeDefinitionNode,
  SubgraphNode,
  StyleNode,
  ClassDefNode,
  Direction,
  DiagramType,
  NodeShape,
  LinkType,
  StyleProperties,
  Position,
  SourceLocation,
} from '../types/ASTNode';

export class ParseError extends Error {
  constructor(
    message: string,
    public token: Token,
    public line: number,
    public column: number
  ) {
    super(`Parse error at line ${line}, column ${column}: ${message}`);
    this.name = 'ParseError';
  }
}

export class Parser {
  private tokens: Token[] = [];
  private current: number = 0;

  /**
   * Parse tokens into an AST
   */
  parse(tokens: Token[]): DiagramNode {
    this.tokens = tokens.filter(t =>
      t.type !== TokenType.WHITESPACE &&
      t.type !== TokenType.COMMENT
    );
    this.current = 0;

    return this.parseDiagram();
  }

  /**
   * Parse diagram root
   */
  private parseDiagram(): DiagramNode {
    const start = this.currentToken();

    // Parse diagram type and direction
    let diagramType: DiagramType = 'flowchart';
    let direction: Direction | undefined;

    if (this.match(TokenType.FLOWCHART, TokenType.GRAPH)) {
      diagramType = 'flowchart';

      // Parse optional direction
      if (this.match(TokenType.TD, TokenType.TB, TokenType.BT, TokenType.RL, TokenType.LR)) {
        direction = this.previous().value.toUpperCase() as Direction;
      }
      this.consumeNewlines();
    } else if (this.match(TokenType.BPMN)) {
      diagramType = 'bpmn';
      this.consumeNewlines();
    } else if (this.match(TokenType.ERD)) {
      diagramType = 'erd';
      this.consumeNewlines();
    } else if (this.match(TokenType.CLASSDIAAGRAM)) {
      diagramType = 'classDiagram';
      this.consumeNewlines();
    }

    // Parse statements
    const statements: StatementNode[] = [];

    while (!this.isAtEnd()) {
      // Skip empty lines
      if (this.match(TokenType.NEWLINE)) {
        continue;
      }

      const statement = this.parseStatement();
      if (statement) {
        statements.push(statement);
      }

      this.consumeNewlines();
    }

    return {
      type: 'Diagram',
      diagramType,
      direction,
      statements,
      location: this.getLocation(start, this.previous()),
    };
  }

  /**
   * Parse a statement
   */
  private parseStatement(): StatementNode | null {
    // Subgraph
    if (this.check(TokenType.SUBGRAPH)) {
      return this.parseSubgraph();
    }

    // Style definition
    if (this.checkSequence(TokenType.IDENTIFIER) && this.peek().value === 'style') {
      return this.parseStyle();
    }

    // Class definition
    if (this.checkSequence(TokenType.IDENTIFIER) && this.peek().value === 'classDef') {
      return this.parseClassDef();
    }

    // Node or Edge definition
    const start = this.currentToken();
    const firstId = this.parseNodeId();

    if (!firstId) {
      // Skip unknown tokens
      if (!this.isAtEnd()) {
        this.advance();
      }
      return null;
    }

    // Check for source node shape
    let sourceShape: NodeShape | undefined;
    let sourceLabel: string | undefined;
    if (this.isNodeShapeStart()) {
      const shapeInfo = this.parseNodeShape();
      sourceShape = shapeInfo.shape;
      sourceLabel = shapeInfo.label;
    }

    // Check if this is an edge or just a node
    if (this.isLinkToken()) {
      return this.parseEdge(firstId, start, sourceShape, sourceLabel);
    } else {
      // This is just a node definition
      return {
        type: 'NodeDefinition',
        id: firstId,
        label: sourceLabel || firstId,
        shape: sourceShape || 'rectangle',
        location: this.getLocation(start, this.previous()),
      };
    }
  }

  /**
   * Parse subgraph
   */
  private parseSubgraph(): SubgraphNode {
    const start = this.currentToken();
    this.consume(TokenType.SUBGRAPH, 'Expected "subgraph"');

    // Parse optional id and label
    let id: string | undefined;
    let label: string | undefined;
    let direction: Direction | undefined;

    if (this.check(TokenType.IDENTIFIER)) {
      id = this.advance().value;
    }

    // Parse optional label in square brackets
    if (this.match(TokenType.SQUARE_OPEN)) {
      label = this.parseTextUntil(TokenType.SQUARE_CLOSE);
      this.consume(TokenType.SQUARE_CLOSE, 'Expected "]"');
    }

    this.consumeNewlines();

    // Parse optional direction
    if (this.match(TokenType.TD, TokenType.TB, TokenType.BT, TokenType.RL, TokenType.LR)) {
      direction = this.previous().value.toUpperCase() as Direction;
      this.consumeNewlines();
    }

    // Parse subgraph statements
    const statements: StatementNode[] = [];

    while (!this.check(TokenType.END) && !this.isAtEnd()) {
      if (this.match(TokenType.NEWLINE)) {
        continue;
      }

      const statement = this.parseStatement();
      if (statement) {
        statements.push(statement);
      }

      this.consumeNewlines();
    }

    this.consume(TokenType.END, 'Expected "end" to close subgraph');

    return {
      type: 'Subgraph',
      id,
      label,
      direction,
      statements,
      location: this.getLocation(start, this.previous()),
    };
  }

  /**
   * Parse edge definition: A --> B
   */
  private parseEdge(
    sourceId: string,
    start: Token,
    sourceShape?: NodeShape,
    sourceLabel?: string
  ): EdgeDefinitionNode {
    const linkToken = this.advance();
    const linkType = this.getLinkType(linkToken.type);

    // Parse optional label
    let label: string | undefined;
    if (this.match(TokenType.PIPE)) {
      label = this.parseTextUntil(TokenType.PIPE);
      this.consume(TokenType.PIPE, 'Expected closing "|"');
    }

    // Parse target node
    const targetId = this.parseNodeId();
    if (!targetId) {
      throw new ParseError(
        'Expected target node ID',
        this.currentToken(),
        this.currentToken().line,
        this.currentToken().column
      );
    }

    // Check for target node shape and capture it
    let targetShape: NodeShape | undefined;
    let targetLabel: string | undefined;
    if (this.isNodeShapeStart()) {
      const shapeInfo = this.parseNodeShape();
      targetShape = shapeInfo.shape;
      targetLabel = shapeInfo.label;
    }

    return {
      type: 'EdgeDefinition',
      source: sourceId,
      target: targetId,
      linkType,
      label,
      sourceShape,
      sourceLabel,
      targetShape,
      targetLabel,
      location: this.getLocation(start, this.previous()),
    };
  }

  /**
   * Parse style definition: style A fill:#f9f,stroke:#333
   */
  private parseStyle(): StyleNode {
    const start = this.currentToken();
    this.consume(TokenType.IDENTIFIER, 'Expected "style"'); // style keyword

    const targetId = this.consume(TokenType.IDENTIFIER, 'Expected node ID').value;

    // Parse style properties
    const properties = this.parseStyleProperties();

    return {
      type: 'Style',
      targetId,
      properties,
      location: this.getLocation(start, this.previous()),
    };
  }

  /**
   * Parse class definition: classDef className fill:#f9f
   */
  private parseClassDef(): ClassDefNode {
    const start = this.currentToken();
    this.consume(TokenType.IDENTIFIER, 'Expected "classDef"'); // classDef keyword

    const className = this.consume(TokenType.IDENTIFIER, 'Expected class name').value;

    // Parse style properties
    const properties = this.parseStyleProperties();

    return {
      type: 'ClassDef',
      className,
      properties,
      location: this.getLocation(start, this.previous()),
    };
  }

  /**
   * Parse style properties: fill:#f9f,stroke:#333,stroke-width:2
   */
  private parseStyleProperties(): StyleProperties {
    const properties: StyleProperties = {};

    do {
      if (!this.check(TokenType.IDENTIFIER)) break;

      const propName = this.advance().value;
      this.consume(TokenType.COLON, 'Expected ":" after property name');

      let propValue: string;
      if (this.check(TokenType.STRING)) {
        propValue = this.advance().value;
      } else if (this.check(TokenType.NUMBER)) {
        propValue = this.advance().value;
      } else if (this.check(TokenType.IDENTIFIER)) {
        propValue = this.advance().value;
      } else {
        // Try to parse color or other value
        propValue = this.advance().value;
      }

      // Convert kebab-case to camelCase
      const camelCaseName = propName.replace(/-([a-z])/g, (g) => g[1].toUpperCase());

      // Convert numeric strings to numbers for certain properties
      if (camelCaseName === 'strokeWidth' || camelCaseName === 'opacity') {
        properties[camelCaseName] = parseFloat(propValue);
      } else {
        properties[camelCaseName] = propValue;
      }

    } while (this.match(TokenType.COMMA));

    return properties;
  }

  /**
   * Parse node ID
   */
  private parseNodeId(): string | null {
    if (this.check(TokenType.IDENTIFIER)) {
      return this.advance().value;
    }
    return null;
  }

  /**
   * Parse node shape and extract label
   */
  private parseNodeShape(): { shape: NodeShape; label?: string } {
    const start = this.currentToken();

    // [text] - rectangle
    if (this.match(TokenType.SQUARE_OPEN)) {
      const label = this.parseTextUntil(TokenType.SQUARE_CLOSE);
      this.consume(TokenType.SQUARE_CLOSE, 'Expected "]"');
      return { shape: 'rectangle', label };
    }

    // [[text]] - subroutine
    if (this.match(TokenType.SUBROUTINE_OPEN)) {
      const label = this.parseTextUntil(TokenType.SUBROUTINE_CLOSE);
      this.consume(TokenType.SUBROUTINE_CLOSE, 'Expected "]]"');
      return { shape: 'subroutine', label };
    }

    // ([text]) - stadium
    if (this.match(TokenType.STADIUM_OPEN)) {
      const label = this.parseTextUntil(TokenType.STADIUM_CLOSE);
      this.consume(TokenType.STADIUM_CLOSE, 'Expected "])"');
      return { shape: 'stadium', label };
    }

    // [(text)] - cylindrical
    if (this.match(TokenType.CYLINDRICAL_OPEN)) {
      const label = this.parseTextUntil(TokenType.CYLINDRICAL_CLOSE);
      this.consume(TokenType.CYLINDRICAL_CLOSE, 'Expected ")]"');
      return { shape: 'cylindrical', label };
    }

    // ((text)) - circle
    if (this.match(TokenType.CIRCLE_OPEN)) {
      const label = this.parseTextUntil(TokenType.CIRCLE_CLOSE);
      this.consume(TokenType.CIRCLE_CLOSE, 'Expected "))"');
      return { shape: 'circle', label };
    }

    // (text) - rounded rectangle
    if (this.match(TokenType.ROUND_OPEN)) {
      const label = this.parseTextUntil(TokenType.ROUND_CLOSE);
      this.consume(TokenType.ROUND_CLOSE, 'Expected ")"');
      return { shape: 'rounded-rectangle', label };
    }

    // {text} - rhombus/diamond
    if (this.match(TokenType.RHOMBUS_OPEN)) {
      const label = this.parseTextUntil(TokenType.RHOMBUS_CLOSE);
      this.consume(TokenType.RHOMBUS_CLOSE, 'Expected "}"');
      return { shape: 'rhombus', label };
    }

    // {{text}} - hexagon
    if (this.match(TokenType.HEXAGON_OPEN)) {
      const label = this.parseTextUntil(TokenType.HEXAGON_CLOSE);
      this.consume(TokenType.HEXAGON_CLOSE, 'Expected "}}"');
      return { shape: 'hexagon', label };
    }

    // [/text/] or [\text\] - trapezoid
    if (this.match(TokenType.TRAPEZOID_OPEN)) {
      const label = this.parseTextUntil(TokenType.TRAPEZOID_CLOSE);
      this.consume(TokenType.TRAPEZOID_CLOSE, 'Expected trapezoid close');
      return { shape: 'trapezoid', label };
    }

    // >text] - asymmetric
    if (this.match(TokenType.ASYMMETRIC_OPEN)) {
      const label = this.parseTextUntil(TokenType.SQUARE_CLOSE);
      this.consume(TokenType.SQUARE_CLOSE, 'Expected "]"');
      return { shape: 'asymmetric', label };
    }

    // Default to rectangle if no shape found
    return { shape: 'rectangle' };
  }

  /**
   * Parse text until a specific token type
   */
  private parseTextUntil(endType: TokenType): string {
    let text = '';
    let prevEnd = -1;

    while (!this.check(endType) && !this.isAtEnd()) {
      const token = this.advance();
      // Join by SOURCE ADJACENCY, not with an unconditional space: tokens that
      // touch in the input stay touching in the label. The unconditional join
      // exploded any run of characters the lexer didn't recognise as one word.
      if (prevEnd >= 0 && token.startIndex > prevEnd) {
        text += ' ';
      }
      // The quoted form: a["He said #quot;hi#quot; [brackets ok]"] — the whole
      // string is ONE token (brackets inside quotes never reach the bracket
      // matcher), and mermaid's #quot; entity decodes back to a double quote.
      text += token.type === TokenType.STRING ? token.value.replace(/#quot;/g, '"') : token.value;
      prevEnd = token.endIndex;
    }

    return text.trim();
  }

  /**
   * Get link type from token type
   */
  private getLinkType(tokenType: TokenType): LinkType {
    switch (tokenType) {
      case TokenType.ARROW:
        return 'arrow';
      case TokenType.LINE:
        return 'line';
      case TokenType.DOTTED_ARROW:
        return 'dotted-arrow';
      case TokenType.DOTTED_LINE:
        return 'dotted-line';
      case TokenType.THICK_ARROW:
        return 'thick-arrow';
      case TokenType.THICK_LINE:
        return 'thick-line';
      case TokenType.BIDIRECTIONAL:
        return 'bidirectional';
      case TokenType.CIRCLE_EDGE:
        return 'circle-edge';
      case TokenType.CROSS_EDGE:
        return 'cross-edge';
      default:
        return 'arrow';
    }
  }

  /**
   * Check if current token is a link token
   */
  private isLinkToken(): boolean {
    return (
      this.check(TokenType.ARROW) ||
      this.check(TokenType.LINE) ||
      this.check(TokenType.DOTTED_ARROW) ||
      this.check(TokenType.DOTTED_LINE) ||
      this.check(TokenType.THICK_ARROW) ||
      this.check(TokenType.THICK_LINE) ||
      this.check(TokenType.BIDIRECTIONAL) ||
      this.check(TokenType.CIRCLE_EDGE) ||
      this.check(TokenType.CROSS_EDGE)
    );
  }

  /**
   * Check if current token starts a node shape
   */
  private isNodeShapeStart(): boolean {
    return (
      this.check(TokenType.SQUARE_OPEN) ||
      this.check(TokenType.ROUND_OPEN) ||
      this.check(TokenType.SUBROUTINE_OPEN) ||
      this.check(TokenType.STADIUM_OPEN) ||
      this.check(TokenType.CYLINDRICAL_OPEN) ||
      this.check(TokenType.CIRCLE_OPEN) ||
      this.check(TokenType.RHOMBUS_OPEN) ||
      this.check(TokenType.HEXAGON_OPEN) ||
      this.check(TokenType.TRAPEZOID_OPEN) ||
      this.check(TokenType.ASYMMETRIC_OPEN)
    );
  }

  /**
   * Token stream helpers
   */
  private match(...types: TokenType[]): boolean {
    for (const type of types) {
      if (this.check(type)) {
        this.advance();
        return true;
      }
    }
    return false;
  }

  private check(type: TokenType): boolean {
    if (this.isAtEnd()) return false;
    return this.peek().type === type;
  }

  private checkSequence(type: TokenType): boolean {
    return this.check(type);
  }

  private advance(): Token {
    if (!this.isAtEnd()) this.current++;
    return this.previous();
  }

  private isAtEnd(): boolean {
    return this.peek().type === TokenType.EOF;
  }

  private peek(): Token {
    return this.tokens[this.current] || this.tokens[this.tokens.length - 1];
  }

  private previous(): Token {
    return this.tokens[this.current - 1];
  }

  private currentToken(): Token {
    return this.peek();
  }

  private consume(type: TokenType, message: string): Token {
    if (this.check(type)) return this.advance();

    const token = this.currentToken();
    throw new ParseError(message, token, token.line, token.column);
  }

  private consumeNewlines(): void {
    while (this.match(TokenType.NEWLINE)) {
      // Keep consuming
    }
  }

  /**
   * Get source location from start and end tokens
   */
  private getLocation(start: Token, end: Token): SourceLocation {
    return {
      start: {
        line: start.line,
        column: start.column,
        index: start.startIndex,
      },
      end: {
        line: end.line,
        column: end.column,
        index: end.endIndex,
      },
    };
  }
}
