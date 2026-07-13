// Card 7 — content-aware auto-sizing + geometry-true anchors.

import {
  autoSizeNode,
  autoSizeDiagram,
  desiredNodeSize,
  outerSizeForInner,
  measureLabelContent,
} from './auto-size';
import { getShape } from './shape-registry';
import { getNodeSizing, clampSizeToConstraints } from './node-sizing';
import { DiagramEngine, NodeModel } from '@grafloria/engine';

describe('Card 7 — measureLabelContent', () => {
  it('grows height with line count and width with the widest line', () => {
    const one = measureLabelContent('hi', { fontSize: 14 });
    const two = measureLabelContent('hi\nthere world', { fontSize: 14 });
    expect(two.height).toBeGreaterThan(one.height);
    expect(two.width).toBeGreaterThan(one.width);
  });

  it('is empty for an empty label', () => {
    expect(measureLabelContent('')).toEqual({ width: 0, height: 0 });
  });
});

describe('Card 7 — outerSizeForInner inverts the shape inset', () => {
  it('rect: outer ≈ content + padding', () => {
    const out = outerSizeForInner(getShape('rect'), 84, 44);
    // rect default innerRect pads by 8 each side → outer ~100×60.
    expect(out.width).toBeGreaterThanOrEqual(100);
    expect(out.height).toBeGreaterThanOrEqual(60);
  });

  it('diamond: outer is ~2× content (0.5 inner fraction)', () => {
    const out = outerSizeForInner(getShape('diamond'), 50, 25);
    // diamond innerRect = 0.5·outer → outer ≈ 100×50.
    expect(out.width).toBeGreaterThanOrEqual(100);
    expect(out.height).toBeGreaterThanOrEqual(50);
    // The content box fits inside the derived inner rect.
    const ir = getShape('diamond').innerRect!(out.width, out.height);
    expect(ir.w).toBeGreaterThanOrEqual(50 - 0.5);
    expect(ir.h).toBeGreaterThanOrEqual(25 - 0.5);
  });
});

describe('Card 7 — autoSizeNode', () => {
  const makeNode = (sizing: any, label: string) => {
    const node = new NodeModel({ type: 'default', position: { x: 0, y: 0 }, size: { width: 40, height: 20 } });
    node.setMetadata('label', label);
    node.setMetadata('sizing', sizing);
    return node;
  };

  it('is a no-op when the node did not opt in', () => {
    const node = makeNode({}, 'a very long label that would need to grow');
    expect(autoSizeNode(node)).toBe(false);
    expect(node.size.width).toBe(40);
  });

  it('grows an opted-in node to fit its label, via setSize', () => {
    const node = makeNode({ auto: true }, 'a reasonably long label');
    const before = { ...node.size };
    const events: string[] = [];
    node.on('change:size', () => events.push('size'));

    expect(autoSizeNode(node)).toBe(true);
    expect(node.size.width).toBeGreaterThan(before.width);
    // Bounds change went through setSize → change:size fired (spatial index hook).
    expect(events).toContain('size');
  });

  it('is idempotent — a second pass makes no change', () => {
    const node = makeNode({ auto: true }, 'stable label');
    autoSizeNode(node);
    expect(autoSizeNode(node)).toBe(false);
  });

  it('respects per-node maxWidth (wraps + clamps)', () => {
    const node = makeNode(
      { auto: true, maxWidth: 120 },
      'this is a fairly long label that must wrap within a bounded width'
    );
    autoSizeNode(node);
    expect(node.size.width).toBeLessThanOrEqual(120);
    // Wrapping made it taller than a single line.
    expect(node.size.height).toBeGreaterThan(20);
  });

  it('honors an explicit aspect lock', () => {
    const node = makeNode({ auto: true, aspectLock: 2 }, 'square-ish content here');
    autoSizeNode(node);
    expect(node.size.width / node.size.height).toBeCloseTo(2, 1);
  });

  it('reserves panel space (Card 5 header band pushes height up)', () => {
    const plain = makeNode({ auto: true }, 'Title');
    const withHeader = makeNode({ auto: true }, 'Title');
    autoSizeNode(plain);
    autoSizeNode(withHeader, { reserve: { top: 40 } });
    expect(withHeader.size.height).toBeGreaterThan(plain.size.height);
  });
});

describe('Card 7 — auto-size is seen by the engine spatial index', () => {
  it('updates the node bounding box + spatial index through setSize', () => {
    const engine = new DiagramEngine();
    engine.createDiagram();
    const diagram = engine.getDiagram()!;
    const node = new NodeModel({ type: 'default', position: { x: 100, y: 100 }, size: { width: 40, height: 20 } });
    node.setMetadata('label', 'a long enough label to grow the node meaningfully');
    node.setMetadata('sizing', { auto: true, maxWidth: 160 });
    diagram.addNode(node);

    const changed = autoSizeDiagram(diagram.getNodes());
    expect(changed).toBe(1);

    // getBoundingBox (what routing/spatial index read) reflects the new size.
    const box = node.getBoundingBox();
    expect(box.width).toBe(node.size.width);
    // The spatial index (updated on change:size) still resolves the node at its
    // grown footprint.
    const found = diagram.getVisibleNodes({ x: 90, y: 90, width: 300, height: 300 } as any);
    expect(found.some((n) => n.id === node.id)).toBe(true);
  });
});

describe('Card 7 — geometry-true anchors', () => {
  it('cylinder top port sits on the front rim seam, not the bbox top', () => {
    const def = getShape('cylinder');
    const top = def.portAnchor(100, 60, 'top', 0, 1);
    // rim seam is below y=0 (the bbox edge) at y = 2·ry.
    expect(top.x).toBeCloseTo(50, 0);
    expect(top.y).toBeGreaterThan(0);
    expect(top.y).toBeLessThan(30);
  });

  it('cylinder boundary projects onto the rim, not the box corner', () => {
    const def = getShape('cylinder');
    const bp = def.boundaryPoint({ x: 0, y: 0, w: 100, h: 60 }, 'top', 50);
    expect(bp).not.toBeNull();
    expect(bp!.x).toBeCloseTo(50, 0);
    expect(bp!.y).toBeCloseTo(0, 0); // top of the rim at center
  });

  it('actor side ports attach to the hands (40% height), not mid-side', () => {
    const def = getShape('actor');
    const left = def.portAnchor(100, 80, 'left', 0, 1);
    const right = def.portAnchor(100, 80, 'right', 0, 1);
    expect(left.x).toBeCloseTo(18, 0);
    expect(left.y).toBeCloseTo(32, 0); // 0.4 * 80
    expect(right.x).toBeCloseTo(82, 0);
  });

  it('every shape keeps anchors finite and inside the box (no regressions)', () => {
    for (const type of ['cylinder', 'actor', 'diamond', 'rect']) {
      const def = getShape(type);
      for (const side of ['left', 'right', 'top', 'bottom'] as const) {
        const p = def.portAnchor(100, 60, side, 0, 1);
        expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
        expect(p.x).toBeGreaterThanOrEqual(-0.001);
        expect(p.x).toBeLessThanOrEqual(100.001);
        expect(p.y).toBeGreaterThanOrEqual(-0.001);
        expect(p.y).toBeLessThanOrEqual(60.001);
      }
    }
  });
});
