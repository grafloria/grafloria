/**
 * FormatPreserver - Preserve comments, whitespace, and formatting
 *
 * Extracts and restores formatting information during DSL parsing and generation.
 * Maintains code quality and readability across parse/generate cycles.
 *
 * Phase 5: Performance Optimization
 */

import { FormatInfo, CommentInfo, WhitespaceInfo } from '../workers/dsl-worker.interface';

export class FormatPreserver {
  /**
   * Extract format information from DSL text
   */
  extractFormatInfo(text: string): FormatInfo {
    const comments = this.extractComments(text);
    const whitespace = this.analyzeWhitespace(text);
    const indentStyle = this.detectIndentStyle(text);
    const indentSize = indentStyle === 'spaces' ? this.detectIndentSize(text) : 0;
    const lineEnding = this.detectLineEnding(text);

    return {
      originalText: text,
      comments,
      whitespace,
      indentStyle,
      indentSize,
      lineEnding,
    };
  }

  /**
   * Extract comments from DSL text
   */
  private extractComments(text: string): CommentInfo[] {
    const comments: CommentInfo[] = [];
    const lines = text.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNumber = i + 1;

      // Line comments (// or #)
      const lineCommentMatch = line.match(/(?:\/\/|#)\s*(.+)/);
      if (lineCommentMatch) {
        const commentText = lineCommentMatch[1].trim();
        const nodeIdMatch = line.match(/^\s*(\w+)\[/); // Try to associate with node

        comments.push({
          text: commentText,
          line: lineNumber,
          type: 'line',
          nodeId: nodeIdMatch ? nodeIdMatch[1] : undefined,
        });
      }

      // Block comments (/* ... */)
      const blockCommentMatch = line.match(/\/\*\s*(.+?)\s*\*\//);
      if (blockCommentMatch) {
        comments.push({
          text: blockCommentMatch[1].trim(),
          line: lineNumber,
          type: 'block',
        });
      }
    }

    return comments;
  }

  /**
   * Analyze whitespace patterns
   */
  private analyzeWhitespace(text: string): WhitespaceInfo {
    const lines = text.split('\n');

    // Detect section spacing (blank lines between @style, @template, flowchart)
    let sectionSpacing = 1;
    let consecutiveBlankLines = 0;
    let maxConsecutiveBlankLines = 0;

    for (const line of lines) {
      if (line.trim() === '') {
        consecutiveBlankLines++;
      } else {
        if (consecutiveBlankLines > maxConsecutiveBlankLines) {
          maxConsecutiveBlankLines = consecutiveBlankLines;
        }
        consecutiveBlankLines = 0;
      }
    }

    sectionSpacing = Math.min(maxConsecutiveBlankLines, 2);

    // Detect arrow spacing
    const arrowSpacing = / --> /.test(text) || / -> /.test(text);

    // Detect colon spacing
    const colonSpacing = /:\s+/.test(text);

    return {
      sectionSpacing,
      arrowSpacing,
      colonSpacing,
    };
  }

  /**
   * Detect indentation style (spaces vs tabs)
   */
  private detectIndentStyle(text: string): 'spaces' | 'tabs' {
    const lines = text.split('\n');
    let spaceIndentCount = 0;
    let tabIndentCount = 0;

    for (const line of lines) {
      if (line.startsWith('  ')) {
        spaceIndentCount++;
      }
      if (line.startsWith('\t')) {
        tabIndentCount++;
      }
    }

    return tabIndentCount > spaceIndentCount ? 'tabs' : 'spaces';
  }

  /**
   * Detect indent size (for spaces)
   */
  private detectIndentSize(text: string): number {
    const lines = text.split('\n');
    const indents: number[] = [];

    for (const line of lines) {
      const match = line.match(/^( +)/);
      if (match) {
        indents.push(match[1].length);
      }
    }

    if (indents.length === 0) {
      return 2; // Default to 2 spaces
    }

    // Find GCD of all indentations to determine base indent size
    const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
    const indentSize = indents.reduce((acc, val) => gcd(acc, val));

    // Common sizes: 2, 4
    return indentSize === 0 ? 2 : Math.min(indentSize, 4);
  }

  /**
   * Detect line ending style
   */
  private detectLineEnding(text: string): '\n' | '\r\n' {
    return text.includes('\r\n') ? '\r\n' : '\n';
  }

  /**
   * Strip comments from DSL text for parsing
   */
  stripComments(text: string): string {
    return text
      .split('\n')
      .map(line => {
        // Remove line comments
        return line.replace(/(?:\/\/|#).*$/, '').trimEnd();
      })
      .join('\n')
      // Remove block comments
      .replace(/\/\*[\s\S]*?\*\//g, '');
  }

  /**
   * Apply format information to generated DSL text
   */
  applyFormatInfo(text: string, formatInfo: FormatInfo): string {
    let formatted = text;

    // Apply indentation
    formatted = this.applyIndentation(formatted, formatInfo.indentStyle, formatInfo.indentSize);

    // Apply line endings
    if (formatInfo.lineEnding === '\r\n') {
      formatted = formatted.replace(/\n/g, '\r\n');
    }

    // Restore comments
    formatted = this.restoreComments(formatted, formatInfo.comments);

    // Apply whitespace patterns
    formatted = this.applyWhitespace(formatted, formatInfo.whitespace);

    return formatted;
  }

  /**
   * Apply indentation to text
   */
  private applyIndentation(text: string, style: 'spaces' | 'tabs', size: number): string {
    const indent = style === 'tabs' ? '\t' : ' '.repeat(size);
    const lines = text.split('\n');

    return lines.map(line => {
      const trimmed = line.trimStart();
      if (!trimmed) return line;

      // Detect current indent level (count leading spaces)
      const currentIndent = line.length - line.trimStart().length;
      const level = Math.floor(currentIndent / 2); // Assuming original is 2-space

      return indent.repeat(level) + trimmed;
    }).join('\n');
  }

  /**
   * Restore comments to generated text
   */
  restoreComments(text: string, comments: CommentInfo[]): string {
    if (comments.length === 0) return text;

    const lines = text.split('\n');
    const commentsByLine = new Map<number, CommentInfo[]>();

    // Group comments by line
    for (const comment of comments) {
      if (!commentsByLine.has(comment.line)) {
        commentsByLine.set(comment.line, []);
      }
      commentsByLine.get(comment.line)!.push(comment);
    }

    // Insert comments
    const result: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      const lineNumber = i + 1;
      const lineComments = commentsByLine.get(lineNumber);

      if (lineComments) {
        for (const comment of lineComments) {
          const commentPrefix = comment.type === 'line' ? '// ' : '/* ';
          const commentSuffix = comment.type === 'line' ? '' : ' */';
          result.push(`${commentPrefix}${comment.text}${commentSuffix}`);
        }
      }

      result.push(lines[i]);
    }

    return result.join('\n');
  }

  /**
   * Apply whitespace patterns
   */
  private applyWhitespace(text: string, whitespace: WhitespaceInfo): string {
    let formatted = text;

    // Apply section spacing
    if (whitespace.sectionSpacing > 1) {
      const sectionPattern = /(@style|@template|flowchart|erDiagram|classDiagram)/g;
      formatted = formatted.replace(sectionPattern, (match, offset) => {
        // Add blank lines before section markers (except first line)
        if (offset > 0) {
          return '\n'.repeat(whitespace.sectionSpacing - 1) + match;
        }
        return match;
      });
    }

    // Apply arrow spacing
    if (whitespace.arrowSpacing) {
      formatted = formatted.replace(/-->/g, ' --> ');
      formatted = formatted.replace(/->/g, ' -> ');
    } else {
      formatted = formatted.replace(/ ?--> ?/g, '-->');
      formatted = formatted.replace(/ ?-> ?/g, '->');
    }

    // Apply colon spacing
    if (whitespace.colonSpacing) {
      formatted = formatted.replace(/:/g, ': ');
    } else {
      formatted = formatted.replace(/: /g, ':');
    }

    return formatted;
  }

  /**
   * Normalize formatting for consistent output
   */
  normalize(text: string): string {
    return text
      .split('\n')
      .map(line => line.trimEnd()) // Remove trailing whitespace
      .join('\n')
      .replace(/\n{3,}/g, '\n\n') // Max 2 consecutive blank lines
      .trim();
  }

  /**
   * Get format statistics
   */
  getFormatStats(formatInfo: FormatInfo): {
    commentCount: number;
    indentStyle: string;
    indentSize: number;
    lineEnding: string;
    hasCustomWhitespace: boolean;
  } {
    return {
      commentCount: formatInfo.comments.length,
      indentStyle: formatInfo.indentStyle,
      indentSize: formatInfo.indentSize,
      lineEnding: formatInfo.lineEnding === '\r\n' ? 'CRLF' : 'LF',
      hasCustomWhitespace: formatInfo.whitespace.sectionSpacing > 1 ||
                           formatInfo.whitespace.arrowSpacing ||
                           formatInfo.whitespace.colonSpacing,
    };
  }

  /**
   * Merge two format infos (useful for incremental updates)
   */
  mergeFormatInfo(base: FormatInfo, updates: Partial<FormatInfo>): FormatInfo {
    return {
      originalText: updates.originalText || base.originalText,
      comments: updates.comments || base.comments,
      whitespace: updates.whitespace || base.whitespace,
      indentStyle: updates.indentStyle || base.indentStyle,
      indentSize: updates.indentSize !== undefined ? updates.indentSize : base.indentSize,
      lineEnding: updates.lineEnding || base.lineEnding,
    };
  }
}
