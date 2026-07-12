/**
 * Layout Quality Metrics System
 *
 * Measures and scores layout quality based on multiple criteria.
 * Helps users understand layout effectiveness and suggests improvements.
 */

import { NodeModel } from '../models/NodeModel';
import { LinkModel } from '../models/LinkModel';

/**
 * Individual quality metric
 */
export interface QualityMetric {
  /** Metric name */
  name: string;
  /** Score (0-100, higher is better) */
  score: number;
  /** Weight of this metric in overall score */
  weight: number;
  /** Description of what this measures */
  description: string;
  /** Suggestions for improvement */
  suggestions?: string[];
}

/**
 * Overall layout quality assessment
 */
export interface LayoutQualityResult {
  /** Overall quality score (0-100) */
  overallScore: number;
  /** Quality grade (A, B, C, D, F) */
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  /** Individual metrics */
  metrics: {
    edgeCrossings: QualityMetric;
    nodeOverlap: QualityMetric;
    edgeLength: QualityMetric;
    nodeDistribution: QualityMetric;
    symmetry: QualityMetric;
    aspectRatio: QualityMetric;
  };
  /** Top suggestions for improvement */
  topSuggestions: string[];
  /** Timestamp of assessment */
  timestamp: number;
}

/**
 * Options for quality assessment
 */
export interface QualityAssessmentOptions {
  /** Whether to include detailed suggestions */
  includeSuggestions?: boolean;
  /** Custom metric weights (overrides defaults) */
  customWeights?: {
    edgeCrossings?: number;
    nodeOverlap?: number;
    edgeLength?: number;
    nodeDistribution?: number;
    symmetry?: number;
    aspectRatio?: number;
  };
  /** Canvas dimensions for aspect ratio calculation */
  canvasDimensions?: {
    width: number;
    height: number;
  };
}

/**
 * Layout Quality Metrics Calculator
 */
export class LayoutQualityMetrics {
  private static readonly DEFAULT_WEIGHTS = {
    edgeCrossings: 0.25,    // Most important - crossings are confusing
    nodeOverlap: 0.25,      // Critical - overlaps are unusable
    edgeLength: 0.15,       // Important - short edges are clearer
    nodeDistribution: 0.15, // Important - even distribution is aesthetic
    symmetry: 0.10,         // Moderate - symmetry is pleasing
    aspectRatio: 0.10,      // Moderate - good use of space
  };

  /**
   * Assess the quality of a layout
   *
   * @param nodes - Laid out nodes
   * @param links - Links between nodes
   * @param options - Assessment options
   * @returns Quality assessment result
   */
  static assess(
    nodes: NodeModel[],
    links: LinkModel[],
    options: QualityAssessmentOptions = {}
  ): LayoutQualityResult {
    const weights = { ...this.DEFAULT_WEIGHTS, ...options.customWeights };

    // Calculate individual metrics
    const edgeCrossings = this.calculateEdgeCrossingsMetric(nodes, links, weights.edgeCrossings, options.includeSuggestions);
    const nodeOverlap = this.calculateNodeOverlapMetric(nodes, weights.nodeOverlap, options.includeSuggestions);
    const edgeLength = this.calculateEdgeLengthMetric(nodes, links, weights.edgeLength, options.includeSuggestions);
    const nodeDistribution = this.calculateNodeDistributionMetric(nodes, weights.nodeDistribution, options.includeSuggestions);
    const symmetry = this.calculateSymmetryMetric(nodes, weights.symmetry, options.includeSuggestions);
    const aspectRatio = this.calculateAspectRatioMetric(nodes, weights.aspectRatio, options.canvasDimensions, options.includeSuggestions);

    // Calculate overall score
    const overallScore = Math.round(
      edgeCrossings.score * edgeCrossings.weight +
      nodeOverlap.score * nodeOverlap.weight +
      edgeLength.score * edgeLength.weight +
      nodeDistribution.score * nodeDistribution.weight +
      symmetry.score * symmetry.weight +
      aspectRatio.score * aspectRatio.weight
    );

    // Determine grade
    const grade = this.scoreToGrade(overallScore);

    // Collect top suggestions
    const allMetrics = [edgeCrossings, nodeOverlap, edgeLength, nodeDistribution, symmetry, aspectRatio];
    const topSuggestions = this.getTopSuggestions(allMetrics);

    return {
      overallScore,
      grade,
      metrics: {
        edgeCrossings,
        nodeOverlap,
        edgeLength,
        nodeDistribution,
        symmetry,
        aspectRatio,
      },
      topSuggestions,
      timestamp: Date.now(),
    };
  }

  /**
   * Calculate edge crossings metric
   * Fewer crossings = better (crossings cause confusion)
   */
  private static calculateEdgeCrossingsMetric(
    nodes: NodeModel[],
    links: LinkModel[],
    weight: number,
    includeSuggestions?: boolean
  ): QualityMetric {
    const nodePositions = new Map<string, { x: number; y: number }>();
    nodes.forEach(node => {
      const pos = node.position;
      nodePositions.set(node.id, pos);
    });

    let crossingCount = 0;
    const linkArray = links.filter(l => l.sourceNodeId && l.targetNodeId);

    // Check each pair of links for intersections
    for (let i = 0; i < linkArray.length; i++) {
      for (let j = i + 1; j < linkArray.length; j++) {
        const link1 = linkArray[i];
        const link2 = linkArray[j];

        const pos1Start = nodePositions.get(link1.sourceNodeId!);
        const pos1End = nodePositions.get(link1.targetNodeId!);
        const pos2Start = nodePositions.get(link2.sourceNodeId!);
        const pos2End = nodePositions.get(link2.targetNodeId!);

        if (pos1Start && pos1End && pos2Start && pos2End) {
          if (this.linesIntersect(pos1Start, pos1End, pos2Start, pos2End)) {
            crossingCount++;
          }
        }
      }
    }

    // Score: 100 for 0 crossings, decreases with more crossings
    const maxAcceptableCrossings = Math.max(linkArray.length * 0.1, 5);
    const score = Math.max(0, 100 - (crossingCount / maxAcceptableCrossings) * 100);

    const suggestions: string[] = [];
    if (includeSuggestions && crossingCount > 0) {
      if (crossingCount > maxAcceptableCrossings) {
        suggestions.push('Try a different layout algorithm (e.g., layered or hierarchical)');
        suggestions.push('Increase node separation to reduce edge overlap');
      } else if (crossingCount > 0) {
        suggestions.push('Minor crossings present - consider adjusting node positions');
      }
    }

    return {
      name: 'Edge Crossings',
      score: Math.round(score),
      weight,
      description: `Measures edge intersections (${crossingCount} crossings detected)`,
      suggestions,
    };
  }

  /**
   * Calculate node overlap metric
   * No overlaps = perfect (overlaps make diagram unusable)
   */
  private static calculateNodeOverlapMetric(
    nodes: NodeModel[],
    weight: number,
    includeSuggestions?: boolean
  ): QualityMetric {
    let overlapCount = 0;
    const overlapPairs: string[] = [];

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        if (this.nodesOverlap(nodes[i], nodes[j])) {
          overlapCount++;
          overlapPairs.push(`${nodes[i].id}-${nodes[j].id}`);
        }
      }
    }

    // Score: 100 for no overlaps, 0 if more than 10% of nodes overlap
    const maxAcceptableOverlaps = Math.max(nodes.length * 0.05, 2);
    const score = overlapCount === 0 ? 100 : Math.max(0, 100 - (overlapCount / maxAcceptableOverlaps) * 100);

    const suggestions: string[] = [];
    if (includeSuggestions && overlapCount > 0) {
      suggestions.push(`${overlapCount} node overlaps detected - increase node separation`);
      suggestions.push('Try a force-directed layout to automatically separate nodes');
      if (overlapCount > 5) {
        suggestions.push('Consider using a larger canvas or smaller nodes');
      }
    }

    return {
      name: 'Node Overlap',
      score: Math.round(score),
      weight,
      description: `Checks for overlapping nodes (${overlapCount} overlaps detected)`,
      suggestions,
    };
  }

  /**
   * Calculate edge length metric
   * Shorter average edge length = better (easier to follow)
   */
  private static calculateEdgeLengthMetric(
    nodes: NodeModel[],
    links: LinkModel[],
    weight: number,
    includeSuggestions?: boolean
  ): QualityMetric {
    const nodePositions = new Map<string, { x: number; y: number }>();
    nodes.forEach(node => {
      const pos = node.position;
      nodePositions.set(node.id, pos);
    });

    let totalLength = 0;
    let validLinks = 0;

    links.forEach(link => {
      if (link.sourceNodeId && link.targetNodeId) {
        const pos1 = nodePositions.get(link.sourceNodeId);
        const pos2 = nodePositions.get(link.targetNodeId);

        if (pos1 && pos2) {
          const length = Math.sqrt(
            Math.pow(pos2.x - pos1.x, 2) + Math.pow(pos2.y - pos1.y, 2)
          );
          totalLength += length;
          validLinks++;
        }
      }
    });

    const avgLength = validLinks > 0 ? totalLength / validLinks : 0;

    // Score: Ideal average edge length is 100-300px
    // Score decreases for very short (<50) or very long (>500) edges
    const idealMin = 100;
    const idealMax = 300;
    let score = 100;

    if (avgLength < idealMin) {
      score = 60 + (avgLength / idealMin) * 40;
    } else if (avgLength > idealMax) {
      score = Math.max(0, 100 - ((avgLength - idealMax) / 500) * 60);
    }

    const suggestions: string[] = [];
    if (includeSuggestions) {
      if (avgLength < 50) {
        suggestions.push('Edges are very short - increase node separation');
      } else if (avgLength > 500) {
        suggestions.push('Edges are very long - reduce node separation or use compact layout');
      }
    }

    return {
      name: 'Edge Length',
      score: Math.round(score),
      weight,
      description: `Measures average edge length (${Math.round(avgLength)}px average)`,
      suggestions,
    };
  }

  /**
   * Calculate node distribution metric
   * Even distribution = better (balanced appearance)
   */
  private static calculateNodeDistributionMetric(
    nodes: NodeModel[],
    weight: number,
    includeSuggestions?: boolean
  ): QualityMetric {
    if (nodes.length === 0) {
      return {
        name: 'Node Distribution',
        score: 100,
        weight,
        description: 'No nodes to assess',
        suggestions: [],
      };
    }

    // Calculate centroid
    let sumX = 0, sumY = 0;
    nodes.forEach(node => {
      const pos = node.position;
      sumX += pos.x;
      sumY += pos.y;
    });
    const centroidX = sumX / nodes.length;
    const centroidY = sumY / nodes.length;

    // Evenness = coefficient of variation of nearest-neighbour distances —
    // the classic spatial-uniformity measure. Translation-invariant (the old
    // version divided by the centroid's distance from the ORIGIN, so the same
    // layout scored differently depending on where it sat on the canvas), and
    // it correctly punishes clusters: tight groups have tiny NN distances
    // while outliers have huge ones. 0 = perfectly even grid.
    let cv = 0;
    if (nodes.length >= 2) {
      const nnDistances = nodes.map((node, i) => {
        let min = Infinity;
        nodes.forEach((other, j) => {
          if (i === j) return;
          min = Math.min(
            min,
            Math.hypot(other.position.x - node.position.x, other.position.y - node.position.y)
          );
        });
        return min;
      });
      const meanNN = nnDistances.reduce((a, b) => a + b, 0) / nnDistances.length;
      const nnVariance =
        nnDistances.reduce((a, d) => a + Math.pow(d - meanNN, 2), 0) / nnDistances.length;
      cv = meanNN > 0 ? Math.sqrt(nnVariance) / meanNN : 0;
    }

    // Good CV is < 0.5, excellent is < 0.3
    const score = cv < 0.3 ? 100 : cv < 0.5 ? 80 : Math.max(0, 100 - (cv - 0.5) * 100);

    const suggestions: string[] = [];
    if (includeSuggestions && score < 70) {
      suggestions.push('Nodes are unevenly distributed - try force-directed layout');
      suggestions.push('Adjust spacing parameters for more balanced distribution');
    }

    return {
      name: 'Node Distribution',
      score: Math.round(score),
      weight,
      description: 'Measures how evenly nodes are distributed across the canvas',
      suggestions,
    };
  }

  /**
   * Calculate symmetry metric
   * More symmetric = better (aesthetically pleasing)
   */
  private static calculateSymmetryMetric(
    nodes: NodeModel[],
    weight: number,
    includeSuggestions?: boolean
  ): QualityMetric {
    if (nodes.length < 3) {
      return {
        name: 'Symmetry',
        score: 100,
        weight,
        description: 'Too few nodes to assess symmetry',
        suggestions: [],
      };
    }

    // Calculate horizontal and vertical symmetry
    let sumX = 0, sumY = 0;
    nodes.forEach(node => {
      const pos = node.position;
      sumX += pos.x;
      sumY += pos.y;
    });
    const centerX = sumX / nodes.length;
    const centerY = sumY / nodes.length;

    // Measure symmetry by comparing node distribution on each side
    let leftCount = 0, rightCount = 0, topCount = 0, bottomCount = 0;
    nodes.forEach(node => {
      const pos = node.position;
      if (pos.x < centerX) leftCount++;
      else rightCount++;
      if (pos.y < centerY) topCount++;
      else bottomCount++;
    });

    const horizontalBalance = Math.min(leftCount, rightCount) / Math.max(leftCount, rightCount, 1);
    const verticalBalance = Math.min(topCount, bottomCount) / Math.max(topCount, bottomCount, 1);

    // Average of both balances
    const balance = (horizontalBalance + verticalBalance) / 2;
    const score = balance * 100;

    const suggestions: string[] = [];
    if (includeSuggestions && score < 70) {
      suggestions.push('Layout is asymmetric - try a hierarchical or radial layout for better balance');
    }

    return {
      name: 'Symmetry',
      score: Math.round(score),
      weight,
      description: 'Measures horizontal and vertical balance',
      suggestions,
    };
  }

  /**
   * Calculate aspect ratio metric
   * Good use of available space
   */
  private static calculateAspectRatioMetric(
    nodes: NodeModel[],
    weight: number,
    canvasDimensions?: { width: number; height: number },
    includeSuggestions?: boolean
  ): QualityMetric {
    if (nodes.length === 0) {
      return {
        name: 'Aspect Ratio',
        score: 100,
        weight,
        description: 'No nodes to assess',
        suggestions: [],
      };
    }

    // Calculate bounding box
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    nodes.forEach(node => {
      const pos = node.position;
      const size = node.size;
      minX = Math.min(minX, pos.x);
      minY = Math.min(minY, pos.y);
      maxX = Math.max(maxX, pos.x + (size.width || 150));
      maxY = Math.max(maxY, pos.y + (size.height || 50));
    });

    const layoutWidth = maxX - minX;
    const layoutHeight = maxY - minY;
    const layoutAspect = layoutWidth / layoutHeight;

    let score = 100;
    const suggestions: string[] = [];

    if (canvasDimensions) {
      const canvasAspect = canvasDimensions.width / canvasDimensions.height;
      const aspectDiff = Math.abs(layoutAspect - canvasAspect);

      // Good if layout aspect is within 30% of canvas aspect
      if (aspectDiff < 0.3) {
        score = 100;
      } else if (aspectDiff < 0.6) {
        score = 80;
      } else {
        score = Math.max(40, 100 - aspectDiff * 60);
      }

      if (includeSuggestions && score < 70) {
        if (layoutAspect > canvasAspect * 1.5) {
          suggestions.push('Layout is too wide - try vertical orientation or increase canvas width');
        } else if (layoutAspect < canvasAspect * 0.67) {
          suggestions.push('Layout is too tall - try horizontal orientation or increase canvas height');
        }
      }
    } else {
      // Without canvas dimensions, just check if aspect is reasonable (1:3 to 3:1)
      if (layoutAspect < 0.33 || layoutAspect > 3) {
        score = 60;
        if (includeSuggestions) {
          suggestions.push('Layout aspect ratio is extreme - consider adjusting direction or spacing');
        }
      }
    }

    return {
      name: 'Aspect Ratio',
      score: Math.round(score),
      weight,
      description: `Measures space utilization (${layoutWidth.toFixed(0)}x${layoutHeight.toFixed(0)})`,
      suggestions,
    };
  }

  /**
   * Convert score to letter grade
   */
  private static scoreToGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    return 'F';
  }

  /**
   * Get top suggestions from all metrics
   */
  private static getTopSuggestions(metrics: QualityMetric[]): string[] {
    const allSuggestions: Array<{ suggestion: string; score: number }> = [];

    metrics.forEach(metric => {
      if (metric.suggestions) {
        metric.suggestions.forEach(suggestion => {
          allSuggestions.push({
            suggestion,
            score: metric.score,
          });
        });
      }
    });

    // Sort by score (lowest first = most important)
    allSuggestions.sort((a, b) => a.score - b.score);

    // Return top 3 unique suggestions
    const unique = new Set<string>();
    const result: string[] = [];

    for (const item of allSuggestions) {
      if (!unique.has(item.suggestion)) {
        unique.add(item.suggestion);
        result.push(item.suggestion);
        if (result.length >= 3) break;
      }
    }

    return result;
  }

  /**
   * Check if two line segments intersect
   */
  private static linesIntersect(
    p1: { x: number; y: number },
    p2: { x: number; y: number },
    p3: { x: number; y: number },
    p4: { x: number; y: number }
  ): boolean {
    const det = (p2.x - p1.x) * (p4.y - p3.y) - (p4.x - p3.x) * (p2.y - p1.y);
    if (det === 0) return false;

    const lambda = ((p4.y - p3.y) * (p4.x - p1.x) + (p3.x - p4.x) * (p4.y - p1.y)) / det;
    const gamma = ((p1.y - p2.y) * (p4.x - p1.x) + (p2.x - p1.x) * (p4.y - p1.y)) / det;

    return (lambda > 0 && lambda < 1) && (gamma > 0 && gamma < 1);
  }

  /**
   * Check if two nodes overlap
   */
  private static nodesOverlap(node1: NodeModel, node2: NodeModel): boolean {
    const pos1 = node1.position;
    const pos2 = node2.position;
    const size1 = node1.size;
    const size2 = node2.size;

    const width1 = size1.width || 150;
    const height1 = size1.height || 50;
    const width2 = size2.width || 150;
    const height2 = size2.height || 50;

    return !(
      pos1.x + width1 < pos2.x ||
      pos2.x + width2 < pos1.x ||
      pos1.y + height1 < pos2.y ||
      pos2.y + height2 < pos1.y
    );
  }
}
