// ObstacleMapBuilder - Builds ObstacleMap from DiagramModel (Phase 1.6b)

import type { DiagramModel } from '../models/DiagramModel';
import { ObstacleMap } from './ObstacleMap';
import type { Obstacle } from './types';

export interface ObstacleMapOptions {
  /** Margin to add around each obstacle */
  margin?: number;
}

/**
 * ObstacleMapBuilder creates ObstacleMap from DiagramModel
 * Uses global bounds to account for transforms and hierarchy
 */
export class ObstacleMapBuilder {
  /**
   * Build obstacle map from all nodes in diagram (Phase 1.6b)
   * @param diagram The diagram model
   * @param options Options for obstacle creation
   * @returns ObstacleMap containing all diagram nodes as obstacles
   */
  static fromDiagram(diagram: DiagramModel, options: ObstacleMapOptions = {}): ObstacleMap {
    const map = new ObstacleMap();
    const margin = options.margin ?? 0;

    for (const node of diagram.getNodes()) {
      // Skip if explicitly marked as non-obstacle
      if (node.getData('isObstacle') === false) {
        continue;
      }

      // Use global bounds (accounts for transforms and hierarchy)
      const bounds = node.getGlobalBounds();

      const obstacle: Obstacle = {
        id: node.id,
        x: bounds.left - margin,
        y: bounds.top - margin,
        width: bounds.width + margin * 2,
        height: bounds.height + margin * 2,
      };

      map.add(obstacle);
    }

    return map;
  }

  /**
   * Build obstacle map excluding specific nodes (Phase 1.6b)
   * Useful for routing where source/target nodes should not be obstacles
   * @param diagram The diagram model
   * @param excludeIds Node IDs to exclude from obstacles
   * @param options Options for obstacle creation
   * @returns ObstacleMap containing diagram nodes except excluded ones
   */
  static fromDiagramExcluding(
    diagram: DiagramModel,
    excludeIds: string[],
    options: ObstacleMapOptions = {}
  ): ObstacleMap {
    const map = new ObstacleMap();
    const margin = options.margin ?? 0;
    const excludeSet = new Set(excludeIds);

    for (const node of diagram.getNodes()) {
      // Skip excluded nodes
      if (excludeSet.has(node.id)) {
        continue;
      }

      // Skip if explicitly marked as non-obstacle
      if (node.getData('isObstacle') === false) {
        continue;
      }

      // Use global bounds (accounts for transforms and hierarchy)
      const bounds = node.getGlobalBounds();

      const obstacle: Obstacle = {
        id: node.id,
        x: bounds.left - margin,
        y: bounds.top - margin,
        width: bounds.width + margin * 2,
        height: bounds.height + margin * 2,
      };

      map.add(obstacle);
    }

    return map;
  }
}
