/**
 * @jest-environment jsdom
 */

// Smart Layout Tests - Verify flex/grid layouts actually position nodes

import { DiagramEngine } from '../engine/DiagramEngine';
import { DiagramModel } from '../models/DiagramModel';
import { NodeModel } from '../models/NodeModel';
import { GroupModel } from '../models/GroupModel';
import type { FlexboxLayoutConfig, GridLayoutConfig } from '../types/layout.types';

describe('Smart Layout - Automatic Node Positioning', () => {
  let engine: DiagramEngine;
  let diagram: DiagramModel;

  beforeEach(() => {
    engine = new DiagramEngine();
    diagram = engine.createDiagram('test-diagram');
  });

  afterEach(() => {
    engine.destroy();
  });

  describe('Flex Column Layout', () => {
    it('should automatically stack nodes vertically in flex column', () => {
      // Create container with flex column layout
      const container = new GroupModel({ name: 'Column Container' });
      diagram.addGroup(container);

      const flexConfig: FlexboxLayoutConfig = {
        direction: 'column',
        wrap: 'nowrap',
        justifyContent: 'start',
        alignItems: 'stretch',
        alignContent: 'start',
        gap: 10,
        padding: 20,
      };
      container.setLayout('flexbox', flexConfig);

      // Create 3 child nodes
      const child1 = new NodeModel({
        type: 'card',
        position: { x: 0, y: 0 }, // Initial position doesn't matter
        size: { width: 200, height: 50, depth: 0 },
      });
      const child2 = new NodeModel({
        type: 'card',
        position: { x: 0, y: 0 },
        size: { width: 200, height: 50, depth: 0 },
      });
      const child3 = new NodeModel({
        type: 'card',
        position: { x: 0, y: 0 },
        size: { width: 200, height: 50, depth: 0 },
      });

      diagram.addNode(child1);
      diagram.addNode(child2);
      diagram.addNode(child3);

      container.addMember(child1.id);
      container.addMember(child2.id);
      container.addMember(child3.id);

      // Apply layout
      container.applyLayout(diagram);

      // Verify nodes are stacked vertically with gap
      // Child 1 should be at (20, 20) - padding
      expect(child1.position.x).toBe(20);
      expect(child1.position.y).toBe(20);

      // Child 2 should be at (20, 20 + 50 + 10) = (20, 80)
      expect(child2.position.x).toBe(20);
      expect(child2.position.y).toBe(80);

      // Child 3 should be at (20, 80 + 50 + 10) = (20, 140)
      expect(child3.position.x).toBe(20);
      expect(child3.position.y).toBe(140);
    });

    it('should respect padding in flex column layout', () => {
      const container = new GroupModel({ name: 'Padded Container' });
      diagram.addGroup(container);

      container.setLayout('flexbox', {
        direction: 'column',
        wrap: 'nowrap',
        justifyContent: 'start',
        alignItems: 'stretch',
        alignContent: 'start',
        gap: 5,
        padding: { top: 30, right: 10, bottom: 30, left: 10 },
      });

      const child = new NodeModel({
        type: 'test',
        position: { x: 0, y: 0 },
        size: { width: 100, height: 40, depth: 0 },
      });

      diagram.addNode(child);
      container.addMember(child.id);
      container.applyLayout(diagram);

      // Should be at left padding (10), top padding (30)
      expect(child.position.x).toBe(10);
      expect(child.position.y).toBe(30);
    });
  });

  describe('Flex Row Layout', () => {
    it('should automatically stack nodes horizontally in flex row', () => {
      const container = new GroupModel({ name: 'Row Container' });
      diagram.addGroup(container);

      container.setLayout('flexbox', {
        direction: 'row',
        wrap: 'nowrap',
        justifyContent: 'start',
        alignItems: 'stretch',
        alignContent: 'start',
        gap: 15,
        padding: 10,
      });

      const child1 = new NodeModel({
        type: 'button',
        position: { x: 0, y: 0 },
        size: { width: 100, height: 40, depth: 0 },
      });
      const child2 = new NodeModel({
        type: 'button',
        position: { x: 0, y: 0 },
        size: { width: 100, height: 40, depth: 0 },
      });

      diagram.addNode(child1);
      diagram.addNode(child2);
      container.addMember(child1.id);
      container.addMember(child2.id);
      container.applyLayout(diagram);

      // Child 1 at (10, 10)
      expect(child1.position.x).toBe(10);
      expect(child1.position.y).toBe(10);

      // Child 2 at (10 + 100 + 15, 10) = (125, 10)
      expect(child2.position.x).toBe(125);
      expect(child2.position.y).toBe(10);
    });

    it('should center align items in flex row', () => {
      const container = new GroupModel({ name: 'Centered Row' });
      diagram.addGroup(container);

      container.setLayout('flexbox', {
        direction: 'row',
        wrap: 'nowrap',
        justifyContent: 'center',
        alignItems: 'center',
        alignContent: 'start',
        gap: 10,
        padding: 0,
      });

      // Set container size
      container.size = { width: 500, height: 200, depth: 0 };

      const child1 = new NodeModel({
        type: 'small',
        position: { x: 0, y: 0 },
        size: { width: 80, height: 30, depth: 0 },
      });
      const child2 = new NodeModel({
        type: 'large',
        position: { x: 0, y: 0 },
        size: { width: 80, height: 60, depth: 0 },
      });

      diagram.addNode(child1);
      diagram.addNode(child2);
      container.addMember(child1.id);
      container.addMember(child2.id);
      container.applyLayout(diagram);

      // Total width: 80 + 10 + 80 = 170
      // Center X: (500 - 170) / 2 = 165
      expect(child1.position.x).toBe(165);
      expect(child2.position.x).toBe(255); // 165 + 80 + 10

      // Vertical centering (alignItems: center)
      // Child1 height 30, container 200, so Y = (200 - 30) / 2 = 85
      expect(child1.position.y).toBe(85);
      // Child2 height 60, so Y = (200 - 60) / 2 = 70
      expect(child2.position.y).toBe(70);
    });
  });

  describe('Auto-layout on Add', () => {
    it('should auto-apply layout when adding new child nodes', () => {
      const container = new GroupModel({ name: 'Auto Container' });
      diagram.addGroup(container);

      container.setLayout('flexbox', {
        direction: 'column',
        wrap: 'nowrap',
        justifyContent: 'start',
        alignItems: 'stretch',
        alignContent: 'start',
        gap: 10,
        padding: 20,
      });

      // Enable auto-layout
      container.setMetadata('autoLayout', true);

      const child1 = new NodeModel({
        type: 'test',
        position: { x: 0, y: 0 },
        size: { width: 200, height: 50, depth: 0 },
      });

      diagram.addNode(child1);
      container.addMember(child1.id);

      // Should auto-position
      expect(child1.position.x).toBe(20);
      expect(child1.position.y).toBe(20);

      // Add second child
      const child2 = new NodeModel({
        type: 'test',
        position: { x: 0, y: 0 },
        size: { width: 200, height: 50, depth: 0 },
      });

      diagram.addNode(child2);
      container.addMember(child2.id);

      // Should auto-position second child
      expect(child2.position.x).toBe(20);
      expect(child2.position.y).toBe(80);
    });
  });

  describe('Nested Flex Layouts', () => {
    it('should apply layouts recursively for nested containers', () => {
      // Outer container - column
      const outerContainer = new GroupModel({ name: 'Outer' });
      diagram.addGroup(outerContainer);
      outerContainer.setLayout('flexbox', {
        direction: 'column',
        wrap: 'nowrap',
        justifyContent: 'start',
        alignItems: 'stretch',
        alignContent: 'start',
        gap: 20,
        padding: 10,
      });

      // Inner container - row
      const innerContainer = new GroupModel({ name: 'Inner' });
      diagram.addGroup(innerContainer);
      innerContainer.setLayout('flexbox', {
        direction: 'row',
        wrap: 'nowrap',
        justifyContent: 'start',
        alignItems: 'stretch',
        alignContent: 'start',
        gap: 10,
        padding: 5,
      });
      innerContainer.size = { width: 300, height: 60, depth: 0 };

      outerContainer.addMember(innerContainer.id);

      const node1 = new NodeModel({
        type: 'test',
        position: { x: 0, y: 0 },
        size: { width: 80, height: 40, depth: 0 },
      });
      const node2 = new NodeModel({
        type: 'test',
        position: { x: 0, y: 0 },
        size: { width: 80, height: 40, depth: 0 },
      });

      diagram.addNode(node1);
      diagram.addNode(node2);
      innerContainer.addMember(node1.id);
      innerContainer.addMember(node2.id);

      // Apply layouts from outer to inner
      outerContainer.applyLayout(diagram);
      innerContainer.applyLayout(diagram);

      // Inner container should be positioned by outer container
      expect(innerContainer.position.x).toBe(10); // outer padding
      expect(innerContainer.position.y).toBe(10);

      // Nodes should be positioned relative to inner container's position + its padding
      // Inner container at (10,10), padding 5, so nodes start at (15, 15)
      expect(node1.position.x).toBe(15); // innerContainer.x (10) + padding (5)
      expect(node1.position.y).toBe(15); // innerContainer.y (10) + padding (5)
      expect(node2.position.x).toBe(105); // 15 + 80 + 10
      expect(node2.position.y).toBe(15);
    });
  });
});
