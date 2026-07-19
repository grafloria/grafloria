/**
 * @jest-environment jsdom
 */

// C — NODE Z-ORDER.
//
// `GroupModel` had `zIndex` + `bringToFront`/`sendToBack` since Wave-5. `NodeModel`
// had NOTHING: the renderer sorted nodes by `style.zIndex`, so the only way to
// restack a node was to write a STYLE — an un-undoable, un-diffable presentation
// hack for what is a document fact. This gives nodes the same model-level z-order
// the groups already had, and keeps the legacy style path working underneath it.

import { DiagramModel } from './DiagramModel';
import { NodeModel } from './NodeModel';

function node(id: string): NodeModel {
  return new NodeModel({ id, type: 'box', position: { x: 0, y: 0 } });
}

describe('NodeModel — z-order (C)', () => {
  let diagram: DiagramModel;

  beforeEach(() => {
    diagram = new DiagramModel('zorder');
  });

  it('defaults to an UNSET z-index (so a legacy document is byte-stable)', () => {
    const n = node('a');
    expect(n.zIndex).toBeUndefined();
    expect(n.getEffectiveZIndex()).toBe(0);
  });

  it('setZIndex writes the model field and tracks the change', () => {
    const n = node('a');
    diagram.addNode(n);
    n.setZIndex(7);
    expect(n.zIndex).toBe(7);
    expect(n.getEffectiveZIndex()).toBe(7);
  });

  it('bringToFront lifts above every other node', () => {
    const a = node('a');
    const b = node('b');
    const c = node('c');
    [a, b, c].forEach((n) => diagram.addNode(n));
    b.setZIndex(5);

    c.bringToFront(diagram);

    expect(c.getEffectiveZIndex()).toBeGreaterThan(b.getEffectiveZIndex());
    expect(c.getEffectiveZIndex()).toBeGreaterThan(a.getEffectiveZIndex());
  });

  it('sendToBack drops below every other node', () => {
    const a = node('a');
    const b = node('b');
    [a, b].forEach((n) => diagram.addNode(n));
    a.setZIndex(3);

    b.sendToBack(diagram);

    expect(b.getEffectiveZIndex()).toBeLessThan(a.getEffectiveZIndex());
  });

  it('resolves the diagram from its back-reference when none is passed', () => {
    const a = node('a');
    const b = node('b');
    [a, b].forEach((n) => diagram.addNode(n));
    a.setZIndex(9);

    b.bringToFront();

    expect(b.getEffectiveZIndex()).toBe(10);
  });

  describe('coexistence with the legacy style.zIndex the renderer already reads', () => {
    it('falls back to style.zIndex when the model field is unset', () => {
      const n = node('a');
      n.setStyle({ zIndex: 4 });
      expect(n.zIndex).toBeUndefined();
      expect(n.getEffectiveZIndex()).toBe(4);
    });

    it('the MODEL field wins once it is explicitly set', () => {
      const n = node('a');
      n.setStyle({ zIndex: 4 });
      n.setZIndex(1);
      expect(n.getEffectiveZIndex()).toBe(1);
    });

    it('an explicit 0 is a real value, not "unset"', () => {
      const n = node('a');
      n.setStyle({ zIndex: 4 });
      n.setZIndex(0);
      expect(n.getEffectiveZIndex()).toBe(0);
    });
  });

  describe('serialization round-trip', () => {
    it('omits zIndex entirely when never set', () => {
      const n = node('a');
      expect(n.serialize().zIndex).toBeUndefined();
      expect('zIndex' in n.serialize()).toBe(false);
    });

    it('round-trips an explicit z-index (including 0)', () => {
      for (const z of [0, -3, 12]) {
        const n = node('a');
        n.setZIndex(z);
        const restored = NodeModel.fromJSON(JSON.parse(JSON.stringify(n.serialize())));
        expect(restored.zIndex).toBe(z);
        expect(restored.getEffectiveZIndex()).toBe(z);
      }
    });

    it('a legacy payload with no zIndex key restores as unset', () => {
      const n = node('a');
      const payload = JSON.parse(JSON.stringify(n.serialize()));
      delete payload.zIndex;
      const restored = NodeModel.fromJSON(payload);
      expect(restored.zIndex).toBeUndefined();
    });
  });
});
