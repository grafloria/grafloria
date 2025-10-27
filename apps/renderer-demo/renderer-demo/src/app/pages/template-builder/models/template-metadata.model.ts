import { NodeTemplate } from '@grafloria/engine';

/**
 * Extended Template Metadata
 *
 * Enhanced metadata for template gallery and management.
 * Extends base NodeTemplate with discovery, usage, and user data.
 *
 * Phase 9: Template Gallery & Management
 */
export interface TemplateMetadata {
  // ==================== Core Metadata ====================
  /** Unique template identifier */
  id: string;

  /** Display name */
  name: string;

  /** Detailed description */
  description: string;

  /** Version string (semver) */
  version: string;

  /** Primary category */
  category: TemplateCategory;

  /** Search tags */
  tags: string[];

  /** Template author */
  author: string;

  // ==================== Visual & Discovery ====================
  /** Base64 encoded thumbnail or URL */
  thumbnail?: string;

  /** Sample data for preview rendering */
  previewData?: any;

  /** Complexity level for filtering */
  complexity: TemplateComplexity;

  /** Approximate node count in typical usage */
  nodeCount?: number;

  /** Color theme for card display */
  colorScheme?: {
    primary: string;
    secondary: string;
  };

  // ==================== Usage & Analytics ====================
  /** Number of times template has been used */
  usageCount: number;

  /** Timestamp of last use */
  lastUsed?: number;

  /** Timestamp when template was created */
  createdAt: number;

  /** Timestamp of last modification */
  modifiedAt: number;

  /** View count (preview modal opens) */
  viewCount?: number;

  // ==================== Features ====================
  /** Template features for filtering */
  features: TemplateFeature[];

  /** Has child nodes */
  hasChildNodes: boolean;

  /** Has port connections */
  hasConnections: boolean;

  /** Has custom styling (HTML/CSS) */
  hasCustomStyling: boolean;

  /** Has data binding (repeater) */
  hasDataBinding: boolean;

  /** Has interactive behavior */
  hasInteractivity: boolean;

  // ==================== User Data ====================
  /** User marked as favorite */
  isFavorite: boolean;

  /** Collection IDs this template belongs to */
  collections: string[];

  /** User rating (1-5 stars) */
  userRating?: number;

  /** User's personal notes */
  userNotes?: string;

  /** Custom user tags */
  userTags: string[];

  // ==================== Reference to Full Template ====================
  /** Full template data (lazy loaded) */
  template?: NodeTemplate;
}

/**
 * Template Category
 */
export type TemplateCategory =
  | 'basic'
  | 'database'
  | 'workflow'
  | 'dashboard'
  | 'diagram'
  | 'ui-component'
  | 'data-visualization'
  | 'custom';

/**
 * Template Complexity Level
 */
export type TemplateComplexity = 'simple' | 'medium' | 'complex';

/**
 * Template Feature Flags
 */
export type TemplateFeature =
  | 'ports'          // Has port configuration
  | 'html'           // Has HTML layer
  | 'css'            // Has CSS styling
  | 'layout'         // Has flexbox layout
  | 'children'       // Has child nodes
  | 'repeater'       // Has data repeater
  | 'behavior'       // Has behavior config
  | 'constraints'    // Has constraints
  | 'responsive';    // Has responsive design

/**
 * Template Collection
 *
 * User-created groups of templates (like playlists)
 */
export interface TemplateCollection {
  /** Unique collection identifier */
  id: string;

  /** Collection name */
  name: string;

  /** Optional description */
  description?: string;

  /** Badge/card color */
  color: string;

  /** Icon emoji or name */
  icon?: string;

  /** Template IDs in this collection */
  templateIds: string[];

  /** Creation timestamp */
  createdAt: number;

  /** Last modification timestamp */
  modifiedAt: number;

  /** Is this a built-in collection */
  isBuiltIn: boolean;

  /** Sort order */
  sortOrder?: number;
}

/**
 * Template Filters
 *
 * Filter criteria for template search and discovery
 */
export interface TemplateFilters {
  /** Search query (fuzzy match) */
  searchQuery?: string;

  /** Filter by categories */
  categories?: TemplateCategory[];

  /** Filter by tags (OR logic) */
  tags?: string[];

  /** Filter by features (AND logic) */
  features?: TemplateFeature[];

  /** Filter by complexity levels */
  complexity?: TemplateComplexity[];

  /** Filter by collections */
  collections?: string[];

  /** Show only favorites */
  favoritesOnly?: boolean;

  /** Sort field */
  sortBy?: TemplateSortField;

  /** Sort direction */
  sortOrder?: 'asc' | 'desc';

  /** Minimum rating */
  minRating?: number;

  /** Maximum node count */
  maxNodeCount?: number;
}

/**
 * Template Sort Fields
 */
export type TemplateSortField =
  | 'name'
  | 'recent'       // Last used
  | 'popular'      // Usage count
  | 'rating'       // User rating
  | 'created'      // Creation date
  | 'modified';    // Modification date

/**
 * Template View Mode
 */
export type TemplateViewMode = 'grid' | 'list';

/**
 * Template Action Event
 */
export interface TemplateActionEvent {
  type: TemplateActionType;
  templateId: string;
  metadata?: TemplateMetadata;
  data?: any;
}

/**
 * Template Action Types
 */
export type TemplateActionType =
  | 'use'
  | 'preview'
  | 'favorite'
  | 'duplicate'
  | 'export'
  | 'delete'
  | 'edit'
  | 'add-to-collection'
  | 'rate';

/**
 * Generate placeholder thumbnail from template
 */
export function generateTemplateThumbnail(template: any, category: string): string {
  const structure = template?.structure;
  if (!structure) {
    return generateCategoryPlaceholder(category);
  }

  // Extract basic info
  const type = structure.type || 'rectangle';
  const shape = structure.shape || {};
  const fill = shape.fill || '#e3f2fd';
  const stroke = shape.stroke || '#2196f3';
  const hasHtml = !!(structure.html?.template);

  // Create simple SVG thumbnail
  const width = 200;
  const height = 120;

  let shapeSvg = '';
  if (type === 'circle' || type === 'ellipse') {
    shapeSvg = `<ellipse cx="${width/2}" cy="${height/2}" rx="${width/2 - 10}" ry="${height/2 - 10}" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`;
  } else if (type === 'diamond') {
    shapeSvg = `<polygon points="${width/2},5 ${width-5},${height/2} ${width/2},${height-5} 5,${height/2}" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`;
  } else {
    // Rectangle
    const radius = shape.cornerRadius || 0;
    shapeSvg = `<rect x="10" y="10" width="${width-20}" height="${height-20}" rx="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`;
  }

  // Add HTML indicator if present (use circle instead of emoji to avoid Unicode issues)
  const htmlBadge = hasHtml ? `<circle cx="${width-15}" cy="15" r="8" fill="#4ade80"/><text x="${width-15}" y="19" font-size="12" text-anchor="middle" fill="white" font-weight="bold">H</text>` : '';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    ${shapeSvg}
    ${htmlBadge}
  </svg>`;

  // Use encodeURIComponent instead of btoa to handle Unicode properly
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/**
 * Generate category-based placeholder
 */
function generateCategoryPlaceholder(category: string): string {
  const colors: Record<string, { bg: string; fg: string; shape: string }> = {
    basic: { bg: '#e3f2fd', fg: '#2196f3', shape: '<rect x="75" y="45" width="50" height="30" fill="none" stroke="currentColor" stroke-width="3"/>' },
    workflow: { bg: '#f0f4ff', fg: '#4f46e5', shape: '<polygon points="100,40 85,55 100,70 115,55" fill="none" stroke="currentColor" stroke-width="3"/><line x1="100" y1="70" x2="100" y2="80" stroke="currentColor" stroke-width="3"/>' },
    diagram: { bg: '#dbeafe', fg: '#1e40af', shape: '<circle cx="100" cy="60" r="20" fill="none" stroke="currentColor" stroke-width="3"/>' },
    dashboard: { bg: '#ffffff', fg: '#111827', shape: '<rect x="75" y="50" width="15" height="30" fill="currentColor"/><rect x="95" y="40" width="15" height="40" fill="currentColor"/><rect x="115" y="55" width="15" height="25" fill="currentColor"/>' },
    'ui-component': { bg: '#faf5ff', fg: '#9333ea', shape: '<rect x="80" y="45" width="40" height="30" rx="5" fill="none" stroke="currentColor" stroke-width="3"/>' },
    database: { bg: '#e0e7ff', fg: '#4338ca', shape: '<ellipse cx="100" cy="50" rx="25" ry="10" fill="none" stroke="currentColor" stroke-width="3"/><line x1="75" y1="50" x2="75" y2="70" stroke="currentColor" stroke-width="3"/><line x1="125" y1="50" x2="125" y2="70" stroke="currentColor" stroke-width="3"/><ellipse cx="100" cy="70" rx="25" ry="10" fill="none" stroke="currentColor" stroke-width="3"/>' },
    'data-visualization': { bg: '#f0fdfa', fg: '#14b8a6', shape: '<polyline points="75,75 85,65 95,70 105,50 115,55 125,45" fill="none" stroke="currentColor" stroke-width="3"/>' },
    custom: { bg: '#f3f4f6', fg: '#6b7280', shape: '<polygon points="100,45 110,60 100,75 90,60" fill="none" stroke="currentColor" stroke-width="3"/>' }
  };

  const config = colors[category] || colors['custom'];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="120" viewBox="0 0 200 120">
    <rect width="200" height="120" fill="${config.bg}"/>
    <g color="${config.fg}">
      ${config.shape}
    </g>
  </svg>`;

  // Use encodeURIComponent instead of btoa to handle Unicode properly
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/**
 * Default Template Metadata
 */
export function createDefaultTemplateMetadata(
  partial: Partial<TemplateMetadata>
): TemplateMetadata {
  const now = Date.now();

  // Generate thumbnail if not provided
  const thumbnail = partial.thumbnail ||
    (partial.template ? generateTemplateThumbnail(partial.template, partial.category || 'custom') : undefined);

  return {
    id: partial.id || `template-${now}`,
    name: partial.name || 'Untitled Template',
    description: partial.description || '',
    version: partial.version || '1.0.0',
    category: partial.category || 'custom',
    tags: partial.tags || [],
    author: partial.author || 'User',
    complexity: partial.complexity || 'simple',
    nodeCount: partial.nodeCount || 1,
    usageCount: partial.usageCount || 0,
    createdAt: partial.createdAt || now,
    modifiedAt: partial.modifiedAt || now,
    features: partial.features || [],
    hasChildNodes: partial.hasChildNodes || false,
    hasConnections: partial.hasConnections || false,
    hasCustomStyling: partial.hasCustomStyling || false,
    hasDataBinding: partial.hasDataBinding || false,
    hasInteractivity: partial.hasInteractivity || false,
    isFavorite: partial.isFavorite || false,
    collections: partial.collections || [],
    userTags: partial.userTags || [],
    thumbnail,
    ...partial
  };
}

/**
 * Built-in Collections
 */
export const BUILT_IN_COLLECTIONS: TemplateCollection[] = [
  {
    id: 'recent',
    name: 'Recently Used',
    description: 'Templates you\'ve used recently',
    color: '#3498db',
    icon: '🕐',
    templateIds: [],
    createdAt: 0,
    modifiedAt: 0,
    isBuiltIn: true,
    sortOrder: 0
  },
  {
    id: 'favorites',
    name: 'Favorites',
    description: 'Your favorite templates',
    color: '#f39c12',
    icon: '⭐',
    templateIds: [],
    createdAt: 0,
    modifiedAt: 0,
    isBuiltIn: true,
    sortOrder: 1
  },
  {
    id: 'examples',
    name: 'Examples',
    description: 'Example templates to get started',
    color: '#9b59b6',
    icon: '📚',
    templateIds: [],
    createdAt: 0,
    modifiedAt: 0,
    isBuiltIn: true,
    sortOrder: 2
  }
];

/**
 * Feature Display Names
 */
export const FEATURE_DISPLAY_NAMES: Record<TemplateFeature, string> = {
  ports: 'Ports',
  html: 'HTML',
  css: 'CSS',
  layout: 'Layout',
  children: 'Children',
  repeater: 'Repeater',
  behavior: 'Behavior',
  constraints: 'Constraints',
  responsive: 'Responsive'
};

/**
 * Feature Icons
 */
export const FEATURE_ICONS: Record<TemplateFeature, string> = {
  ports: '🔌',
  html: '📄',
  css: '🎨',
  layout: '📐',
  children: '👶',
  repeater: '🔁',
  behavior: '⚡',
  constraints: '🔒',
  responsive: '📱'
};

/**
 * Category Display Names
 */
export const CATEGORY_DISPLAY_NAMES: Record<TemplateCategory, string> = {
  basic: 'Basic',
  database: 'Database',
  workflow: 'Workflow',
  dashboard: 'Dashboard',
  diagram: 'Diagram',
  'ui-component': 'UI Component',
  'data-visualization': 'Data Visualization',
  custom: 'Custom'
};

/**
 * Category Colors
 */
export const CATEGORY_COLORS: Record<TemplateCategory, string> = {
  basic: '#3498db',
  database: '#e74c3c',
  workflow: '#27ae60',
  dashboard: '#f39c12',
  diagram: '#9b59b6',
  'ui-component': '#1abc9c',
  'data-visualization': '#e67e22',
  custom: '#95a5a6'
};

/**
 * Complexity Display Names
 */
export const COMPLEXITY_DISPLAY_NAMES: Record<TemplateComplexity, string> = {
  simple: 'Simple',
  medium: 'Medium',
  complex: 'Complex'
};

/**
 * Complexity Colors
 */
export const COMPLEXITY_COLORS: Record<TemplateComplexity, string> = {
  simple: '#27ae60',
  medium: '#f39c12',
  complex: '#e74c3c'
};
