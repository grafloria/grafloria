/**
 * DSL Generator - Converts DiagramModel to DSL text
 *
 * Generates Mermaid-compatible diagram syntax from DiagramModel instances.
 * Supports flowcharts, BPMN, ERD, and class diagrams.
 */

import { DiagramModel } from '../../models/DiagramModel';
import { NodeModel } from '../../models/NodeModel';
import { LinkModel } from '../../models/LinkModel';
import { DiagramAnalyzer, DiagramAnalysis } from './DiagramAnalyzer';
import { NodeShape, LinkType } from '../types/ASTNode';

export interface GeneratorOptions {
  /**
   * Include comments in output
   */
  includeComments?: boolean;

  /**
   * Include style definitions
   */
  includeStyles?: boolean;

  /**
   * Format output (uses DSLFormatter)
   */
  format?: boolean;

  /**
   * Preserve node IDs from diagram
   */
  preserveIds?: boolean;

  /**
   * Generate subgraphs
   */
  includeSubgraphs?: boolean;
}

export class DSLGenerator {
  private analyzer: DiagramAnalyzer;
  private analysis?: DiagramAnalysis;

  constructor() {
    this.analyzer = new DiagramAnalyzer();
  }

  /**
   * Generate DSL text from diagram
   */
  generate(diagram: DiagramModel, options: GeneratorOptions = {}): string {
    const {
      includeComments = true,
      includeStyles = true,
      preserveIds = true,
      includeSubgraphs = false,
    } = options;

    // Analyze diagram structure
    this.analysis = this.analyzer.analyze(diagram);

    const lines: string[] = [];

    // Add header comment
    if (includeComments) {
      lines.push('%% Generated from DiagramModel');
      lines.push(`%% Nodes: ${this.analysis.stats.nodeCount}, Links: ${this.analysis.stats.linkCount}`);
      lines.push('');
    }

    // Add diagram declaration
    const diagramDeclaration = this.generateDiagramDeclaration();
    lines.push(diagramDeclaration);
    lines.push('');

    // Generate nodes and edges
    const statements = this.generateStatements(diagram, preserveIds, includeSubgraphs);
    lines.push(...statements);

    // Generate style definitions
    if (includeStyles) {
      const styles = this.generateStyles(diagram);
      if (styles.length > 0) {
        lines.push('');
        if (includeComments) {
          lines.push('%% Styles');
        }
        lines.push(...styles);
      }
    }

    return lines.join('\n');
  }

  /**
   * Generate diagram declaration (e.g., "flowchart TD")
   */
  private generateDiagramDeclaration(): string {
    if (!this.analysis) {
      return 'flowchart TD';
    }

    const { diagramType, direction } = this.analysis;

    if (diagramType === 'flowchart') {
      return `flowchart ${direction}`;
    } else if (diagramType === 'bpmn') {
      return `flowchart ${direction} %% BPMN`;
    } else if (diagramType === 'erd') {
      return 'erDiagram';
    } else if (diagramType === 'classDiagram') {
      return 'classDiagram';
    }

    return 'flowchart TD';
  }

  /**
   * Generate statements (nodes and edges)
   */
  private generateStatements(
    diagram: DiagramModel,
    preserveIds: boolean,
    includeSubgraphs: boolean
  ): string[] {
    const lines: string[] = [];

    if (!this.analysis) {
      return lines;
    }

    const nodes = diagram.getNodes();
    const links = diagram.getLinks();

    // Generate in optimal order
    const processedNodes = new Set<string>();
    const processedLinks = new Set<string>();

    for (const nodeId of this.analysis.nodeOrder) {
      const node = nodes.find(n => n.id === nodeId);
      if (!node) continue;

      // Generate node definition
      const nodeDef = this.generateNodeDefinition(node, preserveIds);
      if (nodeDef) {
        lines.push(`  ${nodeDef}`);
        processedNodes.add(nodeId);
      }

      // Generate outgoing edges
      const outgoingLinks = links.filter(l => l.sourceNodeId === nodeId && !processedLinks.has(l.id));
      for (const link of outgoingLinks) {
        const edgeDef = this.generateEdgeDefinition(link, diagram, preserveIds);
        if (edgeDef) {
          lines.push(`  ${edgeDef}`);
          processedLinks.add(link.id);
        }
      }
    }

    // Generate any remaining nodes
    for (const node of nodes) {
      if (!processedNodes.has(node.id)) {
        const nodeDef = this.generateNodeDefinition(node, preserveIds);
        if (nodeDef) {
          lines.push(`  ${nodeDef}`);
          processedNodes.add(node.id);
        }
      }
    }

    // Generate any remaining links
    for (const link of links) {
      if (!processedLinks.has(link.id)) {
        const edgeDef = this.generateEdgeDefinition(link, diagram, preserveIds);
        if (edgeDef) {
          lines.push(`  ${edgeDef}`);
          processedLinks.add(link.id);
        }
      }
    }

    return lines;
  }

  /**
   * Generate node definition
   */
  private generateNodeDefinition(node: NodeModel, preserveIds: boolean): string | null {
    const nodeId = preserveIds ? this.sanitizeId(node.id) : this.generateShortId(node);
    // getLabel() is the canonical read: metadata.label (editor/spec/command
    // diagrams) with a legacy data.label fallback. Reading only data.label
    // exported Mermaid bodies of raw ids — nothing human-readable to edit.
    const label = node.getLabel() ?? node.id;

    // Get shape from metadata
    const shapeMetadata = this.analysis?.nodeMetadata.get(node.id);
    const shape = shapeMetadata?.shape || 'rectangle';

    // Generate shape brackets
    const { opening, closing } = this.getShapeBrackets(shape as NodeShape);

    return `${nodeId}${opening}${label}${closing}`;
  }

  /**
   * Generate edge definition
   */
  private generateEdgeDefinition(
    link: LinkModel,
    diagram: DiagramModel,
    preserveIds: boolean
  ): string | null {
    const sourceNode = diagram.getNode(link.sourceNodeId || '');
    const targetNode = diagram.getNode(link.targetNodeId || '');

    if (!sourceNode || !targetNode) {
      return null;
    }

    const sourceId = preserveIds ? this.sanitizeId(sourceNode.id) : this.generateShortId(sourceNode);
    const targetId = preserveIds ? this.sanitizeId(targetNode.id) : this.generateShortId(targetNode);

    // Get link type from metadata or infer from style
    const linkType = this.inferLinkType(link);
    const linkSyntax = this.getLinkSyntax(linkType);

    // Add label if present (canonical read; see generateNodeDefinition)
    const label = link.getLabel();
    if (label) {
      return `${sourceId} ${linkSyntax.split('>')[0]}>|${label}|${linkSyntax.split('>')[1] || ''} ${targetId}`;
    }

    return `${sourceId} ${linkSyntax} ${targetId}`;
  }

  /**
   * Generate style definitions
   */
  private generateStyles(diagram: DiagramModel): string[] {
    const lines: string[] = [];

    if (!this.analysis) {
      return lines;
    }

    const nodes = diagram.getNodes();

    for (const node of nodes) {
      const metadata = this.analysis.nodeMetadata.get(node.id);
      if (metadata?.hasCustomStyle && node.style) {
        const nodeId = this.sanitizeId(node.id);
        const styleProps = this.formatStyleProperties(node.style);
        if (styleProps) {
          lines.push(`  style ${nodeId} ${styleProps}`);
        }
      }
    }

    return lines;
  }

  /**
   * Format style properties
   */
  private formatStyleProperties(style: any): string {
    const props: string[] = [];

    if (style.fill) {
      props.push(`fill:${style.fill}`);
    }
    if (style.stroke) {
      props.push(`stroke:${style.stroke}`);
    }
    if (style.strokeWidth) {
      props.push(`stroke-width:${style.strokeWidth}`);
    }
    if (style.strokeDasharray) {
      props.push(`stroke-dasharray:${style.strokeDasharray}`);
    }
    if (style.color) {
      props.push(`color:${style.color}`);
    }

    return props.join(',');
  }

  /**
   * Get shape brackets for node definition
   */
  private getShapeBrackets(shape: NodeShape): { opening: string; closing: string } {
    const brackets: Record<NodeShape, { opening: string; closing: string }> = {
      'rectangle': { opening: '[', closing: ']' },
      'rounded-rectangle': { opening: '(', closing: ')' },
      'stadium': { opening: '([', closing: '])' },
      'subroutine': { opening: '[[', closing: ']]' },
      'cylindrical': { opening: '[(', closing: ')]' },
      'circle': { opening: '((', closing: '))' },
      'asymmetric': { opening: '>', closing: ']' },
      'rhombus': { opening: '{', closing: '}' },
      'hexagon': { opening: '{{', closing: '}}' },
      'trapezoid': { opening: '[/', closing: '/]' },
      'trapezoid-alt': { opening: '[\\', closing: '\\]' },
    };

    return brackets[shape] || brackets['rectangle'];
  }

  /**
   * Infer link type from link metadata and style
   */
  private inferLinkType(link: LinkModel): LinkType {
    // Check metadata first
    const dslLinkType = link.getMetadata('dslLinkType');
    if (dslLinkType) {
      return dslLinkType as LinkType;
    }

    // Infer from style
    if (link.style?.strokeDasharray) {
      return 'dotted-arrow';
    }
    if (link.style?.strokeWidth && link.style.strokeWidth > 3) {
      return 'thick-arrow';
    }

    return 'arrow';
  }

  /**
   * Get link syntax for link type
   */
  private getLinkSyntax(linkType: LinkType): string {
    const syntax: Record<LinkType, string> = {
      'arrow': '-->',
      'line': '---',
      'dotted-arrow': '-.->',
      'dotted-line': '-.-',
      'thick-arrow': '==>',
      'thick-line': '===',
      'bidirectional': '<-->',
      'circle-edge': '--o',
      'cross-edge': '--x',
    };

    return syntax[linkType] || '-->';
  }

  /**
   * Sanitize node ID for DSL output
   */
  private sanitizeId(id: string): string {
    // Remove special characters and replace with underscore
    return id.replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  /**
   * Generate short ID for node
   */
  private generateShortId(node: NodeModel): string {
    // Use first letter of label if available (canonical read)
    const label = node.getLabel() ?? node.id;
    const firstLetter = label.charAt(0).toUpperCase();

    // Add counter if needed (implementation detail)
    return firstLetter;
  }
}
