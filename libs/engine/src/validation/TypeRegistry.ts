// TypeRegistry - Manages custom node, port, and link types with validation

import type { ValidationResult, NodeBehavior, NodeStyle, Size } from '../types';

export interface NodeTypeDefinition {
  type: string;
  label?: string;
  description?: string;
  defaultData?: Record<string, any>;
  allowedPortTypes?: string[];
  minPorts?: number;
  maxPorts?: number;
  validator?: (node: any) => ValidationResult;
  // Phase 2: Type System Enhancements
  extends?: string;
  category?: string;
  family?: string;
  tags?: string[];
  defaultBehavior?: Partial<NodeBehavior>;
  defaultStyle?: Partial<NodeStyle>;
  defaultSize?: Partial<Size>;
  // Phase 2: Hierarchy Validation
  allowedChildTypes?: string[]; // Allowed child node types
  allowedParentTypes?: string[]; // Allowed parent node types
  maxChildren?: number; // Maximum number of children
  maxDepth?: number; // Maximum depth from root
  canBeRoot?: boolean; // Can be a root node (no parent)
  // Phase 2: Template System Integration
  templateId?: string; // Reference to NodeTemplate
  defaultPortRendering?: any; // Default port rendering configuration
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

// Phase 2: Group Validation
export interface GroupTypeDefinition {
  type: string;
  label: string;
  description?: string;
  allowedMemberTypes?: string[]; // Allowed node types in this group
  allowedLinkTypes?: string[]; // Allowed link types within group
  minMembers?: number; // Minimum number of members
  maxMembers?: number; // Maximum number of members
  canNest?: boolean; // Can contain other groups
  allowedLayoutTypes?: ('flexbox' | 'grid')[]; // Phase 3: Allowed layout types for this group
  requireLayout?: boolean; // Phase 3: Whether this group must have a layout configured
  validator?: (group: any) => ValidationResult;
}

export class TypeRegistry {
  private nodeTypes: Map<string, NodeTypeDefinition> = new Map();
  private portTypes: Map<string, PortTypeDefinition> = new Map();
  private linkTypes: Map<string, LinkTypeDefinition> = new Map();
  private groupTypes: Map<string, GroupTypeDefinition> = new Map(); // Phase 2

  /**
   * Register a node type
   */
  registerNodeType(definition: NodeTypeDefinition): void {
    // Phase 2: Validate parent type exists and check circular inheritance FIRST
    if (definition.extends) {
      if (!this.nodeTypes.has(definition.extends)) {
        throw new Error(`Parent type '${definition.extends}' not found`);
      }

      // Detect circular inheritance (check before duplicate check)
      this.detectCircularInheritance(definition.type, definition.extends);
    }

    if (this.nodeTypes.has(definition.type)) {
      throw new Error(`Node type '${definition.type}' is already registered`);
    }

    this.nodeTypes.set(definition.type, definition);
  }

  /**
   * Detect circular inheritance in type chain
   */
  private detectCircularInheritance(childType: string, parentType: string): void {
    // Check if parent's inheritance chain leads back to child
    const visited = new Set<string>();
    let current: string | undefined = parentType;

    while (current) {
      if (current === childType) {
        throw new Error('Circular inheritance detected');
      }
      if (visited.has(current)) {
        // Already checked this path, no cycle involving childType
        break;
      }
      visited.add(current);

      const parentDef = this.nodeTypes.get(current);
      if (!parentDef || !parentDef.extends) {
        break;
      }
      current = parentDef.extends;
    }
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
   * Register a group type (Phase 2)
   */
  registerGroupType(definition: GroupTypeDefinition): void {
    if (this.groupTypes.has(definition.type)) {
      throw new Error(`Group type '${definition.type}' is already registered`);
    }

    this.groupTypes.set(definition.type, definition);
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
   * Unregister a group type (Phase 2)
   */
  unregisterGroupType(type: string): boolean {
    return this.groupTypes.delete(type);
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
   * Get group type definition (Phase 2)
   */
  getGroupType(type: string): GroupTypeDefinition | undefined {
    return this.groupTypes.get(type);
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
   * Check if group type exists (Phase 2)
   */
  hasGroupType(type: string): boolean {
    return this.groupTypes.has(type);
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
   * List all group types (Phase 2)
   */
  listGroupTypes(): GroupTypeDefinition[] {
    return Array.from(this.groupTypes.values());
  }

  /**
   * Clear all registered types
   */
  clear(): void {
    this.nodeTypes.clear();
    this.portTypes.clear();
    this.linkTypes.clear();
    this.groupTypes.clear(); // Phase 2
  }

  /**
   * Get type statistics
   */
  getStats(): {
    nodeTypes: number;
    portTypes: number;
    linkTypes: number;
    groupTypes: number; // Phase 2
  } {
    return {
      nodeTypes: this.nodeTypes.size,
      portTypes: this.portTypes.size,
      linkTypes: this.linkTypes.size,
      groupTypes: this.groupTypes.size, // Phase 2
    };
  }

  // ========================================
  // Phase 2: Type System Enhancements
  // ========================================

  /**
   * Resolve a node type with all inherited properties
   */
  resolveNodeType(type: string): NodeTypeDefinition {
    const typeDef = this.nodeTypes.get(type);
    if (!typeDef) {
      throw new Error(`Node type '${type}' not found`);
    }

    // If no inheritance, return as-is
    if (!typeDef.extends) {
      return { ...typeDef };
    }

    // Walk up the inheritance chain and merge properties
    const chain: NodeTypeDefinition[] = [];
    let current: string | undefined = type;

    while (current) {
      const def = this.nodeTypes.get(current);
      if (!def) break;
      chain.push(def);
      current = def.extends;
    }

    // Merge from parent to child (child overrides parent)
    const resolved: NodeTypeDefinition = { type };

    for (let i = chain.length - 1; i >= 0; i--) {
      const def = chain[i];

      // Simple property merging
      if (def.label !== undefined) resolved.label = def.label;
      if (def.description !== undefined) resolved.description = def.description;
      if (def.minPorts !== undefined) resolved.minPorts = def.minPorts;
      if (def.maxPorts !== undefined) resolved.maxPorts = def.maxPorts;
      if (def.category !== undefined) resolved.category = def.category;
      if (def.family !== undefined) resolved.family = def.family;
      if (def.validator !== undefined) resolved.validator = def.validator;
      // Phase 2: Template system properties
      if (def.templateId !== undefined) resolved.templateId = def.templateId;

      // Array merging (tags)
      if (def.tags !== undefined) {
        resolved.tags = [...def.tags];
      }

      // Array merging (allowedPortTypes)
      if (def.allowedPortTypes !== undefined) {
        resolved.allowedPortTypes = [...def.allowedPortTypes];
      }

      // Object merging (defaultData)
      if (def.defaultData !== undefined) {
        resolved.defaultData = {
          ...resolved.defaultData,
          ...def.defaultData,
        };
      }

      // Object merging (defaultBehavior)
      if (def.defaultBehavior !== undefined) {
        resolved.defaultBehavior = {
          ...resolved.defaultBehavior,
          ...def.defaultBehavior,
        };
      }

      // Object merging (defaultStyle)
      if (def.defaultStyle !== undefined) {
        resolved.defaultStyle = {
          ...resolved.defaultStyle,
          ...def.defaultStyle,
        };
      }

      // Object merging (defaultSize)
      if (def.defaultSize !== undefined) {
        resolved.defaultSize = {
          ...resolved.defaultSize,
          ...def.defaultSize,
        };
      }

      // Object merging (defaultPortRendering) - Phase 2
      if (def.defaultPortRendering !== undefined) {
        resolved.defaultPortRendering = {
          ...resolved.defaultPortRendering,
          ...def.defaultPortRendering,
        };
      }
    }

    return resolved;
  }

  /**
   * Get all node types in a category
   */
  getNodeTypesByCategory(category: string): NodeTypeDefinition[] {
    return Array.from(this.nodeTypes.values()).filter(
      (def) => {
        // Check direct category or resolve inherited category
        if (def.category === category) return true;
        if (def.extends) {
          try {
            const resolved = this.resolveNodeType(def.type);
            return resolved.category === category;
          } catch {
            return false;
          }
        }
        return false;
      }
    );
  }

  /**
   * Get all node types in a family
   */
  getNodeTypesByFamily(family: string): NodeTypeDefinition[] {
    return Array.from(this.nodeTypes.values()).filter(
      (def) => {
        // Check direct family or resolve inherited family
        if (def.family === family) return true;
        if (def.extends) {
          try {
            const resolved = this.resolveNodeType(def.type);
            return resolved.family === family;
          } catch {
            return false;
          }
        }
        return false;
      }
    );
  }

  /**
   * Get all node types with a specific tag
   */
  getNodeTypesByTag(tag: string): NodeTypeDefinition[] {
    return Array.from(this.nodeTypes.values()).filter(
      (def) => {
        // Check direct tags or resolve inherited tags
        if (def.tags?.includes(tag)) return true;
        if (def.extends) {
          try {
            const resolved = this.resolveNodeType(def.type);
            return resolved.tags?.includes(tag) ?? false;
          } catch {
            return false;
          }
        }
        return false;
      }
    );
  }

  /**
   * Get all node types using a specific template (Phase 2)
   * Includes types that inherit template ID from parent
   */
  getNodeTypesByTemplate(templateId: string): NodeTypeDefinition[] {
    return Array.from(this.nodeTypes.values()).filter(
      (def) => {
        // Check direct template ID
        if (def.templateId === templateId) return true;
        // Check inherited template ID
        if (def.extends) {
          try {
            const resolved = this.resolveNodeType(def.type);
            return resolved.templateId === templateId;
          } catch {
            return false;
          }
        }
        return false;
      }
    );
  }
}
