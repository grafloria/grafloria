/**
 * Unit tests for Layout Presets
 */

import { LayoutPresets, LayoutPreset, LayoutPresetCategory } from './layout-presets';

describe('LayoutPresets', () => {
  describe('Preset Categories', () => {
    it('should have hierarchical category with presets', () => {
      const category = LayoutPresets.HIERARCHICAL;

      expect(category).toBeDefined();
      expect(category.name).toBe('Hierarchical Layouts');
      expect(category.presets.length).toBeGreaterThan(0);
    });

    it('should have flow category with presets', () => {
      const category = LayoutPresets.FLOW;

      expect(category).toBeDefined();
      expect(category.name).toBe('Flow Layouts');
      expect(category.presets.length).toBeGreaterThan(0);
    });

    it('should have network category with presets', () => {
      const category = LayoutPresets.NETWORK;

      expect(category).toBeDefined();
      expect(category.name).toBe('Network Layouts');
      expect(category.presets.length).toBeGreaterThan(0);
    });

    it('should have architecture category with presets', () => {
      const category = LayoutPresets.ARCHITECTURE;

      expect(category).toBeDefined();
      expect(category.name).toBe('Architecture Layouts');
      expect(category.presets.length).toBeGreaterThan(0);
    });

    it('should have interactive category with presets', () => {
      const category = LayoutPresets.INTERACTIVE;

      expect(category).toBeDefined();
      expect(category.name).toBe('Interactive Layouts');
      expect(category.presets.length).toBeGreaterThan(0);
    });
  });

  describe('getAllCategories', () => {
    it('should return all categories', () => {
      const categories = LayoutPresets.getAllCategories();

      expect(categories.length).toBe(5);
      expect(categories).toContainEqual(LayoutPresets.HIERARCHICAL);
      expect(categories).toContainEqual(LayoutPresets.FLOW);
      expect(categories).toContainEqual(LayoutPresets.NETWORK);
      expect(categories).toContainEqual(LayoutPresets.ARCHITECTURE);
      expect(categories).toContainEqual(LayoutPresets.INTERACTIVE);
    });
  });

  describe('getAllPresets', () => {
    it('should return all presets from all categories', () => {
      const presets = LayoutPresets.getAllPresets();

      expect(presets.length).toBeGreaterThan(10);
      // Check that presets from different categories are included
      expect(presets.some(p => p.id === 'org-chart-compact')).toBe(true);
      expect(presets.some(p => p.id === 'workflow-horizontal')).toBe(true);
      expect(presets.some(p => p.id === 'force-directed-balanced')).toBe(true);
    });

    it('should have valid preset structures', () => {
      const presets = LayoutPresets.getAllPresets();

      presets.forEach(preset => {
        expect(preset.id).toBeDefined();
        expect(preset.name).toBeDefined();
        expect(preset.description).toBeDefined();
        expect(preset.adapter).toMatch(/^(dagre|elk)$/);
        expect(preset.options).toBeDefined();
      });
    });
  });

  describe('findPreset', () => {
    it('should find preset by ID', () => {
      const preset = LayoutPresets.findPreset('org-chart-compact');

      expect(preset).toBeDefined();
      expect(preset?.id).toBe('org-chart-compact');
      expect(preset?.name).toBe('Org Chart (Compact)');
      expect(preset?.adapter).toBe('dagre');
    });

    it('should return undefined for invalid ID', () => {
      const preset = LayoutPresets.findPreset('nonexistent-preset');

      expect(preset).toBeUndefined();
    });
  });

  describe('findPresetsByTag', () => {
    it('should find presets by tag', () => {
      const presets = LayoutPresets.findPresetsByTag('hierarchy');

      expect(presets.length).toBeGreaterThan(0);
      presets.forEach(preset => {
        expect(preset.tags).toContain('hierarchy');
      });
    });

    it('should return empty array for non-existent tag', () => {
      const presets = LayoutPresets.findPresetsByTag('nonexistent-tag');

      expect(presets).toEqual([]);
    });

    it('should find incremental presets', () => {
      const presets = LayoutPresets.findPresetsByTag('incremental');

      expect(presets.length).toBeGreaterThan(0);
      presets.forEach(preset => {
        expect(preset.incrementalOptions).toBeDefined();
      });
    });
  });

  describe('findPresetsByAdapter', () => {
    it('should find dagre presets', () => {
      const presets = LayoutPresets.findPresetsByAdapter('dagre');

      expect(presets.length).toBeGreaterThan(0);
      presets.forEach(preset => {
        expect(preset.adapter).toBe('dagre');
      });
    });

    it('should find elk presets', () => {
      const presets = LayoutPresets.findPresetsByAdapter('elk');

      expect(presets.length).toBeGreaterThan(0);
      presets.forEach(preset => {
        expect(preset.adapter).toBe('elk');
      });
    });
  });

  describe('searchPresets', () => {
    it('should search presets by name', () => {
      const presets = LayoutPresets.searchPresets('Org Chart');

      expect(presets.length).toBeGreaterThan(0);
      presets.forEach(preset => {
        expect(preset.name.toLowerCase()).toContain('org chart');
      });
    });

    it('should search presets by description', () => {
      const presets = LayoutPresets.searchPresets('workflow');

      expect(presets.length).toBeGreaterThan(0);
      presets.forEach(preset => {
        const match =
          preset.name.toLowerCase().includes('workflow') ||
          preset.description.toLowerCase().includes('workflow');
        expect(match).toBe(true);
      });
    });

    it('should be case-insensitive', () => {
      const lowercase = LayoutPresets.searchPresets('microservices');
      const uppercase = LayoutPresets.searchPresets('MICROSERVICES');
      const mixed = LayoutPresets.searchPresets('MicroServices');

      expect(lowercase).toEqual(uppercase);
      expect(lowercase).toEqual(mixed);
    });

    it('should return empty array for no matches', () => {
      const presets = LayoutPresets.searchPresets('xyz123nonexistent');

      expect(presets).toEqual([]);
    });
  });

  describe('Specific Presets', () => {
    it('should have org chart compact preset with correct options', () => {
      const preset = LayoutPresets.findPreset('org-chart-compact');

      expect(preset).toBeDefined();
      expect(preset?.adapter).toBe('dagre');
      expect((preset?.options as any).rankdir).toBe('TB');
      expect((preset?.options as any).nodesep).toBe(40);
      expect((preset?.options as any).ranksep).toBe(60);
    });

    it('should have force-directed preset with correct options', () => {
      const preset = LayoutPresets.findPreset('force-directed-balanced');

      expect(preset).toBeDefined();
      expect(preset?.adapter).toBe('elk');
      expect((preset?.options as any).algorithm).toBe('force');
      expect((preset?.options as any)['elk.force.repulsion']).toBeDefined();
    });

    it('should have incremental presets with incremental options', () => {
      const preset = LayoutPresets.findPreset('incremental-minimal');

      expect(preset).toBeDefined();
      expect(preset?.incrementalOptions).toBeDefined();
      expect(preset?.incrementalOptions?.strategy).toBe('minimal-shift');
      expect(preset?.incrementalOptions?.maxShift).toBe(30);
    });

    it('should have proximity-aware preset', () => {
      const preset = LayoutPresets.findPreset('incremental-proximity');

      expect(preset).toBeDefined();
      expect(preset?.incrementalOptions?.strategy).toBe('proximity-aware');
      expect(preset?.incrementalOptions?.proximityRadius).toBe(250);
    });
  });

  describe('Preset Validation', () => {
    it('should have unique IDs', () => {
      const presets = LayoutPresets.getAllPresets();
      const ids = presets.map(p => p.id);
      const uniqueIds = new Set(ids);

      expect(ids.length).toBe(uniqueIds.size);
    });

    it('should have valid adapter types', () => {
      const presets = LayoutPresets.getAllPresets();

      presets.forEach(preset => {
        expect(['dagre', 'elk']).toContain(preset.adapter);
      });
    });

    it('should have non-empty names and descriptions', () => {
      const presets = LayoutPresets.getAllPresets();

      presets.forEach(preset => {
        expect(preset.name.length).toBeGreaterThan(0);
        expect(preset.description.length).toBeGreaterThan(0);
      });
    });

    it('should have options object', () => {
      const presets = LayoutPresets.getAllPresets();

      presets.forEach(preset => {
        expect(preset.options).toBeDefined();
        expect(typeof preset.options).toBe('object');
      });
    });
  });
});
