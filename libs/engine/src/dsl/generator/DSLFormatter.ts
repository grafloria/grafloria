/**
 * DSL Formatter - Formats DSL text for readability
 *
 * Provides clean, consistent formatting for generated DSL text:
 * - Proper indentation
 * - Line wrapping
 * - Comment alignment
 * - Whitespace normalization
 */

export interface FormatterOptions {
  /**
   * Indentation string (default: 2 spaces)
   */
  indent?: string;

  /**
   * Maximum line length before wrapping
   */
  maxLineLength?: number;

  /**
   * Preserve blank lines
   */
  preserveBlankLines?: boolean;

  /**
   * Add blank line before comments
   */
  blankLineBeforeComments?: boolean;

  /**
   * Align comments to column
   */
  alignComments?: boolean;
}

export class DSLFormatter {
  private options: Required<FormatterOptions>;

  constructor(options: FormatterOptions = {}) {
    this.options = {
      indent: options.indent || '  ',
      maxLineLength: options.maxLineLength || 100,
      preserveBlankLines: options.preserveBlankLines ?? true,
      blankLineBeforeComments: options.blankLineBeforeComments ?? false,
      alignComments: options.alignComments ?? false,
    };
  }

  /**
   * Format DSL text
   */
  format(text: string): string {
    const lines = text.split('\n');
    const formatted: string[] = [];

    let inSubgraph = false;
    let indentLevel = 0;
    let previousLineWasBlank = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Skip empty lines (but preserve them if option is set)
      if (trimmed === '') {
        if (this.options.preserveBlankLines && !previousLineWasBlank) {
          formatted.push('');
          previousLineWasBlank = true;
        }
        continue;
      }

      previousLineWasBlank = false;

      // Handle comments
      if (trimmed.startsWith('%%')) {
        if (this.options.blankLineBeforeComments && formatted.length > 0 && formatted[formatted.length - 1] !== '') {
          formatted.push('');
        }
        formatted.push(this.formatComment(trimmed));
        continue;
      }

      // Handle diagram declaration
      if (this.isDiagramDeclaration(trimmed)) {
        formatted.push(trimmed);
        continue;
      }

      // Handle subgraph start
      if (trimmed.startsWith('subgraph')) {
        formatted.push(this.indent(trimmed, indentLevel));
        inSubgraph = true;
        indentLevel++;
        continue;
      }

      // Handle subgraph end
      if (trimmed === 'end' && inSubgraph) {
        indentLevel--;
        formatted.push(this.indent(trimmed, indentLevel));
        inSubgraph = false;
        continue;
      }

      // Handle regular statements
      const formattedLine = this.formatStatement(trimmed, indentLevel);
      formatted.push(formattedLine);
    }

    return formatted.join('\n');
  }

  /**
   * Format a comment line
   */
  private formatComment(comment: string): string {
    // Ensure single space after %%
    if (comment.startsWith('%%')) {
      const content = comment.substring(2).trim();
      if (content) {
        return `%% ${content}`;
      }
      return '%%';
    }
    return comment;
  }

  /**
   * Format a statement line
   */
  private formatStatement(statement: string, indentLevel: number): string {
    // Normalize whitespace around arrows and operators
    let formatted = statement;

    // Normalize arrows
    formatted = formatted.replace(/\s*-->\s*/g, ' --> ');
    formatted = formatted.replace(/\s*---\s*/g, ' --- ');
    formatted = formatted.replace(/\s*-\.->\s*/g, ' -.-> ');
    formatted = formatted.replace(/\s*-\.-\s*/g, ' -.- ');
    formatted = formatted.replace(/\s*==>\s*/g, ' ==> ');
    formatted = formatted.replace(/\s*===\s*/g, ' === ');
    formatted = formatted.replace(/\s*<-->\s*/g, ' <--> ');

    // Normalize style syntax
    formatted = formatted.replace(/\s*:\s*/g, ':');
    formatted = formatted.replace(/\s*,\s*/g, ',');

    // Apply indentation
    return this.indent(formatted, indentLevel);
  }

  /**
   * Apply indentation
   */
  private indent(text: string, level: number): string {
    if (level === 0) return text;
    return this.options.indent.repeat(level) + text;
  }

  /**
   * Check if line is a diagram declaration
   */
  private isDiagramDeclaration(line: string): boolean {
    return (
      line.startsWith('flowchart') ||
      line.startsWith('graph') ||
      line.startsWith('erDiagram') ||
      line.startsWith('classDiagram') ||
      line.startsWith('stateDiagram') ||
      line.startsWith('sequenceDiagram')
    );
  }

  /**
   * Wrap long lines
   */
  wrapLongLines(text: string): string {
    const lines = text.split('\n');
    const wrapped: string[] = [];

    for (const line of lines) {
      if (line.length <= this.options.maxLineLength) {
        wrapped.push(line);
        continue;
      }

      // Don't wrap comments or declarations
      const trimmed = line.trim();
      if (trimmed.startsWith('%%') || this.isDiagramDeclaration(trimmed)) {
        wrapped.push(line);
        continue;
      }

      // Try to wrap at arrow
      const arrowMatch = line.match(/^(\s*\S+\s+(?:-->|--->|===>|\.\.>|---)\s*)/);
      if (arrowMatch) {
        const prefix = arrowMatch[1];
        const rest = line.substring(prefix.length);
        wrapped.push(prefix);
        wrapped.push(this.indent(rest, 1));
      } else {
        wrapped.push(line);
      }
    }

    return wrapped.join('\n');
  }

  /**
   * Normalize whitespace
   */
  normalizeWhitespace(text: string): string {
    return text
      .replace(/[ \t]+/g, ' ') // Multiple spaces to single space
      .replace(/\n{3,}/g, '\n\n') // Max 2 consecutive newlines
      .trim();
  }

  /**
   * Remove comments
   */
  removeComments(text: string): string {
    return text
      .split('\n')
      .filter(line => !line.trim().startsWith('%%'))
      .join('\n');
  }

  /**
   * Add section headers
   */
  addSectionHeaders(text: string): string {
    const lines = text.split('\n');
    const result: string[] = [];

    let inNodes = false;
    let inEdges = false;
    let inStyles = false;

    for (const line of lines) {
      const trimmed = line.trim();

      // Diagram declaration
      if (this.isDiagramDeclaration(trimmed)) {
        result.push(line);
        continue;
      }

      // Node definition
      if (this.isNodeDefinition(trimmed) && !inNodes && !inEdges) {
        result.push('');
        result.push('%% Nodes');
        inNodes = true;
      }

      // Edge definition
      if (this.isEdgeDefinition(trimmed) && !inEdges) {
        if (inNodes) {
          result.push('');
          result.push('%% Edges');
          inNodes = false;
          inEdges = true;
        }
      }

      // Style definition
      if (trimmed.startsWith('style ') && !inStyles) {
        if (inNodes || inEdges) {
          result.push('');
          result.push('%% Styles');
          inNodes = false;
          inEdges = false;
          inStyles = true;
        }
      }

      result.push(line);
    }

    return result.join('\n');
  }

  /**
   * Check if line is a node definition
   */
  private isNodeDefinition(line: string): boolean {
    // Simple heuristic: contains brackets but no arrow
    return /[\[\(\{\<].*[\]\)\}\>]/.test(line) && !this.isEdgeDefinition(line);
  }

  /**
   * Check if line is an edge definition
   */
  private isEdgeDefinition(line: string): boolean {
    return /(?:-->|---|\.\.>|==>|<-->)/.test(line);
  }

  /**
   * Pretty print with all formatting options
   */
  prettyPrint(text: string, addHeaders: boolean = false): string {
    let formatted = this.format(text);
    formatted = this.normalizeWhitespace(formatted);

    if (addHeaders) {
      formatted = this.addSectionHeaders(formatted);
    }

    return formatted;
  }

  /**
   * Minify (remove all formatting)
   */
  minify(text: string): string {
    return text
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('%%'))
      .join('\n');
  }
}
