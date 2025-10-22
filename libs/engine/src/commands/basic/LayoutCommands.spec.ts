// Layout Commands Tests (Phase 1.7 Part 2)

import { DiagramModel } from '../../models/DiagramModel';
import { GroupModel } from '../../models/GroupModel';
import { NodeModel } from '../../models/NodeModel';
import { SetLayoutCommand } from './SetLayoutCommand';
import { SetFlexItemCommand } from './SetFlexItemCommand';
import { SetGridItemCommand } from './SetGridItemCommand';
import { CommandContext } from '../Command';
import type { FlexboxLayoutConfig, GridLayoutConfig, FlexItemConfig, GridItemConfig } from '../../types/layout.types';

describe('Layout Commands (Phase 1.7 Part 2)', () => {
  let diagram: DiagramModel;
  let context: CommandContext;

  beforeEach(() => {
    diagram = new DiagramModel();
    context = {
      diagram,
      eventBus: { emit: jest.fn() }
    };
  });

  describe('SetLayoutCommand', () => {
    let group: GroupModel;

    beforeEach(() => {
      group = new GroupModel({ name: 'Container' });
      diagram.addGroup(group);
    });

    it('should set flexbox layout on group', () => {
      const flexConfig: FlexboxLayoutConfig = {
        direction: 'row',
        wrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        alignContent: 'stretch',
        gap: 10,
      };

      const command = new SetLayoutCommand(group.id, 'flexbox', flexConfig);
      command.execute(context);

      expect(group.layoutType).toBe('flexbox');
      expect(group.layoutConfig).toEqual(flexConfig);
    });

    it('should set grid layout on group', () => {
      const gridConfig: GridLayoutConfig = {
        templateColumns: 'repeat(3, 1fr)',
        templateRows: 'auto',
        columnGap: 10,
        rowGap: 10,
        autoFlow: 'row',
      };

      const command = new SetLayoutCommand(group.id, 'grid', gridConfig);
      command.execute(context);

      expect(group.layoutType).toBe('grid');
      expect(group.layoutConfig).toEqual(gridConfig);
    });

    it('should undo layout change', () => {
      const flexConfig: FlexboxLayoutConfig = {
        direction: 'row',
        wrap: 'nowrap',
        justifyContent: 'start',
        alignItems: 'start',
        alignContent: 'start',
        gap: 0,
      };

      const command = new SetLayoutCommand(group.id, 'flexbox', flexConfig);
      command.execute(context);

      expect(group.layoutType).toBe('flexbox');

      command.undo(context);

      expect(group.layoutType).toBe('none');
      expect(group.layoutConfig).toBeUndefined();
    });

    it('should undo to previous layout', () => {
      // Set initial layout
      const flexConfig1: FlexboxLayoutConfig = {
        direction: 'row',
        wrap: 'nowrap',
        justifyContent: 'start',
        alignItems: 'start',
        alignContent: 'start',
        gap: 5,
      };
      group.setLayout('flexbox', flexConfig1);

      // Change to different layout
      const gridConfig: GridLayoutConfig = {
        templateColumns: 'repeat(2, 1fr)',
        templateRows: 'auto',
        columnGap: 10,
        rowGap: 10,
        autoFlow: 'row',
      };

      const command = new SetLayoutCommand(group.id, 'grid', gridConfig);
      command.execute(context);

      expect(group.layoutType).toBe('grid');

      command.undo(context);

      expect(group.layoutType).toBe('flexbox');
      expect(group.layoutConfig).toEqual(flexConfig1);
    });

    it('should support redo', () => {
      const flexConfig: FlexboxLayoutConfig = {
        direction: 'column',
        wrap: 'wrap',
        justifyContent: 'center',
        alignItems: 'center',
        alignContent: 'center',
        gap: 15,
      };

      const command = new SetLayoutCommand(group.id, 'flexbox', flexConfig);
      command.execute(context);
      command.undo(context);
      command.execute(context);

      expect(group.layoutType).toBe('flexbox');
      expect(group.layoutConfig).toEqual(flexConfig);
    });

    it('should throw error if group not found', () => {
      const flexConfig: FlexboxLayoutConfig = {
        direction: 'row',
        wrap: 'nowrap',
        justifyContent: 'start',
        alignItems: 'start',
        alignContent: 'start',
        gap: 0,
      };

      const command = new SetLayoutCommand('non-existent', 'flexbox', flexConfig);

      expect(() => command.execute(context)).toThrow('Group non-existent not found');
    });

    it('should validate execution', () => {
      const flexConfig: FlexboxLayoutConfig = {
        direction: 'row',
        wrap: 'nowrap',
        justifyContent: 'start',
        alignItems: 'start',
        alignContent: 'start',
        gap: 0,
      };

      const command = new SetLayoutCommand(group.id, 'flexbox', flexConfig);
      expect(command.canExecute(context)).toBe(true);

      const badCommand = new SetLayoutCommand('non-existent', 'flexbox', flexConfig);
      expect(badCommand.canExecute(context)).toBe(false);
    });

    it('should serialize command', () => {
      const flexConfig: FlexboxLayoutConfig = {
        direction: 'row',
        wrap: 'nowrap',
        justifyContent: 'start',
        alignItems: 'start',
        alignContent: 'start',
        gap: 10,
      };

      const command = new SetLayoutCommand(group.id, 'flexbox', flexConfig);
      const serialized = command.serialize();

      expect(serialized.name).toBe('Set Layout');
      expect(serialized.data.groupId).toBe(group.id);
      expect(serialized.data.layoutType).toBe('flexbox');
      expect(serialized.data.layoutConfig).toEqual(flexConfig);
    });
  });

  describe('SetFlexItemCommand', () => {
    let node: NodeModel;

    beforeEach(() => {
      node = new NodeModel({
        type: 'rect',
        position: { x: 0, y: 0 },
      });
      diagram.addNode(node);
    });

    it('should set flex item config on node', () => {
      const flexConfig: FlexItemConfig = {
        order: 2,
        flexGrow: 1,
        flexShrink: 0,
        flexBasis: 'auto',
        alignSelf: 'center',
      };

      const command = new SetFlexItemCommand(node.id, flexConfig);
      command.execute(context);

      expect(node.flexConfig).toEqual(flexConfig);
    });

    it('should undo flex item config', () => {
      const flexConfig: FlexItemConfig = {
        flexGrow: 1,
        order: 1,
      };

      const command = new SetFlexItemCommand(node.id, flexConfig);
      command.execute(context);

      expect(node.hasFlexItem()).toBe(true);

      command.undo(context);

      expect(node.hasFlexItem()).toBe(false);
      expect(node.flexConfig).toBeUndefined();
    });

    it('should undo to previous flex config', () => {
      // Set initial config
      const flexConfig1: FlexItemConfig = {
        flexGrow: 1,
        order: 1,
      };
      node.setFlexItem(flexConfig1);

      // Change config
      const flexConfig2: FlexItemConfig = {
        flexGrow: 2,
        order: 2,
      };

      const command = new SetFlexItemCommand(node.id, flexConfig2);
      command.execute(context);

      expect(node.flexConfig).toEqual(flexConfig2);

      command.undo(context);

      expect(node.flexConfig).toEqual(flexConfig1);
    });

    it('should support redo', () => {
      const flexConfig: FlexItemConfig = {
        flexGrow: 1,
        alignSelf: 'end',
      };

      const command = new SetFlexItemCommand(node.id, flexConfig);
      command.execute(context);
      command.undo(context);
      command.execute(context);

      expect(node.flexConfig).toEqual(flexConfig);
    });

    it('should throw error if node not found', () => {
      const flexConfig: FlexItemConfig = {
        flexGrow: 1,
      };

      const command = new SetFlexItemCommand('non-existent', flexConfig);

      expect(() => command.execute(context)).toThrow('Node non-existent not found');
    });

    it('should validate execution', () => {
      const flexConfig: FlexItemConfig = {
        flexGrow: 1,
      };

      const command = new SetFlexItemCommand(node.id, flexConfig);
      expect(command.canExecute(context)).toBe(true);

      const badCommand = new SetFlexItemCommand('non-existent', flexConfig);
      expect(badCommand.canExecute(context)).toBe(false);
    });

    it('should serialize command', () => {
      const flexConfig: FlexItemConfig = {
        order: 1,
        flexGrow: 2,
        alignSelf: 'center',
      };

      const command = new SetFlexItemCommand(node.id, flexConfig);
      const serialized = command.serialize();

      expect(serialized.name).toBe('Set Flex Item');
      expect(serialized.data.nodeId).toBe(node.id);
      expect(serialized.data.flexConfig).toEqual(flexConfig);
    });
  });

  describe('SetGridItemCommand', () => {
    let node: NodeModel;

    beforeEach(() => {
      node = new NodeModel({
        type: 'rect',
        position: { x: 0, y: 0 },
      });
      diagram.addNode(node);
    });

    it('should set grid item config on node', () => {
      const gridConfig: GridItemConfig = {
        columnStart: 1,
        columnEnd: 3,
        rowStart: 1,
        rowEnd: 2,
        justifySelf: 'center',
        alignSelf: 'start',
      };

      const command = new SetGridItemCommand(node.id, gridConfig);
      command.execute(context);

      expect(node.gridConfig).toEqual(gridConfig);
    });

    it('should undo grid item config', () => {
      const gridConfig: GridItemConfig = {
        columnStart: 1,
        columnEnd: 2,
      };

      const command = new SetGridItemCommand(node.id, gridConfig);
      command.execute(context);

      expect(node.hasGridItem()).toBe(true);

      command.undo(context);

      expect(node.hasGridItem()).toBe(false);
      expect(node.gridConfig).toBeUndefined();
    });

    it('should undo to previous grid config', () => {
      // Set initial config
      const gridConfig1: GridItemConfig = {
        columnStart: 1,
        columnEnd: 2,
      };
      node.setGridItem(gridConfig1);

      // Change config
      const gridConfig2: GridItemConfig = {
        columnStart: 2,
        columnEnd: 4,
      };

      const command = new SetGridItemCommand(node.id, gridConfig2);
      command.execute(context);

      expect(node.gridConfig).toEqual(gridConfig2);

      command.undo(context);

      expect(node.gridConfig).toEqual(gridConfig1);
    });

    it('should support redo', () => {
      const gridConfig: GridItemConfig = {
        gridArea: 'header',
        justifySelf: 'center',
      };

      const command = new SetGridItemCommand(node.id, gridConfig);
      command.execute(context);
      command.undo(context);
      command.execute(context);

      expect(node.gridConfig).toEqual(gridConfig);
    });

    it('should throw error if node not found', () => {
      const gridConfig: GridItemConfig = {
        columnStart: 1,
      };

      const command = new SetGridItemCommand('non-existent', gridConfig);

      expect(() => command.execute(context)).toThrow('Node non-existent not found');
    });

    it('should validate execution', () => {
      const gridConfig: GridItemConfig = {
        columnStart: 1,
      };

      const command = new SetGridItemCommand(node.id, gridConfig);
      expect(command.canExecute(context)).toBe(true);

      const badCommand = new SetGridItemCommand('non-existent', gridConfig);
      expect(badCommand.canExecute(context)).toBe(false);
    });

    it('should serialize command', () => {
      const gridConfig: GridItemConfig = {
        columnStart: 1,
        columnEnd: 3,
        rowStart: 2,
        rowEnd: 4,
      };

      const command = new SetGridItemCommand(node.id, gridConfig);
      const serialized = command.serialize();

      expect(serialized.name).toBe('Set Grid Item');
      expect(serialized.data.nodeId).toBe(node.id);
      expect(serialized.data.gridConfig).toEqual(gridConfig);
    });
  });
});
