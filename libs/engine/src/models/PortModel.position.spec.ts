/**
 * Unit tests for PortModel position calculations
 * Tests port position calculations for all sides and various node positions
 */

import { PortModel } from './PortModel';
import { BoundingBox } from '../types';

describe('PortModel - Position Calculations', () => {
  describe('getAbsolutePosition', () => {
    it('should calculate correct position for LEFT port at default position (0.5, 0.5)', () => {
      const port = new PortModel({
        type: 'input',
        side: 'left',
      });

      const nodeBounds: BoundingBox = {
        left: 100,
        top: 200,
        right: 220, // 100 + 120
        bottom: 260, // 200 + 60
        width: 120,
        height: 60,
      };

      const position = port.getAbsolutePosition(nodeBounds);

      expect(position.x).toBe(100); // left edge
      expect(position.y).toBe(230); // top + height * 0.5 = 200 + 60 * 0.5 = 230
    });

    it('should calculate correct position for RIGHT port at default position (0.5, 0.5)', () => {
      const port = new PortModel({
        type: 'output',
        side: 'right',
      });

      const nodeBounds: BoundingBox = {
        left: 100,
        top: 200,
        right: 220,
        bottom: 260,
        width: 120,
        height: 60,
      };

      const position = port.getAbsolutePosition(nodeBounds);

      expect(position.x).toBe(220); // right edge
      expect(position.y).toBe(230); // top + height * 0.5 = 200 + 60 * 0.5 = 230
    });

    it('should calculate correct position for TOP port at default position (0.5, 0.5)', () => {
      const port = new PortModel({
        type: 'input',
        side: 'top',
      });

      const nodeBounds: BoundingBox = {
        left: 100,
        top: 200,
        right: 220,
        bottom: 260,
        width: 120,
        height: 60,
      };

      const position = port.getAbsolutePosition(nodeBounds);

      expect(position.x).toBe(160); // left + width * 0.5 = 100 + 120 * 0.5 = 160
      expect(position.y).toBe(200); // top edge
    });

    it('should calculate correct position for BOTTOM port at default position (0.5, 0.5)', () => {
      const port = new PortModel({
        type: 'output',
        side: 'bottom',
      });

      const nodeBounds: BoundingBox = {
        left: 100,
        top: 200,
        right: 220,
        bottom: 260,
        width: 120,
        height: 60,
      };

      const position = port.getAbsolutePosition(nodeBounds);

      expect(position.x).toBe(160); // left + width * 0.5 = 100 + 120 * 0.5 = 160
      expect(position.y).toBe(260); // bottom edge
    });

    it('should handle custom port position (0.25, 0.75) on LEFT side', () => {
      const port = new PortModel({
        type: 'input',
        side: 'left',
        position: { x: 0.25, y: 0.75 },
      });

      const nodeBounds: BoundingBox = {
        left: 100,
        top: 200,
        right: 220,
        bottom: 260,
        width: 120,
        height: 60,
      };

      const position = port.getAbsolutePosition(nodeBounds);

      expect(position.x).toBe(100); // left edge
      expect(position.y).toBe(245); // top + height * 0.75 = 200 + 60 * 0.75 = 245
    });

    it('should handle alignment offset for LEFT port (outward)', () => {
      const port = new PortModel({
        type: 'input',
        side: 'left',
      });
      port.alignment = { side: 'left', offset: 10 };

      const nodeBounds: BoundingBox = {
        left: 100,
        top: 200,
        right: 220,
        bottom: 260,
        width: 120,
        height: 60,
      };

      const position = port.getAbsolutePosition(nodeBounds);

      expect(position.x).toBe(90); // left - offset = 100 - 10 = 90 (moved outward)
      expect(position.y).toBe(230);
    });

    it('should handle alignment offset for RIGHT port (outward)', () => {
      const port = new PortModel({
        type: 'output',
        side: 'right',
      });
      port.alignment = { side: 'right', offset: 10 };

      const nodeBounds: BoundingBox = {
        left: 100,
        top: 200,
        right: 220,
        bottom: 260,
        width: 120,
        height: 60,
      };

      const position = port.getAbsolutePosition(nodeBounds);

      expect(position.x).toBe(230); // right + offset = 220 + 10 = 230 (moved outward)
      expect(position.y).toBe(230);
    });

    it('should handle port offset for precise positioning', () => {
      const port = new PortModel({
        type: 'input',
        side: 'left',
      });
      port.offset = { x: 5, y: -10 };

      const nodeBounds: BoundingBox = {
        left: 100,
        top: 200,
        right: 220,
        bottom: 260,
        width: 120,
        height: 60,
      };

      const position = port.getAbsolutePosition(nodeBounds);

      expect(position.x).toBe(105); // 100 + 5
      expect(position.y).toBe(220); // 230 - 10
    });

    it('should calculate consistent positions for Node 6 scenario', () => {
      // Simulating Node 6 from elk-comparison
      const leftPort = new PortModel({
        id: 'node6-left',
        type: 'input',
        side: 'left',
      });

      const rightPort = new PortModel({
        id: 'node6-right',
        type: 'output',
        side: 'right',
      });

      // Node 6 position: x=600, y=350, size=120x60
      const nodeBounds: BoundingBox = {
        left: 600,
        top: 350,
        right: 720, // 600 + 120
        bottom: 410, // 350 + 60
        width: 120,
        height: 60,
      };

      const leftPos = leftPort.getAbsolutePosition(nodeBounds);
      const rightPos = rightPort.getAbsolutePosition(nodeBounds);

      // Left port should be at left edge, middle vertically
      expect(leftPos.x).toBe(600);
      expect(leftPos.y).toBe(380); // 350 + 60 * 0.5

      // Right port should be at right edge, middle vertically
      expect(rightPos.x).toBe(720);
      expect(rightPos.y).toBe(380);
    });

    it('should handle node at different position (verifying coordinate system)', () => {
      const port = new PortModel({
        type: 'input',
        side: 'left',
      });

      // Node at position 300, 400 with size 100x80
      const nodeBounds: BoundingBox = {
        left: 300,
        top: 400,
        right: 400,
        bottom: 480,
        width: 100,
        height: 80,
      };

      const position = port.getAbsolutePosition(nodeBounds);

      expect(position.x).toBe(300); // left edge
      expect(position.y).toBe(440); // top + height * 0.5 = 400 + 80 * 0.5
    });
  });

  describe('getEdgePosition', () => {
    it('should return edge midpoint for LEFT port', () => {
      const port = new PortModel({
        type: 'input',
        side: 'left',
      });

      const nodeBounds: BoundingBox = {
        left: 100,
        top: 200,
        right: 220,
        bottom: 260,
        width: 120,
        height: 60,
      };

      const position = port.getEdgePosition(nodeBounds);

      expect(position.x).toBe(100); // left edge
      expect(position.y).toBe(230); // vertical center
    });

    it('should return edge midpoint for RIGHT port', () => {
      const port = new PortModel({
        type: 'output',
        side: 'right',
      });

      const nodeBounds: BoundingBox = {
        left: 100,
        top: 200,
        right: 220,
        bottom: 260,
        width: 120,
        height: 60,
      };

      const position = port.getEdgePosition(nodeBounds);

      expect(position.x).toBe(220); // right edge
      expect(position.y).toBe(230); // vertical center
    });
  });
});
