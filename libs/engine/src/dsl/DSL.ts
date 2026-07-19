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
import { NodeStyle } from '../types/model.types';

// BPMN still rides the flowchart grammar (no Mermaid `bpmn` type exists).
// NOTE: extended/ERDParser + extended/UMLParser are NO LONGER USED here —
// parseERD/parseUML now delegate to dsl/mermaid/ so there is exactly one
// implementation of each grammar. The old classes remain only for the demo
// scripts that import them directly and are candidates for deletion.
import { BPMNGenerator } from './extended';

// Mermaid graph-family types (Phase 3): erDiagram / classDiagram / stateDiagram
import {
  parseMermaidEr,
  erModelToDiagram,
  generateErFromDiagram,
  parseMermaidClass,
  classModelToDiagram,
  generateClassFromDiagram,
  parseMermaidState,
  stateModelToDiagram,
  generateStateFromDiagram,
} from './mermaid';

// Advanced features (Phase 4)
import { StyleParser, TemplateParser, TemplateDefinition } from './advanced';

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
  /** First-word (lowercased) → canonical Mermaid header. flowchart/graph/
   *  erDiagram/classDiagram are handled directly in detectDiagramType and are
   *  intentionally absent. `stateDiagram[-v2]` IS listed (the header spelling
   *  needs canonicalising) but is now parsed, not refused — everything else
   *  here is still a recognised-but-unparsed type that Phase 0 fails safe on. */
  private static readonly KNOWN_DIAGRAM_TYPES: Record<string, string> = {
    sequencediagram: 'sequenceDiagram',
    statediagram: 'stateDiagram',
    'statediagram-v2': 'stateDiagram-v2',
    journey: 'journey',
    gantt: 'gantt',
    pie: 'pie',
    quadrantchart: 'quadrantChart',
    requirementdiagram: 'requirementDiagram',
    gitgraph: 'gitGraph',
    mindmap: 'mindmap',
    timeline: 'timeline',
    zenuml: 'zenuml',
    'sankey-beta': 'sankey-beta',
    'xychart-beta': 'xychart-beta',
    'block-beta': 'block-beta',
    'packet-beta': 'packet-beta',
    kanban: 'kanban',
    'architecture-beta': 'architecture-beta',
    radar: 'radar',
    c4context: 'C4Context',
    c4container: 'C4Container',
    c4component: 'C4Component',
    c4dynamic: 'C4Dynamic',
    c4deployment: 'C4Deployment',
  };

  private lexer: Lexer;
  private parser: Parser;
  private transformer: ASTTransformer;
  private layoutDetector: LayoutDetector;
  private generator: DSLGenerator;
  private formatter: DSLFormatter;
  private options: DSLOptions;

  // Phase 4: Advanced features
  private styleParser: StyleParser;
  private templateParser: TemplateParser;

  constructor(options: DSLOptions = {}) {
    this.lexer = new Lexer('');
    this.parser = new Parser();
    this.transformer = new ASTTransformer();
    this.layoutDetector = new LayoutDetector();
    this.generator = new DSLGenerator();
    this.formatter = new DSLFormatter();
    this.styleParser = new StyleParser();
    this.templateParser = new TemplateParser();
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
      // Detect diagram type from first line
      const diagramType = this.detectDiagramType(text);

      if (this.options.debug) {
        console.log(`[DSL] Detected diagram type: ${diagramType}`);
      }

      // Mermaid graph-family types with a real parser of their own (Phase 3).
      // Each returns a fully-built DiagramModel plus the kit spec its renderer
      // consumes — see dsl/mermaid/.
      if (diagramType === 'erDiagram') {
        return this.finishGraphType(erModelToDiagram(parseMermaidEr(text)), 'erDiagram', startTime);
      }
      if (diagramType === 'classDiagram') {
        return this.finishGraphType(
          classModelToDiagram(parseMermaidClass(text)),
          'classDiagram',
          startTime
        );
      }
      if (diagramType === 'stateDiagram' || diagramType === 'stateDiagram-v2') {
        return this.finishGraphType(
          stateModelToDiagram(parseMermaidState(text)),
          'stateDiagram-v2',
          startTime
        );
      }

      // Recognised Mermaid type we do not yet parse (sequence, gantt, pie, …):
      // return an EMPTY diagram tagged with the type, never garbage from the
      // flowchart parser. The caller (importDiagramText) surfaces the tag as an
      // explicit `unsupported` result. See docs/MERMAID-GAP-ANALYSIS.md Phase 0.
      if (diagramType !== 'flowchart') {
        const empty = new DiagramModel('Unsupported diagram');
        empty.setMetadata('diagramType', diagramType);
        empty.setMetadata('unsupportedDiagramType', diagramType);
        return {
          diagram: empty,
          ast: { type: 'Diagram', diagramType: 'flowchart', direction: 'TD', statements: [] },
          tokens: [],
          stats: { nodeCount: 0, linkCount: 0, parseTime: performance.now() - startTime },
        };
      }

      // Phase 4: Parse styles and templates first
      if (this.options.debug) {
        console.log('[DSL] Phase 4: Parsing styles and templates...');
      }
      const styleDefinitions = this.styleParser.parseStyleDefinitions(text);
      const templateDefinitions = this.templateParser.parseTemplateDefinitions(text);

      if (this.options.debug && styleDefinitions.size > 0) {
        console.log(`[DSL] Found ${styleDefinitions.size} style definitions`);
      }
      if (this.options.debug && templateDefinitions.size > 0) {
        console.log(`[DSL] Found ${templateDefinitions.size} template definitions`);
      }

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

      // Phase 4: Apply styles and templates to nodes
      this.applyStylesAndTemplates(diagram, text, styleDefinitions, templateDefinitions);

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

    // A graph-family diagram must be written back in ITS OWN grammar. Handing
    // an ER model to the flowchart generator emits `flowchart TD` with the
    // entity names as plain boxes — valid Mermaid, but a different diagram, and
    // the attributes/cardinality are gone. Route by the type the parser tagged.
    const graphType = diagram.getMetadata('diagramType') as string | undefined;
    if (graphType === 'erDiagram' || graphType === 'erd') return generateErFromDiagram(diagram);
    if (graphType === 'classDiagram') return generateClassFromDiagram(diagram);
    if (graphType === 'stateDiagram' || graphType === 'stateDiagram-v2') {
      return generateStateFromDiagram(diagram);
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
   * Parse ERD (Entity Relationship Diagram).
   *
   * Delegates to the Phase-3 Mermaid parser — ONE implementation, so this
   * long-standing public helper cannot drift back to the scaffolding's
   * behaviour (a single node called `CUSTOMER ||--o`).
   */
  parseERD(text: string): DiagramModel {
    const model = parseMermaidEr(text);
    if (this.options.debug) {
      console.log(
        `[DSL] Parsed ERD: ${model.entities.length} entities, ${model.relationships.length} relationships`
      );
    }
    return erModelToDiagram(model);
  }

  /**
   * Generate ERD DSL from diagram
   */
  generateERD(diagram: DiagramModel): string {
    return generateErFromDiagram(diagram);
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
   * Parse UML Class Diagram.
   *
   * Delegates to the Phase-3 Mermaid parser (see parseERD for the reasoning).
   * The scaffolding this replaces returned an EMPTY diagram for canonical
   * `classDiagram` input.
   */
  parseUML(text: string): DiagramModel {
    const model = parseMermaidClass(text);
    if (this.options.debug) {
      console.log(
        `[DSL] Parsed UML: ${model.classes.length} classes, ${model.relationships.length} relationships`
      );
    }
    return classModelToDiagram(model);
  }

  /**
   * Generate UML DSL from diagram
   */
  generateUML(diagram: DiagramModel): string {
    return generateClassFromDiagram(diagram);
  }

  /**
   * Phase 4: Apply styles and templates to diagram nodes
   */
  private applyStylesAndTemplates(
    diagram: DiagramModel,
    text: string,
    styleDefinitions: Map<string, Partial<NodeStyle>>,
    templateDefinitions: Map<string, TemplateDefinition>
  ): void {
    // Apply diagram-level styles
    const diagramStyles = this.styleParser.parseDiagramStyles(text);
    if (diagramStyles) {
      diagram.setMetadata('defaultNodeStyle', diagramStyles);
    }

    // Store style and template definitions in diagram metadata
    if (styleDefinitions.size > 0) {
      diagram.setMetadata('styleDefinitions', Object.fromEntries(styleDefinitions));
    }
    if (templateDefinitions.size > 0) {
      diagram.setMetadata('templateDefinitions', Object.fromEntries(templateDefinitions));
    }

    // Extract node-specific styles from text
    const lines = text.split('\n');
    const nodeStyleMap = new Map<string, Partial<NodeStyle>>();
    const nodeClassMap = new Map<string, string[]>();

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('@')) {
        continue;
      }

      // Extract node ID and styles
      const nodeIdMatch = trimmed.match(/^\s*(\w+)/);
      if (!nodeIdMatch) continue;

      const nodeId = nodeIdMatch[1];

      // Extract style classes (:::className)
      const styleClasses = this.styleParser.extractStyleClasses(trimmed);
      if (styleClasses.length > 0) {
        nodeClassMap.set(nodeId, styleClasses);
      }

      // Extract inline styles ({property:value})
      const inlineStyle = this.styleParser.extractInlineStyle(trimmed);
      if (inlineStyle) {
        nodeStyleMap.set(nodeId, inlineStyle);
      }
    }

    // Apply styles to nodes
    for (const node of diagram.getNodes()) {
      const styles: Array<Partial<NodeStyle>> = [];

      // 1. Apply diagram-level default styles
      if (diagramStyles) {
        styles.push(diagramStyles);
      }

      // 2. Apply style classes
      const classes = nodeClassMap.get(node.id);
      if (classes) {
        for (const className of classes) {
          const classDef = styleDefinitions.get(className);
          if (classDef) {
            styles.push(classDef);
          }
        }
      }

      // 3. Apply inline styles (highest priority)
      const inlineStyle = nodeStyleMap.get(node.id);
      if (inlineStyle) {
        styles.push(inlineStyle);
      }

      // Merge and apply styles
      if (styles.length > 0) {
        const mergedStyle = this.styleParser.mergeStyles(...styles);
        node.setStyle(mergedStyle);
      }

      // Apply template if specified
      // Template can be specified in node data or via @template mapping
      const templateName = node.data['template'] as string | undefined;
      if (templateName && templateDefinitions.has(templateName)) {
        const template = templateDefinitions.get(templateName)!;
        node.setMetadata('customTemplate', template.html);
        node.setMetadata('templateBindings', template.bindings);
      }
    }
  }

  /**
   * Detect diagram type from text
   */
  private detectDiagramType(text: string): string {
    // The header is the first meaningful line — skip blanks, %% comments, %%{init}%%
    // directives, and --- frontmatter --- so a configured diagram still detects.
    let header = '';
    let inFrontmatter = false;
    for (const raw of text.split('\n')) {
      const line = raw.trim();
      if (!line) continue;
      if (line === '---') { inFrontmatter = !inFrontmatter; continue; }
      if (inFrontmatter) continue;
      if (line.startsWith('%%')) continue;
      header = line;
      break;
    }
    const firstWord = header.split(/[\s:]/)[0];
    const lower = firstWord.toLowerCase();
    if (lower === 'flowchart' || lower === 'graph') return 'flowchart';
    if (lower === 'erdiagram') return 'erDiagram';
    if (lower === 'classdiagram') return 'classDiagram';
    // Every other Mermaid header we recognise but do not yet parse. Returning
    // the canonical name (not 'flowchart') is what lets the caller signal
    // "unsupported" instead of feeding it to the flowchart parser as garbage.
    const known = DSL.KNOWN_DIAGRAM_TYPES[lower];
    if (known) return known;
    return 'flowchart'; // best-effort default for an unlabelled body
  }

  /**
   * Wrap an already-built graph-family DiagramModel in a ParseResult. These
   * types do not go through the flowchart Lexer/Parser at all — their grammars
   * are line-oriented and share nothing with the flowchart token stream — so
   * the AST/token slots are empty by construction, not by omission.
   */
  private finishGraphType(
    diagram: DiagramModel,
    astType: string,
    startTime: number
  ): ParseResult {
    return {
      diagram,
      ast: { type: 'Diagram', diagramType: astType as never, direction: 'TD', statements: [] },
      tokens: [],
      stats: {
        nodeCount: diagram.getNodes().length,
        linkCount: diagram.getLinks().length,
        parseTime: performance.now() - startTime,
      },
    };
  }
}
