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
import { GroupModel } from '../../models/GroupModel';
import { isSideAnchorPort } from '../../ports/side-anchor';

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

  /** Write `%%grafloria:at id x,y WxH` for every node and zone (see ExportTextOptions.positions). */
  positions?: boolean;
}

export class DSLGenerator {
  private analyzer: DiagramAnalyzer;
  private analysis?: DiagramAnalysis;
  /** The links in the order they were written — what `linkStyle <n>` counts. */
  private edgeOrder: LinkModel[] = [];
  private positions = false;

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
    this.edgeOrder = [];
    this.positions = options.positions === true;

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

    // Generate nodes and edges. A diagram with groups writes them as SUBGRAPHS
    // (members inside, edges after) — the zones of the picture.
    const statements = diagram.getGroups().length > 0
      ? this.generateGroupedStatements(diagram, preserveIds)
      : this.generateStatements(diagram, preserveIds, includeSubgraphs);
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

    // Tier-2 %%grafloria: directives (node status, edge animation).
    const grafloria = this.generateGrafloriaDirectives(diagram);
    if (grafloria.length > 0) {
      lines.push('');
      lines.push(...grafloria);
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
          this.edgeOrder.push(link);
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
          this.edgeOrder.push(link);
        }
      }
    }

    return lines;
  }

  /**
   * Nodes inside their zones — `subgraph id["name"] … end` for every group,
   * nested groups inside their parents — then the ungrouped nodes, then every
   * edge. Used when the diagram HAS groups; a diagram without keeps the
   * interleaved order above, byte for byte.
   */
  private generateGroupedStatements(diagram: DiagramModel, preserveIds: boolean): string[] {
    const lines: string[] = [];
    const groups = diagram.getGroups();
    const byId = new Map(groups.map((g) => [g.id, g]));
    const placed = new Set<string>();
    const writeGroup = (group: GroupModel, depth: number): void => {
      const pad = '  '.repeat(depth);
      const name = group.name && group.name !== group.id ? `["${this.labelMarkup(group.name).replace(/"/g, '#quot;')}"]` : '';
      lines.push(`${pad}subgraph ${this.sanitizeId(group.id)}${name}`);
      const dir = group.getMetadata('direction');
      if (typeof dir === 'string' && /^(TB|TD|BT|RL|LR)$/i.test(dir)) lines.push(`${pad}  direction ${dir.toUpperCase()}`);
      for (const child of groups.filter((g) => g.parentGroupId === group.id)) writeGroup(child, depth + 1);
      for (const id of group.members) {
        const node = diagram.getNode(id);
        if (!node || placed.has(id)) continue;
        const def = this.generateNodeDefinition(node, preserveIds);
        if (def) lines.push(`${pad}  ${def}`);
        placed.add(id);
      }
      lines.push(`${pad}end`);
    };
    for (const node of diagram.getNodes()) {
      const inGroup = groups.some((g) => g.members.has(node.id));
      if (inGroup) continue;
      const def = this.generateNodeDefinition(node, preserveIds);
      if (def) lines.push(`  ${def}`);
      placed.add(node.id);
    }
    for (const group of groups) if (!group.parentGroupId || !byId.has(group.parentGroupId)) writeGroup(group, 1);
    for (const link of diagram.getLinks()) {
      const def = this.generateEdgeDefinition(link, diagram, preserveIds);
      if (def) {
        lines.push(`  ${def}`);
        this.edgeOrder.push(link);
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

    // A text note: v11's `@{ shape: text }` — words, no box.
    const shapeType = (node.getMetadata('shape') as { type?: string } | undefined)?.type;
    if (shapeType === 'text' || shape === 'text') {
      return `${nodeId}@{ shape: text, label: "${this.labelMarkup(label).replace(/"/g, '#quot;')}" }`;
    }

    // Generate shape brackets
    const { opening, closing } = this.getShapeBrackets(shape as NodeShape);

    // A name over a subtitle is written the way real Mermaid draws it too:
    // `<b>Name</b><br/>subtitle`, a monospace subtitle in <code>.
    const sub = node.getMetadata('sublabel') as string | { text?: string; fontFamily?: string } | undefined;
    const subText = typeof sub === 'string' ? sub : sub?.text;
    if (subText) {
      const mono = typeof sub === 'object' && (sub.fontFamily === 'mono' || sub.fontFamily === 'monospace');
      const rich = `<b>${this.labelMarkup(label)}</b><br/>${mono ? `<code>${this.labelMarkup(subText)}</code>` : this.labelMarkup(subText)}`;
      return `${nodeId}${opening}"${rich.replace(/"/g, '#quot;')}"${closing}`;
    }

    return `${nodeId}${opening}${this.escapeLabel(this.labelMarkup(label), closing)}${closing}`;
  }

  /** A label's line breaks as `<br/>` — the form every Mermaid renderer reads. */
  private labelMarkup(text: string): string {
    return String(text).replace(/\n/g, '<br/>');
  }

  /**
   * Quote a label whose content would break the surrounding syntax — brackets,
   * quotes, pipes, or the shape's own closing delimiter. Mermaid's quoted form:
   * the label is wrapped in double quotes and inner quotes travel as #quot;.
   * Plain labels pass through untouched, so existing bodies do not churn.
   */
  private escapeLabel(label: string, closing: string): string {
    const needsQuoting =
      /[[\](){}"|<>]/.test(label) ||
      label !== label.trim() ||
      (closing.length > 0 && label.includes(closing));
    if (!needsQuoting) return label;
    return `"${label.replace(/"/g, '#quot;')}"`;
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
      // Line breaks as <br/>; a label with quotes or a break travels quoted.
      const text = this.labelMarkup(label);
      const written = /["|<>]/.test(text) ? `"${text.replace(/"/g, '#quot;')}"` : text;
      return `${sourceId} ${linkSyntax.split('>')[0]}>|${written}|${linkSyntax.split('>')[1] || ''} ${targetId}`;
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
      // Emit for nodes the DSL transformer actually styled — not the analyzer's
      // hasCustomStyle flag, which treats fill/stroke as non-custom — and for
      // nodes that carry the AI-diagram look (typography, the flat box).
      if ((node.getMetadata('dslStyled') || this.hasLookStyle(node)) && node.style) {
        const styleProps = this.formatStyleProperties(node.style);
        if (styleProps) {
          lines.push(`  style ${this.sanitizeId(node.id)} ${styleProps}`);
        }
      }
    }

    // A zone's frame: `style <subgraph> …`.
    for (const group of diagram.getGroups()) {
      const frame = group.getMetadata('frameStyle') as Record<string, unknown> | undefined;
      if (!frame) continue;
      const props = this.formatStyleProperties({ ...frame, rx: frame['borderRadius'] });
      if (props) lines.push(`  style ${this.sanitizeId(group.id)} ${props}`);
    }

    // `linkStyle <n>` — counted in the order the edges were written: the line's
    // colour, dash and width, its label's colour and weight, and right angles as
    // Mermaid's own `interpolate stepBefore`.
    this.edgeOrder.forEach((link, i) => {
      const own: Record<string, unknown> = {};
      if (link.style?.stroke && typeof link.style.stroke === 'string') own['stroke'] = link.style.stroke;
      if (link.style?.strokeWidth !== undefined && link.style.strokeWidth !== 2) own['strokeWidth'] = link.style.strokeWidth;
      const labelStyle = link.labels?.[0]?.style as Record<string, unknown> | undefined;
      if (labelStyle?.['color']) own['color'] = labelStyle['color'];
      if (labelStyle?.['fontWeight']) own['fontWeight'] = labelStyle['fontWeight'];
      if (labelStyle?.['fontSize']) own['fontSize'] = labelStyle['fontSize'];
      const props = this.formatStyleProperties(own);
      const step = link.pathType === 'orthogonal' ? 'interpolate stepBefore ' : '';
      if (props || step) lines.push(`  linkStyle ${i} ${step}${props}`.trimEnd());
    });

    return lines;
  }

  /** A node that carries the AI-diagram look — typography or the flat box. */
  private hasLookStyle(node: NodeModel): boolean {
    const st = node.style as Record<string, unknown> | undefined;
    if (!st) return false;
    return st['fontWeight'] !== undefined || st['fontSize'] !== undefined || st['fontFamily'] !== undefined || st['shadow'] === false || st['color'] !== undefined;
  }

  /**
   * Tier-2 extension directives (%%grafloria:node status / %%grafloria:edge animation)
   * — Grafloria-only features carried in comments a Mermaid renderer ignores, so
   * the visible body stays valid Mermaid. Always emitted (they are data, not
   * decorative comments gated by includeComments).
   */
  private generateGrafloriaDirectives(diagram: DiagramModel): string[] {
    const lines: string[] = [];
    // How the drawing is arranged, when the author asked for a layout by name.
    const layout = diagram.getMetadata('layout');
    if (typeof layout === 'string' && /^[A-Za-z][\w-]*$/.test(layout)) lines.push(`%%grafloria:layout ${layout}`);
    for (const node of diagram.getNodes()) {
      const status = (node.state as { status?: string } | undefined)?.status;
      if (status && status !== 'idle') {
        lines.push(`%%grafloria:node ${this.sanitizeId(node.id)} status:${status}`);
      }
    }
    for (const link of diagram.getLinks()) {
      const anim = (link.style as { animation?: { type?: string; speed?: string } } | undefined)?.animation;
      if (anim?.type && anim.type !== 'none') {
        let line = `%%grafloria:edge ${link.sourceNodeId} ${link.targetNodeId} animation:${anim.type}`;
        if (anim.speed) line += `,speed:${anim.speed}`;
        lines.push(line);
      }
    }
    // A note beside what it is about — a relation, not a coordinate.
    for (const node of diagram.getNodes()) {
      const near = node.getMetadata('near') as { target?: string; side?: string; gap?: number } | undefined;
      if (near?.target) {
        let line = `%%grafloria:near ${this.sanitizeId(node.id)} ${this.sanitizeId(near.target)} ${near.side ?? 'right'}`;
        if (typeof near.gap === 'number') line += ` ${near.gap}`;
        lines.push(line);
      }
    }
    // Where a zone's caption sits, when not its default corner.
    for (const group of diagram.getGroups()) {
      const placement = (group.getMetadata('frameStyle') as { labelPlacement?: string } | undefined)?.labelPlacement;
      if (placement && placement !== 'top-left') lines.push(`%%grafloria:group ${this.sanitizeId(group.id)} caption:${placement}`);
    }
    // Exact positions — asked for (ExportTextOptions.positions).
    if (this.positions) {
      const n = (v: number) => Math.round(v * 100) / 100;
      for (const node of diagram.getNodes()) {
        lines.push(`%%grafloria:at ${this.sanitizeId(node.id)} ${n(node.position.x)},${n(node.position.y)} ${n(node.size.width)}x${n(node.size.height)}`);
      }
      for (const group of diagram.getGroups()) {
        const b = group.getOuterBounds();
        if (b.width > 0 && b.height > 0) lines.push(`%%grafloria:at ${this.sanitizeId(group.id)} ${n(b.x)},${n(b.y)} ${n(b.width)}x${n(b.height)}`);
      }
    }
    // Anchors along a side, label placement, hand-drawn bends.
    for (const link of diagram.getLinks()) {
      const props: string[] = [];
      const handle = (portId: string | undefined, nodeId: string | undefined) =>
        portId && nodeId && isSideAnchorPort(portId) && portId.startsWith(`${nodeId}__`) ? portId.slice(nodeId.length + 2) : undefined;
      // A layout that anchored this line chose its points and bends; only the
      // side the AUTHOR named (a relation: `from:bottom`) is theirs to keep.
      const byLayout = link.getMetadata('layoutAnchored') === true;
      const sideOf = (end: 'sourceSide' | 'targetSide') => {
        const v = link.getMetadata(end);
        return v === 'top' || v === 'right' || v === 'bottom' || v === 'left' ? v : undefined;
      };
      const from = sideOf('sourceSide') ?? (byLayout ? undefined : handle(link.sourcePortId, link.sourceNodeId));
      const to = sideOf('targetSide') ?? (byLayout ? undefined : handle(link.targetPortId, link.targetNodeId));
      if (from) props.push(`from:${from}`);
      if (to) props.push(`to:${to}`);
      const placement = link.getMetadata('labelPlacement');
      if (placement === 'above' || placement === 'below') props.push(`label:${placement}`);
      if (!byLayout && link.getMetadata('hasManualWaypoints') === true && link.points.length > 2) {
        props.push(`via:${link.points.slice(1, -1).map((p) => `${Math.round(p.x * 100) / 100} ${Math.round(p.y * 100) / 100}`).join(' ')}`);
      }
      if (props.length > 0) lines.push(`%%grafloria:edge ${this.sanitizeId(link.sourceNodeId ?? '')} ${this.sanitizeId(link.targetNodeId ?? '')} ${props.join(', ')}`);
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
    // The look's own words — CSS properties real Mermaid passes through.
    if (style.fontWeight !== undefined && style.fontWeight !== '') props.push(`font-weight:${style.fontWeight}`);
    if (typeof style.fontSize === 'number') props.push(`font-size:${style.fontSize}px`);
    if (style.fontFamily) props.push(`font-family:${style.fontFamily}`);
    if (typeof style.letterSpacing === 'number') props.push(`letter-spacing:${style.letterSpacing}px`);
    if (typeof style.rx === 'number') props.push(`rx:${style.rx}`);
    else if (typeof style.borderRadius === 'number') props.push(`rx:${style.borderRadius}`);
    if (style.shadow === false) props.push('shadow:none');

    return props.join(',');
  }

  /**
   * Get shape brackets for node definition
   */
  private getShapeBrackets(shape: NodeShape): { opening: string; closing: string } {
    const brackets: Record<NodeShape, { opening: string; closing: string }> = {
      // A text note is written `id@{ shape: text, label: "…" }` (see
      // generateNodeDefinition); brackets are only its fallback.
      'text': { opening: '[', closing: ']' },
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
