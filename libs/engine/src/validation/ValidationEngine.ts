// ValidationEngine - Validates diagrams, nodes, ports, and links

import { TypeRegistry } from './TypeRegistry';
import { EventBus } from '../events/EventBus'; // Phase 1 - Critical Fixes
import { DiagramEventTypes } from '../types/event.types'; // Phase 1 - Critical Fixes
import type {
  ValidationResult,
  ValidationError,
  ValidationWarning,
} from '../types';
import type { DiagramModel } from '../models/DiagramModel';
import type { NodeModel } from '../models/NodeModel';
import type { PortModel } from '../models/PortModel';
import type { LinkModel } from '../models/LinkModel';
import type { GroupModel } from '../models/GroupModel'; // Phase 2

// Re-export ValidationResult for convenience
export type { ValidationResult, ValidationError, ValidationWarning } from '../types';

export interface ValidationOptions {
  validateTypes?: boolean;
  validateConnections?: boolean;
  validatePorts?: boolean;
  strict?: boolean;
}

export type ValidationRule<T = any> = (entity: T) => ValidationResult;

export class ValidationEngine {
  private typeRegistry: TypeRegistry;
  private customRules: Map<string, ValidationRule[]> = new Map();
  private realTimeValidation: boolean = false;
  private eventBus?: EventBus; // Phase 1 - Critical Fixes

  constructor(typeRegistry: TypeRegistry, eventBus?: EventBus) {
    this.typeRegistry = typeRegistry;
    this.eventBus = eventBus; // Phase 1 - Critical Fixes
  }

  /**
   * Enable real-time validation
   */
  enableRealTimeValidation(): void {
    this.realTimeValidation = true;
  }

  /**
   * Disable real-time validation
   */
  disableRealTimeValidation(): void {
    this.realTimeValidation = false;
  }

  /**
   * Check if real-time validation is enabled (Phase 1 - Critical Fixes)
   */
  isRealTimeValidationEnabled(): boolean {
    return this.realTimeValidation;
  }

  /**
   * Validate entire diagram
   */
  validateDiagram(
    diagram: DiagramModel,
    options: ValidationOptions = {}
  ): ValidationResult {
    // Emit validation started event (Phase 1 - Critical Fixes)
    this.eventBus?.emit(DiagramEventTypes.VALIDATION_STARTED, {
      type: 'diagram',
      timestamp: Date.now()
    });

    const opts = {
      validateTypes: true,
      validateConnections: true,
      validatePorts: true,
      strict: false,
      ...options,
    };

    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Validate all nodes
    for (const node of diagram.getNodes()) {
      const result = this.validateNode(node, opts);
      errors.push(...result.errors);
      warnings.push(...result.warnings);
    }

    // Validate all links
    for (const link of diagram.getLinks()) {
      const result = this.validateLink(link, diagram, opts);
      errors.push(...result.errors);
      warnings.push(...result.warnings);
    }

    // Phase 2: Validate hierarchy for all nodes
    for (const node of diagram.getNodes()) {
      const result = this.validateHierarchy(node, diagram, opts);
      errors.push(...result.errors);
      warnings.push(...result.warnings);
    }

    // Phase 2: Validate all groups
    for (const group of diagram.getGroups()) {
      const result = this.validateGroup(group, diagram, opts);
      errors.push(...result.errors);
      warnings.push(...result.warnings);
    }

    // Custom diagram-level rules
    const customRules = this.customRules.get('diagram') || [];
    for (const rule of customRules) {
      const result = rule(diagram);
      errors.push(...result.errors);
      warnings.push(...result.warnings);
    }

    const result: ValidationResult = {
      valid: errors.length === 0,
      errors,
      warnings,
    };

    // Emit validation events (Phase 1 - Critical Fixes)
    if (result.valid) {
      this.eventBus?.emit(DiagramEventTypes.VALIDATION_COMPLETED, {
        type: 'diagram',
        result,
        timestamp: Date.now()
      });
    } else {
      this.eventBus?.emit(DiagramEventTypes.VALIDATION_FAILED, {
        type: 'diagram',
        result,
        timestamp: Date.now()
      });
    }

    // Emit individual error/warning events
    errors.forEach(error => {
      this.eventBus?.emit(DiagramEventTypes.VALIDATION_ERROR, error);
    });
    warnings.forEach(warning => {
      this.eventBus?.emit(DiagramEventTypes.VALIDATION_WARNING, warning);
    });

    return result;
  }

  /**
   * Validate a node
   */
  validateNode(
    node: NodeModel,
    options: ValidationOptions = {}
  ): ValidationResult {
    // Emit validation started event (Phase 1 - Critical Fixes)
    this.eventBus?.emit(DiagramEventTypes.VALIDATION_STARTED, {
      type: 'node',
      entityId: node.id,
      timestamp: Date.now()
    });

    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Validate node type if enabled
    if (options.validateTypes !== false) {
      const typeDef = this.typeRegistry.getNodeType(node.type);

      if (!typeDef) {
        if (options.strict) {
          errors.push({
            path: `node.${node.id}`,
            message: `Unknown node type: ${node.type}`,
            code: 'UNKNOWN_NODE_TYPE',
            severity: 'error',
          });
        } else {
          warnings.push({
            path: `node.${node.id}`,
            message: `Node type '${node.type}' is not registered`,
            code: 'UNREGISTERED_NODE_TYPE',
            severity: 'warning',
          });
        }
      } else {
        // Validate port count
        const portCount = node.getPorts().length;

        if (typeDef.minPorts !== undefined && portCount < typeDef.minPorts) {
          errors.push({
            path: `node.${node.id}`,
            message: `Node requires at least ${typeDef.minPorts} ports, has ${portCount}`,
            code: 'INSUFFICIENT_PORTS',
            severity: 'error',
          });
        }

        if (typeDef.maxPorts !== undefined && portCount > typeDef.maxPorts) {
          errors.push({
            path: `node.${node.id}`,
            message: `Node allows at most ${typeDef.maxPorts} ports, has ${portCount}`,
            code: 'EXCESSIVE_PORTS',
            severity: 'error',
          });
        }

        // Custom type validator
        if (typeDef.validator) {
          const result = typeDef.validator(node);
          errors.push(...result.errors);
          warnings.push(...result.warnings);
        }
      }
    }

    // Validate ports if enabled
    if (options.validatePorts !== false) {
      for (const port of node.getPorts()) {
        const result = this.validatePort(port, node, options);
        errors.push(...result.errors);
        warnings.push(...result.warnings);
      }
    }

    // Custom node-level rules
    const customRules = this.customRules.get('node') || [];
    for (const rule of customRules) {
      const result = rule(node);
      errors.push(...result.errors);
      warnings.push(...result.warnings);
    }

    const result: ValidationResult = {
      valid: errors.length === 0,
      errors,
      warnings,
    };

    // Emit validation events (Phase 1 - Critical Fixes)
    if (result.valid) {
      this.eventBus?.emit(DiagramEventTypes.VALIDATION_COMPLETED, {
        type: 'node',
        entityId: node.id,
        result,
        timestamp: Date.now()
      });
    } else {
      this.eventBus?.emit(DiagramEventTypes.VALIDATION_FAILED, {
        type: 'node',
        entityId: node.id,
        result,
        timestamp: Date.now()
      });
    }

    return result;
  }

  /**
   * Validate a port
   */
  validatePort(
    port: PortModel,
    node: NodeModel,
    options: ValidationOptions = {}
  ): ValidationResult {
    // Emit validation started event (Phase 1 - Critical Fixes)
    this.eventBus?.emit(DiagramEventTypes.VALIDATION_STARTED, {
      type: 'port',
      entityId: port.id,
      timestamp: Date.now()
    });

    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Validate port type if enabled
    if (options.validateTypes !== false) {
      const typeDef = this.typeRegistry.getPortType(port.systemType || 'default');

      if (!typeDef && port.systemType) {
        if (options.strict) {
          errors.push({
            path: `node.${node.id}.port.${port.id}`,
            message: `Unknown port type: ${port.systemType}`,
            code: 'UNKNOWN_PORT_TYPE',
            severity: 'error',
          });
        } else {
          warnings.push({
            path: `node.${node.id}.port.${port.id}`,
            message: `Port type '${port.systemType}' is not registered`,
            code: 'UNREGISTERED_PORT_TYPE',
            severity: 'warning',
          });
        }
      } else if (typeDef) {
        // Validate connection count
        const connectionCount = port.getConnectionCount();

        if (
          typeDef.maxConnections !== undefined &&
          connectionCount > typeDef.maxConnections
        ) {
          errors.push({
            path: `node.${node.id}.port.${port.id}`,
            message: `Port allows at most ${typeDef.maxConnections} connections, has ${connectionCount}`,
            code: 'EXCESSIVE_CONNECTIONS',
            severity: 'error',
          });
        }

        // Custom type validator
        if (typeDef.validator) {
          const result = typeDef.validator(port);
          errors.push(...result.errors);
          warnings.push(...result.warnings);
        }
      }
    }

    // Custom port-level rules
    const customRules = this.customRules.get('port') || [];
    for (const rule of customRules) {
      const result = rule(port);
      errors.push(...result.errors);
      warnings.push(...result.warnings);
    }

    const result: ValidationResult = {
      valid: errors.length === 0,
      errors,
      warnings,
    };

    // Emit validation events (Phase 1 - Critical Fixes)
    if (result.valid) {
      this.eventBus?.emit(DiagramEventTypes.VALIDATION_COMPLETED, {
        type: 'port',
        entityId: port.id,
        result,
        timestamp: Date.now()
      });
    } else {
      this.eventBus?.emit(DiagramEventTypes.VALIDATION_FAILED, {
        type: 'port',
        entityId: port.id,
        result,
        timestamp: Date.now()
      });
    }

    return result;
  }

  /**
   * Validate a link
   */
  validateLink(
    link: LinkModel,
    diagram: DiagramModel,
    options: ValidationOptions = {}
  ): ValidationResult {
    // Emit validation started event (Phase 1 - Critical Fixes)
    this.eventBus?.emit(DiagramEventTypes.VALIDATION_STARTED, {
      type: 'link',
      entityId: link.id,
      timestamp: Date.now()
    });

    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Validate connections if enabled
    if (options.validateConnections !== false) {
      // Check if source and target nodes exist
      const sourceNode = diagram
        .getNodes()
        .find((n) => n.getPorts().some((p) => p.id === link.sourcePortId));
      const targetNode = diagram
        .getNodes()
        .find((n) => n.getPorts().some((p) => p.id === link.targetPortId));

      if (!sourceNode) {
        errors.push({
          path: `link.${link.id}`,
          message: `Source port ${link.sourcePortId} not found`,
          code: 'SOURCE_PORT_NOT_FOUND',
          severity: 'error',
        });
      }

      if (!targetNode) {
        errors.push({
          path: `link.${link.id}`,
          message: `Target port ${link.targetPortId} not found`,
          code: 'TARGET_PORT_NOT_FOUND',
          severity: 'error',
        });
      }

      // Validate port types if both ports exist
      if (sourceNode && targetNode) {
        const sourcePort = sourceNode
          .getPorts()
          .find((p) => p.id === link.sourcePortId);
        const targetPort = targetNode
          .getPorts()
          .find((p) => p.id === link.targetPortId);

        if (sourcePort && targetPort) {
          // Check port directions
          if (sourcePort.type === 'input' && targetPort.type === 'input') {
            errors.push({
              path: `link.${link.id}`,
              message: 'Cannot connect two input ports',
              code: 'INVALID_PORT_CONNECTION',
              severity: 'error',
            });
          }

          if (sourcePort.type === 'output' && targetPort.type === 'output') {
            errors.push({
              path: `link.${link.id}`,
              message: 'Cannot connect two output ports',
              code: 'INVALID_PORT_CONNECTION',
              severity: 'error',
            });
          }

          // Validate against port type definitions
          const sourceTypeDef = this.typeRegistry.getPortType(
            sourcePort.systemType || 'default'
          );
          const targetTypeDef = this.typeRegistry.getPortType(
            targetPort.systemType || 'default'
          );

          if (sourceTypeDef && sourceTypeDef.allowedLinkTypes) {
            const linkType = (link as any).type || 'default';
            if (!sourceTypeDef.allowedLinkTypes.includes(linkType)) {
              errors.push({
                path: `link.${link.id}`,
                message: `Source port does not allow link type '${linkType}'`,
                code: 'LINK_TYPE_NOT_ALLOWED',
                severity: 'error',
              });
            }
          }

          if (targetTypeDef && targetTypeDef.allowedLinkTypes) {
            const linkType = (link as any).type || 'default';
            if (!targetTypeDef.allowedLinkTypes.includes(linkType)) {
              errors.push({
                path: `link.${link.id}`,
                message: `Target port does not allow link type '${linkType}'`,
                code: 'LINK_TYPE_NOT_ALLOWED',
                severity: 'error',
              });
            }
          }
        }
      }
    }

    // Custom link type validator (Phase 1 - Critical Fixes)
    const linkType = (link as any).systemType || (link as any).type;
    if (linkType) {
      const linkTypeDef = this.typeRegistry.getLinkType(linkType);
      if (linkTypeDef && linkTypeDef.validator) {
        const customResult = linkTypeDef.validator(link);
        errors.push(...customResult.errors);
        warnings.push(...customResult.warnings);
      }
    }

    // Custom link-level rules
    const customRules = this.customRules.get('link') || [];
    for (const rule of customRules) {
      const result = rule(link);
      errors.push(...result.errors);
      warnings.push(...result.warnings);
    }

    const result: ValidationResult = {
      valid: errors.length === 0,
      errors,
      warnings,
    };

    // Emit validation events (Phase 1 - Critical Fixes)
    if (result.valid) {
      this.eventBus?.emit(DiagramEventTypes.VALIDATION_COMPLETED, {
        type: 'link',
        entityId: link.id,
        result,
        timestamp: Date.now()
      });
    } else {
      this.eventBus?.emit(DiagramEventTypes.VALIDATION_FAILED, {
        type: 'link',
        entityId: link.id,
        result,
        timestamp: Date.now()
      });
    }

    return result;
  }

  /**
   * Validate node hierarchy (Phase 2 - Hierarchy-aware validation)
   */
  validateHierarchy(
    node: NodeModel,
    diagram: DiagramModel,
    options: ValidationOptions = {}
  ): ValidationResult {
    // Emit validation started event
    this.eventBus?.emit(DiagramEventTypes.VALIDATION_STARTED, {
      type: 'hierarchy',
      entityId: node.id,
      timestamp: Date.now()
    });

    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Get node type definition with resolved inheritance
    const typeDef = this.typeRegistry.getNodeType(node.type);
    if (!typeDef) {
      // Skip hierarchy validation if type not registered
      return { valid: true, errors: [], warnings: [] };
    }

    // Resolve type definition with inheritance
    const resolved = this.typeRegistry.resolveNodeType(node.type);

    // 1. Validate canBeRoot constraint
    if (!node.parentId && resolved.canBeRoot === false) {
      errors.push({
        path: `node.${node.id}.hierarchy`,
        message: `Node type '${node.type}' cannot be a root node (requires parent)`,
        code: 'INVALID_ROOT_NODE',
        severity: 'error',
      });
    }

    // 2. Validate parent type constraints
    if (node.parentId) {
      const parent = diagram.getNode(node.parentId);
      if (parent) {
        // Check if parent type is allowed
        if (resolved.allowedParentTypes && resolved.allowedParentTypes.length > 0) {
          if (!resolved.allowedParentTypes.includes(parent.type)) {
            errors.push({
              path: `node.${node.id}.hierarchy`,
              message: `Node type '${node.type}' cannot have parent of type '${parent.type}'. Allowed: ${resolved.allowedParentTypes.join(', ')}`,
              code: 'INVALID_PARENT_TYPE',
              severity: 'error',
            });
          }
        }

        // Check if parent allows this child type
        const parentResolved = this.typeRegistry.resolveNodeType(parent.type);
        if (parentResolved.allowedChildTypes && parentResolved.allowedChildTypes.length > 0) {
          if (!parentResolved.allowedChildTypes.includes(node.type)) {
            errors.push({
              path: `node.${node.id}.hierarchy`,
              message: `Parent node type '${parent.type}' does not allow child of type '${node.type}'. Allowed: ${parentResolved.allowedChildTypes.join(', ')}`,
              code: 'INVALID_CHILD_TYPE',
              severity: 'error',
            });
          }
        }
      } else {
        errors.push({
          path: `node.${node.id}.hierarchy`,
          message: `Parent node '${node.parentId}' not found`,
          code: 'PARENT_NOT_FOUND',
          severity: 'error',
        });
      }
    }

    // 3. Validate maxChildren constraint
    if (resolved.maxChildren !== undefined) {
      const childCount = node.children.size;
      if (childCount > resolved.maxChildren) {
        errors.push({
          path: `node.${node.id}.hierarchy`,
          message: `Node type '${node.type}' allows at most ${resolved.maxChildren} children, has ${childCount}`,
          code: 'EXCESSIVE_CHILDREN',
          severity: 'error',
        });
      }
    }

    // 4. Validate maxDepth constraint
    if (resolved.maxDepth !== undefined) {
      const actualDepth = node.depth;
      if (actualDepth > resolved.maxDepth) {
        errors.push({
          path: `node.${node.id}.hierarchy`,
          message: `Node type '${node.type}' allows maximum depth of ${resolved.maxDepth}, actual depth is ${actualDepth}`,
          code: 'EXCESSIVE_DEPTH',
          severity: 'error',
        });
      }
    }

    // 5. Validate child types
    if (resolved.allowedChildTypes && resolved.allowedChildTypes.length > 0) {
      for (const childId of node.children) {
        const child = diagram.getNode(childId);
        if (child) {
          if (!resolved.allowedChildTypes.includes(child.type)) {
            errors.push({
              path: `node.${node.id}.hierarchy`,
              message: `Node type '${node.type}' does not allow child of type '${child.type}'. Allowed: ${resolved.allowedChildTypes.join(', ')}`,
              code: 'INVALID_CHILD_TYPE',
              severity: 'error',
            });
          }
        }
      }
    }

    const result: ValidationResult = {
      valid: errors.length === 0,
      errors,
      warnings,
    };

    // Emit validation events
    if (result.valid) {
      this.eventBus?.emit(DiagramEventTypes.VALIDATION_COMPLETED, {
        type: 'hierarchy',
        entityId: node.id,
        result,
        timestamp: Date.now()
      });
    } else {
      this.eventBus?.emit(DiagramEventTypes.VALIDATION_FAILED, {
        type: 'hierarchy',
        entityId: node.id,
        result,
        timestamp: Date.now()
      });
    }

    return result;
  }

  /**
   * Validate group (Phase 2 - Group validation)
   */
  validateGroup(
    group: GroupModel,
    diagram: DiagramModel,
    options: ValidationOptions = {}
  ): ValidationResult {
    // Emit validation started event
    this.eventBus?.emit(DiagramEventTypes.VALIDATION_STARTED, {
      type: 'group',
      entityId: group.id,
      timestamp: Date.now()
    });

    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Get group type definition
    const groupType = (group as any).type || 'default';
    const typeDef = this.typeRegistry.getGroupType(groupType);

    if (!typeDef) {
      // If no type definition, skip validation
      return { valid: true, errors: [], warnings: [] };
    }

    // 1. Validate member count
    const memberCount = group.members.size;

    if (typeDef.minMembers !== undefined && memberCount < typeDef.minMembers) {
      errors.push({
        path: `group.${group.id}`,
        message: `Group type '${groupType}' requires at least ${typeDef.minMembers} members, has ${memberCount}`,
        code: 'INSUFFICIENT_MEMBERS',
        severity: 'error',
      });
    }

    if (typeDef.maxMembers !== undefined && memberCount > typeDef.maxMembers) {
      errors.push({
        path: `group.${group.id}`,
        message: `Group type '${groupType}' allows at most ${typeDef.maxMembers} members, has ${memberCount}`,
        code: 'EXCESSIVE_MEMBERS',
        severity: 'error',
      });
    }

    // 2. Validate member types
    if (typeDef.allowedMemberTypes && typeDef.allowedMemberTypes.length > 0) {
      for (const memberId of group.members) {
        const node = diagram.getNode(memberId);
        if (node) {
          if (!typeDef.allowedMemberTypes.includes(node.type)) {
            errors.push({
              path: `group.${group.id}`,
              message: `Group type '${groupType}' does not allow member of type '${node.type}'. Allowed: ${typeDef.allowedMemberTypes.join(', ')}`,
              code: 'INVALID_MEMBER_TYPE',
              severity: 'error',
            });
          }
        } else {
          errors.push({
            path: `group.${group.id}`,
            message: `Group member '${memberId}' not found`,
            code: 'MEMBER_NOT_FOUND',
            severity: 'error',
          });
        }
      }
    }

    // 3. Validate nesting constraint
    if (typeDef.canNest === false) {
      // Check if any members are themselves groups
      for (const memberId of group.members) {
        const node = diagram.getNode(memberId);
        // Check if this member is actually a group (groups can contain nodes, so check type)
        if (node && node.type === 'group') {
          errors.push({
            path: `group.${group.id}`,
            message: `Group type '${groupType}' does not allow nested groups`,
            code: 'NESTED_GROUP_NOT_ALLOWED',
            severity: 'error',
          });
          break; // Only report once
        }
      }
    }

    // 4. Validate link types within group
    if (typeDef.allowedLinkTypes && typeDef.allowedLinkTypes.length > 0) {
      const memberIds = Array.from(group.members);
      const links = diagram.getLinks();

      for (const link of links) {
        // Check if this link is between group members
        const sourceNode = diagram
          .getNodes()
          .find((n) => n.getPorts().some((p) => p.id === link.sourcePortId));
        const targetNode = diagram
          .getNodes()
          .find((n) => n.getPorts().some((p) => p.id === link.targetPortId));

        if (sourceNode && targetNode &&
            memberIds.includes(sourceNode.id) &&
            memberIds.includes(targetNode.id)) {
          // This link is between group members
          const linkType = (link as any).type || 'default';
          if (!typeDef.allowedLinkTypes.includes(linkType)) {
            errors.push({
              path: `group.${group.id}`,
              message: `Group type '${groupType}' does not allow link type '${linkType}' within group. Allowed: ${typeDef.allowedLinkTypes.join(', ')}`,
              code: 'INVALID_LINK_TYPE_IN_GROUP',
              severity: 'error',
            });
          }
        }
      }
    }

    // 5. Custom group validator
    if (typeDef.validator) {
      const customResult = typeDef.validator(group);
      errors.push(...customResult.errors);
      warnings.push(...customResult.warnings);
    }

    const result: ValidationResult = {
      valid: errors.length === 0,
      errors,
      warnings,
    };

    // Emit validation events
    if (result.valid) {
      this.eventBus?.emit(DiagramEventTypes.VALIDATION_COMPLETED, {
        type: 'group',
        entityId: group.id,
        result,
        timestamp: Date.now()
      });
    } else {
      this.eventBus?.emit(DiagramEventTypes.VALIDATION_FAILED, {
        type: 'group',
        entityId: group.id,
        result,
        timestamp: Date.now()
      });
    }

    return result;
  }

  /**
   * Add custom validation rule
   */
  addRule(
    entityType: 'diagram' | 'node' | 'port' | 'link',
    rule: ValidationRule
  ): void {
    if (!this.customRules.has(entityType)) {
      this.customRules.set(entityType, []);
    }

    this.customRules.get(entityType)!.push(rule);
  }

  /**
   * Remove all custom rules for an entity type
   */
  clearRules(entityType: 'diagram' | 'node' | 'port' | 'link'): void {
    this.customRules.delete(entityType);
  }

  /**
   * Clear all custom rules
   */
  clearAllRules(): void {
    this.customRules.clear();
  }

  /**
   * Get custom rules count
   */
  getRulesCount(entityType?: 'diagram' | 'node' | 'port' | 'link'): number {
    if (entityType) {
      return this.customRules.get(entityType)?.length || 0;
    }

    let total = 0;
    for (const rules of this.customRules.values()) {
      total += rules.length;
    }
    return total;
  }
}
