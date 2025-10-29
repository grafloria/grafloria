import { NodeModel, DiagramEngine } from '@grafloria/engine';
import { ToolbarAction } from './node-toolbar.component';

/**
 * Create standard delete action
 * Removes the node from the diagram
 */
export function createDeleteAction(engine: DiagramEngine): ToolbarAction {
  return {
    id: 'delete',
    label: 'Delete',
    icon: 'fa fa-trash',
    tooltip: 'Delete node',
    onClick: (node: NodeModel) => {
      const model = engine.getModel();
      if (model) {
        model.removeNode(node.id);
        engine.eventBus.emit('diagram:changed', { source: 'toolbar-action', action: 'delete' });
      }
    },
  };
}

/**
 * Create standard duplicate action
 * Creates a copy of the node with the same type and data
 */
export function createDuplicateAction(engine: DiagramEngine): ToolbarAction {
  return {
    id: 'duplicate',
    label: 'Duplicate',
    icon: 'fa fa-copy',
    tooltip: 'Duplicate node',
    onClick: (node: NodeModel) => {
      const model = engine.getModel();
      if (model) {
        const clone = model.addNode({
          type: node.type,
          data: { ...node.data },
          position: {
            x: node.position.x + 20,
            y: node.position.y + 20,
          },
          size: {
            width: node.size.width,
            height: node.size.height,
          },
        });
        engine.eventBus.emit('diagram:changed', { source: 'toolbar-action', action: 'duplicate' });
      }
    },
  };
}

/**
 * Create standard edit action
 * Triggers a custom edit callback
 */
export function createEditAction(onEdit: (node: NodeModel) => void): ToolbarAction {
  return {
    id: 'edit',
    label: 'Edit',
    icon: 'fa fa-edit',
    tooltip: 'Edit node',
    onClick: onEdit,
  };
}

/**
 * Create action to add connection from this node
 * Enables connection mode starting from this node
 */
export function createAddConnectionAction(engine: DiagramEngine): ToolbarAction {
  return {
    id: 'add-connection',
    label: 'Connect',
    icon: 'fa fa-link',
    tooltip: 'Add connection',
    onClick: (node: NodeModel) => {
      // Emit event to start connection mode from this node
      engine.eventBus.emit('connection:start-from-node', { node });
    },
  };
}

/**
 * Create action to lock/unlock node
 * Toggles the locked state of the node
 */
export function createLockAction(): ToolbarAction {
  return {
    id: 'lock',
    label: 'Lock',
    icon: 'fa fa-lock',
    tooltip: 'Lock/unlock node position',
    onClick: (node: NodeModel) => {
      const isLocked = node.state.locked;
      node.state.locked = !isLocked;
      node.behavior.draggable = isLocked; // If was locked, now draggable; if was unlocked, now not draggable

      // Update icon dynamically based on new state
      // This will be handled by the component re-rendering
    },
  };
}

/**
 * Create action to bring node to front
 * Sets node z-index to a high value
 */
export function createBringToFrontAction(engine: DiagramEngine): ToolbarAction {
  return {
    id: 'bring-to-front',
    label: 'To Front',
    icon: 'fa fa-arrow-up',
    tooltip: 'Bring to front',
    onClick: (node: NodeModel) => {
      // Find the highest z-index in the diagram
      const model = engine.getModel();
      if (model) {
        const nodes = model.getNodes();
        let maxZIndex = 0;

        nodes.forEach(n => {
          const zIndex = n.style.zIndex || 0;
          if (zIndex > maxZIndex) {
            maxZIndex = zIndex;
          }
        });

        // Set this node's z-index to be higher than the max
        node.style.zIndex = maxZIndex + 1;
        engine.eventBus.emit('diagram:changed', { source: 'toolbar-action', action: 'bring-to-front' });
      }
    },
  };
}

/**
 * Create action to send node to back
 * Sets node z-index to 0 or minimum value
 */
export function createSendToBackAction(engine: DiagramEngine): ToolbarAction {
  return {
    id: 'send-to-back',
    label: 'To Back',
    icon: 'fa fa-arrow-down',
    tooltip: 'Send to back',
    onClick: (node: NodeModel) => {
      // Find the lowest z-index in the diagram
      const model = engine.getModel();
      if (model) {
        const nodes = model.getNodes();
        let minZIndex = 0;

        nodes.forEach(n => {
          const zIndex = n.style.zIndex || 0;
          if (zIndex < minZIndex) {
            minZIndex = zIndex;
          }
        });

        // Set this node's z-index to be lower than the min
        node.style.zIndex = minZIndex - 1;
        engine.eventBus.emit('diagram:changed', { source: 'toolbar-action', action: 'send-to-back' });
      }
    },
  };
}

/**
 * Helper to create all standard actions
 * Returns an array of commonly used toolbar actions
 */
export function createStandardActions(
  engine: DiagramEngine,
  onEdit?: (node: NodeModel) => void
): ToolbarAction[] {
  const actions: ToolbarAction[] = [
    createDuplicateAction(engine),
    createDeleteAction(engine),
  ];

  if (onEdit) {
    actions.unshift(createEditAction(onEdit));
  }

  return actions;
}

/**
 * Helper to create all actions including advanced ones
 * Returns the full set of available toolbar actions
 */
export function createAllActions(
  engine: DiagramEngine,
  onEdit?: (node: NodeModel) => void
): ToolbarAction[] {
  const actions: ToolbarAction[] = [];

  if (onEdit) {
    actions.push(createEditAction(onEdit));
  }

  actions.push(
    createDuplicateAction(engine),
    createAddConnectionAction(engine),
    createLockAction(),
    createBringToFrontAction(engine),
    createSendToBackAction(engine),
    createDeleteAction(engine)
  );

  return actions;
}
