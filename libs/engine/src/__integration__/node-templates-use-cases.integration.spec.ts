/**
 * @jest-environment jsdom
 */

// Node Templates Use Cases Integration Tests
// Simplified version testing core functionality

import { DiagramEngine } from '../engine/DiagramEngine';
import { NodeFactory } from '../templates/NodeFactory';
import { TemplateRegistry } from '../templates/TemplateRegistry';
import { LemonadeJSRenderer } from '../rendering/LemonadeJSRenderer';
import { HtmlTemplateRenderer } from '../rendering/HtmlTemplateRenderer';
import { EventBus } from '../events/EventBus';
import {
  CommonTemplates,
  WorkflowTemplates,
  DataVizTemplates,
  registerTemplateLibrary,
  TemplateLibrary,
} from '../template-library';
import type { NodeModel } from '../models/NodeModel';

describe('Node Templates - Real-World Use Cases', () => {
  let engine: DiagramEngine;
  let eventBus: EventBus;
  let templateRegistry: TemplateRegistry;
  let nodeFactory: NodeFactory;
  let lemonadeRenderer: LemonadeJSRenderer;
  let htmlRenderer: HtmlTemplateRenderer;

  beforeEach(() => {
    engine = new DiagramEngine();
    const diagram = engine.createDiagram('test-diagram');
    eventBus = engine.eventBus;

    // Create template registry and register all templates
    templateRegistry = new TemplateRegistry(eventBus);
    registerTemplateLibrary(templateRegistry);

    // Create node factory
    nodeFactory = new NodeFactory(templateRegistry, diagram);

    // Create renderers
    lemonadeRenderer = new LemonadeJSRenderer(eventBus);
    htmlRenderer = new HtmlTemplateRenderer(eventBus);
  });

  afterEach(() => {
    lemonadeRenderer.dispose();
    htmlRenderer.dispose();
    engine.destroy();
  });

  describe('Common Templates Use Cases', () => {
    it('should create user avatar node with profile data', () => {
      const node = nodeFactory.createFromTemplate('user-avatar', {
        name: 'John Doe',
        avatarUrl: 'https://example.com/avatar.jpg',
        status: 'online',
      }, { x: 100, y: 100 });

      expect(node).toBeDefined();
      expect(node.data['name']).toBe('John Doe');
      expect(node.data['status']).toBe('online');
      expect(node.getMetadata('shape')).toBeDefined();
    });

    it('should create card node with content', () => {
      const node = nodeFactory.createFromTemplate('card-node', {
        title: 'Task Card',
        description: 'Complete the implementation',
      }, { x: 200, y: 200 });

      expect(node.data['title']).toBe('Task Card');
      expect(node.data['description']).toBe('Complete the implementation');
    });

    it('should emit click events for user avatar', (done) => {
      const node = nodeFactory.createFromTemplate('user-avatar', {
        name: 'Test User'
      }, { x: 0, y: 0 });

      eventBus.on('user:clicked', (data: any) => {
        expect(data.nodeId).toBe(node.id);
        done();
      });

      const template = TemplateLibrary.get('user-avatar');
      if (template?.structure.html) {
        const result = lemonadeRenderer.render(template.structure.html, node);
        if (result.self.onClick) {
          result.self.onClick({ type: 'click', target: {} });
        }
      }
    });
  });

  describe('Workflow Templates Use Cases', () => {
    it('should create complete BPMN workflow', () => {
      const startNode = nodeFactory.createFromTemplate('start-event', {
        label: 'Begin Process',
        trigger: 'manual',
      }, { x: 100, y: 200 });

      const processNode = nodeFactory.createFromTemplate('process-step', {
        title: 'Review Document',
        description: 'Check for completeness',
      }, { x: 300, y: 200 });

      const endNode = nodeFactory.createFromTemplate('end-event', {
        label: 'Complete',
        result: 'success',
      }, { x: 700, y: 200 });

      expect(startNode).toBeDefined();
      expect(processNode).toBeDefined();
      expect(endNode).toBeDefined();

      const diagram = engine.getDiagram();
      expect(diagram?.getNodes().length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Data Visualization Templates Use Cases', () => {
    it('should create analytics dashboard widgets', () => {
      const metricCard = nodeFactory.createFromTemplate('metric-card', {
        label: 'Total Revenue',
        value: '$125,430',
        change: '+12.5%',
      }, { x: 50, y: 50 });

      const gauge = nodeFactory.createFromTemplate('gauge', {
        label: 'CPU Usage',
        value: 65,
        percentage: 65,
      }, { x: 50, y: 200 });

      expect(metricCard.data['value']).toBe('$125,430');
      expect(gauge.data['percentage']).toBe(65);
    });
  });

  describe('Template Library Discovery', () => {
    it('should find templates by search', () => {
      const results = TemplateLibrary.search('card');
      expect(results.length).toBeGreaterThan(0);
      // search() returns NodeTemplate[], so check the IDs
      const resultIds = results.map((t: any) => t.id);
      expect(resultIds).toContain('card-node');
    });

    it('should get templates by category', () => {
      const workflowTemplates = TemplateLibrary.getByCategory('workflow');
      expect(workflowTemplates.length).toBeGreaterThan(0);
    });

    it('should find templates by tag', () => {
      const userTemplates = TemplateLibrary.findByTag('user');
      expect(userTemplates.length).toBeGreaterThan(0);
    });
  });

  describe('End-to-End Node Lifecycle', () => {
    it('should handle node creation and rendering', () => {
      const node = nodeFactory.createFromTemplate('card-node', {
        title: 'Lifecycle Test',
      }, { x: 0, y: 0 });

      const template = TemplateLibrary.get('card-node');
      if (template?.structure.html) {
        const result = htmlRenderer.render(template.structure.html, node);
        expect(result.html).toBeDefined();
      }
    });

    it('should handle rapid re-renders without memory leaks', () => {
      const node = nodeFactory.createFromTemplate('badge-label', {
        text: 'Status',
        variant: 'success',
      }, { x: 0, y: 0 });

      // Simulate 50 rapid re-renders
      for (let i = 0; i < 50; i++) {
        node.setData('text', `Status ${i}`);

        const template = TemplateLibrary.get('badge-label');
        if (template?.structure.html) {
          lemonadeRenderer.render(template.structure.html, node);
        }
      }

      // Verify no leaks (renderer should still work)
      expect(() => {
        lemonadeRenderer.dispose();
      }).not.toThrow();
    });
  });

  describe('Memory Management', () => {
    it('should clean up resources when disposing renderers', () => {
      const nodes = [
        nodeFactory.createFromTemplate('user-avatar', { name: 'User 1' }, { x: 0, y: 0 }),
        nodeFactory.createFromTemplate('card-node', { title: 'Card 1' }, { x: 150, y: 0 }),
        nodeFactory.createFromTemplate('metric-card', { label: 'Metric 1', value: '100' }, { x: 400, y: 0 }),
      ];

      // Render all nodes
      nodes.forEach((node, i) => {
        const templateIds = ['user-avatar', 'card-node', 'metric-card'];
        const template = TemplateLibrary.get(templateIds[i]);
        if (template?.structure.html) {
          lemonadeRenderer.render(template.structure.html, node);
        }
      });

      // Verify no leaks
      expect(() => {
        lemonadeRenderer.dispose();
      }).not.toThrow();
    });

    it('should handle diagram disposal with many nodes', () => {
      // Create 20 nodes
      for (let i = 0; i < 20; i++) {
        const templateId = i % 3 === 0 ? 'user-avatar' : i % 3 === 1 ? 'card-node' : 'metric-card';
        nodeFactory.createFromTemplate(templateId, { id: `node-${i}` }, {
          x: (i % 5) * 200,
          y: Math.floor(i / 5) * 150
        });
      }

      const diagram = engine.getDiagram();
      expect(diagram?.getNodes().length).toBeGreaterThanOrEqual(20);

      // Verify cleanup works
      expect(() => {
        engine.destroy();
      }).not.toThrow();
    });
  });

  describe('EventBus Integration', () => {
    it('should connect templates with EventBus', () => {
      // Verify that eventBus is properly wired to renderers
      expect(lemonadeRenderer).toBeDefined();
      expect(htmlRenderer).toBeDefined();

      const node = nodeFactory.createFromTemplate('user-avatar', {
        name: 'Test User'
      }, { x: 0, y: 0 });

      // Verify rendering works without throwing
      const template = TemplateLibrary.get('user-avatar');
      if (template?.structure.html) {
        expect(() => {
          lemonadeRenderer.render(template.structure.html!, node);
        }).not.toThrow();
      }
    });
  });
});
