// Layout configuration type definitions (Phase 1.7)
// These types define CSS Flexbox/Grid configurations that are stored in the engine
// and applied by renderers (HTML/SVG use native CSS, Canvas/WebGL use layout libraries)

/**
 * Layout type for containers
 */
export type LayoutType = 'none' | 'flexbox' | 'grid';

/**
 * Flexbox container configuration
 * Maps directly to CSS Flexbox properties
 */
export interface FlexboxLayoutConfig {
  /** Main axis direction */
  direction: 'row' | 'column' | 'row-reverse' | 'column-reverse';

  /** Whether items wrap to multiple lines */
  wrap: 'nowrap' | 'wrap' | 'wrap-reverse';

  /** Main axis alignment */
  justifyContent: 'start' | 'center' | 'end' | 'space-between' | 'space-around' | 'space-evenly';

  /** Cross axis alignment */
  alignItems: 'start' | 'center' | 'end' | 'stretch' | 'baseline';

  /** Multi-line cross axis alignment */
  alignContent: 'start' | 'center' | 'end' | 'space-between' | 'space-around' | 'stretch';

  /** Gap between items (px) */
  gap: number | { row: number; column: number };

  /** Padding inside container (px) */
  padding?: number | { top: number; right: number; bottom: number; left: number };

  /** Column-based layout (like Bootstrap 12-column grid) */
  columns?: number; // e.g., 12 for 12-column layout, child nodes use columnSpan metadata
}

/**
 * Grid container configuration
 * Maps directly to CSS Grid properties
 */
export interface GridLayoutConfig {
  /** Column track definitions (e.g., "repeat(3, 1fr)", "100px 200px auto") */
  templateColumns: string;

  /** Row track definitions */
  templateRows: string;

  /** Named grid areas */
  templateAreas?: string[];

  /** Gap between columns (px) */
  columnGap: number;

  /** Gap between rows (px) */
  rowGap: number;

  /** Auto-placement algorithm */
  autoFlow: 'row' | 'column' | 'dense';

  /** Auto-generated column size */
  autoColumns?: string;

  /** Auto-generated row size */
  autoRows?: string;

  /** Horizontal alignment of items within cells */
  justifyItems?: 'start' | 'center' | 'end' | 'stretch';

  /** Vertical alignment of items within cells */
  alignItems?: 'start' | 'center' | 'end' | 'stretch';

  /** Horizontal alignment of grid within container */
  justifyContent?: 'start' | 'center' | 'end' | 'space-between' | 'space-around' | 'space-evenly';

  /** Vertical alignment of grid within container */
  alignContent?: 'start' | 'center' | 'end' | 'space-between' | 'space-around' | 'space-evenly';

  /** Padding inside container (px) */
  padding?: number | { top: number; right: number; bottom: number; left: number };
}

/**
 * Flexbox item configuration
 * Applied to nodes inside a flexbox container
 */
export interface FlexItemConfig {
  /** Display order (default: 0) */
  order?: number;

  /** Growth factor (default: 0) */
  flexGrow?: number;

  /** Shrink factor (default: 1) */
  flexShrink?: number;

  /** Base size before growing/shrinking (default: 'auto') */
  flexBasis?: number | 'auto';

  /** Override container's align-items for this item */
  alignSelf?: 'auto' | 'start' | 'center' | 'end' | 'stretch' | 'baseline';
}

/**
 * Grid item configuration
 * Applied to nodes inside a grid container
 */
export interface GridItemConfig {
  /** Starting column line (1-based or 'auto') */
  columnStart?: number | 'auto';

  /** Ending column line (1-based or 'auto') */
  columnEnd?: number | 'auto';

  /** Starting row line (1-based or 'auto') */
  rowStart?: number | 'auto';

  /** Ending row line (1-based or 'auto') */
  rowEnd?: number | 'auto';

  /** Named grid area to place item in */
  gridArea?: string;

  /** Override container's justify-items for this item */
  justifySelf?: 'auto' | 'start' | 'center' | 'end' | 'stretch';

  /** Override container's align-items for this item */
  alignSelf?: 'auto' | 'start' | 'center' | 'end' | 'stretch';
}

/**
 * Union type for all layout configurations
 */
export type LayoutConfig = FlexboxLayoutConfig | GridLayoutConfig;

/**
 * Serialized layout configuration
 */
export interface SerializedLayoutConfig {
  type: LayoutType;
  config?: LayoutConfig;
}

/**
 * Serialized flex item configuration
 */
export interface SerializedFlexItemConfig {
  order?: number;
  flexGrow?: number;
  flexShrink?: number;
  flexBasis?: number | 'auto';
  alignSelf?: string;
}

/**
 * Serialized grid item configuration
 */
export interface SerializedGridItemConfig {
  columnStart?: number | 'auto';
  columnEnd?: number | 'auto';
  rowStart?: number | 'auto';
  rowEnd?: number | 'auto';
  gridArea?: string;
  justifySelf?: string;
  alignSelf?: string;
}

/**
 * Default flexbox configuration
 */
export const DEFAULT_FLEXBOX_CONFIG: FlexboxLayoutConfig = {
  direction: 'row',
  wrap: 'nowrap',
  justifyContent: 'start',
  alignItems: 'stretch',
  alignContent: 'stretch',
  gap: 0,
};

/**
 * Default grid configuration
 */
export const DEFAULT_GRID_CONFIG: GridLayoutConfig = {
  templateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
  templateRows: 'auto',
  columnGap: 0,
  rowGap: 0,
  autoFlow: 'row',
};
