// PortModel Template Support Tests (Phase 2)

import { PortModel } from './PortModel';
import { NodeModel } from './NodeModel';

describe('PortModel - Template Support (Phase 2)', () => {
  describe('Rendering Configuration', () => {
    it('should set rendering configuration', () => {
      const port = new PortModel({
        type: 'input',
        side: 'left',
      });

      const renderingConfig = {
        component: 'custom-port',
        className: 'port-handle',
        style: {
          background: '#2196F3',
        },
      };

      port.setRenderingConfig(renderingConfig);

      expect(port.renderingConfig).toEqual(renderingConfig);
    });

    it('should emit rendering-config:changed event', (done) => {
      const port = new PortModel({
        type: 'output',
        side: 'right',
      });

      const renderingConfig = {
        component: 'test-port',
      };

      port.on('rendering-config:changed', (config: any) => {
        expect(config).toEqual(renderingConfig);
        done();
      });

      port.setRenderingConfig(renderingConfig);
    });

    it('should get rendering configuration', () => {
      const port = new PortModel({
        type: 'bi',
        side: 'top',
      });

      const renderingConfig = {
        component: 'port-component',
        visibility: 'on-hover',
      };

      port.setRenderingConfig(renderingConfig);

      const retrieved = port.getRenderingConfig();
      expect(retrieved).toEqual(renderingConfig);
    });

    it('should return undefined if rendering config not set', () => {
      const port = new PortModel({
        type: 'input',
        side: 'left',
      });

      const retrieved = port.getRenderingConfig();
      expect(retrieved).toBeUndefined();
    });
  });

  describe('Effective Visibility', () => {
    it('should return port-level visibility if set', () => {
      const node = new NodeModel({
        type: 'rect',
        position: { x: 0, y: 0 },
      });

      const port = new PortModel({
        type: 'input',
        side: 'left',
      });

      port.setRenderingConfig({ visibility: 'always' });

      const visibility = port.getEffectiveVisibility(node);
      expect(visibility).toBe('always');
    });

    it('should return node metadata visibility if port config not set', () => {
      const node = new NodeModel({
        type: 'rect',
        position: { x: 0, y: 0 },
      });
      node.setMetadata('portVisibility', 'never');

      const port = new PortModel({
        type: 'input',
        side: 'left',
      });

      const visibility = port.getEffectiveVisibility(node);
      expect(visibility).toBe('never');
    });

    it('should return on-hover as default visibility', () => {
      const node = new NodeModel({
        type: 'rect',
        position: { x: 0, y: 0 },
      });

      const port = new PortModel({
        type: 'input',
        side: 'left',
      });

      const visibility = port.getEffectiveVisibility(node);
      expect(visibility).toBe('on-hover');
    });

    it('should prioritize port-level over node-level visibility', () => {
      const node = new NodeModel({
        type: 'rect',
        position: { x: 0, y: 0 },
      });
      node.setMetadata('portVisibility', 'never');

      const port = new PortModel({
        type: 'input',
        side: 'left',
      });
      port.setRenderingConfig({ visibility: 'always' });

      const visibility = port.getEffectiveVisibility(node);
      expect(visibility).toBe('always'); // Port level takes precedence
    });
  });

  describe('Backward Compatibility', () => {
    it('should work with ports that do not use template features', () => {
      const node = new NodeModel({
        type: 'rect',
        position: { x: 0, y: 0 },
      });

      const port = new PortModel({
        type: 'input',
        side: 'left',
      });

      // Should not throw errors
      expect(() => port.getEffectiveVisibility(node)).not.toThrow();
      expect(() => port.getRenderingConfig()).not.toThrow();

      // Should return sensible defaults
      expect(port.getEffectiveVisibility(node)).toBe('on-hover');
      expect(port.getRenderingConfig()).toBeUndefined();
    });

    it('should serialize and deserialize rendering config', () => {
      const port = new PortModel({
        type: 'input',
        side: 'left',
      });

      port.setRenderingConfig({
        component: 'custom-port',
        visibility: 'always',
      });

      const serialized = port.serialize();
      const deserialized = PortModel.fromJSON(serialized);

      expect(deserialized.renderingConfig).toEqual({
        component: 'custom-port',
        visibility: 'always',
      });
    });
  });
});
