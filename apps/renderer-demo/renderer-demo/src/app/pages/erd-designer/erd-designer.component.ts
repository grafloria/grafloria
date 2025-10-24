import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DiagramCanvasComponent } from '@grafloria/renderer-angular';
import { DiagramEngine, NodeModel } from '@grafloria/engine';
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
  tablePositions: Map<string, {x: number, y: number}> = new Map();

  // UI State
  showAddTablePanel = false;
  newTableName = '';
  selectedTable: Table | null = null;

  ngOnInit() {
    this.initializeEngine();
    this.createSampleERD();
  }

  private initializeEngine(): void {
    this.engine = new DiagramEngine();
    console.log('ERD Designer initialized');
  }

  private createSampleERD(): void {
    const diagram = this.engine.createDiagram('ERD Diagram');

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

    // Create relationships
    const usersNode = diagram.getNodes().find(n => n.getMetadata('tableId') === 'users');
    const ordersNode = diagram.getNodes().find(n => n.getMetadata('tableId') === 'orders');
    if (usersNode && ordersNode) {
      diagram.connectNodes(usersNode, ordersNode, 'direct');
    }

    diagram.fitToView(100);
    this.updateViewportFromDiagram();
  }

  private createTableNode(table: Table, position: { x: number; y: number }): void {
    const diagram = this.engine.getDiagram();
    if (!diagram) return;

    // Store position for rendering overlay
    this.tablePositions.set(table.id, position);

    const rowHeight = 30;
    const headerHeight = 40;
    const height = headerHeight + (table.columns.length * rowHeight);

    const node = new NodeModel({
      type: 'table',
      position,
      size: { width: 300, height }
    });

    node.setMetadata('tableId', table.id);
    node.setMetadata('tableName', table.name);
    node.setMetadata('columns', table.columns);

    diagram.addNode(node);
  }

  getTablePosition(tableId: string): {x: number, y: number} {
    return this.tablePositions.get(tableId) || {x: 0, y: 0};
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
