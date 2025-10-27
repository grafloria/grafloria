import { Injectable } from '@angular/core';
import { NodeTemplate } from '@grafloria/engine';

/**
 * Port Position
 * Represents the calculated position of a port
 */
export interface PortPosition {
  side: 'left' | 'right' | 'top' | 'bottom';
  x: number;
  y: number;
  type: 'input' | 'output' | 'both';
  visibility: 'always' | 'on-hover' | 'never';
  enabled: boolean;
}

/**
 * Port Configuration
 * Extracted from template JSON
 */
export interface PortConfig {
  enabled: boolean;
  defaultVisibility: 'always' | 'on-hover' | 'never';
  left?: { enabled: boolean; type: 'input' | 'output' | 'both' };
  right?: { enabled: boolean; type: 'input' | 'output' | 'both' };
  top?: { enabled: boolean; type: 'input' | 'output' | 'both' };
  bottom?: { enabled: boolean; type: 'input' | 'output' | 'both' };
}

/**
 * Port Alignment Helper Service
 *
 * Calculates port positions for all shape types and generates
 * CSS for aligning HTML elements with ports.
 *
 * Features:
 * - Shape-aware position calculation
 * - JSON-based port detection
 * - CSS generation for alignment
 * - Support for all shape types
 *
 * ~300 lines
 */
@Injectable({
  providedIn: 'root'
})
export class PortAlignmentHelperService {

  /**
   * Calculate port positions from template
   */
  calculatePortPositions(template: NodeTemplate | null): PortPosition[] {
    if (!template?.structure) {
      return [];
    }

    const structure = template.structure;

    // Convert width and height to numbers, handling string values like "auto"
    const rawWidth = structure.size?.width || 200;
    const rawHeight = structure.size?.height || 100;
    const width = typeof rawWidth === 'number' ? rawWidth : 200;
    const height = typeof rawHeight === 'number' ? rawHeight : 100;

    const shapeType = structure.shape?.type || 'rect';
    const portConfig = this.extractPortConfig(structure);

    if (!portConfig.enabled) {
      return [];
    }

    const positions: PortPosition[] = [];

    // Calculate positions based on shape type
    switch (shapeType) {
      case 'rect':
        this.addRectanglePortPositions(positions, width, height, portConfig);
        break;
      case 'circle':
        this.addCirclePortPositions(positions, width, height, portConfig);
        break;
      case 'ellipse':
        this.addEllipsePortPositions(positions, width, height, portConfig);
        break;
      case 'diamond':
        this.addDiamondPortPositions(positions, width, height, portConfig);
        break;
      case 'hexagon':
        this.addHexagonPortPositions(positions, width, height, portConfig);
        break;
      default:
        this.addRectanglePortPositions(positions, width, height, portConfig);
    }

    return positions;
  }

  /**
   * Extract port configuration from structure
   */
  private extractPortConfig(structure: any): PortConfig {
    const ports = structure.ports || {};

    return {
      enabled: ports.enabled !== false, // Default true
      defaultVisibility: ports.defaultVisibility || 'always',
      left: ports.left,
      right: ports.right,
      top: ports.top,
      bottom: ports.bottom
    };
  }

  /**
   * Rectangle port positions
   * Ports at midpoint of each side
   */
  private addRectanglePortPositions(
    positions: PortPosition[],
    width: number,
    height: number,
    config: PortConfig
  ): void {
    const halfWidth = width / 2;
    const halfHeight = height / 2;

    // Left port
    if (config.left?.enabled !== false) {
      positions.push({
        side: 'left',
        x: 0,
        y: halfHeight,
        type: config.left?.type || 'input',
        visibility: config.defaultVisibility,
        enabled: true
      });
    }

    // Right port
    if (config.right?.enabled !== false) {
      positions.push({
        side: 'right',
        x: width,
        y: halfHeight,
        type: config.right?.type || 'output',
        visibility: config.defaultVisibility,
        enabled: true
      });
    }

    // Top port
    if (config.top?.enabled !== false) {
      positions.push({
        side: 'top',
        x: halfWidth,
        y: 0,
        type: config.top?.type || 'both',
        visibility: config.defaultVisibility,
        enabled: true
      });
    }

    // Bottom port
    if (config.bottom?.enabled !== false) {
      positions.push({
        side: 'bottom',
        x: halfWidth,
        y: height,
        type: config.bottom?.type || 'both',
        visibility: config.defaultVisibility,
        enabled: true
      });
    }
  }

  /**
   * Circle port positions
   * Ports at cardinal directions on circle perimeter
   */
  private addCirclePortPositions(
    positions: PortPosition[],
    width: number,
    height: number,
    config: PortConfig
  ): void {
    const radius = Math.min(width, height) / 2;
    const centerX = width / 2;
    const centerY = height / 2;

    // Left port
    if (config.left?.enabled !== false) {
      positions.push({
        side: 'left',
        x: centerX - radius,
        y: centerY,
        type: config.left?.type || 'input',
        visibility: config.defaultVisibility,
        enabled: true
      });
    }

    // Right port
    if (config.right?.enabled !== false) {
      positions.push({
        side: 'right',
        x: centerX + radius,
        y: centerY,
        type: config.right?.type || 'output',
        visibility: config.defaultVisibility,
        enabled: true
      });
    }

    // Top port
    if (config.top?.enabled !== false) {
      positions.push({
        side: 'top',
        x: centerX,
        y: centerY - radius,
        type: config.top?.type || 'both',
        visibility: config.defaultVisibility,
        enabled: true
      });
    }

    // Bottom port
    if (config.bottom?.enabled !== false) {
      positions.push({
        side: 'bottom',
        x: centerX,
        y: centerY + radius,
        type: config.bottom?.type || 'both',
        visibility: config.defaultVisibility,
        enabled: true
      });
    }
  }

  /**
   * Ellipse port positions
   * Ports at cardinal directions on ellipse perimeter
   */
  private addEllipsePortPositions(
    positions: PortPosition[],
    width: number,
    height: number,
    config: PortConfig
  ): void {
    const radiusX = width / 2;
    const radiusY = height / 2;
    const centerX = width / 2;
    const centerY = height / 2;

    // Left port
    if (config.left?.enabled !== false) {
      positions.push({
        side: 'left',
        x: centerX - radiusX,
        y: centerY,
        type: config.left?.type || 'input',
        visibility: config.defaultVisibility,
        enabled: true
      });
    }

    // Right port
    if (config.right?.enabled !== false) {
      positions.push({
        side: 'right',
        x: centerX + radiusX,
        y: centerY,
        type: config.right?.type || 'output',
        visibility: config.defaultVisibility,
        enabled: true
      });
    }

    // Top port
    if (config.top?.enabled !== false) {
      positions.push({
        side: 'top',
        x: centerX,
        y: centerY - radiusY,
        type: config.top?.type || 'both',
        visibility: config.defaultVisibility,
        enabled: true
      });
    }

    // Bottom port
    if (config.bottom?.enabled !== false) {
      positions.push({
        side: 'bottom',
        x: centerX,
        y: centerY + radiusY,
        type: config.bottom?.type || 'both',
        visibility: config.defaultVisibility,
        enabled: true
      });
    }
  }

  /**
   * Diamond port positions
   * Ports at vertices of rotated square
   */
  private addDiamondPortPositions(
    positions: PortPosition[],
    width: number,
    height: number,
    config: PortConfig
  ): void {
    const halfWidth = width / 2;
    const halfHeight = height / 2;

    // Left port (left vertex)
    if (config.left?.enabled !== false) {
      positions.push({
        side: 'left',
        x: 0,
        y: halfHeight,
        type: config.left?.type || 'input',
        visibility: config.defaultVisibility,
        enabled: true
      });
    }

    // Right port (right vertex)
    if (config.right?.enabled !== false) {
      positions.push({
        side: 'right',
        x: width,
        y: halfHeight,
        type: config.right?.type || 'output',
        visibility: config.defaultVisibility,
        enabled: true
      });
    }

    // Top port (top vertex)
    if (config.top?.enabled !== false) {
      positions.push({
        side: 'top',
        x: halfWidth,
        y: 0,
        type: config.top?.type || 'both',
        visibility: config.defaultVisibility,
        enabled: true
      });
    }

    // Bottom port (bottom vertex)
    if (config.bottom?.enabled !== false) {
      positions.push({
        side: 'bottom',
        x: halfWidth,
        y: height,
        type: config.bottom?.type || 'both',
        visibility: config.defaultVisibility,
        enabled: true
      });
    }
  }

  /**
   * Hexagon port positions
   * Ports at six vertices
   */
  private addHexagonPortPositions(
    positions: PortPosition[],
    width: number,
    height: number,
    config: PortConfig
  ): void {
    const centerX = width / 2;
    const centerY = height / 2;

    // For hexagon, we place ports at left, right, and optionally top/bottom
    // Hexagon vertices: 6 points around center

    // Left port (left vertex)
    if (config.left?.enabled !== false) {
      positions.push({
        side: 'left',
        x: 0,
        y: centerY,
        type: config.left?.type || 'input',
        visibility: config.defaultVisibility,
        enabled: true
      });
    }

    // Right port (right vertex)
    if (config.right?.enabled !== false) {
      positions.push({
        side: 'right',
        x: width,
        y: centerY,
        type: config.right?.type || 'output',
        visibility: config.defaultVisibility,
        enabled: true
      });
    }

    // Top port (top-center area)
    if (config.top?.enabled !== false) {
      positions.push({
        side: 'top',
        x: centerX,
        y: 0,
        type: config.top?.type || 'both',
        visibility: config.defaultVisibility,
        enabled: true
      });
    }

    // Bottom port (bottom-center area)
    if (config.bottom?.enabled !== false) {
      positions.push({
        side: 'bottom',
        x: centerX,
        y: height,
        type: config.bottom?.type || 'both',
        visibility: config.defaultVisibility,
        enabled: true
      });
    }
  }

  /**
   * Generate CSS for aligning an HTML element with a port
   */
  generatePortAlignmentCSS(port: PortPosition, elementSize: { width: number; height: number }): string {
    const halfWidth = elementSize.width / 2;
    const halfHeight = elementSize.height / 2;

    // Calculate position to center element on port
    const left = port.x - halfWidth;
    const top = port.y - halfHeight;

    return `
position: absolute;
left: ${left}px;
top: ${top}px;
width: ${elementSize.width}px;
height: ${elementSize.height}px;
`.trim();
  }

  /**
   * Generate CSS for a port indicator badge
   */
  generatePortIndicatorCSS(port: PortPosition): string {
    const offsetX = -8; // Half of indicator size (16px / 2)
    const offsetY = -8;

    return `
position: absolute;
left: ${port.x + offsetX}px;
top: ${port.y + offsetY}px;
width: 16px;
height: 16px;
border-radius: 50%;
background: ${this.getPortColor(port.type)};
border: 2px solid white;
box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
cursor: pointer;
z-index: 100;
`.trim();
  }

  /**
   * Get color for port type
   */
  private getPortColor(type: 'input' | 'output' | 'both'): string {
    switch (type) {
      case 'input':
        return '#10b981'; // Green
      case 'output':
        return '#3b82f6'; // Blue
      case 'both':
        return '#8b5cf6'; // Purple
      default:
        return '#6b7280'; // Gray
    }
  }

  /**
   * Get label for port type
   */
  getPortTypeLabel(type: 'input' | 'output' | 'both'): string {
    switch (type) {
      case 'input':
        return 'Input Port';
      case 'output':
        return 'Output Port';
      case 'both':
        return 'Input/Output Port';
      default:
        return 'Port';
    }
  }

  /**
   * Get label for port visibility
   */
  getPortVisibilityLabel(visibility: 'always' | 'on-hover' | 'never'): string {
    switch (visibility) {
      case 'always':
        return 'Always Visible';
      case 'on-hover':
        return 'Visible on Hover';
      case 'never':
        return 'Hidden';
      default:
        return 'Always';
    }
  }
}
