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
 * Default Template Metadata
 */
export function createDefaultTemplateMetadata(
  partial: Partial<TemplateMetadata>
): TemplateMetadata {
  const now = Date.now();

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
