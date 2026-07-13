/**
 * NodeFactory - Creates nodes from templates
 *
 * Handles:
 * - Template-based node creation
 * - Port configuration
 * - Hierarchical structures (parent/child)
 * - Data binding
 * - Metadata management
 *
 * Follows existing NodeModel patterns:
 * - Uses node.setMetadata() for configuration
 * - Uses node.setData() for user data
 * - Adds nodes to diagram
 * - Creates ports following port configuration
 */

import { NodeTemplate, NodeStructureDefinition, PortGroupSpec, PortRenderingConfig } from './NodeTemplate';
// Wave 6 (Card 3): named port groups.
import { setNodePortGroups } from '../ports/port-groups';
import type { PortGroupDefinition } from '../ports/port-types';
import { TemplateRegistry } from './TemplateRegistry';
import { DiagramModel } from '../models/DiagramModel';
import { NodeModel } from '../models/NodeModel';
import { PortModel } from '../models/PortModel';

export class NodeFactory {
  constructor(
    private templateRegistry: TemplateRegistry,
    private diagram: DiagramModel
  ) {}

  /**
   * Create node(s) from template
   *
   * @param templateId Template identifier
   * @param data User data to bind to template
   * @param position Node position in diagram
   * @returns Root node created from template
   * @throws Error if template not found or invalid
   */
  createFromTemplate(
    templateId: string,
    data: Record<string, any>,
    position: { x: number; y: number }
  ): NodeModel {
    // Get template
    const template = this.templateRegistry.get(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    // Merge user data with default data
    const fullData = {
      ...template.defaultData,
      ...data,
    };

    // Build node tree from structure
    const rootNode = this.buildNodeTree(
      template.structure,
      fullData,
      position,
      null,
      template
    );

    // Store template reference in metadata
    rootNode.setMetadata('templateId', template.id);
    rootNode.setMetadata('templateVersion', template.version);

    return rootNode;
  }

  /**
   * Build node tree recursively from structure definition
   *
   * @param structure Node structure definition
   * @param data Data to bind
   * @param position Position (for root only)
   * @param parent Parent node (null for root)
   * @param template Root template reference
   * @returns Created node
   */
  private buildNodeTree(
    structure: NodeStructureDefinition,
    data: Record<string, any>,
    position: { x: number; y: number },
    parent: NodeModel | null,
    template: NodeTemplate
  ): NodeModel {
    // Create node
    const node = new NodeModel({
      type: structure.type,
      position: parent ? { x: 0, y: 0 } : position,
      size: this.parseSize(structure.size),
    });

    // Store user data
    Object.entries(data).forEach(([key, value]) => {
      node.setData(key, value);
    });

    // Set layout configuration if present
    if (structure.layout) {
      // Store layout config in metadata
      node.setMetadata('layout', structure.layout);
      node.setMetadata('autoLayout', true);
    }

    // Set behavior
    if (structure.behavior) {
      node.behavior = {
        ...node.behavior,
        ...structure.behavior,
      };
    }

    // Set connection group
    if (structure.connectionGroup) {
      node.connectionGroup = structure.connectionGroup;
    }

    // Phase 3.1: Set shape configuration
    if (structure.shape) {
      node.setMetadata('shape', structure.shape);
    }

    // Apply property bindings (data-driven properties)
    // This allows conditional properties based on item data
    if ((structure as any).propertyBindings) {
      this.applyPropertyBindings(node, (structure as any).propertyBindings, data);
    }

    // Handle HTML configuration
    if (structure.html) {
      node.setMetadata('useHTMLLayer', true);
      node.data['_html'] = {
        mode: structure.html.mode,
        template: structure.html.template,
        component: structure.html.component,
        className: structure.html.className,
        style: structure.html.style,
        bindings: structure.html.bindings,
        events: structure.html.events,
      };
    }

    // Apply data bindings
    if (structure.dataBind?.bindings) {
      this.applyDataBindings(node, structure.dataBind.bindings, data);
    }

    // Handle ports
    this.createPorts(node, structure);

    // Add to diagram
    this.diagram.addNode(node);

    // Link to parent
    if (parent) {
      node.setParent(parent.id);
      parent.addChild(node.id);
    }

    // Create children
    if (structure.children) {
      structure.children.forEach(childStructure => {
        this.buildNodeTree(childStructure, data, position, node, template);
      });
    }

    // Create dynamic children from repeater configuration
    if (structure.repeater) {
      this.createRepeaterChildren(structure, data, position, node, template);
    }

    // Apply layout after all children (static + repeater) are created
    if ((structure.children || structure.repeater) && structure.layout && node.getMetadata('layout')) {
      this.applyFlexboxLayout(node);
    }

    return node;
  }

  /**
   * Create ports based on template configuration
   */
  private createPorts(node: NodeModel, structure: NodeStructureDefinition): void {
    // Store ports configuration in metadata for HTML layer rendering
    if (structure.ports) {
      node.setMetadata('portsConfig', structure.ports);
    }

    // If no port configuration, keep default 4 ports
    if (!structure.ports) {
      return;
    }

    // If ports explicitly disabled, clear all
    if (structure.ports.enabled === false) {
      node.ports.clear();
      return;
    }

    // Wave 6 (Card 3): NAMED GROUPS. The four-side model below can express
    // "a port on the left" and nothing else — not "eight typed, labelled inputs
    // down the left edge", which is what a real node editor is made of. A
    // template that declares `groups` gets the full port vocabulary; one that
    // doesn't falls through to the legacy sides, unchanged.
    if (structure.ports.groups?.length) {
      this.createGroupedPorts(node, structure.ports.groups, structure.ports.rendering);
      return;
    }

    // If custom port configuration provided, clear defaults first
    const hasCustomConfig =
      structure.ports.top ||
      structure.ports.right ||
      structure.ports.bottom ||
      structure.ports.left;

    if (hasCustomConfig) {
      node.ports.clear();

      // Create ports for each enabled side, in the order the template
      // declares them (declaration order also drives same-side port ranking)
      const allSides = ['top', 'right', 'bottom', 'left'];
      const sides = (Object.keys(structure.ports) as Array<'top' | 'right' | 'bottom' | 'left'>)
        .filter((key) => allSides.includes(key));

      sides.forEach(side => {
        const sideConfig = structure.ports![side];

        if (sideConfig?.enabled) {
          const port = new PortModel({
            type: sideConfig.type || 'bi',
            side: side,
          });

          // Store rendering configuration
          if (structure.ports?.rendering) {
            (port as any).renderingConfig = structure.ports.rendering;
          }

          // Store port visibility for HTML layer rendering
          const visibility = sideConfig.visibility || structure.ports?.defaultVisibility || 'always';
          port.setMetadata('visibility', visibility);

          node.addPort(port);
        }
      });
    }
  }

  /**
   * Wave 6 (Card 3): build a node's ports from NAMED GROUPS.
   *
   * The group definitions are stashed on the node (so they serialize with the
   * diagram and `resolvePortConfig` can find them), and each member is created
   * declaring only what it OVERRIDES — side, shape, label config, gating and
   * data type all flow down from the group.
   */
  private createGroupedPorts(
    node: NodeModel,
    groups: PortGroupSpec[],
    rendering?: PortRenderingConfig
  ): void {
    node.ports.clear();

    const definitions: Record<string, PortGroupDefinition> = {};
    for (const group of groups) {
      definitions[group.id] = group;
    }
    setNodePortGroups(node, definitions);

    for (const group of groups) {
      const members = group.ports ?? [];
      members.forEach((member, index) => {
        const port = new PortModel({
          id: member.id,
          // The group's `type` is the default; a member may still override it.
          type: member.type ?? group.type ?? 'bi',
          index: member.index ?? index,
          group: group.id,
          // Only what the MEMBER declares — everything else resolves from the
          // group at read time, so changing the group changes every member.
          ...(member.side ? { side: member.side } : {}),
          ...(member.label ? { label: member.label } : {}),
          ...(member.shape ? { shape: member.shape } : {}),
          ...(member.dataType ? { dataType: member.dataType } : {}),
          ...(member.style ? { style: member.style } : {}),
        } as any);

        if (rendering) {
          (port as any).renderingConfig = rendering;
        }

        node.addPort(port);
      });
    }
  }

  /**
   * Parse size configuration
   */
  private parseSize(size?: any): { width: number; height: number; depth: number } {
    if (!size) {
      return { width: 200, height: 100, depth: 0 };
    }

    return {
      width: typeof size.width === 'number' ? size.width : 200,
      height: typeof size.height === 'number' ? size.height : 100,
      depth: 0,
    };
  }

  /**
   * Apply data bindings to node
   */
  private applyDataBindings(
    node: NodeModel,
    bindings: Record<string, string>,
    data: Record<string, any>
  ): void {
    Object.entries(bindings).forEach(([sourcePath, targetProp]) => {
      const value = this.getNestedValue(data, sourcePath);
      node.setData(targetProp, value);
    });
  }

  /**
   * Create dynamic children from repeater configuration
   * Iterates over an array in the data and creates a child node for each item
   *
   * @param structure Node structure with repeater config
   * @param data Parent node data
   * @param position Position (passed to children)
   * @param parent Parent node
   * @param template Root template reference
   */
  private createRepeaterChildren(
    structure: NodeStructureDefinition,
    data: Record<string, any>,
    position: { x: number; y: number },
    parent: NodeModel,
    template: NodeTemplate
  ): void {
    if (!structure.repeater) {
      return;
    }

    const { dataSource, itemTemplate, keyField } = structure.repeater;

    // Get the array data from the specified path
    const dataArray = this.getNestedValue(data, dataSource);

    // Validate that we got an array
    if (!Array.isArray(dataArray)) {
      console.warn(
        `[NodeFactory] Repeater dataSource "${dataSource}" did not resolve to an array. ` +
        `Got: ${typeof dataArray}. Skipping repeater children.`
      );
      return;
    }

    // If array is empty, nothing to do
    if (dataArray.length === 0) {
      return;
    }

    const keyFieldName = keyField || 'id';

    // Create a child node for each item in the array
    dataArray.forEach((itemData, index) => {
      // Create a unique data context for this item
      // Merge parent data with item data, giving precedence to item data
      const itemContext = {
        ...data,      // Include parent/container data
        ...itemData,  // Override with item-specific data

        // Add helper properties for templates
        _index: index,
        _isFirst: index === 0,
        _isLast: index === dataArray.length - 1,
        _key: itemData[keyFieldName] !== undefined ? itemData[keyFieldName] : index,
        _total: dataArray.length,
      };

      // Create child node from item template
      const childNode = this.buildNodeTree(
        itemTemplate,
        itemContext,
        position,
        parent,
        template
      );

      // Store repeater metadata on the child for potential updates/tracking
      childNode.setMetadata('_repeaterSource', dataSource);
      childNode.setMetadata('_repeaterItemIndex', index);
      childNode.setMetadata('_repeaterItemKey', itemContext._key);
      childNode.setMetadata('_isRepeaterItem', true);
    });
  }

  /**
   * Apply flexbox layout to position children
   * Extracted from inline code to support both static and repeater children
   *
   * @param node Parent node with children to layout
   */
  private applyFlexboxLayout(node: NodeModel): void {
    const layoutConfig = node.getMetadata('layout');
    if (!layoutConfig || !layoutConfig.direction) {
      return;
    }

    // Cast to FlexboxLayoutConfig type
    const flexLayout = layoutConfig as any;

    // Position children based on flex direction
    let offset = flexLayout.padding?.top || 0;
    const gap = flexLayout.gap || 0;

    // Calculate available space for stretch alignment
    const paddingLeft = flexLayout.padding?.left || 0;
    const paddingRight = flexLayout.padding?.right || 0;
    const paddingTop = flexLayout.padding?.top || 0;
    const paddingBottom = flexLayout.padding?.bottom || 0;

    const availableWidth = node.size.width - paddingLeft - paddingRight;
    const availableHeight = node.size.height - paddingTop - paddingBottom;

    node.children.forEach((childId) => {
      const child = this.diagram.getNode(childId);
      if (child) {
        // Children are layout-managed: their position is parent-relative and
        // owned by this layout pass, not by the user
        child.positionMode = 'layout';
        if (flexLayout.direction === 'column') {
          // Stack vertically
          child.position.x = paddingLeft;
          child.position.y = offset;

          // Apply alignItems stretch - child should fill parent width
          if (flexLayout.alignItems === 'stretch') {
            child.size.width = availableWidth;
          }

          offset += child.size.height + gap;
        } else if (flexLayout.direction === 'row') {
          // Stack horizontally
          child.position.x = offset;
          child.position.y = paddingTop;

          // Apply alignItems stretch - child should fill parent height
          if (flexLayout.alignItems === 'stretch') {
            child.size.height = availableHeight;
          }

          offset += child.size.width + gap;
        }
      }
    });
  }

  /**
   * Get nested value from object path (e.g., 'data.user.name')
   */
  private getNestedValue(obj: any, path: string): any {
    if (path.startsWith('data.')) {
      path = path.substring(5);
    }

    return path.split('.').reduce((acc, part) => acc?.[part], obj);
  }

  /**
   * Apply property bindings to node for data-driven properties
   * Allows conditional properties based on item data
   *
   * Example:
   * propertyBindings: {
   *   shape: {
   *     fill: {
   *       source: 'data.isPrimaryKey',
   *       map: { 'true': '#e3f2fd', 'false': '#ffffff' }
   *     }
   *   }
   * }
   *
   * @param node Node to apply bindings to
   * @param bindings Property bindings configuration
   * @param data Data to evaluate bindings against
   */
  private applyPropertyBindings(
    node: NodeModel,
    bindings: any,
    data: Record<string, any>
  ): void {
    // Apply shape property bindings
    if (bindings.shape) {
      const currentShape = node.getMetadata('shape') || {};
      const newShape = { ...currentShape };

      for (const [prop, resolver] of Object.entries(bindings.shape)) {
        newShape[prop] = this.resolvePropertyValue(resolver as any, data);
      }

      node.setMetadata('shape', newShape);
    }

    // Apply behavior property bindings
    if (bindings.behavior) {
      const currentBehavior = { ...node.behavior };

      for (const [prop, resolver] of Object.entries(bindings.behavior)) {
        (currentBehavior as any)[prop] = this.resolvePropertyValue(resolver as any, data);
      }

      node.behavior = currentBehavior;
    }

    // Note: Port bindings would require more complex logic (regenerating ports)
    // For now, ports should be configured statically or conditionally via multiple templates
  }

  /**
   * Resolve property value from binding configuration
   *
   * @param resolver Property resolver with source path and value map
   * @param data Data to evaluate against
   * @returns Resolved property value
   */
  private resolvePropertyValue(
    resolver: { source: string; map: Record<string, any>; default?: any },
    data: Record<string, any>
  ): any {
    // Get value from data path
    const value = this.getNestedValue(data, resolver.source);

    // Convert to string for map lookup
    const key = String(value);

    // Look up in map
    if (key in resolver.map) {
      return resolver.map[key];
    }

    // Return default or original value
    return resolver.default !== undefined ? resolver.default : value;
  }
}
