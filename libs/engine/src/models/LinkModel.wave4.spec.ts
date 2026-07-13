// LinkModel — Wave 4 (Edges & links) model surface
//
// Card 4: self-loop identity + the unordered node-pair key a parallel bundle is
//         grouped by.
// Card 5: label SLOTS, and the fact that addLabel now carries the whole LinkLabel
//         instead of hand-copying five fields.

import { DiagramModel } from './DiagramModel';
import { NodeModel } from './NodeModel';
import { PortModel } from './PortModel';
import { LinkModel, LINK_LABEL_SLOT_POSITIONS, linkLabelPosition } from './LinkModel';
import type { LinkLabel } from '../types';

describe('LinkModel — Wave 4 (Edges & links)', () => {
  let diagram: DiagramModel;

  const addNode = (ports: Array<{ id: string; side: 'left' | 'right' | 'top' | 'bottom' }>) => {
    const node = new NodeModel({ type: 'rect', position: { x: 0, y: 0 } });
    for (const p of ports) {
      node.addPort(new PortModel({ id: p.id, type: 'output', side: p.side } as any));
    }
    diagram.addNode(node);
    return node;
  };

  beforeEach(() => {
    diagram = new DiagramModel();
  });

  // =========================================================================
  // Card 4: self-loops
  // =========================================================================
  describe('isSelfLoop()', () => {
    it('is true when both ends live on the same node — even on DIFFERENT ports', () => {
      addNode([{ id: 'p1', side: 'right' }, { id: 'p2', side: 'top' }]);
      const link = new LinkModel('p1', 'p2');
      diagram.addLink(link);

      expect(link.isSelfLoop()).toBe(true);
    });

    it('is true when both ends are the SAME port', () => {
      addNode([{ id: 'p1', side: 'right' }]);
      const link = new LinkModel('p1', 'p1');
      diagram.addLink(link);

      expect(link.isSelfLoop()).toBe(true);
    });

    it('is false for an ordinary link between two nodes', () => {
      addNode([{ id: 'a', side: 'right' }]);
      addNode([{ id: 'b', side: 'left' }]);
      const link = new LinkModel('a', 'b');
      diagram.addLink(link);

      expect(link.isSelfLoop()).toBe(false);
    });

    it('is false for a link that was never installed (no owning-node ids to read)', () => {
      // `new LinkModel()` carries no node ids; DiagramModel.installLink is what
      // backfills them. A link nobody installed cannot be known to be a self-loop.
      const orphan = new LinkModel('p1', 'p1');
      expect(orphan.isSelfLoop()).toBe(false);
    });
  });

  // =========================================================================
  // Card 4: parallel bundles are keyed by the UNORDERED pair
  // =========================================================================
  describe('getNodePairKey()', () => {
    it('gives A→B and B→A the SAME key — they are one visual bundle', () => {
      const a = addNode([{ id: 'a-out', side: 'right' }]);
      const b = addNode([{ id: 'b-in', side: 'left' }]);

      const forward = new LinkModel('a-out', 'b-in');
      const backward = new LinkModel('b-in', 'a-out');
      diagram.addLink(forward);
      diagram.addLink(backward);

      expect(forward.getNodePairKey()).toBe(backward.getNodePairKey());
      expect(forward.getNodePairKey()).toContain(a.id);
      expect(forward.getNodePairKey()).toContain(b.id);
    });

    it('gives different pairs different keys', () => {
      addNode([{ id: 'a', side: 'right' }]);
      addNode([{ id: 'b', side: 'left' }]);
      addNode([{ id: 'c', side: 'left' }]);

      const ab = new LinkModel('a', 'b');
      const ac = new LinkModel('a', 'c');
      diagram.addLink(ab);
      diagram.addLink(ac);

      expect(ab.getNodePairKey()).not.toBe(ac.getNodePairKey());
    });

    it('is null when the owning nodes are unknown', () => {
      expect(new LinkModel('x', 'y').getNodePairKey()).toBeNull();
    });
  });

  // =========================================================================
  // Card 5: label slots
  // =========================================================================
  describe('linkLabelPosition()', () => {
    it('resolves each slot to its documented position', () => {
      expect(linkLabelPosition({ position: 0.5, slot: 'start' })).toBe(LINK_LABEL_SLOT_POSITIONS.start);
      expect(linkLabelPosition({ position: 0.5, slot: 'center' })).toBe(LINK_LABEL_SLOT_POSITIONS.center);
      expect(linkLabelPosition({ position: 0.5, slot: 'end' })).toBe(LINK_LABEL_SLOT_POSITIONS.end);
    });

    it('pulls the start/end slots IN from the endpoints, so a slot label never sits under an arrowhead', () => {
      expect(LINK_LABEL_SLOT_POSITIONS.start).toBeGreaterThan(0);
      expect(LINK_LABEL_SLOT_POSITIONS.end).toBeLessThan(1);
    });

    it('lets slot WIN over position — `position` is a required field most slot users only fill to satisfy the type', () => {
      expect(linkLabelPosition({ position: 0.9, slot: 'start' })).toBe(LINK_LABEL_SLOT_POSITIONS.start);
    });

    it('falls back to position when no slot is named', () => {
      expect(linkLabelPosition({ position: 0.25 })).toBe(0.25);
    });

    it('falls back to the midpoint when neither is usable', () => {
      expect(linkLabelPosition({ position: NaN })).toBe(0.5);
    });
  });

  describe('addLabel()', () => {
    it('accepts a slot INSTEAD of a position and stores the resolved position', () => {
      const link = new LinkModel('a', 'b');
      link.addLabel({ text: 'to', slot: 'end' });

      expect(link.labels[0].position).toBe(LINK_LABEL_SLOT_POSITIONS.end);
      expect(link.labels[0].slot).toBe('end');
    });

    it('carries EVERY LinkLabel field through — the old body hand-copied five and silently dropped the rest', () => {
      const link = new LinkModel('a', 'b');
      link.addLabel({
        text: 'rich',
        position: 0.5,
        html: '<b>rich</b>',
        template: 'badge',
        autoOffset: true,
        rotation: 'auto',
        keepUpright: true,
        width: 90,
        height: 20,
      });

      const label = link.labels[0] as LinkLabel;
      expect(label.html).toBe('<b>rich</b>');
      expect(label.template).toBe('badge');
      expect(label.autoOffset).toBe(true);
      expect(label.rotation).toBe('auto');
      expect(label.keepUpright).toBe(true);
      expect(label.width).toBe(90);
      expect(label.height).toBe(20);
    });

    it('still defaults id and offset', () => {
      const link = new LinkModel('a', 'b');
      link.addLabel({ text: 'x', position: 0.5 });

      expect(link.labels[0].id).toBeTruthy();
      expect(link.labels[0].offset).toEqual({ x: 0, y: 0 });
    });
  });
});
