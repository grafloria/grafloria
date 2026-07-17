/**
 * AST Transformer - Converts Abstract Syntax Tree to DiagramModel
 *
 * Takes the parsed AST from the Parser and transforms it into
 * concrete NodeModel and LinkModel instances within a DiagramModel.
 */

import { DiagramModel } from '../../models/DiagramModel';
import { NodeModel } from '../../models/NodeModel';
import { LinkModel } from '../../models/LinkModel';
import { GroupModel } from '../../models/GroupModel';
import {
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
  NodeShape,
  LinkType,
  StyleProperties,
} from '../types/ASTNode';

export interface TransformOptions {
  /**
   * Default node size if not specified
   */
  defaultNodeSize?: { width: number; height: number };

  /**
   * Spacing between auto-positioned nodes
   */
  nodeSpacing?: number;

  /**
   * Starting position for auto-positioned nodes
   */
  startPosition?: { x: number; y: number };

  /**
   * Auto-generate positions (true) or use default position for all (false)
   */
  autoPosition?: boolean;

  /**
   * Name for the generated diagram
   */
  diagramName?: string;
}

export class ASTTransformer {
  private nodePositions: Map<string, { x: number; y: number }> = new Map();
  private nextAutoPosition = { x: 100, y: 100 };
  private nodeSpacing = 150;

  /**
   * Transform AST into DiagramModel
   */
  transform(ast: DiagramNode, options: TransformOptions = {}): DiagramModel {
    // Apply options
    const {
      defaultNodeSize = { width: 120, height: 80 },
      nodeSpacing = 150,
      startPosition = { x: 100, y: 100 },
      autoPosition = true,
      diagramName = 'Generated Diagram',
    } = options;

    this.nodeSpacing = nodeSpacing;
    this.nextAutoPosition = { ...startPosition };

    // Create diagram
    const diagram = new DiagramModel(diagramName);

    // Store diagram type in metadata
    diagram.setMetadata('diagramType', ast.diagramType);
    diagram.setMetadata('direction', ast.direction);

    // Phase 1: structure — nodes, subgraphs→groups, and classDefs (stored so
    // class applications in Phase 3 can resolve regardless of source order).
    for (const statement of ast.statements) {
      this.processStatement(statement, diagram, defaultNodeSize, autoPosition);
    }

    // Phase 2: top-level links (subgraph-internal links are created in
    // createSubgraph, before their group is formed).
    for (const statement of ast.statements) {
      if (statement.type === 'EdgeDefinition') {
        this.createLink(statement as EdgeDefinitionNode, diagram);
      }
    }

    // Phase 3: the extension channel — Tier-1 directives (style/class/linkStyle/
    // click) and Tier-2 %%grafloria: directives. Run last, over the FLATTENED tree,
    // because they reference nodes/links/classDefs that must already exist.
    this.applyDirectives(this.flattenStatements(ast.statements), diagram);

    return diagram;
  }

  /**
   * Process a single statement
   */
  private processStatement(
    statement: StatementNode,
    diagram: DiagramModel,
    defaultNodeSize: { width: number; height: number },
    autoPosition: boolean
  ): void {
    switch (statement.type) {
      case 'NodeDefinition':
        this.createNode(statement as NodeDefinitionNode, diagram, defaultNodeSize, autoPosition);
        break;

      case 'EdgeDefinition':
        // Edges are processed after all nodes are created
        break;

      case 'Subgraph':
        this.createSubgraph(statement as SubgraphNode, diagram, defaultNodeSize, autoPosition);
        break;

      case 'ClassDef':
        // Stored now; class applications resolve against it in Phase 3.
        this.storeClassDef(statement as ClassDefNode, diagram);
        break;

      // Deferred to Phase 3 (need nodes / links / classDefs in place first).
      case 'Style':
      case 'ClassApplication':
      case 'LinkStyle':
      case 'Click':
      case 'GrafloriaDirective':
        break;
    }
  }

  /** Depth-first flatten so directives inside subgraphs are applied too. */
  private flattenStatements(statements: StatementNode[]): StatementNode[] {
    const out: StatementNode[] = [];
    for (const st of statements) {
      out.push(st);
      if (st.type === 'Subgraph') out.push(...this.flattenStatements((st as SubgraphNode).statements));
    }
    return out;
  }

  /**
   * Phase 3 — apply the extension channel. Node-targeting directives first
   * (style/class/click), then link-targeting ones (linkStyle/grafloria:edge) which
   * depend on link order.
   */
  private applyDirectives(statements: StatementNode[], diagram: DiagramModel): void {
    for (const st of statements) {
      if (st.type === 'Style') this.applyStyle(st as StyleNode, diagram);
      else if (st.type === 'ClassApplication') this.applyClass(st as ClassApplicationNode, diagram);
      else if (st.type === 'Click') this.applyClick(st as ClickNode, diagram);
      else if (st.type === 'GrafloriaDirective' && (st as GrafloriaDirectiveNode).target === 'node') {
        this.applyGrafloriaNode(st as GrafloriaDirectiveNode, diagram);
      }
    }
    for (const st of statements) {
      if (st.type === 'LinkStyle') this.applyLinkStyle(st as LinkStyleNode, diagram);
      else if (st.type === 'GrafloriaDirective' && (st as GrafloriaDirectiveNode).target === 'edge') {
        this.applyGrafloriaEdge(st as GrafloriaDirectiveNode, diagram);
      }
    }
  }

  /** `class a,b hot` — resolve the classDef and apply it to each node. */
  private applyClass(node: ClassApplicationNode, diagram: DiagramModel): void {
    const classDefs = (diagram.getMetadata('classDefs') || {}) as Record<string, StyleProperties>;
    const props = classDefs[node.className];
    if (!props) return;
    for (const id of node.ids) {
      const target = diagram.getNode(id);
      if (target) this.applyStyleToNode(target, props);
    }
  }

  /** `linkStyle 0,2 …` — style links by insertion index (or 'default' = all). */
  private applyLinkStyle(node: LinkStyleNode, diagram: DiagramModel): void {
    const links = diagram.getLinks();
    const targets = node.indices === 'default' ? links.map((_, i) => i) : node.indices;
    for (const i of targets) {
      if (links[i]) this.applyStyleToLink(links[i], node.properties);
    }
  }

  /** `click a "url" "tip"` — the node's navigation target (metadata, not a node). */
  private applyClick(node: ClickNode, diagram: DiagramModel): void {
    const target = diagram.getNode(node.id);
    if (!target) return;
    if (node.href) target.setMetadata('href', node.href);
    if (node.tooltip) target.setMetadata('tooltip', node.tooltip);
  }

  /** `%%grafloria:node a status:running` — Grafloria-only node state. */
  private applyGrafloriaNode(node: GrafloriaDirectiveNode, diagram: DiagramModel): void {
    const target = diagram.getNode(node.ids[0]);
    if (!target) return;
    if (node.properties['status']) {
      target.setState({ status: node.properties['status'], animateStatus: true } as never);
    }
  }

  /** `%%grafloria:edge a b animation:flow` — Grafloria-only edge animation. */
  private applyGrafloriaEdge(node: GrafloriaDirectiveNode, diagram: DiagramModel): void {
    const [source, target] = node.ids;
    const link = diagram.getLinks().find((l) => l.sourceNodeId === source && l.targetNodeId === target);
    if (!link) return;
    if (node.properties['animation']) {
      const anim: Record<string, string> = { type: node.properties['animation'] };
      if (node.properties['speed']) anim['speed'] = node.properties['speed'];
      link.updateStyle({ animation: anim } as never);
    }
  }

  /**
   * Create a node from NodeDefinitionNode
   */
  private createNode(
    astNode: NodeDefinitionNode,
    diagram: DiagramModel,
    defaultNodeSize: { width: number; height: number },
    autoPosition: boolean
  ): NodeModel {
    // Check if node already exists
    let node = diagram.getNode(astNode.id);
    if (node) {
      // Update existing node with new information. setLabel writes the CANON
      // (metadata.label — what the renderer and a11y read) and mirrors the
      // legacy data.label slot; see DiagramEntity.setLabel.
      if (astNode.label) {
        node.setLabel(astNode.label);
      }
      return node;
    }

    // Determine position
    let position: { x: number; y: number };
    if (autoPosition) {
      position = this.getNextAutoPosition();
    } else {
      position = { x: 100, y: 100 };
    }

    // Store position for this node ID
    this.nodePositions.set(astNode.id, position);

    // Determine size based on shape
    const size = this.getSizeForShape(astNode.shape, defaultNodeSize);

    // Create node
    node = new NodeModel({
      id: astNode.id,
      type: this.getNodeTypeFromShape(astNode.shape),
      position,
      size,
    });

    // Set label through the canon (metadata.label + legacy mirror) — a parsed
    // node must carry its label where the renderer reads it, or Mermaid-loaded
    // diagrams draw unlabeled and read to screen readers as '<type> node'.
    node.setLabel(astNode.label || astNode.id);

    // Store shape information for DSL
    node.setMetadata('dslShape', astNode.shape);

    // Convert DSL shape to SVG renderer shape config
    const shapeConfig = this.getShapeConfigFromDSLShape(astNode.shape);
    node.setMetadata('shape', shapeConfig);

    // Apply style if provided
    if (astNode.style) {
      this.applyStyleToNode(node, astNode.style);
      // Merge style into shape config
      const updatedShapeConfig: any = { ...shapeConfig };
      if (astNode.style.fill) updatedShapeConfig.fill = astNode.style.fill;
      if (astNode.style.stroke) updatedShapeConfig.stroke = astNode.style.stroke;
      if (astNode.style.strokeWidth !== undefined) updatedShapeConfig.strokeWidth = astNode.style.strokeWidth;
      node.setMetadata('shape', updatedShapeConfig);
    }

    // Add to diagram
    diagram.addNode(node);

    return node;
  }

  /**
   * Create a link from EdgeDefinitionNode
   */
  private createLink(astEdge: EdgeDefinitionNode, diagram: DiagramModel): LinkModel | null {
    // Get or create source node
    let sourceNode = diagram.getNode(astEdge.source);
    if (sourceNode && astEdge.sourceLabel) {
      // Mermaid is last-write-wins: `a[First]` then `a[Second] --> b` leaves
      // the label "Second". An explicit label riding INSIDE an edge line must
      // update an existing node just like a repeated node definition does —
      // a bare reference (`a --> b`, no label) must NOT reset it to the id.
      sourceNode.setLabel(astEdge.sourceLabel);
    }
    if (!sourceNode) {
      // Create implicit node for source using shape/label from edge definition
      const sourceShape = astEdge.sourceShape || 'rectangle';
      const sourceLabel = astEdge.sourceLabel || astEdge.source;
      sourceNode = this.createNode(
        {
          type: 'NodeDefinition',
          id: astEdge.source,
          label: sourceLabel,
          shape: sourceShape,
          location: astEdge.location,
        },
        diagram,
        { width: 120, height: 80 },
        true
      );
    }

    // Get or create target node
    let targetNode = diagram.getNode(astEdge.target);
    if (targetNode && astEdge.targetLabel) {
      // Same last-write-wins rule as the source side above.
      targetNode.setLabel(astEdge.targetLabel);
    }
    if (!targetNode) {
      // Create implicit node for target using shape/label from edge definition
      const targetShape = astEdge.targetShape || 'rectangle';
      const targetLabel = astEdge.targetLabel || astEdge.target;
      targetNode = this.createNode(
        {
          type: 'NodeDefinition',
          id: astEdge.target,
          label: targetLabel,
          shape: targetShape,
          location: astEdge.location,
        },
        diagram,
        { width: 120, height: 80 },
        true
      );
    }

    // Use createSmartLink for automatic port selection
    const pathType = this.getPathTypeFromLinkType(astEdge.linkType);
    const link = diagram.createSmartLink(sourceNode, targetNode, pathType);

    if (!link) {
      console.warn(`Failed to create smart link between ${astEdge.source} and ${astEdge.target}`);
      return null;
    }

    // Set label if provided — canonical write, same reasoning as node labels
    // (svg-renderer reads link.getMetadata('label') for the edge label).
    if (astEdge.label) {
      link.setLabel(astEdge.label);
    }

    // Store link type information
    link.setMetadata('dslLinkType', astEdge.linkType);

    // Apply style if provided
    if (astEdge.style) {
      this.applyStyleToLink(link, astEdge.style);
    }

    // Set line style based on link type
    this.applyLinkTypeStyle(link, astEdge.linkType);

    return link;
  }

  /**
   * Create a subgraph as a real GroupModel whose members are the nodes defined
   * inside it. Mermaid's `subgraph … end` is a container; mapping it to a group
   * is what makes "collapse the subgraph" and drop-to-assign work downstream.
   */
  private createSubgraph(
    astSubgraph: SubgraphNode,
    diagram: DiagramModel,
    defaultNodeSize: { width: number; height: number },
    autoPosition: boolean
  ): void {
    // Nodes (and nested subgraphs) first, so inner edges have endpoints…
    for (const statement of astSubgraph.statements) {
      this.processStatement(statement, diagram, defaultNodeSize, autoPosition);
    }
    // …then the subgraph's OWN edges. The transformer's top-level edge pass
    // only walks `ast.statements`, so without this a `subgraph { a --> b }`
    // drew its nodes but never its wire.
    for (const statement of astSubgraph.statements) {
      if (statement.type === 'EdgeDefinition') {
        this.createLink(statement as EdgeDefinitionNode, diagram);
      }
    }

    // The group and its membership.
    const groupId = astSubgraph.id || `subgraph-${diagram.getGroups().length + 1}`;
    const group = new GroupModel({ id: groupId, name: astSubgraph.label || astSubgraph.id || groupId });
    diagram.addGroup(group);

    const memberIds = new Set<string>();
    this.collectDirectNodeIds(astSubgraph.statements, memberIds);
    for (const id of memberIds) {
      if (diagram.getNode(id)) group.addMember(id, diagram);
    }

    if (astSubgraph.direction) {
      group.setMetadata('direction', astSubgraph.direction);
    }
  }

  /**
   * Node ids defined AT THIS subgraph level (its own node defs + edge
   * endpoints). Nested subgraphs form their own groups, so their nodes are not
   * pulled into the parent's membership.
   */
  private collectDirectNodeIds(statements: StatementNode[], into: Set<string>): void {
    for (const statement of statements) {
      if (statement.type === 'NodeDefinition') {
        into.add((statement as NodeDefinitionNode).id);
      } else if (statement.type === 'EdgeDefinition') {
        into.add((statement as EdgeDefinitionNode).source);
        into.add((statement as EdgeDefinitionNode).target);
      }
    }
  }

  /**
   * Apply style to a node
   */
  private applyStyle(styleNode: StyleNode, diagram: DiagramModel): void {
    const node = diagram.getNode(styleNode.targetId);
    if (!node) {
      console.warn(`Style target node not found: ${styleNode.targetId}`);
      return;
    }

    this.applyStyleToNode(node, styleNode.properties);
  }

  /**
   * Store class definition in diagram metadata
   */
  private storeClassDef(classDefNode: any, diagram: DiagramModel): void {
    const classDefs = diagram.getMetadata('classDefs') || {};
    classDefs[classDefNode.className] = classDefNode.properties;
    diagram.setMetadata('classDefs', classDefs);
  }

  /**
   * Apply style properties to a node
   */
  private applyStyleToNode(node: NodeModel, properties: StyleProperties): void {
    if (properties.fill) {
      node.style.fill = properties.fill;
    }
    if (properties.stroke) {
      node.style.stroke = properties.stroke;
    }
    if (properties.strokeWidth !== undefined) {
      node.style.strokeWidth = properties.strokeWidth;
    }
    if (properties.color) {
      node.style.color = properties.color;
    }
    if (properties.strokeDasharray) {
      node.style.strokeDasharray = properties.strokeDasharray;
    }

    // Paints must ALSO ride the shape-config metadata — that is where the SVG
    // renderer reads fill/stroke for the shape (node.style alone renders
    // nothing). Mirrors the inline-style path in createNode. node.style stays
    // set too, which is what the generator's analyzer detects for round-trip.
    const shapeConfig = { ...(node.getMetadata('shape') as Record<string, unknown> | undefined) };
    if (properties.fill) shapeConfig['fill'] = properties.fill;
    if (properties.stroke) shapeConfig['stroke'] = properties.stroke;
    if (properties.strokeWidth !== undefined) shapeConfig['strokeWidth'] = properties.strokeWidth;
    node.setMetadata('shape', shapeConfig);
    // Mark it so the generator re-emits a `style` line (the analyzer's own
    // hasCustomStyle heuristic wrongly treats fill/stroke as "not custom").
    node.setMetadata('dslStyled', true);
  }

  /**
   * Apply style properties to a link
   */
  private applyStyleToLink(link: LinkModel, properties: StyleProperties): void {
    if (properties.stroke) {
      link.style.stroke = properties.stroke;
    }
    if (properties.strokeWidth !== undefined) {
      link.style.strokeWidth = properties.strokeWidth;
    }
    if (properties.strokeDasharray) {
      link.style.strokeDasharray = properties.strokeDasharray;
    }
  }

  /**
   * Apply link type styling (dashed, thick, etc.)
   */
  private applyLinkTypeStyle(link: LinkModel, linkType: LinkType): void {
    switch (linkType) {
      case 'dotted-line':
      case 'dotted-arrow':
        link.style.strokeDasharray = '5,5';
        break;

      case 'thick-line':
      case 'thick-arrow':
        link.style.strokeWidth = 4;
        break;

      default:
        // Default styling
        break;
    }
  }

  /**
   * Get node type from shape
   */
  private getNodeTypeFromShape(shape: NodeShape): string {
    const shapeToType: Record<NodeShape, string> = {
      'rectangle': 'flowchart:process',
      'rounded-rectangle': 'flowchart:terminator',
      'stadium': 'flowchart:terminator',
      'subroutine': 'flowchart:subprocess',
      'cylindrical': 'flowchart:data',
      'circle': 'flowchart:connector',
      'asymmetric': 'flowchart:document',
      'rhombus': 'flowchart:decision',
      'hexagon': 'flowchart:preparation',
      'trapezoid': 'flowchart:manual-input',
      'trapezoid-alt': 'flowchart:manual-input',
    };

    return shapeToType[shape] || 'flowchart:process';
  }

  /**
   * Convert DSL NodeShape to SVG renderer shape configuration
   * SVG renderer expects shape metadata in format: { type: 'rect' | 'circle' | 'ellipse' | 'diamond' | 'hexagon', cornerRadius?: number }
   */
  private getShapeConfigFromDSLShape(shape: NodeShape): { type: string; cornerRadius?: number } {
    const shapeMapping: Record<NodeShape, { type: string; cornerRadius?: number }> = {
      'rectangle': { type: 'rect' },
      'rounded-rectangle': { type: 'rect', cornerRadius: 10 },
      'stadium': { type: 'ellipse' }, // Stadium is essentially a tall ellipse
      'subroutine': { type: 'rect', cornerRadius: 5 },
      'cylindrical': { type: 'ellipse' }, // Cylinder approximated as ellipse
      'circle': { type: 'circle' },
      'asymmetric': { type: 'rect' }, // Document shape - fallback to rect for now
      'rhombus': { type: 'diamond' },
      'hexagon': { type: 'hexagon' },
      'trapezoid': { type: 'rect' }, // Trapezoid - fallback to rect for now
      'trapezoid-alt': { type: 'rect' }, // Trapezoid alt - fallback to rect for now
    };

    return shapeMapping[shape] || { type: 'rect' };
  }

  /**
   * Get size for shape
   */
  private getSizeForShape(
    shape: NodeShape,
    defaultSize: { width: number; height: number }
  ): { width: number; height: number } {
    // Different shapes may need different default sizes
    switch (shape) {
      case 'circle':
        // Circles should be square
        return { width: 80, height: 80 };

      case 'rhombus':
        // Diamonds are usually wider
        return { width: 140, height: 80 };

      case 'hexagon':
        return { width: 140, height: 80 };

      default:
        return defaultSize;
    }
  }

  /**
   * Get path type from link type
   */
  private getPathTypeFromLinkType(linkType: LinkType): 'direct' | 'orthogonal' | 'smooth' | 'bezier' {
    // For now, use smooth curves for all
    // This can be made more sophisticated later
    return 'smooth';
  }

  /**
   * Get next auto-position for a node
   */
  private getNextAutoPosition(): { x: number; y: number } {
    const position = { ...this.nextAutoPosition };

    // Move to next position (simple horizontal layout for now)
    this.nextAutoPosition.x += this.nodeSpacing;

    // Wrap to next row after 6 nodes
    if (this.nextAutoPosition.x > 1000) {
      this.nextAutoPosition.x = 100;
      this.nextAutoPosition.y += this.nodeSpacing;
    }

    return position;
  }

  /**
   * Reset auto-positioning state
   */
  resetAutoPosition(startPosition: { x: number; y: number }): void {
    this.nextAutoPosition = { ...startPosition };
    this.nodePositions.clear();
  }
}
