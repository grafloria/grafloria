// DiagramModel - Root container for all diagram entities

import { DiagramEntity } from './DiagramEntity';
import { NodeModel, SerializedNode } from './NodeModel';
import { LinkModel, SerializedLink } from './LinkModel';
import { GroupModel, SerializedGroup } from './GroupModel'; // Phase 1.6c
import type { SerializedEntity, Point } from '../types';

export interface SerializedDiagram extends SerializedEntity {
  name: string;
  nodes: SerializedNode[];
  links: SerializedLink[];
  groups: SerializedGroup[]; // Phase 1.6c
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
  groups: Map<string, GroupModel> = new Map(); // Phase 1.6c

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

    // Set diagram reference (Phase 1.6a)
    node.diagram = this;

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
   * Restore node from serialized data (Phase 1.8)
   */
  restoreNode(data: any): NodeModel | undefined {
    try {
      const node = NodeModel.fromJSON(data);
      node.diagram = this;
      this.nodes.set(node.id, node);
      this.trackChange('nodes', null, node);
      this.emitter.emit('node:added', node);
      return node;
    } catch (error) {
      console.error('Failed to restore node:', error);
      return undefined;
    }
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
   * Restore link from serialized data (Phase 1.8)
   */
  restoreLink(data: any): LinkModel | undefined {
    try {
      const link = LinkModel.fromJSON(data);
      this.links.set(link.id, link);
      this.trackChange('links', null, link);
      this.emitter.emit('link:added', link);
      return link;
    } catch (error) {
      console.error('Failed to restore link:', error);
      return undefined;
    }
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
   * Add group (Phase 1.6c)
   */
  addGroup(group: GroupModel): void {
    if (this.groups.has(group.id)) {
      throw new Error(`Group with id ${group.id} already exists`);
    }

    this.groups.set(group.id, group);
    this.trackChange('groups', null, group);
    this.emitter.emit('group:added', group);
  }

  /**
   * Remove group (Phase 1.6c)
   */
  removeGroup(groupId: string): GroupModel | undefined {
    const group = this.groups.get(groupId);
    if (group) {
      this.groups.delete(groupId);
      this.trackChange('groups', group, null);
      this.emitter.emit('group:removed', group);
    }
    return group;
  }

  /**
   * Restore group from serialized data (Phase 1.8)
   */
  restoreGroup(data: any): GroupModel | undefined {
    try {
      const group = GroupModel.fromJSON(data);
      this.groups.set(group.id, group);
      this.trackChange('groups', null, group);
      this.emitter.emit('group:added', group);
      return group;
    } catch (error) {
      console.error('Failed to restore group:', error);
      return undefined;
    }
  }

  /**
   * Get group by ID (Phase 1.6c)
   */
  getGroup(groupId: string): GroupModel | undefined {
    return this.groups.get(groupId);
  }

  /**
   * Get all groups (Phase 1.6c)
   */
  getGroups(): GroupModel[] {
    return Array.from(this.groups.values());
  }

  /**
   * Clear all groups (Phase 1.6c)
   */
  clearGroups(): void {
    this.groups.clear();
    this.emitter.emit('groups:cleared');
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
   * Clear all nodes, links, and groups (Phase 1.6c)
   */
  clear(): void {
    // Remove all links first
    const linkIds = Array.from(this.links.keys());
    for (const linkId of linkIds) {
      this.removeLink(linkId);
    }

    // Remove all nodes
    const nodeIds = Array.from(this.nodes.keys());
    for (const nodeId of nodeIds) {
      this.removeNode(nodeId);
    }

    // Remove all groups (Phase 1.6c)
    const groupIds = Array.from(this.groups.keys());
    for (const groupId of groupIds) {
      this.removeGroup(groupId);
    }

    this.emitter.emit('diagram:cleared');
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
      groups: Array.from(this.groups.values()).map((g) => g.serialize()), // Phase 1.6c
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

    // Restore groups (Phase 1.6c)
    if (data.groups) {
      for (const groupData of data.groups) {
        const group = GroupModel.fromJSON(groupData);
        diagram.groups.set(group.id, group);
      }
    }

    // Restore metadata
    for (const [key, value] of Object.entries(data.metadata)) {
      diagram.metadata.set(key, value);
    }

    return diagram;
  }
}
