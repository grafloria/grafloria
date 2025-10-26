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

import { NodeTemplate, NodeStructureDefinition } from './NodeTemplate';
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

    // Set layout configuration
    // Note: layout configuration is handled at the group level, not at individual nodes

    // Set behavior
    if (structure.behavior) {
      node.behavior = {
        ...node.behavior,
        ...structure.behavior,
      };

      // Remove dragHandler from behavior (not a NodeBehavior property)
      if ('dragHandler' in node.behavior) {
        delete (node.behavior as any).dragHandler;
      }
    }

    // Set connection group
    if (structure.connectionGroup) {
      node.connectionGroup = structure.connectionGroup;
    }

    // Phase 3.1: Set shape configuration
    if (structure.shape) {
      node.setMetadata('shape', structure.shape);
    }

    // Handle HTML configuration
    if (structure.html) {
      node.setMetadata('useHTMLLayer', true);
      node.data['_html'] = {
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

    return node;
  }

  /**
   * Create ports based on template configuration
   */
  private createPorts(node: NodeModel, structure: NodeStructureDefinition): void {
    // If no port configuration, keep default 4 ports
    if (!structure.ports) {
      return;
    }

    // If ports explicitly disabled, clear all
    if (structure.ports.enabled === false) {
      node.ports.clear();
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

      // Create ports for each enabled side
      const sides = ['top', 'right', 'bottom', 'left'] as const;

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

          node.addPort(port);
        }
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
   * Get nested value from object path (e.g., 'data.user.name')
   */
  private getNestedValue(obj: any, path: string): any {
    if (path.startsWith('data.')) {
      path = path.substring(5);
    }

    return path.split('.').reduce((acc, part) => acc?.[part], obj);
  }
}
