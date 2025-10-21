// ValidationEngine - Validates diagrams, nodes, ports, and links

import { TypeRegistry } from './TypeRegistry';
import type {
  ValidationResult,
  ValidationError,
  ValidationWarning,
} from '../types';
import type { DiagramModel } from '../models/DiagramModel';
import type { NodeModel } from '../models/NodeModel';
import type { PortModel } from '../models/PortModel';
import type { LinkModel } from '../models/LinkModel';

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

  constructor(typeRegistry: TypeRegistry) {
    this.typeRegistry = typeRegistry;
  }

  /**
   * Validate entire diagram
   */
  validateDiagram(
    diagram: DiagramModel,
    options: ValidationOptions = {}
  ): ValidationResult {
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

    // Custom diagram-level rules
    const customRules = this.customRules.get('diagram') || [];
    for (const rule of customRules) {
      const result = rule(diagram);
      errors.push(...result.errors);
      warnings.push(...result.warnings);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate a node
   */
  validateNode(
    node: NodeModel,
    options: ValidationOptions = {}
  ): ValidationResult {
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

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate a port
   */
  validatePort(
    port: PortModel,
    node: NodeModel,
    options: ValidationOptions = {}
  ): ValidationResult {
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

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate a link
   */
  validateLink(
    link: LinkModel,
    diagram: DiagramModel,
    options: ValidationOptions = {}
  ): ValidationResult {
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

    // Custom link-level rules
    const customRules = this.customRules.get('link') || [];
    for (const rule of customRules) {
      const result = rule(link);
      errors.push(...result.errors);
      warnings.push(...result.warnings);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
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
