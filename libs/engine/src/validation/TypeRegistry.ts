// TypeRegistry - Manages custom node, port, and link types with validation

import type { ValidationResult } from '../types';

export interface NodeTypeDefinition {
  type: string;
  label: string;
  description?: string;
  defaultData?: Record<string, any>;
  allowedPortTypes?: string[];
  minPorts?: number;
  maxPorts?: number;
  validator?: (node: any) => ValidationResult;
}

export interface PortTypeDefinition {
  type: string;
  label: string;
  description?: string;
  direction: 'input' | 'output' | 'bi';
  maxConnections?: number;
  allowedLinkTypes?: string[];
  validator?: (port: any) => ValidationResult;
}

export interface LinkTypeDefinition {
  type: string;
  label: string;
  description?: string;
  allowedSourcePortTypes?: string[];
  allowedTargetPortTypes?: string[];
  validator?: (link: any) => ValidationResult;
}

export class TypeRegistry {
  private nodeTypes: Map<string, NodeTypeDefinition> = new Map();
  private portTypes: Map<string, PortTypeDefinition> = new Map();
  private linkTypes: Map<string, LinkTypeDefinition> = new Map();

  /**
   * Register a node type
   */
  registerNodeType(definition: NodeTypeDefinition): void {
    if (this.nodeTypes.has(definition.type)) {
      throw new Error(`Node type '${definition.type}' is already registered`);
    }

    this.nodeTypes.set(definition.type, definition);
  }

  /**
   * Register a port type
   */
  registerPortType(definition: PortTypeDefinition): void {
    if (this.portTypes.has(definition.type)) {
      throw new Error(`Port type '${definition.type}' is already registered`);
    }

    this.portTypes.set(definition.type, definition);
  }

  /**
   * Register a link type
   */
  registerLinkType(definition: LinkTypeDefinition): void {
    if (this.linkTypes.has(definition.type)) {
      throw new Error(`Link type '${definition.type}' is already registered`);
    }

    this.linkTypes.set(definition.type, definition);
  }

  /**
   * Unregister a node type
   */
  unregisterNodeType(type: string): boolean {
    return this.nodeTypes.delete(type);
  }

  /**
   * Unregister a port type
   */
  unregisterPortType(type: string): boolean {
    return this.portTypes.delete(type);
  }

  /**
   * Unregister a link type
   */
  unregisterLinkType(type: string): boolean {
    return this.linkTypes.delete(type);
  }

  /**
   * Get node type definition
   */
  getNodeType(type: string): NodeTypeDefinition | undefined {
    return this.nodeTypes.get(type);
  }

  /**
   * Get port type definition
   */
  getPortType(type: string): PortTypeDefinition | undefined {
    return this.portTypes.get(type);
  }

  /**
   * Get link type definition
   */
  getLinkType(type: string): LinkTypeDefinition | undefined {
    return this.linkTypes.get(type);
  }

  /**
   * Check if node type exists
   */
  hasNodeType(type: string): boolean {
    return this.nodeTypes.has(type);
  }

  /**
   * Check if port type exists
   */
  hasPortType(type: string): boolean {
    return this.portTypes.has(type);
  }

  /**
   * Check if link type exists
   */
  hasLinkType(type: string): boolean {
    return this.linkTypes.has(type);
  }

  /**
   * List all node types
   */
  listNodeTypes(): NodeTypeDefinition[] {
    return Array.from(this.nodeTypes.values());
  }

  /**
   * List all port types
   */
  listPortTypes(): PortTypeDefinition[] {
    return Array.from(this.portTypes.values());
  }

  /**
   * List all link types
   */
  listLinkTypes(): LinkTypeDefinition[] {
    return Array.from(this.linkTypes.values());
  }

  /**
   * Clear all registered types
   */
  clear(): void {
    this.nodeTypes.clear();
    this.portTypes.clear();
    this.linkTypes.clear();
  }

  /**
   * Get type statistics
   */
  getStats(): {
    nodeTypes: number;
    portTypes: number;
    linkTypes: number;
  } {
    return {
      nodeTypes: this.nodeTypes.size,
      portTypes: this.portTypes.size,
      linkTypes: this.linkTypes.size,
    };
  }
}
