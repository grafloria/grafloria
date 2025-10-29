import { NodeToolbarConfig, ToolbarActionGroup } from './node-toolbar.component';
import { DiagramEngine } from '@grafloria/engine';
import {
  createDeleteAction,
  createDuplicateAction,
  createEditAction,
  createAddConnectionAction,
  createLockAction,
  createBringToFrontAction,
  createSendToBackAction
} from './toolbar-actions';

/**
 * Toolbar Presets Library (Phase 3)
 *
 * Pre-configured toolbar templates for common use cases.
 * These presets provide ready-to-use configurations that follow
 * best practices for specific diagram types.
 */

/**
 * Minimal Preset
 * Basic actions for simple diagrams
 */
export function createMinimalPreset(engine: DiagramEngine, onEdit?: (node: any) => void): NodeToolbarConfig {
  const actions = [];

  if (onEdit) {
    actions.push(createEditAction(onEdit));
  }

  actions.push(
    createDuplicateAction(engine),
    createDeleteAction(engine)
  );

  return {
    position: 'top',
    alignment: 'center',
    positioningStrategy: 'auto',
    actions,
    animation: {
      preset: 'fade',
      duration: '0.2s'
    },
    behavior: {
      hideOnMultiSelect: true,
      enableKeyboardNav: true
    }
  };
}

/**
 * Standard Preset
 * Comprehensive set of actions for general-purpose diagrams
 */
export function createStandardPreset(engine: DiagramEngine, onEdit?: (node: any) => void): NodeToolbarConfig {
  return {
    position: 'top',
    alignment: 'center',
    positioningStrategy: 'auto',
    actionGroups: [
      {
        id: 'primary',
        actions: onEdit ? [
          createEditAction(onEdit),
          createDuplicateAction(engine)
        ] : [
          createDuplicateAction(engine)
        ],
        separator: 'after'
      },
      {
        id: 'secondary',
        actions: [
          createLockAction(),
          createAddConnectionAction(engine)
        ],
        separator: 'after'
      },
      {
        id: 'delete',
        actions: [
          createDeleteAction(engine)
        ]
      }
    ],
    animation: {
      preset: 'scale',
      duration: '0.2s'
    },
    behavior: {
      hideOnMultiSelect: true,
      enableKeyboardNav: true
    }
  };
}

/**
 * Full Preset
 * Complete set of actions including z-order manipulation
 */
export function createFullPreset(engine: DiagramEngine, onEdit?: (node: any) => void): NodeToolbarConfig {
  return {
    position: 'top',
    alignment: 'center',
    positioningStrategy: 'auto',
    actionGroups: [
      {
        id: 'edit',
        label: 'Edit',
        actions: onEdit ? [
          createEditAction(onEdit),
          createDuplicateAction(engine)
        ] : [
          createDuplicateAction(engine)
        ],
        separator: 'after'
      },
      {
        id: 'connect',
        label: 'Connect',
        actions: [
          createAddConnectionAction(engine),
          createLockAction()
        ],
        separator: 'after'
      },
      {
        id: 'arrange',
        label: 'Arrange',
        actions: [
          createBringToFrontAction(engine),
          createSendToBackAction(engine)
        ],
        separator: 'after'
      },
      {
        id: 'delete',
        actions: [
          createDeleteAction(engine)
        ]
      }
    ],
    animation: {
      preset: 'slide',
      duration: '0.25s'
    },
    behavior: {
      hideOnMultiSelect: true,
      enableKeyboardNav: true
    }
  };
}

/**
 * ERD (Entity-Relationship Diagram) Preset
 * Optimized for database schema design
 */
export function createERDPreset(engine: DiagramEngine, onEdit?: (node: any) => void): NodeToolbarConfig {
  return {
    position: 'top',
    alignment: 'center',
    positioningStrategy: 'sticky', // Keep visible when scrolling large schemas
    actionGroups: [
      {
        id: 'table',
        label: 'Table',
        actions: onEdit ? [
          createEditAction(onEdit)
        ] : [],
        separator: 'after'
      },
      {
        id: 'relationships',
        label: 'Relationships',
        actions: [
          createAddConnectionAction(engine),
          createDuplicateAction(engine)
        ],
        separator: 'after'
      },
      {
        id: 'delete',
        actions: [
          createDeleteAction(engine)
        ]
      }
    ],
    animation: {
      preset: 'fade',
      duration: '0.15s'
    },
    behavior: {
      hideOnMultiSelect: false, // Allow multi-table selection
      enableKeyboardNav: true
    }
  };
}

/**
 * Workflow Preset
 * Optimized for process flow diagrams
 */
export function createWorkflowPreset(engine: DiagramEngine, onEdit?: (node: any) => void): NodeToolbarConfig {
  return {
    position: 'top',
    alignment: 'center',
    positioningStrategy: 'auto',
    actionGroups: [
      {
        id: 'configure',
        actions: onEdit ? [
          createEditAction(onEdit)
        ] : [],
        separator: 'after'
      },
      {
        id: 'flow',
        actions: [
          createAddConnectionAction(engine),
          createDuplicateAction(engine),
          createLockAction()
        ],
        separator: 'after'
      },
      {
        id: 'delete',
        actions: [
          createDeleteAction(engine)
        ]
      }
    ],
    animation: {
      preset: 'slide',
      duration: '0.2s'
    },
    behavior: {
      hideOnMultiSelect: true,
      enableKeyboardNav: true
    }
  };
}

/**
 * Mind Map Preset
 * Optimized for hierarchical mind mapping
 */
export function createMindMapPreset(engine: DiagramEngine, onEdit?: (node: any) => void): NodeToolbarConfig {
  return {
    position: 'top',
    alignment: 'center',
    positioningStrategy: 'follow', // Follow nodes as they're dragged
    actionGroups: [
      {
        id: 'node',
        actions: onEdit ? [
          createEditAction(onEdit),
          createDuplicateAction(engine)
        ] : [
          createDuplicateAction(engine)
        ],
        separator: 'after'
      },
      {
        id: 'arrange',
        actions: [
          createBringToFrontAction(engine),
          createSendToBackAction(engine)
        ],
        separator: 'after'
      },
      {
        id: 'delete',
        actions: [
          createDeleteAction(engine)
        ]
      }
    ],
    animation: {
      preset: 'bounce',
      duration: '0.3s'
    },
    behavior: {
      hideOnMultiSelect: true,
      enableKeyboardNav: true
    }
  };
}

/**
 * Kanban Preset
 * Optimized for kanban board cards
 */
export function createKanbanPreset(engine: DiagramEngine, onEdit?: (node: any) => void): NodeToolbarConfig {
  return {
    position: 'bottom',
    alignment: 'center',
    positioningStrategy: 'auto',
    actions: onEdit ? [
      createEditAction(onEdit),
      createDuplicateAction(engine),
      createDeleteAction(engine)
    ] : [
      createDuplicateAction(engine),
      createDeleteAction(engine)
    ],
    animation: {
      preset: 'slide',
      duration: '0.2s'
    },
    behavior: {
      hideOnMultiSelect: true,
      enableKeyboardNav: true
    }
  };
}

/**
 * Context Menu Preset
 * Right-click context menu style
 */
export function createContextMenuPreset(engine: DiagramEngine, onEdit?: (node: any) => void): NodeToolbarConfig {
  return {
    position: 'top',
    alignment: 'start',
    positioningStrategy: 'fixed',
    actionGroups: [
      {
        id: 'edit',
        actions: onEdit ? [
          createEditAction(onEdit),
          createDuplicateAction(engine)
        ] : [
          createDuplicateAction(engine)
        ],
        separator: 'after'
      },
      {
        id: 'arrange',
        actions: [
          createBringToFrontAction(engine),
          createSendToBackAction(engine),
          createLockAction()
        ],
        separator: 'after'
      },
      {
        id: 'delete',
        actions: [
          createDeleteAction(engine)
        ]
      }
    ],
    animation: {
      preset: 'scale',
      duration: '0.15s'
    },
    behavior: {
      showAs: 'contextMenu',
      contextMenuTrigger: 'rightClick',
      closeOnClickOutside: true,
      hideOnMultiSelect: true,
      enableKeyboardNav: true
    }
  };
}

/**
 * Compact Preset
 * Minimal vertical toolbar for tight spaces
 */
export function createCompactPreset(engine: DiagramEngine, onEdit?: (node: any) => void): NodeToolbarConfig {
  return {
    position: 'right',
    alignment: 'center',
    positioningStrategy: 'auto',
    actions: onEdit ? [
      createEditAction(onEdit),
      createDuplicateAction(engine),
      createDeleteAction(engine)
    ] : [
      createDuplicateAction(engine),
      createDeleteAction(engine)
    ],
    animation: {
      preset: 'slide',
      duration: '0.2s'
    },
    style: {
      padding: '2px'
    },
    behavior: {
      hideOnMultiSelect: true,
      enableKeyboardNav: true
    }
  };
}

/**
 * Preset registry for easy access
 */
export const TOOLBAR_PRESETS = {
  minimal: createMinimalPreset,
  standard: createStandardPreset,
  full: createFullPreset,
  erd: createERDPreset,
  workflow: createWorkflowPreset,
  mindMap: createMindMapPreset,
  kanban: createKanbanPreset,
  contextMenu: createContextMenuPreset,
  compact: createCompactPreset
} as const;

export type ToolbarPresetName = keyof typeof TOOLBAR_PRESETS;

/**
 * Get a preset by name
 */
export function getToolbarPreset(
  name: ToolbarPresetName,
  engine: DiagramEngine,
  onEdit?: (node: any) => void
): NodeToolbarConfig {
  return TOOLBAR_PRESETS[name](engine, onEdit);
}
