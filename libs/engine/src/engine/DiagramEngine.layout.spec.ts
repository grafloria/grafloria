// DiagramEngine Layout API Tests (Phase 1.7 Part 3)

import { DiagramEngine } from './DiagramEngine';
import { GroupModel } from '../models/GroupModel';
import { NodeModel } from '../models/NodeModel';
import type { FlexboxLayoutConfig, GridLayoutConfig, FlexItemConfig, GridItemConfig } from '../types/layout.types';

describe('DiagramEngine - Layout API (Phase 1.7 Part 3)', () => {
  let engine: DiagramEngine;

  beforeEach(async () => {
    engine = new DiagramEngine();
    await engine.createDiagram('test');
  });

  describe('setLayout', () => {
    it('should set flexbox layout on group', async () => {
      const group = await engine.addGroup({ name: 'Container' });

      const flexConfig: FlexboxLayoutConfig = {
        direction: 'row',
        wrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        alignContent: 'stretch',
        gap: 10,
      };

      await engine.setLayout(group.id, 'flexbox', flexConfig);

      const layout = engine.getLayout(group.id);
      expect(layout?.type).toBe('flexbox');
      expect(layout?.config).toEqual(flexConfig);
    });

    it('should set grid layout on group', async () => {
      const group = await engine.addGroup({ name: 'Container' });

      const gridConfig: GridLayoutConfig = {
        templateColumns: 'repeat(3, 1fr)',
        templateRows: 'auto',
        columnGap: 10,
        rowGap: 10,
        autoFlow: 'row',
      };

      await engine.setLayout(group.id, 'grid', gridConfig);

      const layout = engine.getLayout(group.id);
      expect(layout?.type).toBe('grid');
      expect(layout?.config).toEqual(gridConfig);
    });

    it('should support undo/redo', async () => {
      const group = await engine.addGroup({ name: 'Container' });

      const flexConfig: FlexboxLayoutConfig = {
        direction: 'column',
        wrap: 'nowrap',
        justifyContent: 'center',
        alignItems: 'center',
        alignContent: 'center',
        gap: 20,
      };

      await engine.setLayout(group.id, 'flexbox', flexConfig);

      const layoutBefore = engine.getLayout(group.id);
      expect(layoutBefore?.type).toBe('flexbox');

      await engine.undo();

      const layoutAfterUndo = engine.getLayout(group.id);
      expect(layoutAfterUndo?.type).toBe('none');

      await engine.redo();

      const layoutAfterRedo = engine.getLayout(group.id);
      expect(layoutAfterRedo?.type).toBe('flexbox');
      expect(layoutAfterRedo?.config).toEqual(flexConfig);
    });

    it('should throw error if no diagram loaded', async () => {
      const engine2 = new DiagramEngine();

      const flexConfig: FlexboxLayoutConfig = {
        direction: 'row',
        wrap: 'nowrap',
        justifyContent: 'start',
        alignItems: 'start',
        alignContent: 'start',
        gap: 0,
      };

      await expect(engine2.setLayout('group-1', 'flexbox', flexConfig)).rejects.toThrow(
        'No diagram loaded'
      );
    });

    it('should throw error if group not found', async () => {
      const flexConfig: FlexboxLayoutConfig = {
        direction: 'row',
        wrap: 'nowrap',
        justifyContent: 'start',
        alignItems: 'start',
        alignContent: 'start',
        gap: 0,
      };

      await expect(engine.setLayout('non-existent', 'flexbox', flexConfig)).rejects.toThrow(
        'Group non-existent not found'
      );
    });
  });

  describe('clearLayout', () => {
    it('should clear layout from group', async () => {
      const group = await engine.addGroup({ name: 'Container' });

      const flexConfig: FlexboxLayoutConfig = {
        direction: 'row',
        wrap: 'nowrap',
        justifyContent: 'start',
        alignItems: 'start',
        alignContent: 'start',
        gap: 10,
      };

      await engine.setLayout(group.id, 'flexbox', flexConfig);
      expect(engine.getLayout(group.id)?.type).toBe('flexbox');

      await engine.clearLayout(group.id);

      const layout = engine.getLayout(group.id);
      expect(layout?.type).toBe('none');
      expect(layout?.config).toBeUndefined();
    });

    it('should throw error if no diagram loaded', async () => {
      const engine2 = new DiagramEngine();

      await expect(engine2.clearLayout('group-1')).rejects.toThrow('No diagram loaded');
    });

    it('should throw error if group not found', async () => {
      await expect(engine.clearLayout('non-existent')).rejects.toThrow(
        'Group non-existent not found'
      );
    });
  });

  describe('getLayout', () => {
    it('should get layout configuration', async () => {
      const group = await engine.addGroup({ name: 'Container' });

      const gridConfig: GridLayoutConfig = {
        templateColumns: '100px 200px auto',
        templateRows: '50px 100px',
        columnGap: 5,
        rowGap: 5,
        autoFlow: 'dense',
      };

      await engine.setLayout(group.id, 'grid', gridConfig);

      const layout = engine.getLayout(group.id);
      expect(layout?.type).toBe('grid');
      expect(layout?.config).toEqual(gridConfig);
    });

    it('should return undefined for non-existent group', () => {
      const layout = engine.getLayout('non-existent');
      expect(layout).toBeUndefined();
    });

    it('should return none for group without layout', async () => {
      const group = await engine.addGroup({ name: 'Container' });

      const layout = engine.getLayout(group.id);
      expect(layout?.type).toBe('none');
      expect(layout?.config).toBeUndefined();
    });
  });

  describe('setFlexItem', () => {
    it('should set flex item config on node', async () => {
      const node = await engine.addNode({
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

      await engine.setFlexItem(node.id, flexConfig);

      const updatedNode = engine.getDiagram()?.getNode(node.id);
      expect(updatedNode?.flexConfig).toEqual(flexConfig);
    });

    it('should support undo/redo', async () => {
      const node = await engine.addNode({
        type: 'rect',
        position: { x: 0, y: 0 },
      });

      const flexConfig: FlexItemConfig = {
        flexGrow: 1,
        order: 1,
      };

      await engine.setFlexItem(node.id, flexConfig);

      const nodeBefore = engine.getDiagram()?.getNode(node.id);
      expect(nodeBefore?.flexConfig).toEqual(flexConfig);

      await engine.undo();

      const nodeAfterUndo = engine.getDiagram()?.getNode(node.id);
      expect(nodeAfterUndo?.flexConfig).toBeUndefined();

      await engine.redo();

      const nodeAfterRedo = engine.getDiagram()?.getNode(node.id);
      expect(nodeAfterRedo?.flexConfig).toEqual(flexConfig);
    });

    it('should throw error if no diagram loaded', async () => {
      const engine2 = new DiagramEngine();

      const flexConfig: FlexItemConfig = {
        flexGrow: 1,
      };

      await expect(engine2.setFlexItem('node-1', flexConfig)).rejects.toThrow(
        'No diagram loaded'
      );
    });

    it('should throw error if node not found', async () => {
      const flexConfig: FlexItemConfig = {
        flexGrow: 1,
      };

      await expect(engine.setFlexItem('non-existent', flexConfig)).rejects.toThrow(
        'Node non-existent not found'
      );
    });
  });

  describe('setGridItem', () => {
    it('should set grid item config on node', async () => {
      const node = await engine.addNode({
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

      await engine.setGridItem(node.id, gridConfig);

      const updatedNode = engine.getDiagram()?.getNode(node.id);
      expect(updatedNode?.gridConfig).toEqual(gridConfig);
    });

    it('should support undo/redo', async () => {
      const node = await engine.addNode({
        type: 'rect',
        position: { x: 0, y: 0 },
      });

      const gridConfig: GridItemConfig = {
        columnStart: 1,
        columnEnd: 2,
      };

      await engine.setGridItem(node.id, gridConfig);

      const nodeBefore = engine.getDiagram()?.getNode(node.id);
      expect(nodeBefore?.gridConfig).toEqual(gridConfig);

      await engine.undo();

      const nodeAfterUndo = engine.getDiagram()?.getNode(node.id);
      expect(nodeAfterUndo?.gridConfig).toBeUndefined();

      await engine.redo();

      const nodeAfterRedo = engine.getDiagram()?.getNode(node.id);
      expect(nodeAfterRedo?.gridConfig).toEqual(gridConfig);
    });

    it('should throw error if no diagram loaded', async () => {
      const engine2 = new DiagramEngine();

      const gridConfig: GridItemConfig = {
        columnStart: 1,
      };

      await expect(engine2.setGridItem('node-1', gridConfig)).rejects.toThrow(
        'No diagram loaded'
      );
    });

    it('should throw error if node not found', async () => {
      const gridConfig: GridItemConfig = {
        columnStart: 1,
      };

      await expect(engine.setGridItem('non-existent', gridConfig)).rejects.toThrow(
        'Node non-existent not found'
      );
    });
  });

  describe('Integration', () => {
    it('should work with full layout setup', async () => {
      // Create container group with flexbox layout
      const container = await engine.addGroup({ name: 'Flexbox Container' });

      const flexConfig: FlexboxLayoutConfig = {
        direction: 'row',
        wrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        alignContent: 'stretch',
        gap: 10,
      };

      await engine.setLayout(container.id, 'flexbox', flexConfig);

      // Add nodes with flex item configs
      const node1 = await engine.addNode({
        type: 'rect',
        position: { x: 0, y: 0 },
      });

      const node2 = await engine.addNode({
        type: 'rect',
        position: { x: 100, y: 0 },
      });

      await engine.setFlexItem(node1.id, { flexGrow: 1, order: 1 });
      await engine.setFlexItem(node2.id, { flexGrow: 2, order: 2 });

      // Verify configuration
      const layout = engine.getLayout(container.id);
      expect(layout?.type).toBe('flexbox');

      const updatedNode1 = engine.getDiagram()?.getNode(node1.id);
      const updatedNode2 = engine.getDiagram()?.getNode(node2.id);

      expect(updatedNode1?.flexConfig?.flexGrow).toBe(1);
      expect(updatedNode2?.flexConfig?.flexGrow).toBe(2);
    });

    it('should work with grid layout setup', async () => {
      // Create container group with grid layout
      const container = await engine.addGroup({ name: 'Grid Container' });

      const gridConfig: GridLayoutConfig = {
        templateColumns: 'repeat(3, 1fr)',
        templateRows: 'auto',
        columnGap: 10,
        rowGap: 10,
        autoFlow: 'row',
      };

      await engine.setLayout(container.id, 'grid', gridConfig);

      // Add nodes with grid item configs
      const node1 = await engine.addNode({
        type: 'rect',
        position: { x: 0, y: 0 },
      });

      const node2 = await engine.addNode({
        type: 'rect',
        position: { x: 100, y: 0 },
      });

      await engine.setGridItem(node1.id, { columnStart: 1, columnEnd: 2, rowStart: 1, rowEnd: 2 });
      await engine.setGridItem(node2.id, { columnStart: 2, columnEnd: 4, rowStart: 1, rowEnd: 2 });

      // Verify configuration
      const layout = engine.getLayout(container.id);
      expect(layout?.type).toBe('grid');

      const updatedNode1 = engine.getDiagram()?.getNode(node1.id);
      const updatedNode2 = engine.getDiagram()?.getNode(node2.id);

      expect(updatedNode1?.gridConfig?.columnStart).toBe(1);
      expect(updatedNode2?.gridConfig?.columnEnd).toBe(4);
    });
  });
});
