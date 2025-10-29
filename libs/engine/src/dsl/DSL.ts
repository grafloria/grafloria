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
import { DSLGenerator, GeneratorOptions } from './generator/DSLGenerator';
import { DSLFormatter, FormatterOptions } from './generator/DSLFormatter';
import { DiagramModel } from '../models/DiagramModel';
import { DiagramNode } from './types/ASTNode';
import { Token } from './types/Token';

// Extended types (Phase 3)
import { ERDParser, ERDGenerator, ERDTransformer } from './extended';
import { BPMNParser, BPMNGenerator } from './extended';
import { UMLParser, UMLGenerator } from './extended';

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
  private generator: DSLGenerator;
  private formatter: DSLFormatter;
  private options: DSLOptions;

  constructor(options: DSLOptions = {}) {
    this.lexer = new Lexer('');
    this.parser = new Parser();
    this.transformer = new ASTTransformer();
    this.layoutDetector = new LayoutDetector();
    this.generator = new DSLGenerator();
    this.formatter = new DSLFormatter();
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

  // =========================================================================
  // Generation API (Phase 1.3)
  // =========================================================================

  /**
   * Generate DSL text from diagram
   */
  generate(diagram: DiagramModel, options?: GeneratorOptions): string {
    if (this.options.debug) {
      console.log('[DSL] Generating DSL text from diagram...');
    }

    const text = this.generator.generate(diagram, options);

    if (this.options.debug) {
      console.log(`[DSL] Generated ${text.split('\n').length} lines of DSL text`);
    }

    return text;
  }

  /**
   * Generate and format DSL text from diagram
   */
  generateFormatted(
    diagram: DiagramModel,
    generatorOptions?: GeneratorOptions,
    formatterOptions?: FormatterOptions
  ): string {
    const text = this.generate(diagram, generatorOptions);
    const formatted = this.formatter.format(text);
    return formatted;
  }

  /**
   * Generate pretty-printed DSL text
   */
  generatePretty(diagram: DiagramModel, addHeaders: boolean = true): string {
    const text = this.generate(diagram, {
      includeComments: true,
      includeStyles: true,
      preserveIds: true,
    });
    return this.formatter.prettyPrint(text, addHeaders);
  }

  /**
   * Format DSL text
   */
  format(text: string, options?: FormatterOptions): string {
    if (options) {
      const formatter = new DSLFormatter(options);
      return formatter.format(text);
    }
    return this.formatter.format(text);
  }

  /**
   * Round-trip test: parse → generate → parse
   * Returns true if the round-trip preserves structure
   */
  testRoundTrip(text: string): {
    success: boolean;
    originalNodes: number;
    originalLinks: number;
    regeneratedNodes: number;
    regeneratedLinks: number;
    generatedText: string;
  } {
    try {
      // Parse original text
      const diagram1 = this.parse(text);
      const originalNodes = diagram1.getNodes().length;
      const originalLinks = diagram1.getLinks().length;

      // Generate text from diagram
      const generatedText = this.generate(diagram1);

      // Parse generated text
      const diagram2 = this.parse(generatedText);
      const regeneratedNodes = diagram2.getNodes().length;
      const regeneratedLinks = diagram2.getLinks().length;

      // Check if structure is preserved
      const success =
        originalNodes === regeneratedNodes &&
        originalLinks === regeneratedLinks;

      return {
        success,
        originalNodes,
        originalLinks,
        regeneratedNodes,
        regeneratedLinks,
        generatedText,
      };
    } catch (error) {
      return {
        success: false,
        originalNodes: 0,
        originalLinks: 0,
        regeneratedNodes: 0,
        regeneratedLinks: 0,
        generatedText: '',
      };
    }
  }

  // =========================================================================
  // Extended Diagram Types (Phase 3)
  // =========================================================================

  /**
   * Parse ERD (Entity Relationship Diagram)
   */
  parseERD(text: string): DiagramModel {
    const erdParser = new ERDParser();
    const erdTransformer = new ERDTransformer();

    const erdDiagram = erdParser.parse(text);
    const diagram = erdTransformer.transform(erdDiagram);

    if (this.options.debug) {
      console.log(`[DSL] Parsed ERD: ${erdDiagram.entities.size} entities, ${erdDiagram.relationships.length} relationships`);
    }

    return diagram;
  }

  /**
   * Generate ERD DSL from diagram
   */
  generateERD(diagram: DiagramModel): string {
    const erdGenerator = new ERDGenerator();
    return erdGenerator.generate(diagram);
  }

  /**
   * Parse BPMN (Business Process Model)
   */
  parseBPMN(text: string): DiagramModel {
    // BPMN uses extended flowchart syntax, so we can use the regular parser
    // but with BPMN-specific interpretation
    return this.parse(text);
  }

  /**
   * Generate BPMN DSL from diagram
   */
  generateBPMN(diagram: DiagramModel): string {
    const bpmnGenerator = new BPMNGenerator();
    return bpmnGenerator.generate(diagram);
  }

  /**
   * Parse UML Class Diagram
   */
  parseUML(text: string): DiagramModel {
    const umlParser = new UMLParser();
    const umlDiagram = umlParser.parse(text);

    // Transform UML to DiagramModel
    const diagram = new DiagramModel('UML Class Diagram');
    diagram.setMetadata('diagramType', 'classDiagram');

    // Create class nodes
    let index = 0;
    for (const [name, umlClass] of umlDiagram.classes) {
      const row = Math.floor(index / 3);
      const col = index % 3;

      const NodeModel = require('../models/NodeModel').NodeModel;
      const node = new NodeModel({
        id: name,
        type: 'uml:class',
        position: {
          x: 100 + col * 300,
          y: 100 + row * 250,
        },
        size: {
          width: 220,
          height: 150 + (umlClass.attributes.length + umlClass.methods.length) * 20,
        },
      });

      node.data.name = name;
      node.data.label = name;
      node.data.stereotype = umlClass.stereotype;
      node.data.attributes = umlClass.attributes;
      node.data.methods = umlClass.methods;

      diagram.addNode(node);
      index++;
    }

    // Create relationship links
    for (const rel of umlDiagram.relationships) {
      const sourceNode = diagram.getNode(rel.from);
      const targetNode = diagram.getNode(rel.to);

      if (sourceNode && targetNode) {
        const link = diagram.createSmartLink(sourceNode, targetNode, 'smooth');
        if (link) {
          link.setMetadata('umlRelationship', rel.type);
          if (rel.label) {
            link.data.label = rel.label;
          }
        }
      }
    }

    if (this.options.debug) {
      console.log(`[DSL] Parsed UML: ${umlDiagram.classes.size} classes, ${umlDiagram.relationships.length} relationships`);
    }

    return diagram;
  }

  /**
   * Generate UML DSL from diagram
   */
  generateUML(diagram: DiagramModel): string {
    const umlGenerator = new UMLGenerator();
    return umlGenerator.generate(diagram);
  }
}
