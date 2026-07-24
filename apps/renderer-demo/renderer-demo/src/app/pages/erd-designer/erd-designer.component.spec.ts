import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { ErdDesignerComponent } from './erd-designer.component';
import { TableNodeComponent } from './table-node.component';
import { DiagramCanvasComponent } from '@grafloria/angular';
import { DiagramEngine, NodeModel } from '@grafloria/engine';

describe('ErdDesignerComponent', () => {
  let component: ErdDesignerComponent;
  let fixture: ComponentFixture<ErdDesignerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ErdDesignerComponent, FormsModule, DiagramCanvasComponent, TableNodeComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(ErdDesignerComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('Initialization', () => {
    it('should initialize engine on ngOnInit', () => {
      component.ngOnInit();
      expect(component.engine).toBeTruthy();
      expect(component.engine instanceof DiagramEngine).toBe(true);
    });

    it('should create sample ERD on initialization', async () => {
      await component.ngOnInit();

      const diagram = component.engine.getDiagram();
      expect(diagram).toBeTruthy();

      const nodes = diagram?.getNodes();
      expect(nodes?.length).toBeGreaterThanOrEqual(3); // Users, Orders, Products
    });

    it('should initialize with correct viewport dimensions', () => {
      component.ngOnInit();

      expect(component.viewport).toBeDefined();
      expect(component.viewport.width).toBe(1200);
      expect(component.viewport.height).toBe(800);
    });

    it('should initialize with default zoom level', () => {
      component.ngOnInit();
      expect(component.zoom).toBe(1.0);
    });

    it('should initialize with light theme', () => {
      component.ngOnInit();
      expect(component.theme).toBeDefined();
      expect(component.theme.name).toContain('Light');
    });
  });

  describe('Table Creation', () => {
    beforeEach(async () => {
      await component.ngOnInit();
    });

    it('should create three sample tables', () => {
      expect(component.tables.size).toBe(3);
      expect(component.tables.has('users')).toBe(true);
      expect(component.tables.has('orders')).toBe(true);
      expect(component.tables.has('products')).toBe(true);
    });

    it('should create Users table with correct columns', () => {
      const usersTable = component.tables.get('users');
      expect(usersTable).toBeDefined();
      expect(usersTable?.name).toBe('Users');
      expect(usersTable?.columns.length).toBe(4);

      const idColumn = usersTable?.columns[0];
      expect(idColumn?.name).toBe('id');
      expect(idColumn?.isPrimaryKey).toBe(true);
      expect(idColumn?.isForeignKey).toBe(false);
    });

    it('should create Orders table with foreign key', () => {
      const ordersTable = component.tables.get('orders');
      expect(ordersTable).toBeDefined();

      const userIdColumn = ordersTable?.columns.find(col => col.name === 'user_id');
      expect(userIdColumn).toBeDefined();
      expect(userIdColumn?.isForeignKey).toBe(true);
    });

    it('should store table positions', () => {
      expect(component.tablePositions.size).toBe(3);
      expect(component.tablePositions.has('users')).toBe(true);
      expect(component.tablePositions.has('orders')).toBe(true);
      expect(component.tablePositions.has('products')).toBe(true);
    });

    it('should position tables at unique locations', () => {
      const usersPos = component.tablePositions.get('users');
      const ordersPos = component.tablePositions.get('orders');
      const productsPos = component.tablePositions.get('products');

      // All positions should be different
      expect(usersPos).not.toEqual(ordersPos);
      expect(usersPos).not.toEqual(productsPos);
      expect(ordersPos).not.toEqual(productsPos);
    });
  });

  describe('Node Creation and Port Logic', () => {
    beforeEach(async () => {
      await component.ngOnInit();
    });

    it('should create nodes for all tables in diagram', () => {
      const diagram = component.engine.getDiagram();
      const nodes = diagram?.getNodes();

      expect(nodes?.length).toBe(3);
    });

    it('should set table metadata on nodes', () => {
      const diagram = component.engine.getDiagram();
      const nodes = diagram?.getNodes();

      const usersNode = nodes?.find(n => n.getMetadata('tableId') === 'users');
      expect(usersNode).toBeDefined();
      expect(usersNode?.getMetadata('tableName')).toBe('Users');
      expect(usersNode?.getMetadata('columns')).toBeDefined();
    });

    it('should calculate node height based on column count', () => {
      const diagram = component.engine.getDiagram();
      const usersNode = diagram?.getNodes().find(n => n.getMetadata('tableId') === 'users');

      const usersTable = component.tables.get('users');
      const expectedHeight = 40 + (usersTable!.columns.length * 30); // header + rows

      expect(usersNode?.size.height).toBe(expectedHeight);
    });

    it('should set fixed width for table nodes', () => {
      const diagram = component.engine.getDiagram();
      const nodes = diagram?.getNodes();

      nodes?.forEach(node => {
        expect(node.size.width).toBe(300);
      });
    });

    it('should clear default ports before creating field-specific ports', () => {
      const diagram = component.engine.getDiagram();
      const usersNode = diagram?.getNodes().find(n => n.getMetadata('tableId') === 'users');

      const ports = usersNode?.getPorts();

      // Should NOT have the default 4 ports (top, right, bottom, left)
      // Should only have field-specific ports
      expect(ports?.length).toBeGreaterThan(4);
    });

    it('should create right port for every field', () => {
      const diagram = component.engine.getDiagram();
      const usersNode = diagram?.getNodes().find(n => n.getMetadata('tableId') === 'users');
      const usersTable = component.tables.get('users');

      const rightPorts = usersNode?.getPorts().filter(p => p.alignment.side === 'right');

      // Every field should have a right port
      expect(rightPorts?.length).toBe(usersTable?.columns.length);
    });

    it('should create left port only for foreign key fields', () => {
      const diagram = component.engine.getDiagram();
      const ordersNode = diagram?.getNodes().find(n => n.getMetadata('tableId') === 'orders');
      const ordersTable = component.tables.get('orders');

      const leftPorts = ordersNode?.getPorts().filter(p => p.alignment.side === 'left');
      const foreignKeyCount = ordersTable?.columns.filter(col => col.isForeignKey).length;

      // Only foreign keys should have left ports
      expect(leftPorts?.length).toBe(foreignKeyCount);
    });

    it('should position ports at correct field heights', () => {
      const diagram = component.engine.getDiagram();
      const usersNode = diagram?.getNodes().find(n => n.getMetadata('tableId') === 'users');
      const usersTable = component.tables.get('users');

      const ports = usersNode?.getPorts();
      const headerHeight = 40;
      const rowHeight = 30;

      // Check first field port position (id field)
      const firstFieldPorts = ports?.filter(p => p.alignment.offset === headerHeight + (rowHeight / 2));
      expect(firstFieldPorts?.length).toBeGreaterThan(0); // At least right port for first field

      // Check second field port position
      const secondFieldPorts = ports?.filter(p => p.alignment.offset === headerHeight + rowHeight + (rowHeight / 2));
      expect(secondFieldPorts?.length).toBeGreaterThan(0);
    });

    it('should create output ports for primary keys', () => {
      const diagram = component.engine.getDiagram();
      const usersNode = diagram?.getNodes().find(n => n.getMetadata('tableId') === 'users');

      const outputPorts = usersNode?.getPorts().filter(p => p.type === 'output');

      // All right ports should be output ports
      expect(outputPorts?.length).toBeGreaterThan(0);
    });

    it('should create input ports for foreign keys', () => {
      const diagram = component.engine.getDiagram();
      const ordersNode = diagram?.getNodes().find(n => n.getMetadata('tableId') === 'orders');

      const inputPorts = ordersNode?.getPorts().filter(p => p.type === 'input');

      // Foreign key left ports should be input ports
      expect(inputPorts?.length).toBeGreaterThan(0);
    });

    it('should have unique port positions for each field', () => {
      const diagram = component.engine.getDiagram();
      const usersNode = diagram?.getNodes().find(n => n.getMetadata('tableId') === 'users');

      const ports = usersNode?.getPorts();
      const offsets = ports?.map(p => p.alignment.offset);

      // Should have multiple different offsets (one per field row)
      const uniqueOffsets = new Set(offsets);
      expect(uniqueOffsets.size).toBeGreaterThan(1);
    });
  });

  describe('Relationships and Connections', () => {
    beforeEach(async () => {
      await component.ngOnInit();
    });

    it('should create relationship between Users and Orders', () => {
      const diagram = component.engine.getDiagram();
      const links = diagram?.getLinks();

      expect(links?.length).toBeGreaterThanOrEqual(1);
    });

    it('should connect correct ports for foreign key relationship', () => {
      const diagram = component.engine.getDiagram();
      const link = diagram?.getLinks()[0];

      expect(link?.sourcePortId).toBeDefined();
      expect(link?.targetPortId).toBeDefined();
    });

    it('should use orthogonal path type for connections', () => {
      const diagram = component.engine.getDiagram();
      const link = diagram?.getLinks()[0];

      expect(link?.pathType).toBe('orthogonal');
    });

    it('should set relationship metadata on links', () => {
      const diagram = component.engine.getDiagram();
      const link = diagram?.getLinks()[0];

      expect(link?.getMetadata('relationship')).toBe('1:N');
      expect(link?.getMetadata('label')).toBe('1:N');
    });

    it('should connect from primary key port to foreign key port', () => {
      const diagram = component.engine.getDiagram();
      const usersNode = diagram?.getNodes().find(n => n.getMetadata('tableId') === 'users');
      const ordersNode = diagram?.getNodes().find(n => n.getMetadata('tableId') === 'orders');
      const link = diagram?.getLinks()[0];

      // Source port should belong to users node
      const sourcePort = usersNode?.getPorts().find(p => p.id === link?.sourcePortId);
      expect(sourcePort).toBeDefined();
      expect(sourcePort?.type).toBe('output');

      // Target port should belong to orders node
      const targetPort = ordersNode?.getPorts().find(p => p.id === link?.targetPortId);
      expect(targetPort).toBeDefined();
      expect(targetPort?.type).toBe('input');
    });

    it('should not create duplicate connections', () => {
      const diagram = component.engine.getDiagram();
      const links = diagram?.getLinks();

      // Should have exactly one connection initially (Users -> Orders)
      expect(links?.length).toBe(1);
    });
  });

  describe('Zoom Controls', () => {
    beforeEach(async () => {
      await component.ngOnInit();
    });

    it('should zoom in correctly', () => {
      const initialZoom = component.zoom;
      component.zoomIn();

      expect(component.zoom).toBeGreaterThan(initialZoom);
    });

    it('should zoom out correctly', () => {
      const initialZoom = component.zoom;
      component.zoomOut();

      expect(component.zoom).toBeLessThan(initialZoom);
    });

    it('should not zoom beyond maximum (3.0)', () => {
      // Zoom in many times
      for (let i = 0; i < 20; i++) {
        component.zoomIn();
      }

      expect(component.zoom).toBeLessThanOrEqual(3.0);
    });

    it('should not zoom below minimum (0.1)', () => {
      // Zoom out many times
      for (let i = 0; i < 20; i++) {
        component.zoomOut();
      }

      expect(component.zoom).toBeGreaterThanOrEqual(0.1);
    });

    it('should fit view', () => {
      component.zoom = 2.0;
      component.fitToView();

      // fitToView should adjust zoom and viewport
      const diagram = component.engine.getDiagram();
      expect(diagram?.viewport.zoom).toBeDefined();
    });
  });

  describe('Table Addition', () => {
    beforeEach(async () => {
      await component.ngOnInit();
    });

    it('should add new table', () => {
      const initialCount = component.tables.size;
      component.newTableName = 'Categories';
      component.addTable();

      expect(component.tables.size).toBe(initialCount + 1);
      expect(component.tables.has('categories')).toBe(true);
    });

    it('should create table ID from name', () => {
      component.newTableName = 'Product Categories';
      component.addTable();

      expect(component.tables.has('product_categories')).toBe(true);
    });

    it('should add node to diagram when adding table', () => {
      const diagram = component.engine.getDiagram();
      const initialNodeCount = diagram?.getNodes().length || 0;

      component.newTableName = 'Categories';
      component.addTable();

      const newNodeCount = diagram?.getNodes().length || 0;
      expect(newNodeCount).toBe(initialNodeCount + 1);
    });

    it('should not add table with empty name', () => {
      const initialCount = component.tables.size;
      component.newTableName = '';
      component.addTable();

      expect(component.tables.size).toBe(initialCount);
    });

    it('should reset input after adding table', () => {
      component.newTableName = 'Categories';
      component.addTable();

      expect(component.newTableName).toBe('');
    });

    it('should hide add panel after adding table', () => {
      component.showAddTablePanel = true;
      component.newTableName = 'Categories';
      component.addTable();

      expect(component.showAddTablePanel).toBe(false);
    });

    it('should create new table with default id column', () => {
      component.newTableName = 'Categories';
      component.addTable();

      const newTable = component.tables.get('categories');
      expect(newTable?.columns.length).toBe(1);
      expect(newTable?.columns[0].name).toBe('id');
      expect(newTable?.columns[0].isPrimaryKey).toBe(true);
    });
  });

  describe('SQL Export', () => {
    beforeEach(async () => {
      await component.ngOnInit();
    });

    it('should generate SQL for all tables', () => {
      // Mock the download behavior
      const createElementSpy = spyOn(document, 'createElement').and.returnValue({
        href: '',
        download: '',
        click: jasmine.createSpy('click')
      } as any);

      const createObjectURLSpy = spyOn(window.URL, 'createObjectURL').and.returnValue('blob:test');

      component.exportSQL();

      expect(createElementSpy).toHaveBeenCalledWith('a');
      expect(createObjectURLSpy).toHaveBeenCalled();
    });
  });

  describe('Viewport Updates', () => {
    beforeEach(async () => {
      await component.ngOnInit();
    });

    it('should update viewport on viewport changed event', () => {
      const newViewport = { x: 100, y: 200, width: 1000, height: 600 };
      component.onViewportChanged(newViewport);

      expect(component.viewport.x).toBe(100);
      expect(component.viewport.y).toBe(200);
      expect(component.viewport.width).toBe(1000);
      expect(component.viewport.height).toBe(600);
    });

    it('should update zoom on zoom changed event', () => {
      component.onZoomChanged(1.5);
      expect(component.zoom).toBe(1.5);
    });
  });

  describe('Port Positioning - Field-Level Accuracy', () => {
    beforeEach(async () => {
      await component.ngOnInit();
    });

    it('should calculate exact pixel offset for each field port', () => {
      const diagram = component.engine.getDiagram();
      const usersNode = diagram?.getNodes().find(n => n.getMetadata('tableId') === 'users');
      const usersTable = component.tables.get('users');

      const headerHeight = 40;
      const rowHeight = 30;

      usersTable?.columns.forEach((column, index) => {
        const expectedOffset = headerHeight + (index * rowHeight) + (rowHeight / 2);

        // Find ports at this offset
        const portsAtOffset = usersNode?.getPorts().filter(p => p.alignment.offset === expectedOffset);

        // Should have at least right port for this field
        expect(portsAtOffset?.length).toBeGreaterThan(0);

        // If foreign key, should have both left and right ports
        if (column.isForeignKey) {
          expect(portsAtOffset?.length).toBe(2);
        } else {
          // Only right port
          expect(portsAtOffset?.length).toBe(1);
        }
      });
    });

    it('should not have overlapping port positions', () => {
      const diagram = component.engine.getDiagram();
      const nodes = diagram?.getNodes();

      nodes?.forEach(node => {
        const ports = node.getPorts();
        const positions = ports.map(p => `${p.alignment.side}-${p.alignment.offset}`);

        // Check for duplicates (same side + same offset = overlapping)
        const uniquePositions = new Set(positions);

        // Count by side
        const leftPorts = ports.filter(p => p.alignment.side === 'left');
        const rightPorts = ports.filter(p => p.alignment.side === 'right');

        // Right ports should equal number of columns
        const columns = node.getMetadata('columns');
        expect(rightPorts.length).toBe(columns.length);

        // No two ports on same side should have same offset
        const leftOffsets = leftPorts.map(p => p.alignment.offset);
        const uniqueLeftOffsets = new Set(leftOffsets);
        expect(uniqueLeftOffsets.size).toBe(leftOffsets.length);

        const rightOffsets = rightPorts.map(p => p.alignment.offset);
        const uniqueRightOffsets = new Set(rightOffsets);
        expect(uniqueRightOffsets.size).toBe(rightOffsets.length);
      });
    });
  });

  describe('getTablePosition Method', () => {
    beforeEach(async () => {
      await component.ngOnInit();
    });

    it('should return stored position for existing table', () => {
      const position = component.getTablePosition('users');
      expect(position).toBeDefined();
      expect(position.x).toBe(100);
      expect(position.y).toBe(100);
    });

    it('should return default position for non-existent table', () => {
      const position = component.getTablePosition('nonexistent');
      expect(position.x).toBe(0);
      expect(position.y).toBe(0);
    });
  });
});
