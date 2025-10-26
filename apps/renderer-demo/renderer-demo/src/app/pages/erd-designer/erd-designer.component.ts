import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DiagramCanvasComponent } from '@grafloria/renderer-angular';
import {
  DiagramEngine,
  NodeModel,
  PortModel,
  GroupModel,
  InteractionMode,
  PortVisibilityStrategy,
  NodeFactory,
  TemplateRegistry,
  registerTemplateLibrary,
  FlexboxLayoutConfig,
} from '@grafloria/engine';
import { LIGHT_THEME, type Theme, type Rectangle } from '@grafloria/renderer';
import { TableNodeComponent } from './table-node.component';

interface Column {
  name: string;
  dataType: string;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  isNullable: boolean;
}

interface Table {
  id: string;
  name: string;
  columns: Column[];
}

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, DiagramCanvasComponent, TableNodeComponent],
  selector: 'app-erd-designer',
  templateUrl: './erd-designer.component.html',
  styleUrl: './erd-designer.component.css',
})
export class ErdDesignerComponent implements OnInit {
  engine!: DiagramEngine;
  viewport: Rectangle = { x: 0, y: 0, width: 1200, height: 800 };
  zoom = 1.0;
  theme: Theme = LIGHT_THEME;

  tables: Map<string, Table> = new Map();
  nodeFactory!: NodeFactory;
  templateRegistry!: TemplateRegistry;

  // UI State
  showAddTablePanel = false;
  newTableName = '';
  selectedTable: Table | null = null;

  ngOnInit() {
    this.initializeEngine();
    this.createSampleERD();
  }

  private initializeEngine(): void {
    this.engine = new DiagramEngine({
      interaction: {
        mode: InteractionMode.SMART,
        portVisibility: PortVisibilityStrategy.ALWAYS,
        enableSmartAutoConnect: true,
      }
    });

    // Initialize template registry and register ERD templates
    this.templateRegistry = new TemplateRegistry(this.engine.eventBus);
    registerTemplateLibrary(this.templateRegistry);

    console.log('✅ ERD Designer initialized with template system');
  }

  private async createSampleERD(): Promise<void> {
    const diagram = this.engine.createDiagram('ERD Diagram - Option Comparison');

    // Initialize node factory
    this.nodeFactory = new NodeFactory(this.templateRegistry, diagram);

    // ===== OPTION A EXAMPLES (Top Row) =====
    // OPTION A Example 1: Users table
    const usersTableA: Table = {
      id: 'users-a',
      name: 'Users',
      columns: [
        { name: 'id', dataType: 'INT', isPrimaryKey: true, isForeignKey: false, isNullable: false },
        { name: 'email', dataType: 'VARCHAR(255)', isPrimaryKey: false, isForeignKey: false, isNullable: false },
        { name: 'name', dataType: 'VARCHAR(100)', isPrimaryKey: false, isForeignKey: false, isNullable: false },
        { name: 'created_at', dataType: 'TIMESTAMP', isPrimaryKey: false, isForeignKey: false, isNullable: false },
      ]
    };
    this.tables.set('users-a', usersTableA);
    this.createTableNodeOptionA(usersTableA, { x: 50, y: 50 });

    // OPTION A Example 2: Orders table
    const ordersTableA: Table = {
      id: 'orders-a',
      name: 'Orders',
      columns: [
        { name: 'id', dataType: 'INT', isPrimaryKey: true, isForeignKey: false, isNullable: false },
        { name: 'user_id', dataType: 'INT', isPrimaryKey: false, isForeignKey: true, isNullable: false },
        { name: 'total', dataType: 'DECIMAL(10,2)', isPrimaryKey: false, isForeignKey: false, isNullable: false },
        { name: 'status', dataType: 'VARCHAR(20)', isPrimaryKey: false, isForeignKey: false, isNullable: false },
      ]
    };
    this.tables.set('orders-a', ordersTableA);
    this.createTableNodeOptionA(ordersTableA, { x: 350, y: 50 });

    // OPTION A Example 3: Payments table
    const paymentsTableA: Table = {
      id: 'payments-a',
      name: 'Payments',
      columns: [
        { name: 'id', dataType: 'INT', isPrimaryKey: true, isForeignKey: false, isNullable: false },
        { name: 'order_id', dataType: 'INT', isPrimaryKey: false, isForeignKey: true, isNullable: false },
        { name: 'amount', dataType: 'DECIMAL(10,2)', isPrimaryKey: false, isForeignKey: false, isNullable: false },
        { name: 'method', dataType: 'VARCHAR(50)', isPrimaryKey: false, isForeignKey: false, isNullable: false },
        { name: 'paid_at', dataType: 'TIMESTAMP', isPrimaryKey: false, isForeignKey: false, isNullable: false },
      ]
    };
    this.tables.set('payments-a', paymentsTableA);
    this.createTableNodeOptionA(paymentsTableA, { x: 650, y: 50 });

    // ===== OPTION B EXAMPLES (Bottom Row) =====
    // OPTION B Example 1: Products table
    const productsTableB: Table = {
      id: 'products-b',
      name: 'Products',
      columns: [
        { name: 'id', dataType: 'INT', isPrimaryKey: true, isForeignKey: false, isNullable: false },
        { name: 'name', dataType: 'VARCHAR(255)', isPrimaryKey: false, isForeignKey: false, isNullable: false },
        { name: 'price', dataType: 'DECIMAL(10,2)', isPrimaryKey: false, isForeignKey: false, isNullable: false },
        { name: 'stock', dataType: 'INT', isPrimaryKey: false, isForeignKey: false, isNullable: false },
      ]
    };
    this.tables.set('products-b', productsTableB);
    this.createTableNodeOptionB(productsTableB, { x: 50, y: 350 });

    // OPTION B Example 2: Categories table
    const categoriesTableB: Table = {
      id: 'categories-b',
      name: 'Categories',
      columns: [
        { name: 'id', dataType: 'INT', isPrimaryKey: true, isForeignKey: false, isNullable: false },
        { name: 'name', dataType: 'VARCHAR(100)', isPrimaryKey: false, isForeignKey: false, isNullable: false },
        { name: 'description', dataType: 'TEXT', isPrimaryKey: false, isForeignKey: false, isNullable: true },
      ]
    };
    this.tables.set('categories-b', categoriesTableB);
    this.createTableNodeOptionB(categoriesTableB, { x: 350, y: 350 });

    // OPTION B Example 3: ProductCategories table (junction table)
    const productCategoriesTableB: Table = {
      id: 'product-categories-b',
      name: 'ProductCategories',
      columns: [
        { name: 'id', dataType: 'INT', isPrimaryKey: true, isForeignKey: false, isNullable: false },
        { name: 'product_id', dataType: 'INT', isPrimaryKey: false, isForeignKey: true, isNullable: false },
        { name: 'category_id', dataType: 'INT', isPrimaryKey: false, isForeignKey: true, isNullable: false },
        { name: 'created_at', dataType: 'TIMESTAMP', isPrimaryKey: false, isForeignKey: false, isNullable: false },
      ]
    };
    this.tables.set('product-categories-b', productCategoriesTableB);
    this.createTableNodeOptionB(productCategoriesTableB, { x: 650, y: 350 });

    console.log('📋 ERD Comparison Page:');
    console.log('  Top Row: Option A tables (purple headers with integrated drag handler)');
    console.log('    - Users, Orders, Payments');
    console.log('  Bottom Row: Option B tables (green headers as separate nodes)');
    console.log('    - Products, Categories, ProductCategories');
    console.log('  Try dragging the headers to see the difference!');

    diagram.fitToView(100);
    this.updateViewportFromDiagram();

    // COMPREHENSIVE DIAGRAM STRUCTURE LOGGING
    this.logDiagramStructure();
  }

  /**
   * Log complete diagram structure for debugging
   */
  private logDiagramStructure(): void {
    const diagram = this.engine.getDiagram();
    if (!diagram) {
      console.error('❌ No diagram available for logging');
      return;
    }

    console.log('\n' + '='.repeat(80));
    console.log('📊 COMPLETE DIAGRAM STRUCTURE');
    console.log('='.repeat(80));

    // Log the raw diagram object first
    console.log('\n🔍 RAW DIAGRAM OBJECT:');
    console.dir(diagram, { depth: 3, colors: true });

    // Diagram-level info
    console.log('\n🎯 DIAGRAM METADATA:');
    const metadata = {
      id: diagram.id,
      name: diagram.name,
      zoom: diagram.zoom,
      viewport: diagram.getViewport(),
      totalNodes: diagram.getNodes().length,
      totalLinks: diagram.getLinks().length,
      totalGroups: diagram.getGroups().length,
    };
    console.log(JSON.stringify(metadata, null, 2));
    console.dir(metadata);

    // All nodes with full details
    console.log('\n📦 ALL NODES:');
    const nodes = diagram.getNodes();
    console.log(`Total nodes: ${nodes.length}`);

    nodes.forEach((node, index) => {
      console.log(`\n  [${index}] Node: ${node.id}`);

      // Create a comprehensive node info object
      const nodeInfo = {
        id: node.id,
        type: node.type,
        position: { x: node.position.x, y: node.position.y },
        size: { width: node.size.width, height: node.size.height },
        parentId: node.parentId || null,
        children: Array.from(node.children),
        childrenCount: node.children.size,
        behavior: {
          draggable: node.behavior.draggable,
          selectable: node.behavior.selectable,
        },
        isSelected: node.isSelected(),
        useHTMLLayer: node.getMetadata('useHTMLLayer'),
        layout: node.getMetadata('layout'),
        portsCount: node.getPorts().length,
        data: node.data,
      };

      console.log('    Node Info Object:');
      console.dir(nodeInfo, { depth: 5 });
      console.log('    Node Info JSON:');
      console.log(JSON.stringify(nodeInfo, null, 2));

      // If it has children, show the tree
      if (node.children.size > 0) {
        console.log('    📂 CHILDREN TREE:');
        const childArray = Array.from(node.children);
        childArray.forEach((childId, childIndex) => {
          const child = diagram.getNode(childId);
          if (child) {
            const childInfo = {
              index: childIndex,
              id: child.id,
              type: child.type,
              position: { x: child.position.x, y: child.position.y },
              size: { width: child.size.width, height: child.size.height },
              parentId: child.parentId,
              draggable: child.behavior.draggable,
              useHTMLLayer: child.getMetadata('useHTMLLayer'),
              data: child.data,
            };
            console.log(`      Child [${childIndex}]:`, JSON.stringify(childInfo, null, 2));
          }
        });
      }
    });

    // All links
    console.log('\n🔗 ALL LINKS:');
    const links = diagram.getLinks();
    if (links.length === 0) {
      console.log('  No links created yet');
    } else {
      links.forEach((link, index) => {
        console.log(`\n  [${index}] Link: ${link.id}`);
        console.log('    ├─ sourcePortId:', link.sourcePortId);
        console.log('    └─ targetPortId:', link.targetPortId);
      });
    }

    // Groups
    console.log('\n👥 ALL GROUPS:');
    const groups = diagram.getGroups();
    if (groups.length === 0) {
      console.log('  No groups created');
    } else {
      groups.forEach((group, index) => {
        console.log(`\n  [${index}] Group: ${group.id}`);
        console.log('    ├─ name:', group.name);
        console.log('    ├─ position:', group.position);
        console.log('    ├─ size:', group.size);
        console.log('    └─ members:', group.members);
      });
    }

    // Option B specific analysis
    console.log('\n🔍 OPTION B TABLES ANALYSIS:');
    const containerNodes = nodes.filter(n => n.type === 'erd-table-container-b');
    console.log(`  Found ${containerNodes.length} container nodes`);

    containerNodes.forEach((container, index) => {
      const childArray = Array.from(container.children);
      const tableName = childArray.length > 0
        ? diagram.getNode(childArray[0])?.data['tableName'] || 'Unknown'
        : 'Unknown';

      console.log(`\n  📋 Table ${index + 1}: ${tableName}`);

      const containerInfo = {
        id: container.id,
        position: { x: container.position.x, y: container.position.y },
        size: { width: container.size.width, height: container.size.height },
        childrenCount: container.children.size,
        useHTMLLayer: container.getMetadata('useHTMLLayer'),
        layout: container.getMetadata('layout'),
      };

      console.log('    Container Info:');
      console.log(JSON.stringify(containerInfo, null, 2));

      // Analyze children
      const childrenInfo: any[] = [];
      childArray.forEach((childId, childIdx) => {
        const child = diagram.getNode(childId);
        if (child) {
          const role = childIdx === 0 ? 'HEADER' : `FIELD ${childIdx}`;
          const childData = {
            role: role,
            id: child.id,
            type: child.type,
            position: { x: child.position.x, y: child.position.y },
            size: { width: child.size.width, height: child.size.height },
            parentId: child.parentId,
            useHTMLLayer: child.getMetadata('useHTMLLayer'),
            layout: child.getMetadata('layout'),
            data: child.data,
          };
          childrenInfo.push(childData);
        }
      });

      console.log('    Children:');
      console.log(JSON.stringify(childrenInfo, null, 2));
    });

    console.log('\n' + '='.repeat(80));
    console.log('✅ DIAGRAM STRUCTURE LOGGING COMPLETE');
    console.log('='.repeat(80) + '\n');
  }

  private createTableNode(table: Table, position: { x: number; y: number }): GroupModel {
    const diagram = this.engine.getDiagram();
    if (!diagram) throw new Error('Diagram not initialized');

    // Get ERD table template
    const tableTemplate = this.templateRegistry.get('erd-table');
    if (!tableTemplate) throw new Error('ERD Table template not found');

    // Create GroupModel for table (container for field nodes)
    const tableGroup = new GroupModel({ name: table.name });
    tableGroup.position = position;
    tableGroup.setMetadata('type', 'erd-table'); // Set type in metadata for HTML renderer
    tableGroup.setMetadata('tableId', table.id);
    tableGroup.setMetadata('tableName', table.name);

    // Apply template data (GroupModel uses metadata for all data)
    tableGroup.setMetadata('data', { tableName: table.name });
    tableGroup.setMetadata('tableName', table.name); // For easy access

    // Apply template structure to group for rendering
    if (tableTemplate.structure.html) {
      tableGroup.setMetadata('useHTMLLayer', true);
      tableGroup.setMetadata('html', tableTemplate.structure.html);
      // Also store in format the renderer expects
      tableGroup.setMetadata('_html', {
        mode: tableTemplate.structure.html.mode,
        template: tableTemplate.structure.html.template,
        className: tableTemplate.structure.html.className,
        style: tableTemplate.structure.html.style,
      });
    }
    if (tableTemplate.structure.shape) {
      tableGroup.setMetadata('shape', tableTemplate.structure.shape);
    }

    // Set layout from template (flex column for stacking fields)
    if (tableTemplate.structure.layout) {
      // Cast to FlexboxLayoutConfig since template uses flex column
      const flexLayout = tableTemplate.structure.layout as FlexboxLayoutConfig;
      tableGroup.setLayout('flexbox', flexLayout);
      // NOTE: Don't enable autoLayout yet - we'll do it after adding to diagram
    }

    // Calculate table size based on number of fields
    const rowHeight = 30;
    const headerHeight = 45;
    const height = headerHeight + (table.columns.length * rowHeight);
    tableGroup.size = { width: 250, height, depth: 0 };

    // Create field nodes as nested children using ERD field template
    table.columns.forEach((column) => {
      const fieldNode = this.nodeFactory.createFromTemplate('erd-field', {
        fieldName: column.name,
        fieldType: column.dataType,
        isPrimaryKey: column.isPrimaryKey,
        isForeignKey: column.isForeignKey,
        isNullable: column.isNullable,
      }, { x: 0, y: 0 }); // Position doesn't matter - flex layout will position it

      // Store column data in metadata for later retrieval
      fieldNode.setMetadata('columnData', column);
      fieldNode.setMetadata('tableName', table.name);

      // NOTE: NodeFactory already added the node to the diagram
      // We don't need to call diagram.addNode(fieldNode) here

      // Add field as member of table group
      tableGroup.addMember(fieldNode.id);
    });

    // Add table group to diagram FIRST
    diagram.addGroup(tableGroup);

    // Enable auto-layout AFTER adding to diagram to avoid warnings
    tableGroup.setMetadata('autoLayout', true);

    // Apply smart layout to position field nodes
    tableGroup.applyLayout(diagram);

    console.log(`✅ Created table '${table.name}' as GroupModel with ${table.columns.length} nested field nodes`);
    console.log(`📐 Using flex column layout with auto-positioning`);

    return tableGroup;
  }

  /**
   * Apply flexbox layout to position children nodes
   */
  private applyFlexLayout(containerNode: NodeModel): void {
    const diagram = this.engine.getDiagram();
    if (!diagram) return;

    const layoutConfig = containerNode.getMetadata('layout');
    if (!layoutConfig || !layoutConfig.direction) return;

    // Position children based on flex direction
    let offset = layoutConfig.padding?.top || 0;
    const gap = layoutConfig.gap || 0;
    const alignItems = layoutConfig.alignItems || 'start';

    // Calculate available width for stretching
    const containerWidth = containerNode.size.width;
    const horizontalPadding = (layoutConfig.padding?.left || 0) + (layoutConfig.padding?.right || 0);
    const availableWidth = containerWidth - horizontalPadding;

    containerNode.children.forEach((childId) => {
      const child = diagram.getNode(childId);
      if (child) {
        if (layoutConfig.direction === 'column') {
          // Stack vertically
          child.position.x = layoutConfig.padding?.left || 0;
          child.position.y = offset;

          // If alignItems is 'stretch', make child take full width
          if (alignItems === 'stretch') {
            child.size.width = availableWidth;
          }

          offset += child.size.height + gap;
        } else if (layoutConfig.direction === 'row') {
          // Stack horizontally
          child.position.x = offset;
          child.position.y = layoutConfig.padding?.top || 0;
          offset += child.size.width + gap;
        }
      }
    });
  }

  /**
   * OPTION A: Create table using template with children array
   * Container node has header child built-in via template
   */
  private createTableNodeOptionA(table: Table, position: { x: number; y: number }): NodeModel {
    const diagram = this.engine.getDiagram();
    if (!diagram) throw new Error('Diagram not initialized');

    // Create container node with header child from template
    const containerNode = this.nodeFactory.createFromTemplate('erd-table-option-a', {
      tableName: table.name,
    }, position);

    // Create field nodes as children of container
    table.columns.forEach((column, index) => {
      const fieldNode = this.nodeFactory.createFromTemplate('erd-field-option-a', {
        fieldName: column.name,
        fieldType: column.dataType,
        isPrimaryKey: column.isPrimaryKey,
        isForeignKey: column.isForeignKey,
        isNullable: column.isNullable,
      }, { x: 0, y: 0 }); // Position handled by layout

      // Add as child of container
      fieldNode.setParent(containerNode.id);
      containerNode.addChild(fieldNode.id);

      // Store metadata
      fieldNode.setMetadata('columnData', column);
      fieldNode.setMetadata('tableName', table.name);
      fieldNode.setMetadata('isLastField', index === table.columns.length - 1);
    });

    // Apply layout to position children
    this.applyFlexLayout(containerNode);

    console.log(`✅ Created Option A table '${table.name}' with ${table.columns.length} fields`);
    return containerNode;
  }

  /**
   * OPTION B: Create table using three separate templates
   * Container, header, and fields are all separate templates
   */
  private createTableNodeOptionB(table: Table, position: { x: number; y: number }): NodeModel {
    const diagram = this.engine.getDiagram();
    if (!diagram) throw new Error('Diagram not initialized');

    // Create container node
    const containerNode = this.nodeFactory.createFromTemplate('erd-table-container-b', {}, position);

    // Create header node as child
    const headerNode = this.nodeFactory.createFromTemplate('erd-table-header-b', {
      tableName: table.name,
    }, { x: 0, y: 0 });

    headerNode.setParent(containerNode.id);
    containerNode.addChild(headerNode.id);

    // Create field nodes as children
    table.columns.forEach((column, index) => {
      const isLastField = index === table.columns.length - 1;
      const fieldNode = this.nodeFactory.createFromTemplate('erd-field-option-b', {
        fieldName: column.name,
        fieldType: column.dataType,
        isPrimaryKey: column.isPrimaryKey,
        isForeignKey: column.isForeignKey,
        isNullable: column.isNullable,
        isLastField: isLastField,
      }, { x: 0, y: 0 });

      // Add as child of container
      fieldNode.setParent(containerNode.id);
      containerNode.addChild(fieldNode.id);

      // Store metadata
      fieldNode.setMetadata('columnData', column);
      fieldNode.setMetadata('tableName', table.name);
      fieldNode.setMetadata('isLastField', isLastField);
    });

    // Apply layout to position children (header + fields)
    this.applyFlexLayout(containerNode);

    // Auto-resize container to fit content + padding
    this.autoResizeContainer(containerNode);

    // Re-apply layout after resizing to stretch children to new container width
    this.applyFlexLayout(containerNode);

    console.log(`✅ Created Option B table '${table.name}' with ${table.columns.length} fields (container width: ${containerNode.size.width}px)`);
    return containerNode;
  }

  /**
   * Auto-resize container to fit its children + padding
   */
  private autoResizeContainer(containerNode: NodeModel): void {
    const diagram = this.engine.getDiagram();
    if (!diagram) return;

    const layoutConfig = containerNode.getMetadata('layout');
    if (!layoutConfig) return;

    let maxHeight = 0;
    let maxWidth = 0;

    // Calculate total height and max width needed for all children
    containerNode.children.forEach((childId) => {
      const child = diagram.getNode(childId);
      if (child) {
        const childBottom = child.position.y + child.size.height;
        if (childBottom > maxHeight) {
          maxHeight = childBottom;
        }

        // Calculate content width based on field data
        const contentWidth = this.calculateFieldContentWidth(child);
        if (contentWidth > maxWidth) {
          maxWidth = contentWidth;
        }
      }
    });

    // Add padding
    const bottomPadding = layoutConfig.padding?.bottom || 0;
    const horizontalPadding = (layoutConfig.padding?.left || 0) + (layoutConfig.padding?.right || 0);
    const totalHeight = maxHeight + bottomPadding;
    const totalWidth = Math.max(200, maxWidth + horizontalPadding);

    // Resize container to fit content
    containerNode.setSize(totalWidth, totalHeight);

    // CRITICAL: Also resize all children to match the new container width
    // This is necessary because children were created with static template widths (200px)
    // but need to stretch to the calculated container width
    containerNode.children.forEach((childId) => {
      const child = diagram.getNode(childId);
      if (child) {
        // Keep child's height, but update width to match container
        child.setSize(totalWidth, child.size.height);
      }
    });
  }

  /**
   * Calculate the required width for a field or header based on its content
   */
  private calculateFieldContentWidth(node: NodeModel): number {
    // Base width for padding and icon
    let width = 30; // Left/right padding + icon space

    // For headers (have tableName)
    if (node.data['tableName']) {
      width += node.data['tableName'].length * 8; // Headers use larger font
    }
    // For fields (have fieldName and fieldType)
    else if (node.data['fieldName']) {
      width += node.data['fieldName'].length * 7;

      // Add space for field type (approximate 6px per character for monospace)
      if (node.data['fieldType']) {
        width += node.data['fieldType'].length * 6 + 10; // Extra space for gap
      }
    }

    // Minimum width
    return Math.max(180, width);
  }

  addTable(): void {
    if (!this.newTableName.trim()) return;

    const newTable: Table = {
      id: this.newTableName.toLowerCase().replace(/\s+/g, '_'),
      name: this.newTableName,
      columns: [
        { name: 'id', dataType: 'INT', isPrimaryKey: true, isForeignKey: false, isNullable: false }
      ]
    };

    this.tables.set(newTable.id, newTable);
    this.createTableNode(newTable, { x: 100 + (this.tables.size * 50), y: 100 });

    this.newTableName = '';
    this.showAddTablePanel = false;
  }

  exportSQL(): void {
    let sql = '-- Generated SQL Schema\n\n';

    this.tables.forEach(table => {
      sql += `CREATE TABLE ${table.name} (\n`;

      const columnDefs = table.columns.map(col => {
        let def = `  ${col.name} ${col.dataType}`;
        if (col.isPrimaryKey) def += ' PRIMARY KEY';
        if (!col.isNullable && !col.isPrimaryKey) def += ' NOT NULL';
        return def;
      });

      sql += columnDefs.join(',\n');
      sql += '\n);\n\n';
    });

    // Download SQL file
    const blob = new Blob([sql], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'schema.sql';
    link.click();
    window.URL.revokeObjectURL(url);

    console.log('SQL exported:', sql);
  }

  onViewportChanged(rect: Rectangle): void {
    this.viewport = rect;
  }

  onZoomChanged(newZoom: number): void {
    this.zoom = newZoom;
  }

  private updateViewportFromDiagram(): void {
    const diagram = this.engine.getDiagram();
    if (diagram) {
      const vp = diagram.getViewport();
      this.viewport = { x: vp.x, y: vp.y, width: vp.width, height: vp.height };
      this.zoom = vp.zoom;
    }
  }

  zoomIn(): void {
    const diagram = this.engine.getDiagram();
    if (diagram) {
      const newZoom = Math.min(diagram.viewport.zoom * 1.1, 3.0);
      diagram.setZoom(newZoom);
      this.updateViewportFromDiagram();
    }
  }

  zoomOut(): void {
    const diagram = this.engine.getDiagram();
    if (diagram) {
      const newZoom = Math.max(diagram.viewport.zoom / 1.1, 0.1);
      diagram.setZoom(newZoom);
      this.updateViewportFromDiagram();
    }
  }

  fitToView(): void {
    const diagram = this.engine.getDiagram();
    if (diagram) {
      diagram.fitToView(100);
      this.updateViewportFromDiagram();
    }
  }
}
