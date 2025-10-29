/**
 * Port-Aware Layout System
 *
 * Enables layout algorithms to consider port positions when arranging nodes,
 * minimizing edge crossings and creating cleaner diagrams.
 *
 * Key features:
 * - Port side preferences (left, right, top, bottom)
 * - Port ordering constraints
 * - Connection-aware positioning
 * - Crossing minimization
 *
 * @module layout/port-aware-layout
 */

/**
 * Port side relative to node
 */
export type PortSide = 'left' | 'right' | 'top' | 'bottom';

/**
 * Port direction (input or output)
 */
export type PortFlowDirection = 'input' | 'output' | 'bidirectional';

/**
 * Information about a port for layout purposes
 */
export interface PortInfo {
  /** Port unique identifier */
  id: string;

  /** Node this port belongs to */
  nodeId: string;

  /** Preferred side of the node */
  preferredSide?: PortSide;

  /** Port direction */
  direction?: PortFlowDirection;

  /** Position along the side (0-1, where 0 is top/left, 1 is bottom/right) */
  offset?: number;

  /** Fixed position (prevents automatic ordering) */
  fixed?: boolean;

  /** Priority for ordering (higher = more important) */
  priority?: number;

  /** Group identifier for related ports */
  group?: string;
}

/**
 * Configuration for port-aware layout
 */
export interface PortAwareLayoutOptions {
  /** Enable port-aware layout */
  enabled: boolean;

  /** Port information for all ports in the diagram */
  ports?: PortInfo[];

  /** Automatic port side assignment based on node connections */
  autoAssignSides?: boolean;

  /** Automatic port ordering to minimize crossings */
  autoOrderPorts?: boolean;

  /** Prefer inputs on specific side */
  inputSide?: PortSide;

  /** Prefer outputs on specific side */
  outputSide?: PortSide;

  /** Minimum spacing between ports (in pixels) */
  portSpacing?: number;

  /** Whether to consider port positions in edge routing */
  usePortPositions?: boolean;

  /** Strategy for port ordering */
  orderingStrategy?: 'minimize-crossings' | 'connection-based' | 'group-based' | 'manual';

  /** Node-specific port side preferences */
  nodeSidePreferences?: {
    [nodeId: string]: {
      inputs?: PortSide;
      outputs?: PortSide;
    };
  };

  /** Per-port ordering constraints */
  portOrdering?: {
    [nodeId: string]: string[]; // Ordered list of port IDs for this node
  };
}

/**
 * Result of port-aware layout computation
 */
export interface PortAwareLayoutResult {
  /** Final port assignments (port ID -> side) */
  portAssignments: Map<string, PortSide>;

  /** Final port ordering (node ID -> ordered port IDs) */
  portOrdering: Map<string, string[]>;

  /** Calculated port positions (port ID -> {x, y} relative to node) */
  portPositions: Map<string, { x: number; y: number; side: PortSide }>;

  /** Number of edge crossings */
  edgeCrossings: number;

  /** Whether port positions were optimized */
  wasOptimized: boolean;

  /** Ports that were automatically assigned sides */
  autoAssignedPorts: string[];

  /** Ports that were automatically ordered */
  autoOrderedPorts: string[];
}

/**
 * Port-aware layout computation utilities
 */
export class PortAwareLayoutManager {
  private static readonly DEFAULT_PORT_SPACING = 20;

  /**
   * Assign ports to sides of their parent nodes
   */
  static assignPortSides(
    ports: PortInfo[],
    nodePositions: Map<string, { x: number; y: number }>,
    options: PortAwareLayoutOptions
  ): Map<string, PortSide> {
    const assignments = new Map<string, PortSide>();

    // First, assign ports with explicit preferences
    for (const port of ports) {
      if (port.preferredSide) {
        assignments.set(port.id, port.preferredSide);
      }
    }

    // If auto-assign is enabled, assign remaining ports based on connections
    if (options.autoAssignSides) {
      const unassignedPorts = ports.filter((p) => !assignments.has(p.id));

      for (const port of unassignedPorts) {
        const side = this.determineOptimalSide(port, ports, nodePositions, options);
        assignments.set(port.id, side);
      }
    }

    return assignments;
  }

  /**
   * Determine optimal side for a port based on connections
   */
  private static determineOptimalSide(
    port: PortInfo,
    allPorts: PortInfo[],
    nodePositions: Map<string, { x: number; y: number }>,
    options: PortAwareLayoutOptions
  ): PortSide {
    // Use direction-based defaults if specified
    if (port.direction === 'input' && options.inputSide) {
      return options.inputSide;
    }
    if (port.direction === 'output' && options.outputSide) {
      return options.outputSide;
    }

    // Check node-specific preferences
    const nodePrefs = options.nodeSidePreferences?.[port.nodeId];
    if (nodePrefs) {
      if (port.direction === 'input' && nodePrefs.inputs) {
        return nodePrefs.inputs;
      }
      if (port.direction === 'output' && nodePrefs.outputs) {
        return nodePrefs.outputs;
      }
    }

    // Default assignments based on direction
    if (port.direction === 'input') {
      return 'left';
    }
    if (port.direction === 'output') {
      return 'right';
    }

    // For bidirectional or unspecified, use top
    return 'top';
  }

  /**
   * Order ports on each node to minimize edge crossings
   */
  static orderPorts(
    ports: PortInfo[],
    portAssignments: Map<string, PortSide>,
    nodePositions: Map<string, { x: number; y: number }>,
    links: Array<{ sourcePortId?: string; targetPortId?: string }>,
    options: PortAwareLayoutOptions
  ): Map<string, string[]> {
    const ordering = new Map<string, string[]>();

    // Group ports by node
    const portsByNode = this.groupPortsByNode(ports);

    for (const [nodeId, nodePorts] of portsByNode) {
      // Check for manual ordering
      if (options.portOrdering?.[nodeId]) {
        ordering.set(nodeId, options.portOrdering[nodeId]);
        continue;
      }

      // Auto-order if enabled
      if (options.autoOrderPorts) {
        const ordered = this.computeOptimalPortOrder(
          nodePorts,
          portAssignments,
          nodePositions,
          links,
          options
        );
        ordering.set(nodeId, ordered);
      } else {
        // Default order: by offset, then by ID
        const defaultOrder = nodePorts
          .sort((a, b) => {
            if (a.offset !== undefined && b.offset !== undefined) {
              return a.offset - b.offset;
            }
            return a.id.localeCompare(b.id);
          })
          .map((p) => p.id);
        ordering.set(nodeId, defaultOrder);
      }
    }

    return ordering;
  }

  /**
   * Compute optimal port order to minimize crossings
   */
  private static computeOptimalPortOrder(
    nodePorts: PortInfo[],
    portAssignments: Map<string, PortSide>,
    nodePositions: Map<string, { x: number; y: number }>,
    links: Array<{ sourcePortId?: string; targetPortId?: string }>,
    options: PortAwareLayoutOptions
  ): string[] {
    // Group ports by side
    const portsBySide = new Map<PortSide, PortInfo[]>();
    for (const port of nodePorts) {
      const side = portAssignments.get(port.id) || 'top';
      if (!portsBySide.has(side)) {
        portsBySide.set(side, []);
      }
      portsBySide.get(side)!.push(port);
    }

    const orderedPorts: string[] = [];

    // Order ports on each side
    for (const [side, ports] of portsBySide) {
      let sideOrder: PortInfo[];

      if (options.orderingStrategy === 'minimize-crossings') {
        sideOrder = this.orderByMinimizingCrossings(ports, links, nodePositions, side);
      } else if (options.orderingStrategy === 'connection-based') {
        sideOrder = this.orderByConnections(ports, links, nodePositions, side);
      } else if (options.orderingStrategy === 'group-based') {
        sideOrder = this.orderByGroups(ports);
      } else {
        // Manual or default
        sideOrder = [...ports];
      }

      orderedPorts.push(...sideOrder.map((p) => p.id));
    }

    return orderedPorts;
  }

  /**
   * Order ports to minimize edge crossings
   */
  private static orderByMinimizingCrossings(
    ports: PortInfo[],
    links: Array<{ sourcePortId?: string; targetPortId?: string }>,
    nodePositions: Map<string, { x: number; y: number }>,
    side: PortSide
  ): PortInfo[] {
    // Use barycenter method for crossing minimization
    const barycenters = new Map<string, number>();

    for (const port of ports) {
      // Calculate average position of connected ports
      const connectedPorts = this.getConnectedPorts(port.id, links);
      if (connectedPorts.length === 0) {
        barycenters.set(port.id, 0);
        continue;
      }

      let sum = 0;
      for (const connectedPortId of connectedPorts) {
        // Get position based on side
        const portInfo = ports.find((p) => p.id === connectedPortId);
        if (portInfo) {
          const nodePos = nodePositions.get(portInfo.nodeId);
          if (nodePos) {
            // Use the appropriate coordinate based on side
            if (side === 'left' || side === 'right') {
              sum += nodePos.y;
            } else {
              sum += nodePos.x;
            }
          }
        }
      }

      barycenters.set(port.id, sum / connectedPorts.length);
    }

    // Sort by barycenter
    return ports.sort((a, b) => {
      const bcA = barycenters.get(a.id) || 0;
      const bcB = barycenters.get(b.id) || 0;
      return bcA - bcB;
    });
  }

  /**
   * Order ports based on their connections
   */
  private static orderByConnections(
    ports: PortInfo[],
    links: Array<{ sourcePortId?: string; targetPortId?: string }>,
    nodePositions: Map<string, { x: number; y: number }>,
    side: PortSide
  ): PortInfo[] {
    // Similar to crossing minimization but considers connectivity strength
    return this.orderByMinimizingCrossings(ports, links, nodePositions, side);
  }

  /**
   * Order ports by their group membership
   */
  private static orderByGroups(ports: PortInfo[]): PortInfo[] {
    return ports.sort((a, b) => {
      // Group together, then by priority, then by ID
      const groupCompare = (a.group || '').localeCompare(b.group || '');
      if (groupCompare !== 0) return groupCompare;

      const priorityA = a.priority || 0;
      const priorityB = b.priority || 0;
      if (priorityA !== priorityB) return priorityB - priorityA; // Higher priority first

      return a.id.localeCompare(b.id);
    });
  }

  /**
   * Calculate physical port positions on nodes
   */
  static calculatePortPositions(
    ports: PortInfo[],
    portAssignments: Map<string, PortSide>,
    portOrdering: Map<string, string[]>,
    nodeSizes: Map<string, { width: number; height: number }>,
    options: PortAwareLayoutOptions
  ): Map<string, { x: number; y: number; side: PortSide }> {
    const positions = new Map<string, { x: number; y: number; side: PortSide }>();
    const spacing = options.portSpacing || this.DEFAULT_PORT_SPACING;

    // Group ports by node
    const portsByNode = this.groupPortsByNode(ports);

    for (const [nodeId, nodePorts] of portsByNode) {
      const nodeSize = nodeSizes.get(nodeId) || { width: 100, height: 100 };
      const order = portOrdering.get(nodeId) || nodePorts.map((p) => p.id);

      // Group by side
      const portsBySide = new Map<PortSide, string[]>();
      for (const portId of order) {
        const side = portAssignments.get(portId) || 'top';
        if (!portsBySide.has(side)) {
          portsBySide.set(side, []);
        }
        portsBySide.get(side)!.push(portId);
      }

      // Calculate positions for each side
      for (const [side, portIds] of portsBySide) {
        this.positionPortsOnSide(portIds, side, nodeSize, spacing, positions);
      }
    }

    return positions;
  }

  /**
   * Position ports evenly along a node side
   */
  private static positionPortsOnSide(
    portIds: string[],
    side: PortSide,
    nodeSize: { width: number; height: number },
    spacing: number,
    positions: Map<string, { x: number; y: number; side: PortSide }>
  ): void {
    const count = portIds.length;
    if (count === 0) return;

    for (let i = 0; i < count; i++) {
      const portId = portIds[i];
      let x = 0;
      let y = 0;

      switch (side) {
        case 'left':
          x = -nodeSize.width / 2;
          y = this.distributeAlongAxis(i, count, nodeSize.height, spacing);
          break;

        case 'right':
          x = nodeSize.width / 2;
          y = this.distributeAlongAxis(i, count, nodeSize.height, spacing);
          break;

        case 'top':
          x = this.distributeAlongAxis(i, count, nodeSize.width, spacing);
          y = -nodeSize.height / 2;
          break;

        case 'bottom':
          x = this.distributeAlongAxis(i, count, nodeSize.width, spacing);
          y = nodeSize.height / 2;
          break;
      }

      positions.set(portId, { x, y, side });
    }
  }

  /**
   * Distribute ports evenly along an axis
   */
  private static distributeAlongAxis(
    index: number,
    total: number,
    axisLength: number,
    spacing: number
  ): number {
    if (total === 1) {
      return 0; // Center single port
    }

    // Calculate even distribution
    const segment = axisLength / (total + 1);
    return -axisLength / 2 + segment * (index + 1);
  }

  /**
   * Group ports by their parent node
   */
  private static groupPortsByNode(ports: PortInfo[]): Map<string, PortInfo[]> {
    const grouped = new Map<string, PortInfo[]>();

    for (const port of ports) {
      if (!grouped.has(port.nodeId)) {
        grouped.set(port.nodeId, []);
      }
      grouped.get(port.nodeId)!.push(port);
    }

    return grouped;
  }

  /**
   * Get ports connected to a given port
   */
  private static getConnectedPorts(
    portId: string,
    links: Array<{ sourcePortId?: string; targetPortId?: string }>
  ): string[] {
    const connected: string[] = [];

    for (const link of links) {
      if (link.sourcePortId === portId && link.targetPortId) {
        connected.push(link.targetPortId);
      }
      if (link.targetPortId === portId && link.sourcePortId) {
        connected.push(link.sourcePortId);
      }
    }

    return connected;
  }

  /**
   * Count edge crossings for a given port configuration
   */
  static countEdgeCrossings(
    portPositions: Map<string, { x: number; y: number; side: PortSide }>,
    nodePositions: Map<string, { x: number; y: number }>,
    links: Array<{ sourcePortId?: string; targetPortId?: string }>
  ): number {
    let crossings = 0;

    // Check each pair of links
    for (let i = 0; i < links.length; i++) {
      for (let j = i + 1; j < links.length; j++) {
        if (this.linksIntersect(links[i], links[j], portPositions, nodePositions)) {
          crossings++;
        }
      }
    }

    return crossings;
  }

  /**
   * Check if two links intersect
   */
  private static linksIntersect(
    link1: { sourcePortId?: string; targetPortId?: string },
    link2: { sourcePortId?: string; targetPortId?: string },
    portPositions: Map<string, { x: number; y: number; side: PortSide }>,
    nodePositions: Map<string, { x: number; y: number }>
  ): boolean {
    const l1Start = this.getLinkEndpoint(link1, 'source', portPositions, nodePositions);
    const l1End = this.getLinkEndpoint(link1, 'target', portPositions, nodePositions);
    const l2Start = this.getLinkEndpoint(link2, 'source', portPositions, nodePositions);
    const l2End = this.getLinkEndpoint(link2, 'target', portPositions, nodePositions);

    if (!l1Start || !l1End || !l2Start || !l2End) {
      return false;
    }

    return this.lineSegmentsIntersect(l1Start, l1End, l2Start, l2End);
  }

  /**
   * Get absolute position of link endpoint (port or node center)
   */
  private static getLinkEndpoint(
    link: { sourcePortId?: string; targetPortId?: string },
    end: 'source' | 'target',
    portPositions: Map<string, { x: number; y: number; side: PortSide }>,
    nodePositions: Map<string, { x: number; y: number }>
  ): { x: number; y: number } | null {
    const portId = end === 'source' ? link.sourcePortId : link.targetPortId;

    if (!portId) {
      return null;
    }

    // Try to get port position
    const portPos = portPositions.get(portId);
    if (portPos) {
      // Find the node this port belongs to
      // For now, return the port's relative position
      // In real implementation, this should be absolute
      return { x: portPos.x, y: portPos.y };
    }

    return null;
  }

  /**
   * Check if two line segments intersect
   */
  private static lineSegmentsIntersect(
    p1: { x: number; y: number },
    p2: { x: number; y: number },
    p3: { x: number; y: number },
    p4: { x: number; y: number }
  ): boolean {
    const ccw = (a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }) => {
      return (c.y - a.y) * (b.x - a.x) > (b.y - a.y) * (c.x - a.x);
    };

    return ccw(p1, p3, p4) !== ccw(p2, p3, p4) && ccw(p1, p2, p3) !== ccw(p1, p2, p4);
  }

  /**
   * Generate complete port-aware layout result
   */
  static computePortLayout(
    ports: PortInfo[],
    nodePositions: Map<string, { x: number; y: number }>,
    nodeSizes: Map<string, { width: number; height: number }>,
    links: Array<{ sourcePortId?: string; targetPortId?: string }>,
    options: PortAwareLayoutOptions
  ): PortAwareLayoutResult {
    // Assign sides
    const portAssignments = this.assignPortSides(ports, nodePositions, options);

    // Order ports
    const portOrdering = this.orderPorts(ports, portAssignments, nodePositions, links, options);

    // Calculate positions
    const portPositions = this.calculatePortPositions(
      ports,
      portAssignments,
      portOrdering,
      nodeSizes,
      options
    );

    // Count crossings
    const edgeCrossings = this.countEdgeCrossings(portPositions, nodePositions, links);

    // Track what was auto-assigned/ordered
    const autoAssignedPorts = options.autoAssignSides
      ? ports.filter((p) => !p.preferredSide).map((p) => p.id)
      : [];

    const autoOrderedPorts = options.autoOrderPorts
      ? Array.from(portOrdering.keys()).filter((nodeId) => !options.portOrdering?.[nodeId])
      : [];

    return {
      portAssignments,
      portOrdering,
      portPositions,
      edgeCrossings,
      wasOptimized: options.autoAssignSides || options.autoOrderPorts || false,
      autoAssignedPorts,
      autoOrderedPorts,
    };
  }
}
