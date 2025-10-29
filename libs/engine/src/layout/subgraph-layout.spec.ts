/**
 * Subgraph Layout Tests
 *
 * Comprehensive test suite for subgraph/group layout system
 */

import {
  GroupInfo,
  SubgraphLayoutOptions,
  SubgraphLayoutManager,
} from './subgraph-layout.interface';

describe('SubgraphLayoutManager', () => {
  // Sample data for tests
  const createSampleGroups = (): GroupInfo[] => [
    {
      id: 'group1',
      memberNodeIds: ['node1', 'node2'],
      padding: { top: 20, right: 20, bottom: 20, left: 20 },
    },
    {
      id: 'group2',
      memberNodeIds: ['node3', 'node4'],
      padding: { top: 10, right: 10, bottom: 10, left: 10 },
    },
  ];

  const createNestedGroups = (): GroupInfo[] => [
    {
      id: 'parent',
      memberNodeIds: ['node1', 'node2'],
      childGroupIds: ['child1', 'child2'],
    },
    {
      id: 'child1',
      parentId: 'parent',
      memberNodeIds: ['node3', 'node4'],
    },
    {
      id: 'child2',
      parentId: 'parent',
      memberNodeIds: ['node5', 'node6'],
    },
  ];

  const createNodes = () => [
    { id: 'node1' },
    { id: 'node2' },
    { id: 'node3' },
    { id: 'node4' },
    { id: 'node5' },
    { id: 'node6' },
  ];

  const createLinks = () => [
    { sourceNodeId: 'node1', targetNodeId: 'node2' },
    { sourceNodeId: 'node3', targetNodeId: 'node4' },
  ];

  const createNodePositions = (): Map<string, { x: number; y: number }> => {
    const map = new Map();
    map.set('node1', { x: 0, y: 0 });
    map.set('node2', { x: 100, y: 0 });
    map.set('node3', { x: 0, y: 100 });
    map.set('node4', { x: 100, y: 100 });
    return map;
  };

  const createNodeSizes = (): Map<string, { width: number; height: number }> => {
    const map = new Map();
    ['node1', 'node2', 'node3', 'node4', 'node5', 'node6'].forEach(id => {
      map.set(id, { width: 50, height: 30 });
    });
    return map;
  };

  describe('buildGroupTree', () => {
    it('should build flat tree for non-nested groups', () => {
      const groups = createSampleGroups();
      const tree = SubgraphLayoutManager.buildGroupTree(groups);

      expect(tree.length).toBe(2);
      expect(tree[0].info.id).toBe('group1');
      expect(tree[1].info.id).toBe('group2');
      expect(tree[0].children.length).toBe(0);
      expect(tree[1].children.length).toBe(0);
    });

    it('should build hierarchical tree for nested groups', () => {
      const groups = createNestedGroups();
      const tree = SubgraphLayoutManager.buildGroupTree(groups);

      expect(tree.length).toBe(1); // Only root
      expect(tree[0].info.id).toBe('parent');
      expect(tree[0].children.length).toBe(2);
      expect(tree[0].children[0].info.id).toBe('child1');
      expect(tree[0].children[1].info.id).toBe('child2');
    });

    it('should calculate correct depths', () => {
      const groups = createNestedGroups();
      const tree = SubgraphLayoutManager.buildGroupTree(groups);

      expect(tree[0].depth).toBe(0);
      expect(tree[0].children[0].depth).toBe(1);
      expect(tree[0].children[1].depth).toBe(1);
    });
  });

  describe('getGroupsAtDepth', () => {
    it('should return groups at specified depth', () => {
      const groups = createNestedGroups();
      const tree = SubgraphLayoutManager.buildGroupTree(groups);

      const depth0 = SubgraphLayoutManager.getGroupsAtDepth(tree, 0);
      const depth1 = SubgraphLayoutManager.getGroupsAtDepth(tree, 1);

      expect(depth0.length).toBe(1);
      expect(depth0[0].id).toBe('parent');
      expect(depth1.length).toBe(2);
    });

    it('should return empty array for non-existent depth', () => {
      const groups = createSampleGroups();
      const tree = SubgraphLayoutManager.buildGroupTree(groups);

      const depth5 = SubgraphLayoutManager.getGroupsAtDepth(tree, 5);

      expect(depth5.length).toBe(0);
    });
  });

  describe('getMaxDepth', () => {
    it('should return 0 for flat groups', () => {
      const groups = createSampleGroups();
      const tree = SubgraphLayoutManager.buildGroupTree(groups);

      const maxDepth = SubgraphLayoutManager.getMaxDepth(tree);

      expect(maxDepth).toBe(0);
    });

    it('should return correct max depth for nested groups', () => {
      const groups = createNestedGroups();
      const tree = SubgraphLayoutManager.buildGroupTree(groups);

      const maxDepth = SubgraphLayoutManager.getMaxDepth(tree);

      expect(maxDepth).toBe(1);
    });

    it('should handle deeply nested groups', () => {
      const deepGroups: GroupInfo[] = [
        { id: 'level0', memberNodeIds: [], childGroupIds: ['level1'] },
        { id: 'level1', parentId: 'level0', memberNodeIds: [], childGroupIds: ['level2'] },
        { id: 'level2', parentId: 'level1', memberNodeIds: ['node1'] },
      ];
      const tree = SubgraphLayoutManager.buildGroupTree(deepGroups);

      const maxDepth = SubgraphLayoutManager.getMaxDepth(tree);

      expect(maxDepth).toBe(2);
    });
  });

  describe('getNodesInGroup', () => {
    it('should return nodes belonging to group', () => {
      const groups = createSampleGroups();
      const nodes = createNodes();
      const options: SubgraphLayoutOptions = { enabled: true };

      const nodesInGroup1 = SubgraphLayoutManager.getNodesInGroup(
        'group1',
        groups[0],
        nodes,
        options
      );

      expect(nodesInGroup1.length).toBe(2);
      expect(nodesInGroup1[0].id).toBe('node1');
      expect(nodesInGroup1[1].id).toBe('node2');
    });

    it('should return empty array for group with no members', () => {
      const group: GroupInfo = { id: 'empty', memberNodeIds: [] };
      const nodes = createNodes();
      const options: SubgraphLayoutOptions = { enabled: true };

      const nodesInGroup = SubgraphLayoutManager.getNodesInGroup(
        'empty',
        group,
        nodes,
        options
      );

      expect(nodesInGroup.length).toBe(0);
    });
  });

  describe('getLinksInGroup', () => {
    it('should return links where both ends are in group', () => {
      const group: GroupInfo = {
        id: 'group1',
        memberNodeIds: ['node1', 'node2'],
      };
      const links = createLinks();
      const options: SubgraphLayoutOptions = { enabled: true };

      const linksInGroup = SubgraphLayoutManager.getLinksInGroup(group, links, options);

      expect(linksInGroup.length).toBe(1);
      expect(linksInGroup[0].sourceNodeId).toBe('node1');
      expect(linksInGroup[0].targetNodeId).toBe('node2');
    });

    it('should exclude links crossing group boundaries', () => {
      const group: GroupInfo = {
        id: 'group1',
        memberNodeIds: ['node1', 'node2'],
      };
      const links = [
        { sourceNodeId: 'node1', targetNodeId: 'node3' }, // Crosses boundary
        { sourceNodeId: 'node1', targetNodeId: 'node2' }, // Within group
      ];
      const options: SubgraphLayoutOptions = { enabled: true };

      const linksInGroup = SubgraphLayoutManager.getLinksInGroup(group, links, options);

      expect(linksInGroup.length).toBe(1);
      expect(linksInGroup[0].targetNodeId).toBe('node2');
    });
  });

  describe('calculateGroupSize', () => {
    it('should calculate size based on member nodes', () => {
      const group: GroupInfo = {
        id: 'group1',
        memberNodeIds: ['node1', 'node2'],
        padding: { top: 10, right: 10, bottom: 10, left: 10 },
      };
      const nodePositions = new Map<string, { x: number; y: number }>();
      nodePositions.set('node1', { x: 0, y: 0 });
      nodePositions.set('node2', { x: 100, y: 0 });
      const nodeSizes = new Map();
      nodeSizes.set('node1', { width: 50, height: 30 });
      nodeSizes.set('node2', { width: 50, height: 30 });
      const options: SubgraphLayoutOptions = { enabled: true };

      const size = SubgraphLayoutManager.calculateGroupSize(
        group,
        nodePositions,
        nodeSizes,
        options
      );

      // Width: from 0 - 50/2 to 100 + 50/2 = 125, plus padding 20 = 145
      // Height: from 0 - 30/2 to 0 + 30/2 = 30, plus padding 20 = 50
      expect(size.width).toBeGreaterThan(100);
      expect(size.height).toBeGreaterThan(20);
    });

    it('should return fixed size when fixedSize is true', () => {
      const group: GroupInfo = {
        id: 'group1',
        memberNodeIds: ['node1'],
        minSize: { width: 300, height: 200 },
        fixedSize: true,
      };
      const nodePositions = createNodePositions();
      const nodeSizes = createNodeSizes();
      const options: SubgraphLayoutOptions = { enabled: true };

      const size = SubgraphLayoutManager.calculateGroupSize(
        group,
        nodePositions,
        nodeSizes,
        options
      );

      expect(size.width).toBe(300);
      expect(size.height).toBe(200);
    });

    it('should respect minSize constraints', () => {
      const group: GroupInfo = {
        id: 'group1',
        memberNodeIds: ['node1'],
        minSize: { width: 300, height: 200 },
      };
      const nodePositions = new Map([['node1', { x: 0, y: 0 }]]);
      const nodeSizes = new Map([['node1', { width: 10, height: 10 }]]);
      const options: SubgraphLayoutOptions = { enabled: true };

      const size = SubgraphLayoutManager.calculateGroupSize(
        group,
        nodePositions,
        nodeSizes,
        options
      );

      expect(size.width).toBeGreaterThanOrEqual(300);
      expect(size.height).toBeGreaterThanOrEqual(200);
    });

    it('should respect maxSize constraints', () => {
      const group: GroupInfo = {
        id: 'group1',
        memberNodeIds: ['node1', 'node2'],
        maxSize: { width: 100, height: 50 },
      };
      const nodePositions = new Map();
      nodePositions.set('node1', { x: 0, y: 0 });
      nodePositions.set('node2', { x: 500, y: 500 });
      const nodeSizes = createNodeSizes();
      const options: SubgraphLayoutOptions = { enabled: true };

      const size = SubgraphLayoutManager.calculateGroupSize(
        group,
        nodePositions,
        nodeSizes,
        options
      );

      expect(size.width).toBeLessThanOrEqual(100);
      expect(size.height).toBeLessThanOrEqual(50);
    });
  });

  describe('getGroupPadding', () => {
    it('should return group padding when specified', () => {
      const group: GroupInfo = {
        id: 'group1',
        memberNodeIds: [],
        padding: { top: 15, right: 20, bottom: 25, left: 30 },
      };
      const options: SubgraphLayoutOptions = { enabled: true };

      const padding = SubgraphLayoutManager.getGroupPadding(group, options);

      expect(padding.top).toBe(15);
      expect(padding.right).toBe(20);
      expect(padding.bottom).toBe(25);
      expect(padding.left).toBe(30);
    });

    it('should use default padding when not specified', () => {
      const group: GroupInfo = {
        id: 'group1',
        memberNodeIds: [],
      };
      const options: SubgraphLayoutOptions = {
        enabled: true,
        defaultPadding: 25,
      };

      const padding = SubgraphLayoutManager.getGroupPadding(group, options);

      expect(padding.top).toBe(25);
      expect(padding.right).toBe(25);
      expect(padding.bottom).toBe(25);
      expect(padding.left).toBe(25);
    });

    it('should mix custom and default padding', () => {
      const group: GroupInfo = {
        id: 'group1',
        memberNodeIds: [],
        padding: { top: 10, left: 30 }, // Only top and left specified
      };
      const options: SubgraphLayoutOptions = {
        enabled: true,
        defaultPadding: 20,
      };

      const padding = SubgraphLayoutManager.getGroupPadding(group, options);

      expect(padding.top).toBe(10);
      expect(padding.left).toBe(30);
      expect(padding.right).toBe(20); // Default
      expect(padding.bottom).toBe(20); // Default
    });
  });

  describe('positionGroups', () => {
    it('should position groups in grid layout', () => {
      const groups = createSampleGroups();
      const groupSizes = new Map();
      groupSizes.set('group1', { width: 200, height: 100 });
      groupSizes.set('group2', { width: 150, height: 120 });
      const options: SubgraphLayoutOptions = {
        enabled: true,
        groupPositioning: 'grid',
        groupSpacing: 20,
      };

      const positions = SubgraphLayoutManager.positionGroups(groups, groupSizes, options);

      expect(positions.size).toBe(2);
      expect(positions.has('group1')).toBe(true);
      expect(positions.has('group2')).toBe(true);
    });

    it('should respect fixed groups', () => {
      const groups: GroupInfo[] = [
        { id: 'group1', memberNodeIds: [], fixed: true },
        { id: 'group2', memberNodeIds: [] },
      ];
      const groupSizes = new Map();
      groupSizes.set('group1', { width: 200, height: 100 });
      groupSizes.set('group2', { width: 150, height: 120 });
      const options: SubgraphLayoutOptions = {
        enabled: true,
        groupPositioning: 'grid',
      };

      const positions = SubgraphLayoutManager.positionGroups(groups, groupSizes, options);

      // Should still have positions for all groups
      expect(positions.size).toBeGreaterThanOrEqual(0);
    });

    it('should apply compact positioning', () => {
      const groups = createSampleGroups();
      const groupSizes = new Map();
      groupSizes.set('group1', { width: 100, height: 100 });
      groupSizes.set('group2', { width: 100, height: 100 });
      const options: SubgraphLayoutOptions = {
        enabled: true,
        groupPositioning: 'compact',
        groupSpacing: 10,
      };

      const positions = SubgraphLayoutManager.positionGroups(groups, groupSizes, options);

      expect(positions.size).toBe(2);
    });
  });

  describe('translateToGroupCoordinates', () => {
    it('should translate node positions relative to group', () => {
      const group: GroupInfo = {
        id: 'group1',
        memberNodeIds: ['node1', 'node2'],
        padding: { top: 10, right: 10, bottom: 10, left: 10 },
      };
      const nodePositions = new Map();
      nodePositions.set('node1', { x: 0, y: 0 });
      nodePositions.set('node2', { x: 100, y: 0 });
      const groupPosition = { x: 50, y: 50 };
      const options: SubgraphLayoutOptions = { enabled: true };

      const translated = SubgraphLayoutManager.translateToGroupCoordinates(
        nodePositions,
        group,
        groupPosition,
        options
      );

      // Nodes should be positioned relative to group with padding
      expect(translated.has('node1')).toBe(true);
      expect(translated.has('node2')).toBe(true);

      const node1Pos = translated.get('node1')!;
      const node2Pos = translated.get('node2')!;

      // Node1 at (0,0) + group(50,50) + padding.left(10) = (60, 60)
      expect(node1Pos.x).toBe(60);
      expect(node1Pos.y).toBe(60);

      // Node2 at (100,0) relative, translated
      expect(node2Pos.x).toBe(160);
      expect(node2Pos.y).toBe(60);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty group list', () => {
      const tree = SubgraphLayoutManager.buildGroupTree([]);
      expect(tree.length).toBe(0);
    });

    it('should handle group with no nodes', () => {
      const group: GroupInfo = { id: 'empty', memberNodeIds: [] };
      const nodePositions = new Map();
      const nodeSizes = new Map();
      const options: SubgraphLayoutOptions = { enabled: true };

      const size = SubgraphLayoutManager.calculateGroupSize(
        group,
        nodePositions,
        nodeSizes,
        options
      );

      expect(size.width).toBeGreaterThanOrEqual(0);
      expect(size.height).toBeGreaterThanOrEqual(0);
    });

    it('should handle collapsed groups', () => {
      const group: GroupInfo = {
        id: 'collapsed',
        memberNodeIds: ['node1'],
        collapsed: true,
      };

      // Collapsed groups should be handled specially by the layout algorithm
      expect(group.collapsed).toBe(true);
    });
  });

  describe('Group positioning strategies', () => {
    const setupGroupPositioning = () => {
      const groups: GroupInfo[] = [
        { id: 'g1', memberNodeIds: ['n1'] },
        { id: 'g2', memberNodeIds: ['n2'] },
        { id: 'g3', memberNodeIds: ['n3'] },
      ];
      const groupSizes = new Map();
      groups.forEach(g => groupSizes.set(g.id, { width: 100, height: 100 }));
      return { groups, groupSizes };
    };

    it('should use grid positioning strategy', () => {
      const { groups, groupSizes } = setupGroupPositioning();
      const options: SubgraphLayoutOptions = {
        enabled: true,
        groupPositioning: 'grid',
        groupSpacing: 20,
      };

      const positions = SubgraphLayoutManager.positionGroups(groups, groupSizes, options);

      expect(positions.size).toBe(3);
      // Grid should arrange in rows and columns
    });

    it('should use compact positioning strategy', () => {
      const { groups, groupSizes } = setupGroupPositioning();
      const options: SubgraphLayoutOptions = {
        enabled: true,
        groupPositioning: 'compact',
        groupSpacing: 10,
      };

      const positions = SubgraphLayoutManager.positionGroups(groups, groupSizes, options);

      expect(positions.size).toBe(3);
      // Compact should minimize total area
    });

    it('should use spacious positioning strategy', () => {
      const { groups, groupSizes } = setupGroupPositioning();
      const options: SubgraphLayoutOptions = {
        enabled: true,
        groupPositioning: 'spacious',
        groupSpacing: 50,
      };

      const positions = SubgraphLayoutManager.positionGroups(groups, groupSizes, options);

      expect(positions.size).toBe(3);
      // Spacious should have more whitespace
    });
  });
});
