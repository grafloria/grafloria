import type { DiagramEngine, NodeModel, LinkModel } from '@grafloria/engine';

/**
 * The SEMANTIC layer: what a node/edge/diagram *is* to an assistive technology.
 *
 * These are pure functions over the model. They are called from the renderer
 * while it builds the VNode tree — NOT from a DOM post-pass — so the semantics
 * are part of the tree itself and therefore survive SSR (`renderToStaticSVG`)
 * and headless export unchanged. A screen reader reading a server-rendered SVG
 * gets exactly what it gets in the live canvas.
 *
 * Wave 6 (a11y card 0).
 */

/** Roles we emit. `graphics-*` come from the W3C Graphics ARIA module. */
export const DIAGRAM_ROLE = 'graphics-document';
export const NODE_ROLE = 'graphics-symbol';
export const EDGE_ROLE = 'graphics-symbol';

/**
 * A shape's human roledescription — what the AT says INSTEAD of the raw role.
 * "Decision" is infinitely more useful than "graphics-symbol".
 *
 * Keyed by node `type` (the flowchart/BPMN/ERD vocabulary the engine already
 * uses). Unknown types fall back to a humanised form of the type itself, so a
 * custom node type is never described as a bare "symbol".
 */
const NODE_ROLEDESCRIPTIONS: Record<string, string> = {
  start: 'Start',
  end: 'End',
  terminator: 'Terminator',
  process: 'Process',
  decision: 'Decision',
  input: 'Input',
  output: 'Output',
  inputoutput: 'Input/Output',
  data: 'Data',
  document: 'Document',
  database: 'Database',
  subprocess: 'Subprocess',
  predefined: 'Predefined process',
  manual: 'Manual operation',
  preparation: 'Preparation',
  connector: 'Connector',
  delay: 'Delay',
  display: 'Display',
  merge: 'Merge',
  entity: 'Entity',
  relationship: 'Relationship',
  table: 'Table',
  class: 'Class',
  actor: 'Actor',
  usecase: 'Use case',
  state: 'State',
  event: 'Event',
  gateway: 'Gateway',
  task: 'Task',
  group: 'Group',
  container: 'Container',
  note: 'Note',
  comment: 'Comment',
};

/** Humanise an unknown type: `my_customNode` → "My custom node". */
export function humaniseType(type: string | undefined): string {
  if (!type) return 'Node';
  const spaced = type
    .replace(/[-_]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim()
    .toLowerCase();
  if (!spaced) return 'Node';
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** The `aria-roledescription` for a node — its SHAPE, in human words. */
export function nodeRoleDescription(node: NodeModel): string {
  const type = (node.type || '').toLowerCase();
  return NODE_ROLEDESCRIPTIONS[type] ?? humaniseType(node.type);
}

/** The `aria-roledescription` for an edge. Respects the link's own semantics. */
export function edgeRoleDescription(link: LinkModel): string {
  const kind = (link.data?.['kind'] ?? link.data?.['type']) as string | undefined;
  if (typeof kind === 'string' && kind.trim()) return humaniseType(kind);
  return 'Edge';
}

/** The `aria-roledescription` for the whole canvas. */
export function diagramRoleDescription(diagramType?: string): string {
  if (diagramType && diagramType.trim()) return `${humaniseType(diagramType)} diagram`;
  return 'Diagram';
}

/**
 * A node's human NAME: its label, else its type + a short id.
 * Single source of truth — the renderer's `aria-label`, the keyboard
 * controller's announcements, and the outline text-mirror all call THIS, so a
 * node can never be called two different things by two different surfaces.
 */
export function nodeName(node: NodeModel): string {
  const label = node.getMetadata?.('label');
  if (typeof label === 'string' && label.trim().length > 0) return label.trim();
  const styleLabel = (node as unknown as { label?: unknown }).label;
  if (typeof styleLabel === 'string' && styleLabel.trim().length > 0) return styleLabel.trim();
  return `${node.type || 'node'} ${String(node.id).slice(0, 4)}`;
}

/** A link's own label text, if it carries one. */
export function linkLabelText(link: LinkModel): string | undefined {
  const labels = link.labels;
  if (Array.isArray(labels)) {
    for (const l of labels) {
      const text = (l as unknown as { text?: unknown })?.text;
      if (typeof text === 'string' && text.trim()) return text.trim();
    }
  }
  return undefined;
}

export function sourceNodeIdOf(link: LinkModel, diagram: DiagramLike): string {
  return link.sourceNodeId ?? diagram.getNodeByPortId?.(link.sourcePortId)?.id ?? '';
}

export function targetNodeIdOf(link: LinkModel, diagram: DiagramLike): string {
  return link.targetNodeId ?? diagram.getNodeByPortId?.(link.targetPortId)?.id ?? '';
}

/** The minimum of DiagramModel these pure functions need. */
export interface DiagramLike {
  getNode(id: string): NodeModel | undefined;
  getNodes(): NodeModel[];
  getLink(id: string): LinkModel | undefined;
  getLinks(): LinkModel[];
  getNodeByPortId?(portId: string): NodeModel | undefined;
  getGroups?(): unknown[];
}

/**
 * A node's ACCESSIBLE NAME — what the screen reader reads on focus.
 *
 * "Decision, Is order valid?, 1 incoming, 2 outgoing, selected"
 *
 * The degree counts are the position context an AT user cannot get any other
 * way: sighted users see the edges converging on a shape; a screen-reader user
 * is told.
 */
export function nodeAccessibleName(node: NodeModel, diagram?: DiagramLike): string {
  const bits: string[] = [nodeRoleDescription(node), nodeName(node)];

  if (diagram) {
    const { incoming, outgoing } = degreeOf(node.id, diagram);
    bits.push(`${incoming} incoming`, `${outgoing} outgoing`);
  }

  if (node.isSelected?.()) bits.push('selected');
  if (node.state?.highlighted) bits.push('highlighted');
  if (node.state?.error) bits.push('error');
  if (node.state?.locked) bits.push('locked');
  if (node.state?.enabled === false) bits.push('disabled');

  return bits.join(', ');
}

/**
 * An edge's ACCESSIBLE NAME. THE headline gap this card closes: before wave 6
 * the renderer emitted no ARIA at all on links, so every edge in every diagram
 * was invisible to a screen reader — the graph read as a bag of disconnected
 * shapes, which is precisely the information a diagram exists to convey.
 *
 * "Edge from Start to Is order valid?, labelled yes, selected"
 */
export function edgeAccessibleName(link: LinkModel, diagram: DiagramLike): string {
  const source = diagram.getNode(sourceNodeIdOf(link, diagram));
  const target = diagram.getNode(targetNodeIdOf(link, diagram));

  const bits: string[] = [
    `Edge from ${source ? nodeName(source) : 'unknown'} to ${target ? nodeName(target) : 'unknown'}`,
  ];

  const label = linkLabelText(link);
  if (label) bits.push(`labelled ${label}`);
  if (link.state === 'selected') bits.push('selected');
  if (link.state === 'highlighted') bits.push('highlighted');

  return bits.join(', ');
}

/** Incoming / outgoing degree of a node. Self-loops count on both sides. */
export function degreeOf(
  nodeId: string,
  diagram: DiagramLike
): { incoming: number; outgoing: number } {
  let incoming = 0;
  let outgoing = 0;
  for (const link of diagram.getLinks()) {
    if (targetNodeIdOf(link, diagram) === nodeId) incoming++;
    if (sourceNodeIdOf(link, diagram) === nodeId) outgoing++;
  }
  return { incoming, outgoing };
}

/**
 * The canvas's own accessible name: "Diagram, 12 nodes, 14 edges".
 * Read when focus first enters the canvas, so the user knows the size of what
 * they have landed in before they start walking it.
 */
export function diagramAccessibleName(diagram: DiagramLike, title?: string): string {
  const nodes = diagram.getNodes().length;
  const links = diagram.getLinks().length;
  const head = title && title.trim() ? title.trim() : 'Diagram';
  return `${head}, ${nodes} node${nodes === 1 ? '' : 's'}, ${links} edge${links === 1 ? '' : 's'}`;
}

/** Resolve the diagram off an engine, tolerating a bare DiagramModel. */
export function diagramOf(engine: DiagramEngine | DiagramLike | undefined): DiagramLike | undefined {
  if (!engine) return undefined;
  const asEngine = engine as DiagramEngine;
  if (typeof asEngine.getDiagram === 'function') {
    return asEngine.getDiagram() as unknown as DiagramLike;
  }
  const asDiagram = engine as DiagramLike;
  return typeof asDiagram.getNodes === 'function' ? asDiagram : undefined;
}
