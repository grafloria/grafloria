// NodeModel Layout Item Configuration Tests (Phase 1.7)

import { NodeModel } from './NodeModel';
import type { FlexItemConfig, GridItemConfig } from '../types/layout.types';

describe('NodeModel - Layout Item Configuration (Phase 1.7)', () => {
  describe('Flex Item Configuration', () => {
    it('should set flex item configuration', () => {
      const node = new NodeModel({
        type: 'rect',
        position: { x: 0, y: 0 },
      });

      const flexConfig: FlexItemConfig = {
        order: 2,
        flexGrow: 1,
        flexShrink: 0,
        flexBasis: 'auto',
        alignSelf: 'center',
      };

      node.setFlexItem(flexConfig);

      expect(node.flexConfig).toEqual(flexConfig);
      expect(node.hasFlexItem()).toBe(true);
    });

    it('should emit flex-item:changed event', (done) => {
      const node = new NodeModel({
        type: 'rect',
        position: { x: 0, y: 0 },
      });

      const flexConfig: FlexItemConfig = {
        flexGrow: 2,
        flexShrink: 1,
      };

      node.on('flex-item:changed', (config: any) => {
        expect(config).toEqual(flexConfig);
        done();
      });

      node.setFlexItem(flexConfig);
    });

    it('should get flex item configuration', () => {
      const node = new NodeModel({
        type: 'rect',
        position: { x: 0, y: 0 },
      });

      const flexConfig: FlexItemConfig = {
        order: 1,
        flexGrow: 1,
      };

      node.setFlexItem(flexConfig);

      const retrieved = node.getFlexItem();
      expect(retrieved).toEqual(flexConfig);
    });

    it('should clear flex item configuration', () => {
      const node = new NodeModel({
        type: 'rect',
        position: { x: 0, y: 0 },
      });

      const flexConfig: FlexItemConfig = {
        flexGrow: 1,
      };

      node.setFlexItem(flexConfig);
      expect(node.hasFlexItem()).toBe(true);

      node.clearFlexItem();

      expect(node.flexConfig).toBeUndefined();
      expect(node.hasFlexItem()).toBe(false);
    });

    it('should emit flex-item:cleared event', (done) => {
      const node = new NodeModel({
        type: 'rect',
        position: { x: 0, y: 0 },
      });

      node.setFlexItem({ flexGrow: 1 });

      node.on('flex-item:cleared', () => {
        expect(node.flexConfig).toBeUndefined();
        done();
      });

      node.clearFlexItem();
    });

    it('should support partial flex item configuration', () => {
      const node = new NodeModel({
        type: 'rect',
        position: { x: 0, y: 0 },
      });

      // Only specify flexGrow
      node.setFlexItem({ flexGrow: 2 });

      const retrieved = node.getFlexItem();
      expect(retrieved?.flexGrow).toBe(2);
      expect(retrieved?.order).toBeUndefined();
    });

    it('should support flex item with numeric flexBasis', () => {
      const node = new NodeModel({
        type: 'rect',
        position: { x: 0, y: 0 },
      });

      node.setFlexItem({
        flexBasis: 200,
        flexGrow: 0,
      });

      const retrieved = node.getFlexItem();
      expect(retrieved?.flexBasis).toBe(200);
    });

    it('should support flex item with auto flexBasis', () => {
      const node = new NodeModel({
        type: 'rect',
        position: { x: 0, y: 0 },
      });

      node.setFlexItem({
        flexBasis: 'auto',
        flexShrink: 1,
      });

      const retrieved = node.getFlexItem();
      expect(retrieved?.flexBasis).toBe('auto');
    });

    it('should support all alignSelf values', () => {
      const node = new NodeModel({
        type: 'rect',
        position: { x: 0, y: 0 },
      });

      const alignSelfValues: Array<'auto' | 'start' | 'center' | 'end' | 'stretch' | 'baseline'> = [
        'auto',
        'start',
        'center',
        'end',
        'stretch',
        'baseline',
      ];

      alignSelfValues.forEach((value) => {
        node.setFlexItem({ alignSelf: value });
        expect(node.getFlexItem()?.alignSelf).toBe(value);
      });
    });
  });

  describe('Grid Item Configuration', () => {
    it('should set grid item configuration', () => {
      const node = new NodeModel({
        type: 'rect',
        position: { x: 0, y: 0 },
      });

      const gridConfig: GridItemConfig = {
        columnStart: 1,
        columnEnd: 3,
        rowStart: 1,
        rowEnd: 2,
        justifySelf: 'center',
        alignSelf: 'start',
      };

      node.setGridItem(gridConfig);

      expect(node.gridConfig).toEqual(gridConfig);
      expect(node.hasGridItem()).toBe(true);
    });

    it('should emit grid-item:changed event', (done) => {
      const node = new NodeModel({
        type: 'rect',
        position: { x: 0, y: 0 },
      });

      const gridConfig: GridItemConfig = {
        columnStart: 2,
        columnEnd: 4,
      };

      node.on('grid-item:changed', (config: any) => {
        expect(config).toEqual(gridConfig);
        done();
      });

      node.setGridItem(gridConfig);
    });

    it('should get grid item configuration', () => {
      const node = new NodeModel({
        type: 'rect',
        position: { x: 0, y: 0 },
      });

      const gridConfig: GridItemConfig = {
        columnStart: 1,
        columnEnd: 2,
        rowStart: 1,
        rowEnd: 3,
      };

      node.setGridItem(gridConfig);

      const retrieved = node.getGridItem();
      expect(retrieved).toEqual(gridConfig);
    });

    it('should clear grid item configuration', () => {
      const node = new NodeModel({
        type: 'rect',
        position: { x: 0, y: 0 },
      });

      const gridConfig: GridItemConfig = {
        columnStart: 1,
        columnEnd: 2,
      };

      node.setGridItem(gridConfig);
      expect(node.hasGridItem()).toBe(true);

      node.clearGridItem();

      expect(node.gridConfig).toBeUndefined();
      expect(node.hasGridItem()).toBe(false);
    });

    it('should emit grid-item:cleared event', (done) => {
      const node = new NodeModel({
        type: 'rect',
        position: { x: 0, y: 0 },
      });

      node.setGridItem({ columnStart: 1 });

      node.on('grid-item:cleared', () => {
        expect(node.gridConfig).toBeUndefined();
        done();
      });

      node.clearGridItem();
    });

    it('should support auto placement', () => {
      const node = new NodeModel({
        type: 'rect',
        position: { x: 0, y: 0 },
      });

      node.setGridItem({
        columnStart: 'auto',
        columnEnd: 'auto',
        rowStart: 'auto',
        rowEnd: 'auto',
      });

      const retrieved = node.getGridItem();
      expect(retrieved?.columnStart).toBe('auto');
      expect(retrieved?.columnEnd).toBe('auto');
      expect(retrieved?.rowStart).toBe('auto');
      expect(retrieved?.rowEnd).toBe('auto');
    });

    it('should support grid area names', () => {
      const node = new NodeModel({
        type: 'rect',
        position: { x: 0, y: 0 },
      });

      node.setGridItem({
        gridArea: 'header',
      });

      const retrieved = node.getGridItem();
      expect(retrieved?.gridArea).toBe('header');
    });

    it('should support partial grid item configuration', () => {
      const node = new NodeModel({
        type: 'rect',
        position: { x: 0, y: 0 },
      });

      // Only specify column placement
      node.setGridItem({
        columnStart: 1,
        columnEnd: 3,
      });

      const retrieved = node.getGridItem();
      expect(retrieved?.columnStart).toBe(1);
      expect(retrieved?.columnEnd).toBe(3);
      expect(retrieved?.rowStart).toBeUndefined();
      expect(retrieved?.rowEnd).toBeUndefined();
    });

    it('should support grid item alignment', () => {
      const node = new NodeModel({
        type: 'rect',
        position: { x: 0, y: 0 },
      });

      node.setGridItem({
        justifySelf: 'end',
        alignSelf: 'center',
      });

      const retrieved = node.getGridItem();
      expect(retrieved?.justifySelf).toBe('end');
      expect(retrieved?.alignSelf).toBe('center');
    });
  });

  describe('Mixed Configuration', () => {
    it('should allow both flex and grid configs on same node', () => {
      const node = new NodeModel({
        type: 'rect',
        position: { x: 0, y: 0 },
      });

      const flexConfig: FlexItemConfig = {
        flexGrow: 1,
      };

      const gridConfig: GridItemConfig = {
        columnStart: 1,
        columnEnd: 2,
      };

      node.setFlexItem(flexConfig);
      node.setGridItem(gridConfig);

      expect(node.hasFlexItem()).toBe(true);
      expect(node.hasGridItem()).toBe(true);
      expect(node.getFlexItem()).toEqual(flexConfig);
      expect(node.getGridItem()).toEqual(gridConfig);
    });

    it('should independently clear flex and grid configs', () => {
      const node = new NodeModel({
        type: 'rect',
        position: { x: 0, y: 0 },
      });

      node.setFlexItem({ flexGrow: 1 });
      node.setGridItem({ columnStart: 1 });

      node.clearFlexItem();

      expect(node.hasFlexItem()).toBe(false);
      expect(node.hasGridItem()).toBe(true);

      node.clearGridItem();

      expect(node.hasGridItem()).toBe(false);
    });
  });

  describe('Serialization', () => {
    it('should serialize flex item configuration', () => {
      const node = new NodeModel({
        type: 'rect',
        position: { x: 0, y: 0 },
      });

      const flexConfig: FlexItemConfig = {
        order: 2,
        flexGrow: 1,
        flexShrink: 0,
        flexBasis: 'auto',
        alignSelf: 'center',
      };

      node.setFlexItem(flexConfig);

      const serialized = node.serialize();

      expect(serialized.flexConfig).toEqual(flexConfig);
    });

    it('should serialize grid item configuration', () => {
      const node = new NodeModel({
        type: 'rect',
        position: { x: 0, y: 0 },
      });

      const gridConfig: GridItemConfig = {
        columnStart: 1,
        columnEnd: 3,
        rowStart: 1,
        rowEnd: 2,
        justifySelf: 'center',
        alignSelf: 'start',
      };

      node.setGridItem(gridConfig);

      const serialized = node.serialize();

      expect(serialized.gridConfig).toEqual(gridConfig);
    });

    it('should deserialize flex item configuration', () => {
      const node = new NodeModel({
        type: 'rect',
        position: { x: 0, y: 0 },
      });

      const flexConfig: FlexItemConfig = {
        flexGrow: 2,
        flexShrink: 1,
        alignSelf: 'end',
      };

      node.setFlexItem(flexConfig);

      const serialized = node.serialize();
      const deserialized = NodeModel.fromJSON(serialized);

      expect(deserialized.flexConfig).toEqual(flexConfig);
      expect(deserialized.hasFlexItem()).toBe(true);
    });

    it('should deserialize grid item configuration', () => {
      const node = new NodeModel({
        type: 'rect',
        position: { x: 0, y: 0 },
      });

      const gridConfig: GridItemConfig = {
        columnStart: 2,
        columnEnd: 4,
        gridArea: 'content',
      };

      node.setGridItem(gridConfig);

      const serialized = node.serialize();
      const deserialized = NodeModel.fromJSON(serialized);

      expect(deserialized.gridConfig).toEqual(gridConfig);
      expect(deserialized.hasGridItem()).toBe(true);
    });

    it('should serialize both flex and grid configs', () => {
      const node = new NodeModel({
        type: 'rect',
        position: { x: 0, y: 0 },
      });

      const flexConfig: FlexItemConfig = {
        flexGrow: 1,
      };

      const gridConfig: GridItemConfig = {
        columnStart: 1,
        columnEnd: 2,
      };

      node.setFlexItem(flexConfig);
      node.setGridItem(gridConfig);

      const serialized = node.serialize();

      expect(serialized.flexConfig).toEqual(flexConfig);
      expect(serialized.gridConfig).toEqual(gridConfig);
    });

    it('should deserialize both flex and grid configs', () => {
      const node = new NodeModel({
        type: 'rect',
        position: { x: 0, y: 0 },
      });

      const flexConfig: FlexItemConfig = {
        flexGrow: 1,
        order: 2,
      };

      const gridConfig: GridItemConfig = {
        columnStart: 1,
        rowStart: 1,
      };

      node.setFlexItem(flexConfig);
      node.setGridItem(gridConfig);

      const serialized = node.serialize();
      const deserialized = NodeModel.fromJSON(serialized);

      expect(deserialized.flexConfig).toEqual(flexConfig);
      expect(deserialized.gridConfig).toEqual(gridConfig);
      expect(deserialized.hasFlexItem()).toBe(true);
      expect(deserialized.hasGridItem()).toBe(true);
    });

    it('should handle nodes without layout configs', () => {
      const node = new NodeModel({
        type: 'rect',
        position: { x: 0, y: 0 },
      });

      const serialized = node.serialize();
      const deserialized = NodeModel.fromJSON(serialized);

      expect(deserialized.flexConfig).toBeUndefined();
      expect(deserialized.gridConfig).toBeUndefined();
      expect(deserialized.hasFlexItem()).toBe(false);
      expect(deserialized.hasGridItem()).toBe(false);
    });
  });
});
