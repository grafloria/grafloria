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

/**
 * Port rendering mode
 */
export type PortRenderingMode = 'svg' | 'html' | 'auto';

/**
 * Port visibility strategy
 */
export type PortVisibility = 'always' | 'on-hover' | 'never';

/**
 * Positioning mode for nodes
 */
export type PositioningMode = 'absolute' | 'relative' | 'layout';

/**
 * Flexbox direction
 */
export type FlexDirection = 'row' | 'column' | 'row-reverse' | 'column-reverse';

/**
 * Node role in hierarchy
 */
export type NodeRole = 'container' | 'drag-handler' | 'content' | 'repeater';

/**
 * Shape type for SVG rendering (Phase 3.1)
 */
export type ShapeType = 'rect' | 'circle' | 'ellipse' | 'diamond' | 'hexagon';

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
 * Flexbox layout configuration
 */
export interface FlexLayoutConfig {
  type: 'flexbox';
  direction: FlexDirection;
  gap?: number;
  padding?: { top: number; right: number; bottom: number; left: number };
  alignItems?: string;
  justifyContent?: string;
}

/**
 * Grid layout configuration (future)
 */
export interface GridLayoutConfig {
  type: 'grid';
  columns?: number;
  rows?: number;
  gap?: number;
  padding?: { top: number; right: number; bottom: number; left: number };
}

/**
 * Layout configuration union
 */
export type LayoutConfig = FlexLayoutConfig | GridLayoutConfig;

/**
 * Ports configuration
 */
export interface PortsConfig {
  enabled?: boolean;
  defaultVisibility?: PortVisibility;
  rendering?: PortRenderingConfig;
  top?: PortConfig;
  right?: PortConfig;
  bottom?: PortConfig;
  left?: PortConfig;
}

/**
 * HTML rendering configuration
 */
export interface HtmlConfig {
  component: string;
  className?: string | string[];
  style?: Record<string, any>;
  bindings?: Record<string, string>;
  events?: Record<string, string>;
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

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors?: string[];
}

/**
 * Connection validator function
 */
export type ConnectionValidator = (
  sourceNode: any,
  targetNode: any
) => boolean;
