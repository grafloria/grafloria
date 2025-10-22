// GroupModel Layout Configuration Tests (Phase 1.7)

import { GroupModel } from './GroupModel';
import type { FlexboxLayoutConfig, GridLayoutConfig } from '../types/layout.types';

describe('GroupModel - Layout Configuration (Phase 1.7)', () => {
  describe('Flexbox Layout', () => {
    it('should set flexbox layout configuration', () => {
      const group = new GroupModel({ name: 'Container' });

      const flexConfig: FlexboxLayoutConfig = {
        direction: 'row',
        wrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        alignContent: 'stretch',
        gap: 10,
      };

      group.setLayout('flexbox', flexConfig);

      expect(group.layoutType).toBe('flexbox');
      expect(group.layoutConfig).toEqual(flexConfig);
      expect(group.hasLayout()).toBe(true);
    });

    it('should emit layout:changed event when setting flexbox layout', (done) => {
      const group = new GroupModel({ name: 'Container' });

      const flexConfig: FlexboxLayoutConfig = {
        direction: 'column',
        wrap: 'nowrap',
        justifyContent: 'start',
        alignItems: 'stretch',
        alignContent: 'stretch',
        gap: 0,
      };

      group.on('layout:changed', (event: any) => {
        expect(event.type).toBe('flexbox');
        expect(event.config).toEqual(flexConfig);
        done();
      });

      group.setLayout('flexbox', flexConfig);
    });

    it('should get flexbox layout configuration', () => {
      const group = new GroupModel({ name: 'Container' });

      const flexConfig: FlexboxLayoutConfig = {
        direction: 'row',
        wrap: 'nowrap',
        justifyContent: 'center',
        alignItems: 'center',
        alignContent: 'center',
        gap: 20,
      };

      group.setLayout('flexbox', flexConfig);

      const retrieved = group.getFlexboxLayout();
      expect(retrieved).toEqual(flexConfig);
    });

    it('should throw error when getting flexbox layout from non-flexbox group', () => {
      const group = new GroupModel({ name: 'Container' });

      expect(() => group.getFlexboxLayout()).toThrow(
        'Group ' + group.id + ' does not have flexbox layout'
      );
    });

    it('should support flexbox gap as object', () => {
      const group = new GroupModel({ name: 'Container' });

      const flexConfig: FlexboxLayoutConfig = {
        direction: 'row',
        wrap: 'nowrap',
        justifyContent: 'start',
        alignItems: 'start',
        alignContent: 'start',
        gap: { row: 10, column: 20 },
      };

      group.setLayout('flexbox', flexConfig);

      const retrieved = group.getFlexboxLayout();
      expect(retrieved.gap).toEqual({ row: 10, column: 20 });
    });

    it('should support flexbox padding', () => {
      const group = new GroupModel({ name: 'Container' });

      const flexConfig: FlexboxLayoutConfig = {
        direction: 'row',
        wrap: 'nowrap',
        justifyContent: 'start',
        alignItems: 'start',
        alignContent: 'start',
        gap: 0,
        padding: { top: 10, right: 15, bottom: 10, left: 15 },
      };

      group.setLayout('flexbox', flexConfig);

      const retrieved = group.getFlexboxLayout();
      expect(retrieved.padding).toEqual({ top: 10, right: 15, bottom: 10, left: 15 });
    });
  });

  describe('Grid Layout', () => {
    it('should set grid layout configuration', () => {
      const group = new GroupModel({ name: 'Container' });

      const gridConfig: GridLayoutConfig = {
        templateColumns: 'repeat(3, 1fr)',
        templateRows: 'auto',
        columnGap: 10,
        rowGap: 10,
        autoFlow: 'row',
      };

      group.setLayout('grid', gridConfig);

      expect(group.layoutType).toBe('grid');
      expect(group.layoutConfig).toEqual(gridConfig);
      expect(group.hasLayout()).toBe(true);
    });

    it('should emit layout:changed event when setting grid layout', (done) => {
      const group = new GroupModel({ name: 'Container' });

      const gridConfig: GridLayoutConfig = {
        templateColumns: '100px 200px auto',
        templateRows: '50px 100px',
        columnGap: 5,
        rowGap: 5,
        autoFlow: 'column',
      };

      group.on('layout:changed', (event: any) => {
        expect(event.type).toBe('grid');
        expect(event.config).toEqual(gridConfig);
        done();
      });

      group.setLayout('grid', gridConfig);
    });

    it('should get grid layout configuration', () => {
      const group = new GroupModel({ name: 'Container' });

      const gridConfig: GridLayoutConfig = {
        templateColumns: 'repeat(4, 1fr)',
        templateRows: 'auto',
        columnGap: 15,
        rowGap: 15,
        autoFlow: 'dense',
      };

      group.setLayout('grid', gridConfig);

      const retrieved = group.getGridLayout();
      expect(retrieved).toEqual(gridConfig);
    });

    it('should throw error when getting grid layout from non-grid group', () => {
      const group = new GroupModel({ name: 'Container' });

      expect(() => group.getGridLayout()).toThrow(
        'Group ' + group.id + ' does not have grid layout'
      );
    });

    it('should support grid template areas', () => {
      const group = new GroupModel({ name: 'Container' });

      const gridConfig: GridLayoutConfig = {
        templateColumns: '1fr 2fr 1fr',
        templateRows: 'auto 1fr auto',
        templateAreas: [
          'header header header',
          'sidebar content content',
          'footer footer footer',
        ],
        columnGap: 10,
        rowGap: 10,
        autoFlow: 'row',
      };

      group.setLayout('grid', gridConfig);

      const retrieved = group.getGridLayout();
      expect(retrieved.templateAreas).toEqual(gridConfig.templateAreas);
    });

    it('should support grid auto-columns and auto-rows', () => {
      const group = new GroupModel({ name: 'Container' });

      const gridConfig: GridLayoutConfig = {
        templateColumns: 'repeat(3, 1fr)',
        templateRows: 'auto',
        columnGap: 10,
        rowGap: 10,
        autoFlow: 'row',
        autoColumns: 'minmax(100px, 1fr)',
        autoRows: 'minmax(50px, auto)',
      };

      group.setLayout('grid', gridConfig);

      const retrieved = group.getGridLayout();
      expect(retrieved.autoColumns).toBe('minmax(100px, 1fr)');
      expect(retrieved.autoRows).toBe('minmax(50px, auto)');
    });

    it('should support grid alignment properties', () => {
      const group = new GroupModel({ name: 'Container' });

      const gridConfig: GridLayoutConfig = {
        templateColumns: 'repeat(3, 1fr)',
        templateRows: 'auto',
        columnGap: 10,
        rowGap: 10,
        autoFlow: 'row',
        justifyItems: 'center',
        alignItems: 'start',
        justifyContent: 'space-between',
        alignContent: 'space-around',
      };

      group.setLayout('grid', gridConfig);

      const retrieved = group.getGridLayout();
      expect(retrieved.justifyItems).toBe('center');
      expect(retrieved.alignItems).toBe('start');
      expect(retrieved.justifyContent).toBe('space-between');
      expect(retrieved.alignContent).toBe('space-around');
    });
  });

  describe('Layout Management', () => {
    it('should clear layout configuration', () => {
      const group = new GroupModel({ name: 'Container' });

      const flexConfig: FlexboxLayoutConfig = {
        direction: 'row',
        wrap: 'nowrap',
        justifyContent: 'start',
        alignItems: 'start',
        alignContent: 'start',
        gap: 10,
      };

      group.setLayout('flexbox', flexConfig);
      expect(group.hasLayout()).toBe(true);

      group.clearLayout();

      expect(group.layoutType).toBe('none');
      expect(group.layoutConfig).toBeUndefined();
      expect(group.hasLayout()).toBe(false);
    });

    it('should emit layout:cleared event when clearing layout', (done) => {
      const group = new GroupModel({ name: 'Container' });

      const flexConfig: FlexboxLayoutConfig = {
        direction: 'row',
        wrap: 'nowrap',
        justifyContent: 'start',
        alignItems: 'start',
        alignContent: 'start',
        gap: 10,
      };

      group.setLayout('flexbox', flexConfig);

      group.on('layout:cleared', () => {
        expect(group.layoutType).toBe('none');
        done();
      });

      group.clearLayout();
    });

    it('should get layout info', () => {
      const group = new GroupModel({ name: 'Container' });

      const flexConfig: FlexboxLayoutConfig = {
        direction: 'column',
        wrap: 'wrap',
        justifyContent: 'center',
        alignItems: 'center',
        alignContent: 'center',
        gap: 15,
      };

      group.setLayout('flexbox', flexConfig);

      const layout = group.getLayout();
      expect(layout.type).toBe('flexbox');
      expect(layout.config).toEqual(flexConfig);
    });

    it('should return none layout for new groups', () => {
      const group = new GroupModel({ name: 'Container' });

      const layout = group.getLayout();
      expect(layout.type).toBe('none');
      expect(layout.config).toBeUndefined();
    });

    it('should track layout changes', () => {
      const group = new GroupModel({ name: 'Container' });
      const initialVersion = group.version;

      const flexConfig: FlexboxLayoutConfig = {
        direction: 'row',
        wrap: 'nowrap',
        justifyContent: 'start',
        alignItems: 'start',
        alignContent: 'start',
        gap: 10,
      };

      group.setLayout('flexbox', flexConfig);

      expect(group.version).toBeGreaterThan(initialVersion);
    });
  });

  describe('Serialization', () => {
    it('should serialize flexbox layout', () => {
      const group = new GroupModel({ name: 'Container' });

      const flexConfig: FlexboxLayoutConfig = {
        direction: 'row',
        wrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        alignContent: 'stretch',
        gap: 10,
      };

      group.setLayout('flexbox', flexConfig);

      const serialized = group.serialize();

      expect(serialized.layoutType).toBe('flexbox');
      expect(serialized.layoutConfig).toEqual(flexConfig);
    });

    it('should serialize grid layout', () => {
      const group = new GroupModel({ name: 'Container' });

      const gridConfig: GridLayoutConfig = {
        templateColumns: 'repeat(3, 1fr)',
        templateRows: 'auto',
        columnGap: 10,
        rowGap: 10,
        autoFlow: 'row',
      };

      group.setLayout('grid', gridConfig);

      const serialized = group.serialize();

      expect(serialized.layoutType).toBe('grid');
      expect(serialized.layoutConfig).toEqual(gridConfig);
    });

    it('should deserialize flexbox layout', () => {
      const group = new GroupModel({ name: 'Container' });

      const flexConfig: FlexboxLayoutConfig = {
        direction: 'column',
        wrap: 'nowrap',
        justifyContent: 'center',
        alignItems: 'center',
        alignContent: 'center',
        gap: 20,
      };

      group.setLayout('flexbox', flexConfig);

      const serialized = group.serialize();
      const deserialized = GroupModel.fromJSON(serialized);

      expect(deserialized.layoutType).toBe('flexbox');
      expect(deserialized.layoutConfig).toEqual(flexConfig);
    });

    it('should deserialize grid layout', () => {
      const group = new GroupModel({ name: 'Container' });

      const gridConfig: GridLayoutConfig = {
        templateColumns: '100px 200px auto',
        templateRows: '50px 100px',
        columnGap: 5,
        rowGap: 5,
        autoFlow: 'dense',
      };

      group.setLayout('grid', gridConfig);

      const serialized = group.serialize();
      const deserialized = GroupModel.fromJSON(serialized);

      expect(deserialized.layoutType).toBe('grid');
      expect(deserialized.layoutConfig).toEqual(gridConfig);
    });

    it('should handle groups without layout configuration', () => {
      const group = new GroupModel({ name: 'Container' });

      const serialized = group.serialize();
      const deserialized = GroupModel.fromJSON(serialized);

      expect(deserialized.layoutType).toBe('none');
      expect(deserialized.layoutConfig).toBeUndefined();
    });
  });
});
