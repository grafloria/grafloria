/**
 * Node Template System - Type Definitions
 *
 * Provides declarative, JSON-driven node creation with support for:
 * - Hierarchical node structures (parent/children)
 * - Flexible port configuration
 * - HTML and SVG rendering modes
 * - Data binding and repeaters
 * - Layout management (flexbox/grid)
 */

// Import types from their canonical locations
import type { PositioningMode } from '../models/NodeModel';
import type { ValidationResult } from '../types/model.types';
import type { ConnectionValidator } from '../state/ConnectionStateManager';
// Wave 6 (Ports & connections): the declarative port vocabulary.
import type { PortGroupDefinition, PortLabelSpec, PortShapeSpec } from '../ports/port-types';
import type {
  FlexboxLayoutConfig,
  GridLayoutConfig,
  LayoutConfig,
} from '../types/layout.types';

/**
 * Port rendering mode
 */
export type PortRenderingMode = 'svg' | 'html' | 'auto';

/**
 * Port visibility strategy
 */
export type PortVisibility = 'always' | 'on-hover' | 'never';

/**
 * Flexbox direction
 */
export type FlexDirection = 'row' | 'column' | 'row-reverse' | 'column-reverse';

/**
 * Node role in hierarchy
 */
export type NodeRole = 'container' | 'drag-handler' | 'content' | 'repeater';

/**
 * Shape type for SVG rendering.
 *
 * The five originals (rect/circle/ellipse/diamond/hexagon) plus the extended
 * flowchart / BPMN / UML / ERD figure library. Every value here has a matching
 * ShapeDefinition in the renderer's shape registry (libs/renderer/src/svg/
 * shape-registry.ts); adding a shape means: register its geometry there and add
 * its name here. A few widely-used aliases (database, stadium, data …) are
 * included so callers can type the vocabulary they already know.
 */
export type ShapeType =
  // originals
  | 'rect'
  | 'circle'
  | 'ellipse'
  | 'diamond'
  | 'hexagon'
  // extended figure library
  | 'parallelogram'
  | 'parallelogram-top'
  | 'trapezoid'
  | 'trapezoid-bottom'
  | 'triangle'
  | 'triangle-down'
  | 'package'
  | 'cube'
  | 'document'
  | 'cylinder'
  | 'cloud'
  | 'predefined-process'
  | 'component'
  | 'note'
  | 'terminal'
  | 'actor'
  // common aliases
  | 'database'
  | 'stadium'
  | 'data'
  | 'subroutine'
  | 'folder';

/**
 * Shape configuration for SVG node rendering (Phase 3.1)
 * Defines the geometric shape of the node in the SVG layer
 */
export interface ShapeConfig {
  /**
   * Shape type
   */
  type: ShapeType;

  /**
   * Fill color (CSS color)
   */
  fill?: string;

  /**
   * Stroke color (CSS color)
   */
  stroke?: string;

  /**
   * Stroke width in pixels
   */
  strokeWidth?: number;

  /**
   * Corner radius for rectangles (in pixels)
   */
  cornerRadius?: number;

  /**
   * Opacity (0-1)
   */
  opacity?: number;
}

/**
 * Port configuration for a specific side
 */
export interface PortConfig {
  enabled: boolean;
  visibility?: PortVisibility;
  type?: 'input' | 'output' | 'bi';
  maxConnections?: number;
}

/**
 * Port rendering configuration
 */
export interface PortRenderingConfig {
  /**
   * Rendering mode: 'svg', 'html', or 'auto'
   */
  mode: PortRenderingMode;

  /**
   * Port size
   */
  size?: {
    width: number;
    height: number;
    hoverScale?: number;
  };

  /**
   * HTML-specific configuration
   */
  html?: {
    component?: string;
    className?: string | string[];
    style?: Record<string, any>;
    zIndex?: number;
  };

  /**
   * SVG-specific configuration
   */
  svg?: {
    shape?: 'circle' | 'rect' | 'custom';
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
  };

  /**
   * Visibility configuration
   */
  visibility?: {
    default?: PortVisibility;
    showOnNodeHover?: boolean;
    showOnNodeSelected?: boolean;
  };
}

/**
 * Drag handler configuration
 */
export interface DragHandlerConfig {
  isDragHandler: boolean;
  dragChildren?: boolean;
  snapToGrid?: boolean;
  gridSize?: number;
}


/**
 * Ports configuration
 */
/**
 * Wave 6 (Card 3): one member of a named port group. It declares its id and
 * ONLY the fields that differ from the group — side, shape, label config,
 * gating and data type all inherit.
 */
export interface PortGroupMemberSpec {
  id: string;
  index?: number;
  type?: 'input' | 'output' | 'bi';
  side?: 'left' | 'right' | 'top' | 'bottom';
  label?: PortLabelSpec;
  shape?: PortShapeSpec;
  dataType?: string;
  style?: Record<string, unknown>;
}

/**
 * A named port group on a template, plus its members.
 *
 * This is what replaces the four `top`/`right`/`bottom`/`left` slots below —
 * those could say "there is a port on the left" and nothing more, so the shape
 * every real node editor needs ("eight typed, labelled inputs down the left
 * edge, each capped at one incoming link") was simply not expressible.
 */
export interface PortGroupSpec extends PortGroupDefinition {
  ports?: PortGroupMemberSpec[];
}

export interface PortsConfig {
  enabled?: boolean;
  defaultVisibility?: PortVisibility;
  rendering?: PortRenderingConfig;
  /** Wave 6 (Card 3). When present, the four side slots below are not consulted. */
  groups?: PortGroupSpec[];
  top?: PortConfig;
  right?: PortConfig;
  bottom?: PortConfig;
  left?: PortConfig;
}

/**
 * HTML rendering configuration
 * Phase 3.4: Enhanced to support LemonadeJS templates for framework-agnostic rendering
 */
export interface HtmlConfig {
  /**
   * Rendering mode
   * - 'component': Reference to a framework-specific component (Angular, React, etc.)
   * - 'template': LemonadeJS template string (framework-agnostic)
   */
  mode?: 'component' | 'template';

  /**
   * Component reference (for mode='component')
   * Used when integrating with framework-specific components
   */
  component?: string;

  /**
   * LemonadeJS template string (for mode='template')
   * HTML string with LemonadeJS binding syntax
   * Example: '<div>{{data.name}}</div>'
   *
   * Phase 3.4: Framework-agnostic HTML templates
   */
  template?: string;

  /**
   * CSS classes to apply
   */
  className?: string | string[];

  /**
   * Inline styles
   */
  style?: Record<string, any>;

  /**
   * Data bindings (property mappings)
   * Maps template variables to node data paths
   * Example: { userName: 'data.user.name', count: 'data.items.length' }
   */
  bindings?: Record<string, string>;

  /**
   * Event handlers
   * Maps DOM events to engine event names
   * Example: { click: 'node:clicked', input: 'node:valueChanged' }
   *
   * Phase 3.4: Events are emitted through the engine's EventBus
   * Handler signature: (nodeId: string, eventData: any) => void
   */
  events?: Record<string, string>;

  /**
   * Z-index for HTML layer positioning
   */
  zIndex?: number;

  /**
   * Whether to enable pointer events
   * If false, the HTML layer won't capture mouse events (pass-through to SVG)
   */
  pointerEvents?: boolean;
}

/**
 * Data binding configuration
 */
export interface DataBindConfig {
  bindings?: Record<string, string>;
  condition?: string;
}

/**
 * Repeater configuration for dynamic children
 */
export interface RepeaterConfig {
  dataSource: string;
  itemTemplate: NodeStructureDefinition;
  keyField?: string;
}

/**
 * Node structure definition (recursive)
 */
export interface NodeStructureDefinition {
  type: string;
  role?: NodeRole;

  size?: {
    width?: number | string;
    height?: number | string;
    minWidth?: number;
    maxWidth?: number;
    minHeight?: number;
    maxHeight?: number;
  };

  /**
   * Shape configuration for SVG rendering (Phase 3.1)
   * Defines the geometric shape of the node
   * If not specified, defaults to rectangle
   */
  shape?: ShapeConfig;

  layout?: LayoutConfig;

  ports?: PortsConfig;

  behavior?: {
    draggable?: boolean;
    dragHandler?: DragHandlerConfig;
    selectable?: boolean;
    connectable?: boolean;
    resizable?: boolean;
    deletable?: boolean;
  };

  connectionGroup?: string;

  connectionRestrictions?: {
    allowedGroups?: string[];
    disallowedGroups?: string[];
    customValidatorId?: string;
  };

  html?: HtmlConfig;

  dataBind?: DataBindConfig;

  className?: string;
  style?: Record<string, any>;

  children?: NodeStructureDefinition[];

  repeater?: RepeaterConfig;
}

/**
 * Template metadata
 */
export interface TemplateMetadata {
  name: string;
  description?: string;
  category: string;
  icon?: string;
  preview?: string;
  tags?: string[];
  author?: string;
  license?: string;
}

/**
 * Node template definition
 */
export interface NodeTemplate {
  /**
   * Unique template identifier
   */
  id: string;

  /**
   * Template version (semver)
   */
  version: string;

  /**
   * Template metadata
   */
  meta: TemplateMetadata;

  /**
   * Root node structure
   */
  structure: NodeStructureDefinition;

  /**
   * Data schema for validation (JSON Schema)
   */
  dataSchema?: Record<string, any>;

  /**
   * Default data values
   */
  defaultData?: Record<string, any>;

  /**
   * Style presets
   */
  styles?: Record<string, any>;
}

// ValidationResult and ConnectionValidator are imported from their canonical locations above
// Re-export them for convenience
export type { ValidationResult, ConnectionValidator };
