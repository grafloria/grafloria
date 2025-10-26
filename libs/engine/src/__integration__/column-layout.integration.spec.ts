/**
 * @jest-environment jsdom
 */

// Column-Based Layout Tests (like Bootstrap 12-column grid)

import { DiagramEngine } from '../engine/DiagramEngine';
import { DiagramModel } from '../models/DiagramModel';
import { NodeModel } from '../models/NodeModel';
import { GroupModel } from '../models/GroupModel';
import type { FlexboxLayoutConfig } from '../types/layout.types';

describe('Column-Based Layout - Dashboard Builder', () => {
  let engine: DiagramEngine;
  let diagram: DiagramModel;

  beforeEach(() => {
    engine = new DiagramEngine();
    diagram = engine.createDiagram('test-diagram');
  });

  afterEach(() => {
    engine.destroy();
  });

  describe('12-Column Grid Layout', () => {
    it('should position widgets in 12-column grid', () => {
      const dashboard = new GroupModel({ name: 'Dashboard' });
      dashboard.size = { width: 1200, height: 800, depth: 0 };
      diagram.addGroup(dashboard);

      dashboard.setLayout('flexbox', {
        direction: 'row',
        wrap: 'wrap',
        justifyContent: 'start',
        alignItems: 'start',
        alignContent: 'start',
        gap: 20,
        padding: 40,
        columns: 12, // 12-column layout
      });

      // Widget 1: Takes 4 columns (1/3 width)
      const widget1 = new NodeModel({
        type: 'widget',
        position: { x: 0, y: 0 },
        size: { width: 100, height: 200, depth: 0 },
      });
      widget1.setMetadata('columnSpan', 4);

      // Widget 2: Takes 8 columns (2/3 width)
      const widget2 = new NodeModel({
        type: 'widget',
        position: { x: 0, y: 0 },
        size: { width: 100, height: 200, depth: 0 },
      });
      widget2.setMetadata('columnSpan', 8);

      diagram.addNode(widget1);
      diagram.addNode(widget2);
      dashboard.addMember(widget1.id);
      dashboard.addMember(widget2.id);

      dashboard.applyLayout(diagram);

      // Available width: 1200 - 40 (left) - 40 (right) = 1120
      // Total gaps: 11 * 20 = 220
      // Column width: (1120 - 220) / 12 = 75px

      // Widget 1: 4 columns = 75 * 4 + 20 * 3 = 300 + 60 = 360px
      expect(widget1.size?.width).toBe(360);
      expect(widget1.position.x).toBe(40); // padding.left
      expect(widget1.position.y).toBe(40); // padding.top

      // Widget 2: 8 columns = 75 * 8 + 20 * 7 = 600 + 140 = 740px
      expect(widget2.size?.width).toBe(740);
      expect(widget2.position.x).toBe(420); // 40 + 360 + 20
      expect(widget2.position.y).toBe(40);
    });

    it('should wrap widgets to next row when exceeding 12 columns', () => {
      const dashboard = new GroupModel({ name: 'Dashboard' });
      dashboard.size = { width: 1200, height: 800, depth: 0 };
      diagram.addGroup(dashboard);

      dashboard.setLayout('flexbox', {
        direction: 'row',
        wrap: 'wrap',
        justifyContent: 'start',
        alignItems: 'start',
        alignContent: 'start',
        gap: 20,
        padding: 20,
        columns: 12,
      });

      // Row 1: 6 + 6 = 12 columns
      const widget1 = new NodeModel({
        type: 'widget',
        position: { x: 0, y: 0 },
        size: { width: 100, height: 150, depth: 0 },
      });
      widget1.setMetadata('columnSpan', 6);

      const widget2 = new NodeModel({
        type: 'widget',
        position: { x: 0, y: 0 },
        size: { width: 100, height: 150, depth: 0 },
      });
      widget2.setMetadata('columnSpan', 6);

      // Row 2: 12 columns (wraps to next row)
      const widget3 = new NodeModel({
        type: 'widget',
        position: { x: 0, y: 0 },
        size: { width: 100, height: 100, depth: 0 },
      });
      widget3.setMetadata('columnSpan', 12);

      diagram.addNode(widget1);
      diagram.addNode(widget2);
      diagram.addNode(widget3);
      dashboard.addMember(widget1.id);
      dashboard.addMember(widget2.id);
      dashboard.addMember(widget3.id);

      dashboard.applyLayout(diagram);

      // Row 1
      expect(widget1.position.y).toBe(20);
      expect(widget2.position.y).toBe(20);

      // Row 2 (wrapped)
      expect(widget3.position.x).toBe(20); // padding.left
      expect(widget3.position.y).toBe(190); // 20 + 150 + 20
    });

    it('should handle mixed column spans', () => {
      const dashboard = new GroupModel({ name: 'Dashboard' });
      dashboard.size = { width: 1200, height: 600, depth: 0 };
      diagram.addGroup(dashboard);

      dashboard.setLayout('flexbox', {
        direction: 'row',
        wrap: 'wrap',
        justifyContent: 'start',
        alignItems: 'start',
        alignContent: 'start',
        gap: 10,
        padding: 0,
        columns: 12,
      });

      // Row 1: 3 + 3 + 6 = 12
      const small1 = new NodeModel({
        type: 'small',
        position: { x: 0, y: 0 },
        size: { width: 10, height: 100, depth: 0 },
      });
      small1.setMetadata('columnSpan', 3);

      const small2 = new NodeModel({
        type: 'small',
        position: { x: 0, y: 0 },
        size: { width: 10, height: 100, depth: 0 },
      });
      small2.setMetadata('columnSpan', 3);

      const medium = new NodeModel({
        type: 'medium',
        position: { x: 0, y: 0 },
        size: { width: 10, height: 100, depth: 0 },
      });
      medium.setMetadata('columnSpan', 6);

      diagram.addNode(small1);
      diagram.addNode(small2);
      diagram.addNode(medium);
      dashboard.addMember(small1.id);
      dashboard.addMember(small2.id);
      dashboard.addMember(medium.id);

      dashboard.applyLayout(diagram);

      // Available width: 1200
      // Gaps: 11 * 10 = 110
      // Column width: (1200 - 110) / 12 = 90.83...

      // Small1: 3 columns
      expect(small1.position.x).toBe(0);
      expect(small1.position.y).toBe(0);

      // Small2: 3 columns
      expect(small2.position.y).toBe(0);

      // Medium: 6 columns
      expect(medium.position.y).toBe(0);
    });

    it('should default to columnSpan=1 if not specified', () => {
      const dashboard = new GroupModel({ name: 'Dashboard' });
      dashboard.size = { width: 600, height: 400, depth: 0 };
      diagram.addGroup(dashboard);

      dashboard.setLayout('flexbox', {
        direction: 'row',
        wrap: 'wrap',
        justifyContent: 'start',
        alignItems: 'start',
        alignContent: 'start',
        gap: 0,
        padding: 0,
        columns: 12,
      });

      // No columnSpan metadata - should default to 1
      const widget = new NodeModel({
        type: 'widget',
        position: { x: 0, y: 0 },
        size: { width: 100, height: 50, depth: 0 },
      });

      diagram.addNode(widget);
      dashboard.addMember(widget.id);
      dashboard.applyLayout(diagram);

      // 1 column out of 12 = 600/12 = 50px
      expect(widget.size?.width).toBe(50);
    });
  });

  describe('Responsive Dashboard Layouts', () => {
    it('should create typical dashboard with header, sidebar, and main content', () => {
      const dashboard = new GroupModel({ name: 'Dashboard' });
      dashboard.size = { width: 1440, height: 900, depth: 0 };
      diagram.addGroup(dashboard);

      dashboard.setLayout('flexbox', {
        direction: 'row',
        wrap: 'wrap',
        justifyContent: 'start',
        alignItems: 'start',
        alignContent: 'start',
        gap: 0,
        padding: 0,
        columns: 12,
      });

      // Header: Full width (12 columns)
      const header = new NodeModel({
        type: 'header',
        position: { x: 0, y: 0 },
        size: { width: 100, height: 60, depth: 0 },
      });
      header.setMetadata('columnSpan', 12);

      // Sidebar: 3 columns
      const sidebar = new NodeModel({
        type: 'sidebar',
        position: { x: 0, y: 0 },
        size: { width: 100, height: 800, depth: 0 },
      });
      sidebar.setMetadata('columnSpan', 3);

      // Main content: 9 columns
      const mainContent = new NodeModel({
        type: 'main',
        position: { x: 0, y: 0 },
        size: { width: 100, height: 800, depth: 0 },
      });
      mainContent.setMetadata('columnSpan', 9);

      diagram.addNode(header);
      diagram.addNode(sidebar);
      diagram.addNode(mainContent);
      dashboard.addMember(header.id);
      dashboard.addMember(sidebar.id);
      dashboard.addMember(mainContent.id);

      dashboard.applyLayout(diagram);

      // Header spans full width
      expect(header.size?.width).toBe(1440);
      expect(header.position.x).toBe(0);
      expect(header.position.y).toBe(0);

      // Sidebar (3/12 = 25%)
      expect(sidebar.size?.width).toBe(360); // 1440 / 12 * 3
      expect(sidebar.position.x).toBe(0);
      expect(sidebar.position.y).toBe(60); // After header

      // Main content (9/12 = 75%)
      expect(mainContent.size?.width).toBe(1080); // 1440 / 12 * 9
      expect(mainContent.position.x).toBe(360); // After sidebar
      expect(mainContent.position.y).toBe(60);
    });
  });
});
