/**
 * ShapeMapper - Maps TypeRegistry shape strings to NodeTemplate ShapeConfig
 *
 * Handles conversion between string-based shape definitions in TypeRegistry
 * to strongly-typed ShapeConfig objects for NodeTemplates.
 */

import type { ShapeConfig, ShapeType } from '../NodeTemplate';

export class ShapeMapper {
  /**
   * Shape string to ShapeType enum mapping.
   *
   * Covers the five originals plus the extended flowchart / BPMN / UML / ERD
   * figure library (see the renderer's shape registry). Synonyms from common
   * dialects (draw.io / mermaid / BPMN) resolve to the canonical ShapeType.
   */
  private static readonly SHAPE_MAP: Record<string, ShapeType> = {
    // originals
    'rectangle': 'rect',
    'rounded-rectangle': 'rect',
    'rect': 'rect',
    'circle': 'circle',
    'ellipse': 'ellipse',
    'oval': 'ellipse',
    'diamond': 'diamond',
    'decision': 'diamond',
    'hexagon': 'hexagon',
    // extended figure library (identity + synonyms)
    'parallelogram': 'parallelogram',
    'data': 'parallelogram',
    'input-output': 'parallelogram',
    'parallelogram-top': 'parallelogram-top',
    'parallelogram-alt': 'parallelogram-top',
    'trapezoid': 'trapezoid',
    'manual-operation': 'trapezoid',
    'trapezoid-bottom': 'trapezoid-bottom',
    'triangle': 'triangle',
    'triangle-down': 'triangle-down',
    'package': 'package',
    'folder': 'folder',
    'cube': 'cube',
    'document': 'document',
    'cylinder': 'cylinder',
    'database': 'database',
    'cloud': 'cloud',
    'predefined-process': 'predefined-process',
    'subroutine': 'subroutine',
    'component': 'component',
    'note': 'note',
    'comment': 'note',
    'terminal': 'terminal',
    'terminator': 'terminal',
    'stadium': 'stadium',
    'pill': 'terminal',
    'actor': 'actor',
  };

  /**
   * Resolve a shape string to a ShapeType, logging (not silently swallowing)
   * anything unrecognized so a typo'd / new shape name surfaces instead of
   * quietly degrading to a plain rectangle.
   */
  private static resolve(shapeString: string): ShapeType {
    const mapped = ShapeMapper.SHAPE_MAP[shapeString];
    if (!mapped) {
      console.warn(
        `[ShapeMapper] Unknown shape "${shapeString}" — falling back to 'rect'. ` +
          `Add it to SHAPE_MAP + the renderer shape registry if it should render as a figure.`
      );
      return 'rect';
    }
    return mapped;
  }

  /**
   * Map a TypeRegistry shape string to a ShapeConfig
   */
  map(styleConfig: any): ShapeConfig {
    const shapeString = styleConfig?.shape || 'rectangle';
    const baseShape = ShapeMapper.resolve(shapeString);

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
    return ShapeMapper.resolve(shapeString);
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
