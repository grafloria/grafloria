/**
 * ShapeMapper - Maps TypeRegistry shape strings to NodeTemplate ShapeConfig
 *
 * Handles conversion between string-based shape definitions in TypeRegistry
 * to strongly-typed ShapeConfig objects for NodeTemplates.
 */

import type { ShapeConfig, ShapeType } from '../NodeTemplate';

export class ShapeMapper {
  /**
   * Shape string to ShapeType enum mapping
   */
  private static readonly SHAPE_MAP: Record<string, ShapeType> = {
    'rectangle': 'rect',
    'rounded-rectangle': 'rect',
    'circle': 'circle',
    'ellipse': 'ellipse',
    'diamond': 'diamond',
    'hexagon': 'hexagon',
  };

  /**
   * Map a TypeRegistry shape string to a ShapeConfig
   */
  map(styleConfig: any): ShapeConfig {
    const shapeString = styleConfig?.shape || 'rectangle';
    const baseShape = ShapeMapper.SHAPE_MAP[shapeString] || 'rect';

    const shapeConfig: ShapeConfig = {
      type: baseShape,
      fill: styleConfig?.fill,
      stroke: styleConfig?.stroke,
      strokeWidth: styleConfig?.strokeWidth,
      opacity: styleConfig?.opacity || 1,
    };

    // Add corner radius for rounded rectangles
    if (shapeString === 'rounded-rectangle') {
      shapeConfig.cornerRadius = styleConfig?.borderRadius || 8;
    } else if (baseShape === 'rect' && styleConfig?.borderRadius) {
      shapeConfig.cornerRadius = styleConfig.borderRadius;
    }

    return shapeConfig;
  }

  /**
   * Get the ShapeType enum value from a shape string
   */
  getShapeType(shapeString: string): ShapeType {
    return ShapeMapper.SHAPE_MAP[shapeString] || 'rect';
  }

  /**
   * Check if a shape string is valid
   */
  isValidShape(shapeString: string): boolean {
    return shapeString in ShapeMapper.SHAPE_MAP;
  }

  /**
   * Get all supported shape strings
   */
  getSupportedShapes(): string[] {
    return Object.keys(ShapeMapper.SHAPE_MAP);
  }
}
