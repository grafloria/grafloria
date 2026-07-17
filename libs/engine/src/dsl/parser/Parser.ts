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
  ClassApplicationNode,
  LinkStyleNode,
  ClickNode,
  GrafloriaDirectiveNode,
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

interface NodeRef {
  id: string;
  shape?: NodeShape;
  label?: string;
  cssClass?: string;
}

/** Mermaid v11 `@{ shape: … }` names → our NodeShape. Unknowns fall to rect. */
const V11_SHAPE_MAP: Record<string, NodeShape> = {
  rect: 'rectangle', rectangle: 'rectangle', process: 'rectangle',
  rounded: 'rounded-rectangle', 'rounded-rect': 'rounded-rectangle',
  stadium: 'stadium', pill: 'stadium', terminal: 'stadium',
  subroutine: 'subroutine', subprocess: 'subroutine', 'framed-rectangle': 'subroutine',
  cylinder: 'cylindrical', database: 'cylindrical', db: 'cylindrical', 'lin-cyl': 'cylindrical',
  circle: 'circle', circ: 'circle',
  diamond: 'rhombus', decision: 'rhombus', rhombus: 'rhombus', question: 'rhombus',
  hexagon: 'hexagon', hex: 'hexagon', prepare: 'hexagon',
  trapezoid: 'trapezoid', 'trap-b': 'trapezoid', 'manual-input': 'trapezoid',
  'trapezoid-alt': 'trapezoid-alt', 'trap-t': 'trapezoid-alt',
};

export class Parser {
  private tokens: Token[] = [];
  private current: number = 0;

  /**
   * Parse tokens into an AST
   */
  parse(tokens: Token[]): DiagramNode {
    this.tokens = tokens.filter(t =>
      t.type !== TokenType.WHITESPACE &&
      // Keep ONLY the Tier-2 extension comments; ordinary %% comments still drop.
      (t.type !== TokenType.COMMENT || /^%%grafloria:(node|edge)\b/.test(t.value))
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

      const before = this.current;
      try {
        const statement = this.parseStatement();
        if (statement) {
          // parseStatement may yield ONE statement or a list (chains, multi-edge).
          if (Array.isArray(statement)) statements.push(...statement);
          else statements.push(statement);
        }
      } catch (error) {
        // Line-level error recovery: one un-parseable line must not abort the
        // whole diagram, and must not leave debris. Skip to the next newline.
        // (docs/MERMAID-GAP-ANALYSIS.md Phase 0 — "never manufacture nodes".)
        if (error instanceof ParseError) {
          this.skipLine();
        } else {
          throw error;
        }
      }
      // Guard against a statement that consumed nothing (would loop forever).
      if (this.current === before && !this.isAtEnd()) this.advance();

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
  private parseStatement(): StatementNode | StatementNode[] | null {
    // Subgraph
    if (this.check(TokenType.SUBGRAPH)) {
      return this.parseSubgraph();
    }

    // Tier-2 extension comment (%%grafloria:node / %%grafloria:edge).
    if (this.check(TokenType.COMMENT)) {
      return this.parseGrafloriaComment(this.advance().value);
    }

    // Tier-1 native directives — Phase 2 wires them to the model (Phase 0 only
    // skipped them so they never threw or garbaged).
    if (this.check(TokenType.IDENTIFIER)) {
      switch (this.peek().value) {
        case 'style': return this.parseStyle();
        case 'classDef': return this.parseClassDef();
        case 'class': return this.parseClassApplication();
        case 'linkStyle': return this.parseLinkStyle();
        case 'click': return this.parseClick();
        case 'direction': this.skipLine(); return null;
      }
    }

    // A statement is a NODE GROUP (one or more refs joined by `&`) optionally
    // followed by an edge chain. `a & b --> c & d` and `a --> b --> c` both
    // start here.
    const start = this.currentToken();
    const firstGroup = this.parseNodeGroup();

    if (firstGroup.length === 0) {
      // Not a node/edge start — skip the whole line rather than a single token,
      // so partial debris cannot leak into the model.
      this.skipLine();
      return null;
    }

    if (this.isLinkToken()) {
      return this.parseEdgeChain(firstGroup, start);
    }

    // Bare node group: one NodeDefinition per ref (usually one; `a & b` gives two).
    const defs: StatementNode[] = firstGroup.map((ref) => ({
      type: 'NodeDefinition' as const,
      id: ref.id,
      label: ref.label || ref.id,
      shape: ref.shape || 'rectangle',
      location: this.getLocation(start, this.previous()),
    }));
    return [...defs, ...this.classApps(firstGroup, start)];
  }

  /**
   * A single node reference: an id, then an optional shape (`[A]`, `([A])`, …)
   * or a v11 metadata block (`@{ shape: rect, label: "Hi" }`).
   */
  private parseNodeRef(): NodeRef | null {
    const id = this.parseNodeId();
    if (!id) return null;

    const ref: NodeRef = { id };
    if (this.check(TokenType.AT)) {
      const meta = this.parseNodeMetadata();
      ref.shape = meta.shape;
      ref.label = meta.label;
    } else if (this.isNodeShapeStart()) {
      const info = this.parseNodeShape();
      ref.shape = info.shape;
      ref.label = info.label;
    }
    // Inline class: a:::hot  (also a[Label]:::hot)
    if (this.check(TokenType.TRIPLE_COLON)) {
      this.advance();
      if (this.check(TokenType.IDENTIFIER)) ref.cssClass = this.advance().value;
    }
    return ref;
  }

  /** One or more node refs joined by `&` (Mermaid multi-node syntax). */
  private parseNodeGroup(): NodeRef[] {
    const group: NodeRef[] = [];
    const first = this.parseNodeRef();
    if (first) group.push(first);
    while (this.check(TokenType.AMPERSAND)) {
      this.advance();
      const ref = this.parseNodeRef();
      if (ref) group.push(ref);
    }
    return group;
  }

  /** ClassApplication statements for any refs carrying an inline `:::class`. */
  private classApps(refs: NodeRef[], start: Token): ClassApplicationNode[] {
    return refs
      .filter((r) => r.cssClass)
      .map((r) => ({
        type: 'ClassApplication' as const,
        ids: [r.id],
        className: r.cssClass!,
        location: this.getLocation(start, this.previous()),
      }));
  }

  /**
   * An edge chain: node-group (link [label] node-group)+. Each link produces the
   * FULL CROSS PRODUCT of the previous group and the next (so `a & b --> c & d`
   * is four edges), and the chain continues so `a --> b --> c` is two.
   */
  private parseEdgeChain(firstGroup: NodeRef[], start: Token): StatementNode[] {
    const edges: EdgeDefinitionNode[] = [];
    const allRefs: NodeRef[] = [...firstGroup];
    let prevGroup = firstGroup;

    while (this.isLinkToken()) {
      const linkToken = this.advance();
      const linkType = this.getLinkType(linkToken.type);

      let label: string | undefined;
      if (this.match(TokenType.PIPE)) {
        label = this.parseTextUntil(TokenType.PIPE);
        this.consume(TokenType.PIPE, 'Expected closing "|"');
      }

      const nextGroup = this.parseNodeGroup();
      if (nextGroup.length === 0) {
        throw new ParseError(
          'Expected target node after link',
          this.currentToken(),
          this.currentToken().line,
          this.currentToken().column
        );
      }

      for (const source of prevGroup) {
        for (const target of nextGroup) {
          edges.push({
            type: 'EdgeDefinition',
            source: source.id,
            target: target.id,
            linkType,
            label,
            sourceShape: source.shape,
            sourceLabel: source.label,
            targetShape: target.shape,
            targetLabel: target.label,
            location: this.getLocation(start, this.previous()),
          });
        }
      }
      prevGroup = nextGroup;
      allRefs.push(...nextGroup);
    }

    return [...edges, ...this.classApps(allRefs, start)];
  }

  /**
   * v11 node metadata block: `@{ shape: rect, label: "Hi", icon: … }`. We read
   * the keys we model (shape, label) and ignore the rest for forward-compat.
   * `{`/`}` lex as RHOMBUS_OPEN/CLOSE.
   */
  private parseNodeMetadata(): { shape?: NodeShape; label?: string } {
    this.consume(TokenType.AT, 'Expected "@"');
    this.consume(TokenType.RHOMBUS_OPEN, 'Expected "{" after "@"');

    let shape: NodeShape | undefined;
    let label: string | undefined;

    while (!this.check(TokenType.RHOMBUS_CLOSE) && !this.isAtEnd()) {
      if (!this.check(TokenType.IDENTIFIER)) {
        this.advance(); // skip commas / stray tokens
        continue;
      }
      const key = this.advance().value;
      this.consume(TokenType.COLON, 'Expected ":" in node metadata');
      const value = this.advance().value.replace(/#quot;/g, '"');
      if (key === 'label') label = value;
      else if (key === 'shape') shape = V11_SHAPE_MAP[value.toLowerCase()] ?? 'rectangle';
    }

    this.consume(TokenType.RHOMBUS_CLOSE, 'Expected "}" to close node metadata');
    return { shape, label };
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

      const before = this.current;
      try {
        const statement = this.parseStatement();
        if (statement) {
          if (Array.isArray(statement)) statements.push(...statement);
          else statements.push(statement);
        }
      } catch (error) {
        if (error instanceof ParseError) this.skipLine();
        else throw error;
      }
      if (this.current === before && !this.isAtEnd()) this.advance();

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
   * Parse `class a,b hot` — bind an existing classDef to one or more nodes.
   */
  private parseClassApplication(): ClassApplicationNode {
    const start = this.currentToken();
    this.consume(TokenType.IDENTIFIER, 'Expected "class"'); // class keyword
    const ids: string[] = [this.consume(TokenType.IDENTIFIER, 'Expected node id').value];
    while (this.match(TokenType.COMMA)) {
      ids.push(this.consume(TokenType.IDENTIFIER, 'Expected node id').value);
    }
    const className = this.consume(TokenType.IDENTIFIER, 'Expected class name').value;
    return { type: 'ClassApplication', ids, className, location: this.getLocation(start, this.previous()) };
  }

  /**
   * Parse `linkStyle 0,2 stroke:#f00` — style links by index (or `default`).
   */
  private parseLinkStyle(): LinkStyleNode {
    const start = this.currentToken();
    this.consume(TokenType.IDENTIFIER, 'Expected "linkStyle"'); // linkStyle keyword

    let indices: number[] | 'default';
    if (this.check(TokenType.IDENTIFIER) && this.peek().value === 'default') {
      this.advance();
      indices = 'default';
    } else {
      indices = [parseInt(this.consume(TokenType.NUMBER, 'Expected link index').value, 10)];
      while (this.match(TokenType.COMMA)) {
        indices.push(parseInt(this.consume(TokenType.NUMBER, 'Expected link index').value, 10));
      }
    }
    const properties = this.parseStyleProperties();
    return { type: 'LinkStyle', indices, properties, location: this.getLocation(start, this.previous()) };
  }

  /**
   * Parse `click a "https://…" "tooltip"` — a node's navigation target. The
   * `href` keyword form and `call`/callback forms are intentionally not modeled
   * (a callback name is not a document fact); those lines are still skipped.
   */
  private parseClick(): ClickNode | null {
    const start = this.currentToken();
    this.consume(TokenType.IDENTIFIER, 'Expected "click"'); // click keyword
    const id = this.consume(TokenType.IDENTIFIER, 'Expected node id').value;

    // Optional `href` keyword, then the URL string, then an optional tooltip.
    if (this.check(TokenType.IDENTIFIER) && this.peek().value === 'href') this.advance();
    let href: string | undefined;
    let tooltip: string | undefined;
    if (this.check(TokenType.STRING)) href = this.advance().value;
    if (this.check(TokenType.STRING)) tooltip = this.advance().value;
    this.skipLine(); // ignore any trailing target token (_blank etc.)
    return { type: 'Click', id, href, tooltip, location: this.getLocation(start, this.previous()) };
  }

  /**
   * Parse a Tier-2 extension comment into a GrafloriaDirective:
   *   %%grafloria:node <id> <k>:<v>[,<k>:<v>]*
   *   %%grafloria:edge <source> <target> <k>:<v>...
   * Returns null for anything that is not a well-formed grafloria directive (a
   * malformed one is simply ignored, never garbage).
   */
  private parseGrafloriaComment(value: string): GrafloriaDirectiveNode | null {
    const m = value.match(/^%%grafloria:(node|edge)\s+(.+)$/);
    if (!m) return null;
    const target = m[1] as 'node' | 'edge';
    const parts = m[2].trim().split(/\s+/);
    const idCount = target === 'edge' ? 2 : 1;
    if (parts.length < idCount) return null;
    const ids = parts.slice(0, idCount);
    const properties: Record<string, string> = {};
    for (const pair of parts.slice(idCount).join(' ').split(',')) {
      const idx = pair.indexOf(':');
      if (idx <= 0) continue;
      properties[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
    }
    return { type: 'GrafloriaDirective', target, ids, properties, location: this.getLocation(this.previous(), this.previous()) };
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

  /** Consume everything up to (not including) the next newline. */
  private skipLine(): void {
    while (!this.isAtEnd() && !this.check(TokenType.NEWLINE)) {
      this.advance();
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
