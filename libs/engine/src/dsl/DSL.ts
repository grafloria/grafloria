/**
 * DSL - Main interface for Mermaid-compatible diagram text parsing
 *
 * High-level API that orchestrates Lexer, Parser, Transformer, and LayoutDetector
 * to convert text-based diagram syntax into fully rendered DiagramModel instances.
 *
 * @example
 * ```typescript
 * const dsl = new DSL();
 *
 * const text = `
 * flowchart TD
 *   A[Start] --> B{Decision}
 *   B -->|Yes| C[Process]
 *   B -->|No| D[End]
 *   C --> D
 * `;
 *
 * const diagram = dsl.parse(text);
 * console.log(`Created ${diagram.getNodes().length} nodes`);
 * ```
 */

import { Lexer } from './lexer/Lexer';
import { Parser, ParseError } from './parser/Parser';
import { ASTTransformer, TransformOptions } from './transformer/ASTTransformer';
import { LayoutDetector, LayoutSuggestion } from './detector/LayoutDetector';
import { DiagramModel } from '../models/DiagramModel';
import { DiagramNode } from './types/ASTNode';
import { Token } from './types/Token';

export interface DSLOptions {
  /**
   * Auto-apply layout after parsing
   */
  autoLayout?: boolean;

  /**
   * Transformation options
   */
  transformOptions?: TransformOptions;

  /**
   * Enable debug logging
   */
  debug?: boolean;
}

export interface ParseResult {
  /**
   * Generated diagram model
   */
  diagram: DiagramModel;

  /**
   * Abstract syntax tree
   */
  ast: DiagramNode;

  /**
   * Tokens from lexical analysis
   */
  tokens: Token[];

  /**
   * Layout suggestion
   */
  layoutSuggestion?: LayoutSuggestion;

  /**
   * Parse statistics
   */
  stats: {
    nodeCount: number;
    linkCount: number;
    parseTime: number;
  };
}

export class DSL {
  private lexer: Lexer;
  private parser: Parser;
  private transformer: ASTTransformer;
  private layoutDetector: LayoutDetector;
  private options: DSLOptions;

  constructor(options: DSLOptions = {}) {
    this.lexer = new Lexer('');
    this.parser = new Parser();
    this.transformer = new ASTTransformer();
    this.layoutDetector = new LayoutDetector();
    this.options = {
      autoLayout: true,
      debug: false,
      ...options,
    };
  }

  /**
   * Parse DSL text into a DiagramModel
   */
  parse(text: string): DiagramModel {
    const result = this.parseDetailed(text);
    return result.diagram;
  }

  /**
   * Parse DSL text with detailed results
   */
  parseDetailed(text: string): ParseResult {
    const startTime = performance.now();

    try {
      // Step 1: Lexical analysis
      if (this.options.debug) {
        console.log('[DSL] Starting lexical analysis...');
      }
      this.lexer = new Lexer(text);
      const tokens = this.lexer.tokenize();

      if (this.options.debug) {
        console.log(`[DSL] Tokenized: ${tokens.length} tokens`);
      }

      // Step 2: Parsing
      if (this.options.debug) {
        console.log('[DSL] Starting parsing...');
      }
      const ast = this.parser.parse(tokens);

      if (this.options.debug) {
        console.log(`[DSL] Parsed AST: ${ast.statements.length} statements`);
      }

      // Step 3: Transformation
      if (this.options.debug) {
        console.log('[DSL] Transforming AST to DiagramModel...');
      }
      const diagram = this.transformer.transform(ast, this.options.transformOptions);

      const nodeCount = diagram.getNodes().length;
      const linkCount = diagram.getLinks().length;

      if (this.options.debug) {
        console.log(`[DSL] Created diagram: ${nodeCount} nodes, ${linkCount} links`);
      }

      // Step 4: Layout detection and application
      let layoutSuggestion: LayoutSuggestion | undefined;

      if (this.options.autoLayout) {
        if (this.options.debug) {
          console.log('[DSL] Detecting optimal layout...');
        }

        layoutSuggestion = this.layoutDetector.detect(diagram, ast);

        if (this.options.debug) {
          console.log(
            `[DSL] Layout suggestion: ${layoutSuggestion.presetId} (confidence: ${layoutSuggestion.confidence.toFixed(2)})`
          );
          console.log(`[DSL] Reasoning: ${layoutSuggestion.reasoning}`);
        }

        // Store layout suggestion in diagram metadata
        diagram.setMetadata('suggestedLayout', layoutSuggestion.presetId);
        diagram.setMetadata('layoutReasoning', layoutSuggestion.reasoning);
        diagram.setMetadata('layoutConfidence', layoutSuggestion.confidence);
      }

      const parseTime = performance.now() - startTime;

      if (this.options.debug) {
        console.log(`[DSL] Parse complete in ${parseTime.toFixed(2)}ms`);
      }

      return {
        diagram,
        ast,
        tokens,
        layoutSuggestion,
        stats: {
          nodeCount,
          linkCount,
          parseTime,
        },
      };
    } catch (error) {
      if (error instanceof ParseError) {
        throw new Error(
          `DSL Parse Error at line ${error.line}, column ${error.column}: ${error.message}`
        );
      }
      throw error;
    }
  }

  /**
   * Validate DSL text without creating a diagram
   */
  validate(text: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    try {
      // Tokenize
      this.lexer = new Lexer(text);
      const tokens = this.lexer.tokenize();

      // Parse
      this.parser.parse(tokens);

      return { valid: true, errors: [] };
    } catch (error) {
      if (error instanceof ParseError) {
        errors.push(
          `Line ${error.line}, Column ${error.column}: ${error.message}`
        );
      } else if (error instanceof Error) {
        errors.push(error.message);
      }

      return { valid: false, errors };
    }
  }

  /**
   * Get layout suggestion for text without parsing fully
   */
  suggestLayout(text: string): LayoutSuggestion | null {
    try {
      const result = this.parseDetailed(text);
      return result.layoutSuggestion || null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Get token stream for debugging
   */
  tokenize(text: string): Token[] {
    this.lexer = new Lexer(text);
    return this.lexer.tokenize();
  }

  /**
   * Get AST for debugging
   */
  parseToAST(text: string): DiagramNode {
    this.lexer = new Lexer(text);
    const tokens = this.lexer.tokenize();
    return this.parser.parse(tokens);
  }

  /**
   * Set options
   */
  setOptions(options: Partial<DSLOptions>): void {
    this.options = { ...this.options, ...options };
  }

  /**
   * Get current options
   */
  getOptions(): DSLOptions {
    return { ...this.options };
  }
}
