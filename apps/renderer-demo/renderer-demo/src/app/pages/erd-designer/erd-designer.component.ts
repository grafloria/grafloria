import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DiagramCanvasComponent } from '@grafloria/renderer-angular';
import {
  DiagramEngine,
  NodeModel,
  PortModel,
  LinkModel,
  GroupModel,
  InteractionMode,
  PortVisibilityStrategy,
  NodeFactory,
  TemplateRegistry,
  registerTemplateLibrary,
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

    // Create node factory
    const diagram = this.engine.createDiagram('ERD Diagram');
    this.nodeFactory = new NodeFactory(this.templateRegistry, diagram);

    console.log('✅ ERD Designer initialized with template system');
  }

  private async createSampleERD(): Promise<void> {
    const diagram = this.engine.getDiagram();
    if (!diagram) return;

    // Create Users table
    const usersTable: Table = {
      id: 'users',
      name: 'Users',
      columns: [
        { name: 'id', dataType: 'INT', isPrimaryKey: true, isForeignKey: false, isNullable: false },
        { name: 'email', dataType: 'VARCHAR(255)', isPrimaryKey: false, isForeignKey: false, isNullable: false },
        { name: 'name', dataType: 'VARCHAR(100)', isPrimaryKey: false, isForeignKey: false, isNullable: false },
        { name: 'created_at', dataType: 'TIMESTAMP', isPrimaryKey: false, isForeignKey: false, isNullable: false }
      ]
    };
    this.tables.set('users', usersTable);
    this.createTableNode(usersTable, { x: 100, y: 100 });

    // Create Orders table
    const ordersTable: Table = {
      id: 'orders',
      name: 'Orders',
      columns: [
        { name: 'id', dataType: 'INT', isPrimaryKey: true, isForeignKey: false, isNullable: false },
        { name: 'user_id', dataType: 'INT', isPrimaryKey: false, isForeignKey: true, isNullable: false },
        { name: 'total', dataType: 'DECIMAL(10,2)', isPrimaryKey: false, isForeignKey: false, isNullable: false },
        { name: 'status', dataType: 'VARCHAR(50)', isPrimaryKey: false, isForeignKey: false, isNullable: false }
      ]
    };
    this.tables.set('orders', ordersTable);
    this.createTableNode(ordersTable, { x: 500, y: 100 });

    // Create Products table
    const productsTable: Table = {
      id: 'products',
      name: 'Products',
      columns: [
        { name: 'id', dataType: 'INT', isPrimaryKey: true, isForeignKey: false, isNullable: false },
        { name: 'name', dataType: 'VARCHAR(255)', isPrimaryKey: false, isForeignKey: false, isNullable: false },
        { name: 'price', dataType: 'DECIMAL(10,2)', isPrimaryKey: false, isForeignKey: false, isNullable: false },
        { name: 'stock', dataType: 'INT', isPrimaryKey: false, isForeignKey: false, isNullable: false }
      ]
    };
    this.tables.set('products', productsTable);
    this.createTableNode(productsTable, { x: 100, y: 400 });

    // Create relationships with field-level connections
    // Find the table group nodes
    const usersTableGroup = diagram.getGroups().find(g => g.getMetadata('tableId') === 'users') as GroupModel;
    const ordersTableGroup = diagram.getGroups().find(g => g.getMetadata('tableId') === 'orders') as GroupModel;

    if (usersTableGroup && ordersTableGroup) {
      // Get field nodes (members of the table groups)
      const usersMemberIds = Array.from(usersTableGroup.members);
      const ordersMemberIds = Array.from(ordersTableGroup.members);

      // Find users.id field node (primary key)
      const usersIdField = usersMemberIds
        .map(id => diagram.getNode(id))
        .find(node => node?.getMetadata('columnData')?.name === 'id');

      // Find orders.user_id field node (foreign key)
      const ordersUserIdField = ordersMemberIds
        .map(id => diagram.getNode(id))
        .find(node => node?.getMetadata('columnData')?.name === 'user_id');

      if (usersIdField && ordersUserIdField) {
        // Get output port from users.id field (right side)
        const usersIdPort = usersIdField.getPorts().find(p => p.type === 'output');
        // Get input port from orders.user_id field (left side)
        const ordersUserIdPort = ordersUserIdField.getPorts().find(p => p.type === 'input');

        if (usersIdPort && ordersUserIdPort) {
          // Create link between field nodes
          const link = new LinkModel(usersIdPort.id, ordersUserIdPort.id);
          link.setMetadata('relationship', '1:N');
          link.setMetadata('label', '1:N');
          link.setMetadata('description', 'One user has many orders');

          // Register connection with ports
          usersIdPort.addConnection(link.id);
          ordersUserIdPort.addConnection(link.id);

          // Add link to diagram
          diagram.addLink(link);

          console.log('✅ Created relationship: Users.id → Orders.user_id using nested field nodes');
        }
      }
    }

    diagram.fitToView(100);
    this.updateViewportFromDiagram();
  }

  private createTableNode(table: Table, position: { x: number; y: number }): GroupModel {
    const diagram = this.engine.getDiagram();
    if (!diagram) throw new Error('Diagram not initialized');

    // Create table node using ERD template
    const tableNode = this.nodeFactory.createFromTemplate('erd-table', {
      tableName: table.name,
    }, position) as GroupModel;

    tableNode.setMetadata('tableId', table.id);

    // Calculate table size based on fields
    const rowHeight = 30;
    const headerHeight = 45;
    const height = headerHeight + (table.columns.length * rowHeight);
    tableNode.size = { width: 250, height, depth: 0 };

    // Create field nodes as nested children
    const fieldNodes: NodeModel[] = [];
    table.columns.forEach((column) => {
      const fieldNode = this.nodeFactory.createFromTemplate('erd-field', {
        fieldName: column.name,
        fieldType: column.dataType,
        isPrimaryKey: column.isPrimaryKey,
        isForeignKey: column.isForeignKey,
        isNullable: column.isNullable,
      }, { x: 0, y: 0 }); // Position doesn't matter - layout will handle it

      fieldNode.setMetadata('columnData', column);
      fieldNodes.push(fieldNode);

      // Add field as member of table group
      tableNode.addMember(fieldNode.id);
    });

    // Apply smart layout to stack fields vertically
    tableNode.applyLayout(diagram);

    console.log(`✅ Created table '${table.name}' with ${fieldNodes.length} field nodes using nested architecture`);
    return tableNode;
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
