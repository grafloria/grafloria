// NodeModel Template Support Tests (Phase 2)

import { NodeModel } from './NodeModel';
import type { PortRenderingConfig, DragHandlerConfig } from '../templates/NodeTemplate';

describe('NodeModel - Template Support (Phase 2)', () => {
  describe('Port Rendering Configuration', () => {
    it('should set port rendering configuration', () => {
      const node = new NodeModel({
        type: 'rect',
        position: { x: 0, y: 0 },
      });

      const portConfig: PortRenderingConfig = {
        mode: 'html',
        size: { width: 12, height: 12, hoverScale: 1.4 },
        html: {
          component: 'custom-port',
          className: 'port-handle',
        },
      };

      node.setPortRenderingConfig(portConfig);

      expect(node.portRenderingConfig).toEqual(portConfig);
    });

    it('should emit port-rendering:changed event', (done) => {
      const node = new NodeModel({
        type: 'rect',
        position: { x: 0, y: 0 },
      });

      const portConfig: PortRenderingConfig = {
        mode: 'svg',
        svg: {
          shape: 'circle',
          fill: '#2196F3',
        },
      };

      node.on('port-rendering:changed', (config: any) => {
        expect(config).toEqual(portConfig);
        done();
      });

      node.setPortRenderingConfig(portConfig);
    });

    it('should get port rendering configuration', () => {
      const node = new NodeModel({
        type: 'rect',
        position: { x: 0, y: 0 },
      });

      const portConfig: PortRenderingConfig = {
        mode: 'auto',
      };

      node.setPortRenderingConfig(portConfig);

      const retrieved = node.getPortRenderingConfig();
      expect(retrieved).toEqual(portConfig);
    });

    it('should return undefined if port rendering config not set', () => {
      const node = new NodeModel({
        type: 'rect',
        position: { x: 0, y: 0 },
      });

      const retrieved = node.getPortRenderingConfig();
      expect(retrieved).toBeUndefined();
    });
  });

  describe('Port Rendering Mode', () => {
    it('should return svg mode when metadata not set and no HTML layer', () => {
      const node = new NodeModel({
        type: 'rect',
        position: { x: 0, y: 0 },
      });

      const mode = node.getPortRenderingMode();
      expect(mode).toBe('svg');
    });

    it('should return html mode when useHTMLLayer metadata is true', () => {
      const node = new NodeModel({
        type: 'rect',
        position: { x: 0, y: 0 },
      });

      node.setMetadata('useHTMLLayer', true);

      const mode = node.getPortRenderingMode();
      expect(mode).toBe('html');
    });

    it('should return mode from metadata if explicitly set', () => {
      const node = new NodeModel({
        type: 'rect',
        position: { x: 0, y: 0 },
      });

      node.setMetadata('portRenderingMode', 'svg');
      node.setMetadata('useHTMLLayer', true); // Should be overridden

      const mode = node.getPortRenderingMode();
      expect(mode).toBe('svg');
    });

    it('should return mode from portRenderingConfig if set', () => {
      const node = new NodeModel({
        type: 'rect',
        position: { x: 0, y: 0 },
      });

      node.setPortRenderingConfig({ mode: 'html' });

      const mode = node.getPortRenderingMode();
      expect(mode).toBe('html');
    });
  });

  describe('Drag Handler Configuration', () => {
    it('should set drag handler configuration', () => {
      const node = new NodeModel({
        type: 'rect',
        position: { x: 0, y: 0 },
      });

      const dragConfig: DragHandlerConfig = {
        isDragHandler: true,
        dragChildren: true,
        snapToGrid: true,
        gridSize: 10,
      };

      node.setDragHandlerConfig(dragConfig);

      expect(node.dragHandlerConfig).toEqual(dragConfig);
    });

    it('should emit drag-handler:changed event', (done) => {
      const node = new NodeModel({
        type: 'rect',
        position: { x: 0, y: 0 },
      });

      const dragConfig: DragHandlerConfig = {
        isDragHandler: true,
        dragChildren: false,
      };

      node.on('drag-handler:changed', (config: any) => {
        expect(config).toEqual(dragConfig);
        done();
      });

      node.setDragHandlerConfig(dragConfig);
    });

    it('should get drag handler configuration', () => {
      const node = new NodeModel({
        type: 'rect',
        position: { x: 0, y: 0 },
      });

      const dragConfig: DragHandlerConfig = {
        isDragHandler: true,
      };

      node.setDragHandlerConfig(dragConfig);

      const retrieved = node.getDragHandlerConfig();
      expect(retrieved).toEqual(dragConfig);
    });

    it('should return undefined if drag handler config not set', () => {
      const node = new NodeModel({
        type: 'rect',
        position: { x: 0, y: 0 },
      });

      const retrieved = node.getDragHandlerConfig();
      expect(retrieved).toBeUndefined();
    });

    it('should check if node is drag handler', () => {
      const node = new NodeModel({
        type: 'rect',
        position: { x: 0, y: 0 },
      });

      expect(node.isDragHandler()).toBe(false);

      node.setDragHandlerConfig({ isDragHandler: true });

      expect(node.isDragHandler()).toBe(true);
    });
  });

  describe('Connection Group', () => {
    it('should set connection group', () => {
      const node = new NodeModel({
        type: 'rect',
        position: { x: 0, y: 0 },
      });

      node.setConnectionGroup('erd:field');

      expect(node.connectionGroup).toBe('erd:field');
    });

    it('should emit connection-group:changed event', (done) => {
      const node = new NodeModel({
        type: 'rect',
        position: { x: 0, y: 0 },
      });

      node.on('connection-group:changed', (data: any) => {
        expect(data.group).toBe('workflow:process');
        done();
      });

      node.setConnectionGroup('workflow:process');
    });

    it('should get connection group', () => {
      const node = new NodeModel({
        type: 'rect',
        position: { x: 0, y: 0 },
      });

      node.setConnectionGroup('test:group');

      const retrieved = node.getConnectionGroup();
      expect(retrieved).toBe('test:group');
    });

    it('should return undefined if connection group not set', () => {
      const node = new NodeModel({
        type: 'rect',
        position: { x: 0, y: 0 },
      });

      const retrieved = node.getConnectionGroup();
      expect(retrieved).toBeUndefined();
    });
  });

  describe('Backward Compatibility', () => {
    it('should work with nodes that do not use template features', () => {
      const node = new NodeModel({
        type: 'rect',
        position: { x: 0, y: 0 },
      });

      // Should not throw errors
      expect(() => node.getPortRenderingMode()).not.toThrow();
      expect(() => node.isDragHandler()).not.toThrow();
      expect(() => node.getConnectionGroup()).not.toThrow();

      // Should return sensible defaults
      expect(node.getPortRenderingMode()).toBe('svg');
      expect(node.isDragHandler()).toBe(false);
      expect(node.getConnectionGroup()).toBeUndefined();
    });

    it('should serialize and deserialize template properties', () => {
      const node = new NodeModel({
        type: 'rect',
        position: { x: 0, y: 0 },
      });

      node.setPortRenderingConfig({ mode: 'html' });
      node.setDragHandlerConfig({ isDragHandler: true });
      node.setConnectionGroup('test:group');

      const serialized = node.serialize();
      const deserialized = NodeModel.fromJSON(serialized);

      expect(deserialized.portRenderingConfig).toEqual({ mode: 'html' });
      expect(deserialized.dragHandlerConfig).toEqual({ isDragHandler: true });
      expect(deserialized.connectionGroup).toBe('test:group');
    });
  });
});
