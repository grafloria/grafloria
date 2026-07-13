/**
 * Angular Component Adapter - End-to-End Integration Test
 *
 * Tests the complete flow from NodeModel to rendered Angular component
 * including lifecycle, updates, and destruction.
 */

import { TestBed } from '@angular/core/testing';
import { Component, Input, OnDestroy, OnInit, ViewContainerRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AngularComponentAdapter } from './angular-component-adapter';
import { NodeModel, DiagramModel } from '@grafloria/engine';

/**
 * Real-world ERD Table Component
 */
@Component({
  selector: 'grafloria-erd-table-integration',
  template: `
    <div class="erd-table" [style.width.px]="width" [style.height.px]="height">
      <div class="table-header">
        <strong>{{ tableName }}</strong>
      </div>
      <div class="table-columns">
        <div *ngFor="let column of columns; let i = index" class="column-row">
          <span class="column-name">{{ column.name }}</span>
          <span class="column-type">{{ column.type }}</span>
          <span *ngIf="column.primaryKey" class="pk-indicator">PK</span>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .erd-table {
      border: 1px solid #ccc;
      background: white;
      font-family: Arial, sans-serif;
    }
    .table-header {
      background: #007bff;
      color: white;
      padding: 8px;
      font-size: 14px;
    }
    .column-row {
      padding: 4px 8px;
      border-bottom: 1px solid #eee;
      font-size: 12px;
    }
    .column-name {
      font-weight: bold;
      margin-right: 8px;
    }
    .column-type {
      color: #666;
    }
    .pk-indicator {
      margin-left: 8px;
      color: #ffc107;
    }
  `],
  standalone: true,
  imports: [CommonModule],
})
class ErdTableIntegrationComponent implements OnInit, OnDestroy {
  @Input() tableName = '';
  @Input() columns: Array<{ name: string; type: string; primaryKey?: boolean }> = [];
  @Input() positionX = 0;
  @Input() positionY = 0;
  @Input() width = 200;
  @Input() height = 150;

  initCalled = false;
  destroyCalled = false;

  ngOnInit(): void {
    this.initCalled = true;
  }

  ngOnDestroy(): void {
    this.destroyCalled = true;
  }
}

describe('AngularComponentAdapter - End-to-End Integration', () => {
  let adapter: AngularComponentAdapter;
  let viewContainerRef: ViewContainerRef;
  let diagram: DiagramModel;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [AngularComponentAdapter],
    });

    adapter = TestBed.inject(AngularComponentAdapter);

    // Create ViewContainerRef
    const hostFixture = TestBed.createComponent(ErdTableIntegrationComponent);
    viewContainerRef = hostFixture.componentRef.injector.get(ViewContainerRef);

    // Create diagram
    diagram = new DiagramModel('test-diagram');
  });

  afterEach(() => {
    adapter.destroyAll?.();
    diagram = null as any;
  });

  describe('Complete Workflow: Register → Create → Update → Destroy', () => {
    it('should handle complete ERD table node lifecycle', () => {
      // Step 1: Register component
      adapter.registerComponent('erd.table', ErdTableIntegrationComponent);

      expect(adapter.hasComponent('erd.table')).toBe(true);
      expect(adapter.getRegisteredTypes()).toContain('erd.table');

      // Step 2: Create node
      const tableNode = new NodeModel({
        id: 'users-table',
        type: 'erd.table',
        position: { x: 100, y: 200 },
        size: { width: 250, height: 180 },
      });
      tableNode.data = {
        tableName: 'users',
        columns: [
          { name: 'id', type: 'integer', primaryKey: true },
          { name: 'name', type: 'string' },
          { name: 'email', type: 'string' },
        ],
      };

      // Add to diagram
      diagram.addNode(tableNode);

      // Step 3: Create component instance
      const instance = adapter.createComponentInstance(tableNode, viewContainerRef);

      expect(instance).toBeDefined();

      const componentRef = instance as any;
      const component = componentRef.instance;

      expect(component.tableName).toBe('users');
      expect(component.columns.length).toBe(3);
      expect(component.columns[0].name).toBe('id');
      expect(component.columns[0].primaryKey).toBe(true);
      expect(component.positionX).toBe(100);
      expect(component.positionY).toBe(200);
      expect(component.width).toBe(250);
      expect(component.height).toBe(180);
      expect(component.initCalled).toBe(true);

      // Step 4: Update node - change table name and add column
      tableNode.data = {
        tableName: 'products',
        columns: [
          { name: 'id', type: 'integer', primaryKey: true },
          { name: 'name', type: 'string' },
          { name: 'price', type: 'decimal' },
          { name: 'stock', type: 'integer' },
        ],
      };

      adapter.updateComponentInstance(instance, tableNode);

      expect(component.tableName).toBe('products');
      expect(component.columns.length).toBe(4);
      expect(component.columns[2].name).toBe('price');

      // Step 5: Move node
      tableNode.setPosition(300, 400);

      adapter.updateComponentInstance(instance, tableNode);

      expect(component.positionX).toBe(300);
      expect(component.positionY).toBe(400);

      // Step 6: Destroy
      adapter.destroyComponentInstance(instance);

      expect(component.destroyCalled).toBe(true);
    });

    it('should handle multiple ERD tables in a diagram', () => {
      adapter.registerComponent('erd.table', ErdTableIntegrationComponent);

      // Create users table
      const usersTable = new NodeModel({
        id: 'users-table',
        type: 'erd.table',
        position: { x: 100, y: 100 },
        size: { width: 200, height: 150 },
      });
      usersTable.data = {
        tableName: 'users',
        columns: [
          { name: 'id', type: 'integer', primaryKey: true },
          { name: 'name', type: 'string' },
        ],
      };

      // Create orders table
      const ordersTable = new NodeModel({
        id: 'orders-table',
        type: 'erd.table',
        position: { x: 400, y: 100 },
        size: { width: 200, height: 150 },
      });
      ordersTable.data = {
        tableName: 'orders',
        columns: [
          { name: 'id', type: 'integer', primaryKey: true },
          { name: 'user_id', type: 'integer' },
          { name: 'total', type: 'decimal' },
        ],
      };

      // Add to diagram
      diagram.addNode(usersTable);
      diagram.addNode(ordersTable);

      // Create instances
      const usersInstance = adapter.createComponentInstance(usersTable, viewContainerRef);
      const ordersInstance = adapter.createComponentInstance(ordersTable, viewContainerRef);

      const usersComponent = (usersInstance as any).instance;
      const ordersComponent = (ordersInstance as any).instance;

      expect(usersComponent.tableName).toBe('users');
      expect(ordersComponent.tableName).toBe('orders');

      expect(usersComponent.columns.length).toBe(2);
      expect(ordersComponent.columns.length).toBe(3);

      expect(adapter.getActiveCount()).toBe(2);

      // Update users table
      usersTable.data = {
        tableName: 'users_updated',
        columns: [
          { name: 'id', type: 'integer', primaryKey: true },
          { name: 'name', type: 'string' },
          { name: 'created_at', type: 'timestamp' },
        ],
      };

      adapter.updateComponentInstance(usersInstance, usersTable);

      // Orders table should be unaffected
      expect(usersComponent.tableName).toBe('users_updated');
      expect(usersComponent.columns.length).toBe(3);
      expect(ordersComponent.tableName).toBe('orders');
      expect(ordersComponent.columns.length).toBe(3);

      // Clean up
      adapter.destroyComponentInstance(usersInstance);
      adapter.destroyComponentInstance(ordersInstance);

      expect(usersComponent.destroyCalled).toBe(true);
      expect(ordersComponent.destroyCalled).toBe(true);
    });

    it('should handle node removal from diagram', () => {
      adapter.registerComponent('erd.table', ErdTableIntegrationComponent);

      const tableNode = new NodeModel({
        id: 'test-table',
        type: 'erd.table',
        position: { x: 0, y: 0 },
      });
      tableNode.data = {
        tableName: 'test',
        columns: [{ name: 'id', type: 'integer' }],
      };

      diagram.addNode(tableNode);

      const instance = adapter.createComponentInstance(tableNode, viewContainerRef);
      const component = (instance as any).instance;

      expect(diagram.getNode('test-table')).toBe(tableNode);

      // Remove from diagram
      diagram.removeNode('test-table');

      expect(diagram.getNode('test-table')).toBeUndefined();

      // Destroy component
      adapter.destroyComponentInstance(instance);

      expect(component.destroyCalled).toBe(true);
    });
  });

  describe('Real-World Scenarios', () => {
    it('should handle rapid updates (simulating user editing)', () => {
      adapter.registerComponent('erd.table', ErdTableIntegrationComponent);

      const tableNode = new NodeModel({
        id: 'editable-table',
        type: 'erd.table',
        position: { x: 0, y: 0 },
      });
      tableNode.data = {
        tableName: 'table1',
        columns: [],
      };

      const instance = adapter.createComponentInstance(tableNode, viewContainerRef);
      const component = (instance as any).instance;

      // Simulate rapid edits
      for (let i = 1; i <= 10; i++) {
        tableNode.data = {
          tableName: `table${i}`,
          columns: Array.from({ length: i }, (_, idx) => ({
            name: `col${idx + 1}`,
            type: 'string',
          })),
        };

        adapter.updateComponentInstance(instance, tableNode);

        expect(component.tableName).toBe(`table${i}`);
        expect(component.columns.length).toBe(i);
      }

      adapter.destroyComponentInstance(instance);
    });

    it('should handle node with minimal data', () => {
      adapter.registerComponent('erd.table', ErdTableIntegrationComponent);

      const minimalNode = new NodeModel({
        id: 'minimal',
        type: 'erd.table',
        position: { x: 0, y: 0 },
      });
      // No data set - component should use defaults

      const instance = adapter.createComponentInstance(minimalNode, viewContainerRef);
      const component = (instance as any).instance;

      expect(component.tableName).toBe('');
      expect(component.columns).toEqual([]);

      adapter.destroyComponentInstance(instance);
    });

    it('should handle bulk operations', () => {
      adapter.registerComponent('erd.table', ErdTableIntegrationComponent);

      const nodes: NodeModel[] = [];
      const instances: any[] = [];

      // Create 20 tables
      for (let i = 0; i < 20; i++) {
        const node = new NodeModel({
          id: `table-${i}`,
          type: 'erd.table',
          position: { x: i * 250, y: Math.floor(i / 5) * 200 },
        });
        node.data = {
          tableName: `table_${i}`,
          columns: [{ name: 'id', type: 'integer', primaryKey: true }],
        };

        nodes.push(node);
        diagram.addNode(node);

        const instance = adapter.createComponentInstance(node, viewContainerRef);
        instances.push(instance);
      }

      expect(adapter.getActiveCount()).toBe(20);

      // Update all
      for (let i = 0; i < nodes.length; i++) {
        nodes[i].data = {
          tableName: `updated_table_${i}`,
          columns: [
            { name: 'id', type: 'integer', primaryKey: true },
            { name: 'created_at', type: 'timestamp' },
          ],
        };

        adapter.updateComponentInstance(instances[i], nodes[i]);

        const component = (instances[i] as any).instance;
        expect(component.tableName).toBe(`updated_table_${i}`);
        expect(component.columns.length).toBe(2);
      }

      // Destroy all
      instances.forEach((instance) => {
        adapter.destroyComponentInstance(instance);
      });

      expect(adapter.getActiveCount()).toBe(0);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should throw error when creating instance for unregistered type', () => {
      const node = new NodeModel({
        id: 'unregistered',
        type: 'unknown.type',
        position: { x: 0, y: 0 },
      });

      expect(() => {
        adapter.createComponentInstance(node, viewContainerRef);
      }).toThrow(/no component registered/i);
    });

    it('should handle destroying instance twice', () => {
      adapter.registerComponent('erd.table', ErdTableIntegrationComponent);

      const node = new NodeModel({
        id: 'test',
        type: 'erd.table',
        position: { x: 0, y: 0 },
      });
      node.data = { tableName: 'test', columns: [] };

      const instance = adapter.createComponentInstance(node, viewContainerRef);

      adapter.destroyComponentInstance(instance);

      expect(() => {
        adapter.destroyComponentInstance(instance);
      }).not.toThrow();
    });

    it('should handle updating after destroy', () => {
      adapter.registerComponent('erd.table', ErdTableIntegrationComponent);

      const node = new NodeModel({
        id: 'test',
        type: 'erd.table',
        position: { x: 0, y: 0 },
      });
      node.data = { tableName: 'test', columns: [] };

      const instance = adapter.createComponentInstance(node, viewContainerRef);

      adapter.destroyComponentInstance(instance);

      // Updating destroyed instance should not throw
      expect(() => {
        adapter.updateComponentInstance(instance, node);
      }).not.toThrow();
    });
  });
});
