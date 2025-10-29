/**
 * Layout Presets Library
 *
 * Pre-configured layout settings for common diagram scenarios.
 * Includes both layout options and constraint configurations.
 */

import { DagreLayoutOptions } from './dagre-layout-adapter';
import { ELKLayoutOptions } from './elk-layout-adapter';
import { LayoutConstraints } from './layout-constraints.interface';
import { IncrementalLayoutOptions } from './incremental-layout.interface';

/**
 * Layout preset configuration
 */
export interface LayoutPreset {
  /** Unique identifier for the preset */
  id: string;

  /** Human-readable name */
  name: string;

  /** Description of when to use this preset */
  description: string;

  /** Which adapter to use */
  adapter: 'dagre' | 'elk';

  /** Layout options for the adapter */
  options: Partial<DagreLayoutOptions> | Partial<ELKLayoutOptions>;

  /** Optional pre-configured constraints */
  constraints?: LayoutConstraints;

  /** Optional incremental layout settings */
  incrementalOptions?: Partial<IncrementalLayoutOptions>;

  /** Tags for categorization */
  tags?: string[];
}

/**
 * Category of layout presets
 */
export interface LayoutPresetCategory {
  /** Category name */
  name: string;

  /** Category description */
  description: string;

  /** Presets in this category */
  presets: LayoutPreset[];
}

/**
 * Predefined layout presets for common scenarios
 */
export class LayoutPresets {
  /**
   * Organizational/Hierarchical Layouts
   */
  static readonly HIERARCHICAL: LayoutPresetCategory = {
    name: 'Hierarchical Layouts',
    description: 'Top-down or left-right hierarchies, org charts, and tree structures',
    presets: [
      {
        id: 'org-chart-compact',
        name: 'Org Chart (Compact)',
        description: 'Compact organizational chart with tight spacing',
        adapter: 'dagre',
        options: {
          rankdir: 'TB',
          nodesep: 40,
          ranksep: 60,
          ranker: 'tight-tree',
        },
        tags: ['hierarchy', 'org-chart', 'compact'],
      },
      {
        id: 'org-chart-spacious',
        name: 'Org Chart (Spacious)',
        description: 'Organizational chart with generous spacing for readability',
        adapter: 'dagre',
        options: {
          rankdir: 'TB',
          nodesep: 100,
          ranksep: 120,
          ranker: 'network-simplex',
        },
        tags: ['hierarchy', 'org-chart', 'spacious'],
      },
      {
        id: 'tree-left-to-right',
        name: 'Tree (Left to Right)',
        description: 'Decision tree or file system hierarchy flowing left to right',
        adapter: 'elk',
        options: {
          algorithm: 'mrtree',
          'elk.direction': 'RIGHT',
          'elk.spacing.nodeNode': 60,
        },
        tags: ['tree', 'horizontal'],
      },
      {
        id: 'tree-top-to-bottom',
        name: 'Tree (Top to Bottom)',
        description: 'Classic tree structure flowing from top to bottom',
        adapter: 'elk',
        options: {
          algorithm: 'mrtree',
          'elk.direction': 'DOWN',
          'elk.spacing.nodeNode': 50,
        },
        tags: ['tree', 'vertical'],
      },
    ],
  };

  /**
   * Process/Flow Layouts
   */
  static readonly FLOW: LayoutPresetCategory = {
    name: 'Flow Layouts',
    description: 'Sequential processes, workflows, and state machines',
    presets: [
      {
        id: 'workflow-horizontal',
        name: 'Workflow (Horizontal)',
        description: 'Left-to-right workflow with clear step progression',
        adapter: 'dagre',
        options: {
          rankdir: 'LR',
          nodesep: 70,
          ranksep: 150,
          ranker: 'longest-path',
        },
        tags: ['workflow', 'process', 'horizontal'],
      },
      {
        id: 'workflow-vertical',
        name: 'Workflow (Vertical)',
        description: 'Top-to-bottom workflow for vertical displays',
        adapter: 'dagre',
        options: {
          rankdir: 'TB',
          nodesep: 60,
          ranksep: 100,
          ranker: 'network-simplex',
        },
        tags: ['workflow', 'process', 'vertical'],
      },
      {
        id: 'state-machine',
        name: 'State Machine',
        description: 'State machine diagram with optimized edge routing',
        adapter: 'elk',
        options: {
          algorithm: 'layered',
          'elk.direction': 'RIGHT',
          'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
          'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
          'elk.spacing.nodeNode': 80,
        },
        tags: ['state-machine', 'fsm'],
      },
    ],
  };

  /**
   * Network/Graph Layouts
   */
  static readonly NETWORK: LayoutPresetCategory = {
    name: 'Network Layouts',
    description: 'Network topologies, dependency graphs, and social networks',
    presets: [
      {
        id: 'force-directed-balanced',
        name: 'Force-Directed (Balanced)',
        description: 'Balanced force-directed layout for general networks',
        adapter: 'elk',
        options: {
          algorithm: 'force',
          'elk.force.repulsion': 150,
          'elk.force.temperature': 0.5,
          'elk.force.iterations': 300,
        },
        tags: ['network', 'force', 'graph'],
      },
      {
        id: 'force-directed-tight',
        name: 'Force-Directed (Tight)',
        description: 'Compact force-directed layout for dense networks',
        adapter: 'elk',
        options: {
          algorithm: 'force',
          'elk.force.repulsion': 80,
          'elk.force.temperature': 0.3,
          'elk.force.iterations': 400,
        },
        tags: ['network', 'force', 'compact'],
      },
      {
        id: 'radial-center',
        name: 'Radial (Center Focus)',
        description: 'Radial layout with central hub and surrounding nodes',
        adapter: 'elk',
        options: {
          algorithm: 'radial',
          'elk.radial.radius': 200,
          'elk.radial.compaction': true,
        },
        tags: ['radial', 'hub', 'network'],
      },
      {
        id: 'stress-minimization',
        name: 'Stress Minimization',
        description: 'Optimized stress-based layout for complex networks',
        adapter: 'elk',
        options: {
          algorithm: 'stress',
          'elk.spacing.nodeNode': 100,
        },
        tags: ['stress', 'network', 'optimization'],
      },
    ],
  };

  /**
   * Architecture/System Layouts
   */
  static readonly ARCHITECTURE: LayoutPresetCategory = {
    name: 'Architecture Layouts',
    description: 'System architectures, microservices, and component diagrams',
    presets: [
      {
        id: 'microservices-layered',
        name: 'Microservices (Layered)',
        description: 'Layered microservices architecture with clear separation',
        adapter: 'elk',
        options: {
          algorithm: 'layered',
          'elk.direction': 'RIGHT',
          'elk.spacing.nodeNode': 120,
          'elk.layered.spacing.nodeNodeBetweenLayers': 150,
          'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
        },
        tags: ['microservices', 'architecture', 'layered'],
      },
      {
        id: 'component-diagram',
        name: 'Component Diagram',
        description: 'Component architecture with dependency flow',
        adapter: 'dagre',
        options: {
          rankdir: 'TB',
          nodesep: 90,
          ranksep: 110,
          ranker: 'network-simplex',
        },
        tags: ['components', 'architecture'],
      },
      {
        id: 'data-flow',
        name: 'Data Flow',
        description: 'Data pipeline with clear flow direction',
        adapter: 'dagre',
        options: {
          rankdir: 'LR',
          nodesep: 80,
          ranksep: 140,
          ranker: 'longest-path',
          edgesep: 20,
        },
        tags: ['data-flow', 'pipeline'],
      },
    ],
  };

  /**
   * Interactive/Dashboard Layouts
   */
  static readonly INTERACTIVE: LayoutPresetCategory = {
    name: 'Interactive Layouts',
    description: 'Layouts optimized for interactive editing and dashboards',
    presets: [
      {
        id: 'dashboard-pinned',
        name: 'Dashboard (Pinned Header)',
        description: 'Dashboard layout with pinned header and sidebar',
        adapter: 'dagre',
        options: {
          rankdir: 'TB',
          nodesep: 70,
          ranksep: 90,
        },
        incrementalOptions: {
          strategy: 'pin-existing',
        },
        tags: ['dashboard', 'interactive', 'pinned'],
      },
      {
        id: 'incremental-minimal',
        name: 'Incremental (Minimal Movement)',
        description: 'Add nodes with minimal disruption to existing layout',
        adapter: 'elk',
        options: {
          algorithm: 'layered',
          'elk.direction': 'DOWN',
        },
        incrementalOptions: {
          strategy: 'minimal-shift',
          maxShift: 30,
        },
        tags: ['incremental', 'minimal-movement'],
      },
      {
        id: 'incremental-proximity',
        name: 'Incremental (Proximity-Aware)',
        description: 'Adjust nearby nodes, pin distant ones',
        adapter: 'dagre',
        options: {
          rankdir: 'TB',
        },
        incrementalOptions: {
          strategy: 'proximity-aware',
          proximityRadius: 250,
        },
        tags: ['incremental', 'proximity'],
      },
    ],
  };

  /**
   * Get all preset categories
   */
  static getAllCategories(): LayoutPresetCategory[] {
    return [
      this.HIERARCHICAL,
      this.FLOW,
      this.NETWORK,
      this.ARCHITECTURE,
      this.INTERACTIVE,
    ];
  }

  /**
   * Get all presets across all categories
   */
  static getAllPresets(): LayoutPreset[] {
    const allPresets: LayoutPreset[] = [];
    this.getAllCategories().forEach(category => {
      allPresets.push(...category.presets);
    });
    return allPresets;
  }

  /**
   * Find preset by ID
   */
  static findPreset(id: string): LayoutPreset | undefined {
    return this.getAllPresets().find(preset => preset.id === id);
  }

  /**
   * Find presets by tag
   */
  static findPresetsByTag(tag: string): LayoutPreset[] {
    return this.getAllPresets().filter(preset =>
      preset.tags?.includes(tag)
    );
  }

  /**
   * Find presets by adapter type
   */
  static findPresetsByAdapter(adapter: 'dagre' | 'elk'): LayoutPreset[] {
    return this.getAllPresets().filter(preset =>
      preset.adapter === adapter
    );
  }

  /**
   * Search presets by name or description
   */
  static searchPresets(query: string): LayoutPreset[] {
    const lowerQuery = query.toLowerCase();
    return this.getAllPresets().filter(preset =>
      preset.name.toLowerCase().includes(lowerQuery) ||
      preset.description.toLowerCase().includes(lowerQuery)
    );
  }
}
