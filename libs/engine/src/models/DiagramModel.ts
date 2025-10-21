// DiagramModel - Root container for all diagram entities

import { DiagramEntity } from './DiagramEntity';
import { NodeModel, SerializedNode } from './NodeModel';
import type { SerializedEntity, Point } from '../types';

export interface SerializedDiagram extends SerializedEntity {
  name: string;
  nodes: SerializedNode[];
  links: any[]; // Will be properly typed when LinkModel is implemented
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
  links: Map<string, any> = new Map(); // Will be LinkModel
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
      links: [], // Will implement when LinkModel is ready
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

    // Restore metadata
    for (const [key, value] of Object.entries(data.metadata)) {
      diagram.metadata.set(key, value);
    }

    return diagram;
  }
}
