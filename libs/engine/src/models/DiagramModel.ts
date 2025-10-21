// DiagramModel - Root container for all diagram entities

import { DiagramEntity } from './DiagramEntity';
import { NodeModel, SerializedNode } from './NodeModel';
import { LinkModel, SerializedLink } from './LinkModel';
import type { SerializedEntity, Point } from '../types';

export interface SerializedDiagram extends SerializedEntity {
  name: string;
  nodes: SerializedNode[];
  links: SerializedLink[];
  groups: any[];
  viewport: {
    x: number;
    y: number;
    zoom: number;
  };
}

export class DiagramModel extends DiagramEntity {
  name: string = 'Untitled Diagram';
  nodes: Map<string, NodeModel> = new Map();
  links: Map<string, LinkModel> = new Map();
  groups: Map<string, any> = new Map(); // Will be GroupModel

  viewport = {
    x: 0,
    y: 0,
    zoom: 1,
  };

  constructor(name?: string) {
    super();
    if (name) this.name = name;
  }

  /**
   * Add node to diagram
   */
  addNode(node: NodeModel): void {
    if (this.nodes.has(node.id)) {
      throw new Error(`Node with id ${node.id} already exists`);
    }

    this.nodes.set(node.id, node);
    this.trackChange('nodes', null, node);
    this.emitter.emit('node:added', node);
  }

  /**
   * Remove node from diagram
   */
  removeNode(nodeId: string): NodeModel | undefined {
    const node = this.nodes.get(nodeId);
    if (node) {
      this.nodes.delete(nodeId);
      this.trackChange('nodes', node, null);
      this.emitter.emit('node:removed', node);
    }
    return node;
  }

  /**
   * Get node by ID
   */
  getNode(nodeId: string): NodeModel | undefined {
    return this.nodes.get(nodeId);
  }

  /**
   * Get all nodes
   */
  getNodes(): NodeModel[] {
    return Array.from(this.nodes.values());
  }

  /**
   * Clear all nodes
   */
  clearNodes(): void {
    this.nodes.clear();
    this.emitter.emit('nodes:cleared');
  }

  /**
   * Add link to diagram
   */
  addLink(link: LinkModel): void {
    if (this.links.has(link.id)) {
      throw new Error(`Link with id ${link.id} already exists`);
    }

    this.links.set(link.id, link);
    this.trackChange('links', null, link);
    this.emitter.emit('link:added', link);
  }

  /**
   * Remove link from diagram
   */
  removeLink(linkId: string): LinkModel | undefined {
    const link = this.links.get(linkId);
    if (link) {
      this.links.delete(linkId);
      this.trackChange('links', link, null);
      this.emitter.emit('link:removed', link);
    }
    return link;
  }

  /**
   * Get link by ID
   */
  getLink(linkId: string): LinkModel | undefined {
    return this.links.get(linkId);
  }

  /**
   * Get all links
   */
  getLinks(): LinkModel[] {
    return Array.from(this.links.values());
  }

  /**
   * Clear all links
   */
  clearLinks(): void {
    this.links.clear();
    this.emitter.emit('links:cleared');
  }

  /**
   * Set viewport
   */
  setViewport(x: number, y: number, zoom: number): void {
    const oldViewport = { ...this.viewport };
    this.viewport = { x, y, zoom };
    this.trackChange('viewport', oldViewport, this.viewport);
    this.emitter.emit('viewport:changed', this.viewport);
  }

  /**
   * Pan viewport
   */
  pan(dx: number, dy: number): void {
    this.setViewport(this.viewport.x + dx, this.viewport.y + dy, this.viewport.zoom);
  }

  /**
   * Zoom viewport
   */
  zoom(delta: number, center?: Point): void {
    const newZoom = Math.max(0.1, Math.min(10, this.viewport.zoom + delta));
    this.setViewport(this.viewport.x, this.viewport.y, newZoom);
  }

  /**
   * Serialize to JSON
   */
  serialize(): SerializedDiagram {
    return {
      id: this.id,
      uuid: this.uuid,
      type: 'diagram',
      version: this.version,
      metadata: Object.fromEntries(this.metadata),
      name: this.name,
      nodes: Array.from(this.nodes.values()).map((n) => n.serialize()),
      links: Array.from(this.links.values()).map((l) => l.serialize()),
      groups: [],
      viewport: { ...this.viewport },
    };
  }

  /**
   * Deserialize from JSON
   */
  static fromJSON(data: SerializedDiagram): DiagramModel {
    const diagram = new DiagramModel(data.name);

    diagram.viewport = data.viewport;

    // Restore nodes
    for (const nodeData of data.nodes) {
      const node = NodeModel.fromJSON(nodeData);
      diagram.nodes.set(node.id, node);
    }

    // Restore links
    for (const linkData of data.links) {
      const link = LinkModel.fromJSON(linkData);
      diagram.links.set(link.id, link);
    }

    // Restore metadata
    for (const [key, value] of Object.entries(data.metadata)) {
      diagram.metadata.set(key, value);
    }

    return diagram;
  }
}
