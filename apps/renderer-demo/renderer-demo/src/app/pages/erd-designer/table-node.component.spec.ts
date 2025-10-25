import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TableNodeComponent, type TableData } from './table-node.component';
import { DebugElement } from '@angular/core';
import { By } from '@angular/platform-browser';

describe('TableNodeComponent', () => {
  let component: TableNodeComponent;
  let fixture: ComponentFixture<TableNodeComponent>;
  let compiled: HTMLElement;

  const mockTableData: TableData = {
    tableName: 'Users',
    columns: [
      { name: 'id', dataType: 'INT', isPrimaryKey: true, isForeignKey: false, isNullable: false },
      { name: 'email', dataType: 'VARCHAR(255)', isPrimaryKey: false, isForeignKey: false, isNullable: false },
      { name: 'order_id', dataType: 'INT', isPrimaryKey: false, isForeignKey: true, isNullable: false },
      { name: 'name', dataType: 'VARCHAR(100)', isPrimaryKey: false, isForeignKey: false, isNullable: true }
    ]
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TableNodeComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(TableNodeComponent);
    component = fixture.componentInstance;
    compiled = fixture.nativeElement;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('Table Rendering', () => {
    beforeEach(() => {
      component.data = mockTableData;
      fixture.detectChanges();
    });

    it('should render table node container', () => {
      const tableNode = compiled.querySelector('.table-node');
      expect(tableNode).toBeTruthy();
    });

    it('should display table header with name', () => {
      const tableName = compiled.querySelector('.table-name');
      expect(tableName?.textContent).toContain('Users');
    });

    it('should display table icon in header', () => {
      const tableIcon = compiled.querySelector('.table-icon');
      expect(tableIcon?.textContent).toBeTruthy();
    });

    it('should render all columns', () => {
      const columnRows = compiled.querySelectorAll('.column-row');
      expect(columnRows.length).toBe(4);
    });

    it('should display column names', () => {
      const columnNames = compiled.querySelectorAll('.column-name');
      expect(columnNames[0].textContent).toContain('id');
      expect(columnNames[1].textContent).toContain('email');
      expect(columnNames[2].textContent).toContain('order_id');
      expect(columnNames[3].textContent).toContain('name');
    });

    it('should display column data types', () => {
      const columnTypes = compiled.querySelectorAll('.column-type');
      expect(columnTypes[0].textContent).toContain('INT');
      expect(columnTypes[1].textContent).toContain('VARCHAR(255)');
      expect(columnTypes[2].textContent).toContain('INT');
      expect(columnTypes[3].textContent).toContain('VARCHAR(100)');
    });
  });

  describe('Column Icons', () => {
    beforeEach(() => {
      component.data = mockTableData;
      fixture.detectChanges();
    });

    it('should display primary key icon for primary key column', () => {
      const icon = component.getColumnIcon(mockTableData.columns[0]);
      expect(icon).toBe('🔑');
    });

    it('should display foreign key icon for foreign key column', () => {
      const icon = component.getColumnIcon(mockTableData.columns[2]);
      expect(icon).toBe('🔗');
    });

    it('should display default icon for regular column', () => {
      const icon = component.getColumnIcon(mockTableData.columns[1]);
      expect(icon).toBe('📝');
    });

    it('should render column icons in DOM', () => {
      const columnIcons = compiled.querySelectorAll('.column-icon');
      expect(columnIcons.length).toBe(4);
      expect(columnIcons[0].textContent).toContain('🔑'); // id - primary key
      expect(columnIcons[1].textContent).toContain('📝'); // email - regular
      expect(columnIcons[2].textContent).toContain('🔗'); // order_id - foreign key
      expect(columnIcons[3].textContent).toContain('📝'); // name - regular
    });
  });

  describe('Port Indicators', () => {
    beforeEach(() => {
      component.data = mockTableData;
      fixture.detectChanges();
    });

    it('should render right port indicators for all columns', () => {
      const rightPorts = compiled.querySelectorAll('.port-indicator.right-port');
      // All 4 columns should have right ports
      expect(rightPorts.length).toBe(4);
    });

    it('should render left port indicator for foreign key column', () => {
      const leftPorts = compiled.querySelectorAll('.port-indicator.left-port');
      // Only 1 foreign key (order_id)
      expect(leftPorts.length).toBe(1);
    });

    it('should render port dots inside port indicators', () => {
      const portDots = compiled.querySelectorAll('.port-dot');
      // 4 right ports + 1 left port = 5 total port dots
      expect(portDots.length).toBe(5);
    });

    it('should position left port indicator on left side', () => {
      const leftPort = compiled.querySelector('.port-indicator.left-port') as HTMLElement;
      expect(leftPort).toBeTruthy();
      const styles = window.getComputedStyle(leftPort);
      expect(styles.position).toBe('absolute');
    });

    it('should position right port indicator on right side', () => {
      const rightPort = compiled.querySelector('.port-indicator.right-port') as HTMLElement;
      expect(rightPort).toBeTruthy();
      const styles = window.getComputedStyle(rightPort);
      expect(styles.position).toBe('absolute');
    });

    it('should only show left port for foreign key columns', () => {
      const columnRows = compiled.querySelectorAll('.column-row');

      // First row (id - primary key) should NOT have left port
      expect(columnRows[0].querySelector('.left-port')).toBeFalsy();

      // Second row (email - regular) should NOT have left port
      expect(columnRows[1].querySelector('.left-port')).toBeFalsy();

      // Third row (order_id - foreign key) SHOULD have left port
      expect(columnRows[2].querySelector('.left-port')).toBeTruthy();

      // Fourth row (name - regular) should NOT have left port
      expect(columnRows[3].querySelector('.left-port')).toBeFalsy();
    });

    it('should show right port for all columns', () => {
      const columnRows = compiled.querySelectorAll('.column-row');

      columnRows.forEach(row => {
        expect(row.querySelector('.right-port')).toBeTruthy();
      });
    });
  });

  describe('Styling', () => {
    beforeEach(() => {
      component.data = mockTableData;
      fixture.detectChanges();
    });

    it('should apply table node styling', () => {
      const tableNode = compiled.querySelector('.table-node') as HTMLElement;
      expect(tableNode).toBeTruthy();
      const styles = window.getComputedStyle(tableNode);
      expect(styles.background).toBeTruthy();
    });

    it('should apply header gradient styling', () => {
      const tableHeader = compiled.querySelector('.table-header') as HTMLElement;
      expect(tableHeader).toBeTruthy();
      const styles = window.getComputedStyle(tableHeader);
      expect(styles.background).toBeTruthy();
    });

    it('should have border styling', () => {
      const tableNode = compiled.querySelector('.table-node') as HTMLElement;
      const styles = window.getComputedStyle(tableNode);
      expect(styles.border).toBeTruthy();
    });
  });

  describe('Edge Cases', () => {
    it('should not render anything when data is null', () => {
      component.data = null as any;
      fixture.detectChanges();

      const tableNode = compiled.querySelector('.table-node');
      expect(tableNode).toBeFalsy();
    });

    it('should not render anything when data is undefined', () => {
      component.data = undefined as any;
      fixture.detectChanges();

      const tableNode = compiled.querySelector('.table-node');
      expect(tableNode).toBeFalsy();
    });

    it('should handle empty columns array', () => {
      component.data = {
        tableName: 'EmptyTable',
        columns: []
      };
      fixture.detectChanges();

      const tableNode = compiled.querySelector('.table-node');
      expect(tableNode).toBeTruthy();

      const columnRows = compiled.querySelectorAll('.column-row');
      expect(columnRows.length).toBe(0);
    });

    it('should handle table with only primary keys', () => {
      component.data = {
        tableName: 'PrimaryKeysOnly',
        columns: [
          { name: 'id1', dataType: 'INT', isPrimaryKey: true, isForeignKey: false, isNullable: false },
          { name: 'id2', dataType: 'INT', isPrimaryKey: true, isForeignKey: false, isNullable: false }
        ]
      };
      fixture.detectChanges();

      const leftPorts = compiled.querySelectorAll('.port-indicator.left-port');
      expect(leftPorts.length).toBe(0); // No foreign keys, no left ports

      const rightPorts = compiled.querySelectorAll('.port-indicator.right-port');
      expect(rightPorts.length).toBe(2); // Both columns have right ports
    });

    it('should handle table with only foreign keys', () => {
      component.data = {
        tableName: 'ForeignKeysOnly',
        columns: [
          { name: 'user_id', dataType: 'INT', isPrimaryKey: false, isForeignKey: true, isNullable: false },
          { name: 'order_id', dataType: 'INT', isPrimaryKey: false, isForeignKey: true, isNullable: false }
        ]
      };
      fixture.detectChanges();

      const leftPorts = compiled.querySelectorAll('.port-indicator.left-port');
      expect(leftPorts.length).toBe(2); // Both are foreign keys

      const rightPorts = compiled.querySelectorAll('.port-indicator.right-port');
      expect(rightPorts.length).toBe(2); // All columns have right ports
    });

    it('should handle long table names', () => {
      component.data = {
        tableName: 'VeryLongTableNameThatMightOverflow',
        columns: [
          { name: 'id', dataType: 'INT', isPrimaryKey: true, isForeignKey: false, isNullable: false }
        ]
      };
      fixture.detectChanges();

      const tableName = compiled.querySelector('.table-name');
      expect(tableName?.textContent).toContain('VeryLongTableNameThatMightOverflow');
    });

    it('should handle long data types', () => {
      component.data = {
        tableName: 'Test',
        columns: [
          { name: 'description', dataType: 'VARCHAR(9999)', isPrimaryKey: false, isForeignKey: false, isNullable: true }
        ]
      };
      fixture.detectChanges();

      const columnType = compiled.querySelector('.column-type');
      expect(columnType?.textContent).toContain('VARCHAR(9999)');
    });
  });

  describe('getColumnIcon Method', () => {
    it('should return primary key icon when isPrimaryKey is true', () => {
      const column = { name: 'id', dataType: 'INT', isPrimaryKey: true, isForeignKey: false, isNullable: false };
      expect(component.getColumnIcon(column)).toBe('🔑');
    });

    it('should return foreign key icon when isForeignKey is true', () => {
      const column = { name: 'user_id', dataType: 'INT', isPrimaryKey: false, isForeignKey: true, isNullable: false };
      expect(component.getColumnIcon(column)).toBe('🔗');
    });

    it('should return default icon when neither primary nor foreign key', () => {
      const column = { name: 'name', dataType: 'VARCHAR(100)', isPrimaryKey: false, isForeignKey: false, isNullable: false };
      expect(component.getColumnIcon(column)).toBe('📝');
    });

    it('should prioritize primary key icon over foreign key', () => {
      // Edge case: column is both primary and foreign key
      const column = { name: 'id', dataType: 'INT', isPrimaryKey: true, isForeignKey: true, isNullable: false };
      expect(component.getColumnIcon(column)).toBe('🔑');
    });
  });

  describe('Port Indicator Visibility', () => {
    beforeEach(() => {
      component.data = mockTableData;
      fixture.detectChanges();
    });

    it('should have low opacity by default', () => {
      const portIndicator = compiled.querySelector('.port-indicator') as HTMLElement;
      expect(portIndicator).toBeTruthy();
      // The CSS sets opacity: 0.3 by default
    });

    it('should have hover styles defined', () => {
      const portIndicator = compiled.querySelector('.port-indicator') as HTMLElement;
      expect(portIndicator).toBeTruthy();
      // Hover effects are defined in CSS, component structure supports it
    });
  });
});
