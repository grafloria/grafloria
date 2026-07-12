/**
 * Template Library Tests (Phase 4)
 * Practical tests for template library functionality
 */

import {
  TemplateLibrary,
  getAllTemplates,
  getTemplatesByCategory,
  CommonTemplates,
  WorkflowTemplates,
  DataVizTemplates,
} from './index';

describe('Template Library (Phase 4)', () => {
  describe('Template Registry', () => {
    it('should register every library template', () => {
      // Count against the source of truth — the library grows over time
      expect(TemplateLibrary.count()).toBe(getAllTemplates().length);
      expect(TemplateLibrary.count()).toBeGreaterThanOrEqual(20);
    });

    it('should retrieve template by ID', () => {
      const template = TemplateLibrary.get('user-avatar');
      expect(template).toBeDefined();
      expect(template?.id).toBe('user-avatar');
    });

    it('should check if template exists', () => {
      expect(TemplateLibrary.has('user-avatar')).toBe(true);
      expect(TemplateLibrary.has('non-existent')).toBe(false);
    });

    it('should list all template IDs', () => {
      const ids = TemplateLibrary.list();
      expect(ids.length).toBe(getAllTemplates().length);
      expect(ids).toContain('user-avatar');
      expect(ids).toContain('process-step');
      expect(ids).toContain('metric-card');
    });
  });

  describe('Category-Based Retrieval', () => {
    it('should get common templates (6 total)', () => {
      const templates = TemplateLibrary.getByCategory('common');
      expect(templates.length).toBe(6);
    });

    it('should get workflow templates (7 total)', () => {
      const templates = TemplateLibrary.getByCategory('workflow');
      expect(templates.length).toBe(7);
    });

    it('should get data-viz templates (7 total)', () => {
      const templates = TemplateLibrary.getByCategory('data-viz');
      expect(templates.length).toBe(7);
    });
  });

  describe('Tag Search', () => {
    it('should find templates by tag', () => {
      const results = TemplateLibrary.findByTag('dashboard');
      expect(results.length).toBeGreaterThan(0);
    });

    it('should find BPMN templates', () => {
      const results = TemplateLibrary.findByTag('bpmn');
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('Text Search', () => {
    it('should search templates', () => {
      const results = TemplateLibrary.search('user');
      expect(results.length).toBeGreaterThan(0);
    });

    it('should be case-insensitive', () => {
      const lower = TemplateLibrary.search('process');
      const upper = TemplateLibrary.search('PROCESS');
      expect(lower.length).toBe(upper.length);
    });
  });

  describe('Common Templates', () => {
    it('should export UserAvatar', () => {
      expect(CommonTemplates.UserAvatar.id).toBe('user-avatar');
    });

    it('should export CardNode', () => {
      expect(CommonTemplates.CardNode.id).toBe('card-node');
    });

    it('should export ButtonNode', () => {
      expect(CommonTemplates.ButtonNode.id).toBe('button-node');
    });
  });

  describe('Workflow Templates', () => {
    it('should export ProcessStep', () => {
      expect(WorkflowTemplates.ProcessStep.id).toBe('process-step');
    });

    it('should export DecisionNode', () => {
      expect(WorkflowTemplates.DecisionNode.id).toBe('decision-node');
    });

    it('should export StartEvent', () => {
      expect(WorkflowTemplates.StartEvent.id).toBe('start-event');
    });
  });

  describe('Data Viz Templates', () => {
    it('should export MetricCard', () => {
      expect(DataVizTemplates.MetricCard.id).toBe('metric-card');
    });

    it('should export Gauge', () => {
      expect(DataVizTemplates.Gauge.id).toBe('gauge');
    });

    it('should export BarChart', () => {
      expect(DataVizTemplates.BarChart.id).toBe('bar-chart');
    });
  });

  describe('All Templates', () => {
    it('should have required properties', () => {
      const templates = getAllTemplates();
      templates.forEach((t) => {
        expect(t.id).toBeDefined();
        expect(t.structure).toBeDefined();
      });
    });

    it('should have shape configuration', () => {
      const templates = getAllTemplates();
      templates.forEach((t) => {
        expect(t.structure.shape).toBeDefined();
      });
    });
  });
});
