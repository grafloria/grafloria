/**
 * PortConfigGenerator - Generates port configurations for NodeTemplates
 *
 * Automatically generates appropriate port configurations based on:
 * - Node shape (circle, diamond, rectangle, etc.)
 * - Node category (bpmn, flowchart, uml, erd)
 * - Type family (gateway, task, event, etc.)
 */

import type { PortsConfig, PortConfig } from '../NodeTemplate';
import type { NodeTypeDefinition } from '../../validation/TypeRegistry';

export class PortConfigGenerator {
  /**
   * Generate port configuration for a node type
   */
  generate(typeDefinition: NodeTypeDefinition): PortsConfig {
    const shape = typeDefinition.defaultStyle?.shape || 'rectangle';
    const family = typeDefinition.family;
    const category = typeDefinition.category;

    // Determine port configuration based on shape and family
    if (shape === 'circle') {
      return this.generateCirclePorts();
    }

    if (shape === 'diamond' || family === 'gateway' || family === 'control-flow') {
      return this.generateGatewayPorts();
    }

    if (category === 'erd' && family === 'entity') {
      return this.generateEntityPorts();
    }

    // Default: standard rectangle with 4-way ports
    return this.generateStandardPorts();
  }

  /**
   * Generate ports for circle shapes (events, connectors)
   * All 4 sides enabled, bidirectional
   */
  private generateCirclePorts(): PortsConfig {
    return {
      enabled: true,
      defaultVisibility: 'on-hover',
      rendering: {
        mode: 'svg',
        size: { width: 8, height: 8, hoverScale: 1.5 },
        svg: {
          shape: 'circle',
          fill: '#1976D2',
          stroke: '#FFFFFF',
          strokeWidth: 2,
        },
      },
      top: {
        enabled: true,
        type: 'bi',
        maxConnections: Infinity,
      },
      right: {
        enabled: true,
        type: 'bi',
        maxConnections: Infinity,
      },
      bottom: {
        enabled: true,
        type: 'bi',
        maxConnections: Infinity,
      },
      left: {
        enabled: true,
        type: 'bi',
        maxConnections: Infinity,
      },
    };
  }

  /**
   * Generate ports for gateway/decision nodes
   * 1 input (left), multiple outputs (right, top, bottom)
   */
  private generateGatewayPorts(): PortsConfig {
    return {
      enabled: true,
      defaultVisibility: 'on-hover',
      rendering: {
        mode: 'svg',
        size: { width: 8, height: 8, hoverScale: 1.5 },
        svg: {
          shape: 'circle',
          fill: '#F57C00',
          stroke: '#FFFFFF',
          strokeWidth: 2,
        },
      },
      left: {
        enabled: true,
        type: 'input',
        maxConnections: Infinity, // Gateways can have multiple inputs
      },
      right: {
        enabled: true,
        type: 'output',
        maxConnections: Infinity,
      },
      top: {
        enabled: true,
        type: 'output',
        maxConnections: Infinity,
      },
      bottom: {
        enabled: true,
        type: 'output',
        maxConnections: Infinity,
      },
    };
  }

  /**
   * Generate ports for ERD entities
   * Ports will be generated dynamically per field
   */
  private generateEntityPorts(): PortsConfig {
    return {
      enabled: true,
      defaultVisibility: 'on-hover',
      rendering: {
        mode: 'svg',
        size: { width: 6, height: 6, hoverScale: 1.5 },
        svg: {
          shape: 'circle',
          fill: '#1976D2',
          stroke: '#FFFFFF',
          strokeWidth: 1,
        },
      },
      // Entity ports are created dynamically per field
      // Just enable basic left/right for entity-level connections
      left: {
        enabled: true,
        type: 'bi',
        maxConnections: Infinity,
      },
      right: {
        enabled: true,
        type: 'bi',
        maxConnections: Infinity,
      },
    };
  }

  /**
   * Generate standard ports for rectangles (tasks, processes, etc.)
   * Input on left, output on right, bidirectional on top/bottom
   */
  private generateStandardPorts(): PortsConfig {
    return {
      enabled: true,
      defaultVisibility: 'on-hover',
      rendering: {
        mode: 'svg',
        size: { width: 8, height: 8, hoverScale: 1.5 },
        svg: {
          shape: 'circle',
          fill: '#1976D2',
          stroke: '#FFFFFF',
          strokeWidth: 2,
        },
      },
      left: {
        enabled: true,
        type: 'input',
        maxConnections: Infinity,
      },
      right: {
        enabled: true,
        type: 'output',
        maxConnections: Infinity,
      },
      top: {
        enabled: true,
        type: 'bi',
        maxConnections: Infinity,
      },
      bottom: {
        enabled: true,
        type: 'bi',
        maxConnections: Infinity,
      },
    };
  }

  /**
   * Get default port configuration for a specific shape
   */
  getDefaultForShape(shape: string): PortsConfig {
    switch (shape) {
      case 'circle':
        return this.generateCirclePorts();
      case 'diamond':
        return this.generateGatewayPorts();
      default:
        return this.generateStandardPorts();
    }
  }
}
