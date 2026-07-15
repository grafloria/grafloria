// GroupModel.subflow.spec.ts — Wave-5 Card 3: subflow geometry
//
// Auto-fit (member bbox + per-side padding + header band), the three fit modes
// (exact / grow-only / shrink-only) plus deep-recursive, child-extent clamping,
// z-order (zIndex + bringToFront/sendToBack), and lossless round-trip of the
// new geometry config.

import { DEFAULT_GROUP_HEADER_HEIGHT, DEFAULT_GROUP_PADDING, GroupModel } from './GroupModel';
import { DiagramModel } from './DiagramModel';
import { NodeModel } from './NodeModel';

/** Strip the authored defaults so a test about OTHER arithmetic stays readable. */
function zeroed(group: GroupModel): GroupModel {
  group.padding = 0;
  group.headerHeight = 0;
  return group;
}

function node(id: string, x: number, y: number, w = 40, h = 40): NodeModel {
  return new NodeModel({ id, type: 'default', position: { x, y }, size: { width: w, height: h } });
}

/** A group with three members forming a 0,0 → 140,90 bounding box. */
function buildGroupWithMembers(): { diagram: DiagramModel; group: GroupModel } {
  const diagram = new DiagramModel();
  const group = new GroupModel({ id: 'g', name: 'G' });
  diagram.addGroup(group);

  const a = node('a', 0, 0); // 0,0 → 40,40
  const b = node('b', 100, 50); // 100,50 → 140,90
  const c = node('c', 20, 20); // inside
  diagram.addNode(a);
  diagram.addNode(b);
  diagram.addNode(c);
  group.addMember('a', diagram);
  group.addMember('b', diagram);
  group.addMember('c', diagram);

  return { diagram, group };
}

describe('GroupModel subflow geometry (Wave-5 Card 3)', () => {
  describe('padding resolution', () => {
    // The screenshot audit found every FITTED frame hugging its members with the
    // label hidden behind the first node — because authored groups defaulted to
    // 0/0. `padding` is tri-state now: undefined (author never said) resolves to
    // the real default; an explicit value — including the 0 that loaders pin for
    // legacy documents — is taken as written. The undefined state is also what
    // lets CompoundLayoutService's containerPadding fallback claim the group.
    it('authored groups (padding unset) resolve to real padding and a title band', () => {
      const g = new GroupModel({ name: 'G' });
      expect(g.padding).toBeUndefined();
      expect(g.getPadding()).toEqual({
        top: DEFAULT_GROUP_PADDING,
        right: DEFAULT_GROUP_PADDING,
        bottom: DEFAULT_GROUP_PADDING,
        left: DEFAULT_GROUP_PADDING,
      });
      expect(g.headerHeight).toBe(DEFAULT_GROUP_HEADER_HEIGHT);
    });

    it('an explicit 0 (how loaders pin legacy documents) resolves to zero on all sides', () => {
      const g = new GroupModel({ name: 'G' });
      g.padding = 0;
      expect(g.getPadding()).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
    });

    it('expands a scalar to all four sides', () => {
      const g = new GroupModel({ name: 'G' });
      g.padding = 12;
      expect(g.getPadding()).toEqual({ top: 12, right: 12, bottom: 12, left: 12 });
    });

    it('fills missing sides of a partial object with zero', () => {
      const g = new GroupModel({ name: 'G' });
      g.padding = { left: 5, top: 8 };
      expect(g.getPadding()).toEqual({ top: 8, right: 0, bottom: 0, left: 5 });
    });
  });

  describe('fitToContents — the real padding/header consumer', () => {
    it('fits with the authored defaults: padding all around + the title band on top', () => {
      const { diagram, group } = buildGroupWithMembers();
      group.fitToContents(diagram);
      // content bbox 0,0→140,90, padded by 16 on each side, band of 24 on top
      expect(group.getOuterBounds()).toEqual({
        x: -DEFAULT_GROUP_PADDING,
        y: -DEFAULT_GROUP_PADDING - DEFAULT_GROUP_HEADER_HEIGHT,
        width: 140 + 2 * DEFAULT_GROUP_PADDING,
        height: 90 + 2 * DEFAULT_GROUP_PADDING + DEFAULT_GROUP_HEADER_HEIGHT,
      });
    });

    it('fits the frame to the tight member bbox when padding/header are zeroed', () => {
      const { diagram, group } = buildGroupWithMembers();
      zeroed(group).fitToContents(diagram);
      expect(group.getOuterBounds()).toEqual({ x: 0, y: 0, width: 140, height: 90 });
    });

    it('adds per-side padding around the member bbox', () => {
      const { diagram, group } = buildGroupWithMembers();
      group.headerHeight = 0; // subject here is the per-side padding only
      group.padding = { top: 10, right: 20, bottom: 30, left: 40 };
      group.fitToContents(diagram);
      // x shifts left by 40, y up by 10; width += 40+20, height += 10+30
      expect(group.getOuterBounds()).toEqual({ x: -40, y: -10, width: 200, height: 130 });
    });

    it('reserves a header band at the top (children live below it)', () => {
      const { diagram, group } = buildGroupWithMembers();
      group.padding = 0; // subject here is the band only
      group.headerHeight = 24;
      group.fitToContents(diagram);
      const outer = group.getOuterBounds();
      expect(outer.y).toBe(-24);
      expect(outer.height).toBe(90 + 24);
      // inner top clears the header band
      expect(group.getInnerBounds().y).toBe(0);
    });

    it('writes position, size and bounds together', () => {
      const { diagram, group } = buildGroupWithMembers();
      group.headerHeight = 0; // keep the arithmetic about the three writes
      group.padding = 5;
      group.fitToContents(diagram);
      expect(group.position).toEqual({ x: -5, y: -5 });
      expect(group.size).toMatchObject({ width: 150, height: 100 });
      expect(group.bounds).toEqual({ x: -5, y: -5, width: 150, height: 100 });
    });

    it('is a no-op when the group has no positioned members', () => {
      const diagram = new DiagramModel();
      const group = new GroupModel({ id: 'empty', name: 'Empty' });
      diagram.addGroup(group);
      group.fitToContents(diagram);
      expect(group.size).toBeUndefined();
    });

    it('fits a parent around a nested group\'s OUTER frame', () => {
      const diagram = new DiagramModel();
      const parent = new GroupModel({ id: 'parent', name: 'Parent' });
      const child = new GroupModel({ id: 'child', name: 'Child' });
      diagram.addGroup(parent);
      diagram.addGroup(child);
      zeroed(parent); // subject: the nested-frame contribution, not the padding
      child.setFrame({ x: 200, y: 200, width: 80, height: 60 });
      const n = node('n', 0, 0);
      diagram.addNode(n);
      parent.addMember('n', diagram);
      parent.addMember('child', diagram);

      parent.fitToContents(diagram);
      // bbox of node(0,0→40,40) and child(200,200→280,260)
      expect(parent.getOuterBounds()).toEqual({ x: 0, y: 0, width: 280, height: 260 });
    });
  });

  describe('fit modes', () => {
    it('grow-only never shrinks below the current frame', () => {
      const { diagram, group } = buildGroupWithMembers();
      group.setFrame({ x: -100, y: -100, width: 400, height: 400 });
      group.fitToContents(diagram, { mode: 'grow-only' });
      // content bbox (0,0,140,90) is smaller — frame must stay the big one
      expect(group.getOuterBounds()).toEqual({ x: -100, y: -100, width: 400, height: 400 });
    });

    it('grow-only expands to swallow content beyond the current frame', () => {
      const { diagram, group } = buildGroupWithMembers();
      zeroed(group).setFrame({ x: 10, y: 10, width: 20, height: 20 });
      group.fitToContents(diagram, { mode: 'grow-only' });
      // union of (10,10,30,30) and (0,0,140,90)
      expect(group.getOuterBounds()).toEqual({ x: 0, y: 0, width: 140, height: 90 });
    });

    it('shrink-only never grows beyond the current frame', () => {
      const { diagram, group } = buildGroupWithMembers();
      group.setFrame({ x: 10, y: 10, width: 50, height: 50 });
      group.fitToContents(diagram, { mode: 'shrink-only' });
      const outer = group.getOuterBounds();
      // clamped inside the current 10,10,50,50 frame
      expect(outer.x).toBeGreaterThanOrEqual(10);
      expect(outer.y).toBeGreaterThanOrEqual(10);
      expect(outer.x + outer.width).toBeLessThanOrEqual(60);
      expect(outer.y + outer.height).toBeLessThanOrEqual(60);
    });

    it('honors the group\'s stored fitMode when no override is passed', () => {
      const { diagram, group } = buildGroupWithMembers();
      group.setFrame({ x: -100, y: -100, width: 400, height: 400 });
      group.fitMode = 'grow-only';
      group.fitToContents(diagram);
      expect(group.getOuterBounds()).toEqual({ x: -100, y: -100, width: 400, height: 400 });
    });

    it('deep-recursive fits descendants first, then the parent around them', () => {
      const diagram = new DiagramModel();
      const parent = new GroupModel({ id: 'parent', name: 'Parent' });
      const child = new GroupModel({ id: 'child', name: 'Child' });
      diagram.addGroup(parent);
      diagram.addGroup(child);
      zeroed(parent);
      zeroed(child);
      const inner = node('inner', 300, 300, 40, 40);
      diagram.addNode(inner);
      child.addMember('inner', diagram);
      parent.addMember('child', diagram);
      // child has stale/no frame; deep-recursive must fit it from `inner` first
      child.padding = 5;

      parent.fitToContents(diagram, { deepRecursive: true });

      // child fitted to inner(300,300,340,340) + 5 padding = 295,295 → 345,345
      expect(child.getOuterBounds()).toEqual({ x: 295, y: 295, width: 50, height: 50 });
      // parent fitted around child's outer frame
      expect(parent.getOuterBounds()).toEqual({ x: 295, y: 295, width: 50, height: 50 });
    });
  });

  describe('child-extent clamping', () => {
    it('does nothing unless constrainChildren is set', () => {
      const { diagram, group } = buildGroupWithMembers();
      group.fitToContents(diagram);
      const moved = group.clampChildToExtent('a', diagram);
      expect(moved).toBe(false);
    });

    it('pulls a member back inside the inner extent', () => {
      const diagram = new DiagramModel();
      const group = new GroupModel({ id: 'g', name: 'G' });
      diagram.addGroup(group);
      group.setFrame({ x: 0, y: 0, width: 200, height: 200 });
      group.constrainChildren = true;
      const n = node('n', 500, 500, 40, 40); // way outside
      diagram.addNode(n);
      group.addMember('n', diagram);

      const moved = group.clampChildToExtent('n', diagram);
      expect(moved).toBe(true);
      const b = n.getGlobalBounds();
      expect(b.right).toBeLessThanOrEqual(200);
      expect(b.bottom).toBeLessThanOrEqual(200);
    });

    it('leaves an already-inside member untouched', () => {
      const diagram = new DiagramModel();
      const group = new GroupModel({ id: 'g', name: 'G' });
      diagram.addGroup(group);
      group.setFrame({ x: 0, y: 0, width: 200, height: 200 });
      group.constrainChildren = true;
      const n = node('n', 50, 50, 40, 40);
      diagram.addNode(n);
      group.addMember('n', diagram);
      expect(group.clampChildToExtent('n', diagram)).toBe(false);
    });

    it('respects padding + header when clamping', () => {
      const diagram = new DiagramModel();
      const group = new GroupModel({ id: 'g', name: 'G' });
      diagram.addGroup(group);
      group.setFrame({ x: 0, y: 0, width: 200, height: 200 });
      group.padding = 10;
      group.headerHeight = 30;
      group.constrainChildren = true;
      const n = node('n', -50, -50, 40, 40);
      diagram.addNode(n);
      group.addMember('n', diagram);

      group.clampChildToExtent('n', diagram);
      const b = n.getGlobalBounds();
      expect(b.left).toBeGreaterThanOrEqual(10); // left padding
      expect(b.top).toBeGreaterThanOrEqual(40); // top padding + header
    });
  });

  describe('z-order', () => {
    it('defaults to 0 and tracks changes', () => {
      const g = new GroupModel({ name: 'G' });
      expect(g.zIndex).toBe(0);
      g.setZIndex(5);
      expect(g.zIndex).toBe(5);
    });

    it('bringToFront lifts above every other group', () => {
      const diagram = new DiagramModel();
      const g1 = new GroupModel({ id: 'g1', name: 'G1' });
      const g2 = new GroupModel({ id: 'g2', name: 'G2' });
      const g3 = new GroupModel({ id: 'g3', name: 'G3' });
      [g1, g2, g3].forEach((g) => diagram.addGroup(g));
      g2.setZIndex(10);
      g1.bringToFront(diagram);
      expect(g1.zIndex).toBeGreaterThan(g2.zIndex);
    });

    it('sendToBack drops below every other group', () => {
      const diagram = new DiagramModel();
      const g1 = new GroupModel({ id: 'g1', name: 'G1' });
      const g2 = new GroupModel({ id: 'g2', name: 'G2' });
      [g1, g2].forEach((g) => diagram.addGroup(g));
      g1.setZIndex(-3);
      g2.sendToBack(diagram);
      expect(g2.zIndex).toBeLessThan(g1.zIndex);
    });

    it('exposes deterministic group render order via the diagram', () => {
      const diagram = new DiagramModel();
      const g1 = new GroupModel({ id: 'g1', name: 'G1' });
      const g2 = new GroupModel({ id: 'g2', name: 'G2' });
      const g3 = new GroupModel({ id: 'g3', name: 'G3' });
      diagram.addGroup(g1);
      diagram.addGroup(g2);
      diagram.addGroup(g3);
      g1.setZIndex(2);
      g2.setZIndex(-1);
      g3.setZIndex(0);
      const order = diagram.getGroupsInRenderOrder().map((g) => g.id);
      expect(order).toEqual(['g2', 'g3', 'g1']);
    });
  });

  describe('round-trip', () => {
    it('round-trips subflow geometry through serialize/fromJSON', () => {
      const g = new GroupModel({ id: 'g', name: 'G' });
      g.padding = { top: 1, right: 2, bottom: 3, left: 4 };
      g.headerHeight = 22;
      g.zIndex = -5;
      g.fitMode = 'grow-only';
      g.constrainChildren = true;
      g.setFrame({ x: 10, y: 20, width: 100, height: 80 });

      const restored = GroupModel.fromJSON(g.serialize());
      expect(restored.padding).toEqual({ top: 1, right: 2, bottom: 3, left: 4 });
      expect(restored.headerHeight).toBe(22);
      expect(restored.zIndex).toBe(-5);
      expect(restored.fitMode).toBe('grow-only');
      expect(restored.constrainChildren).toBe(true);
      expect(restored.getOuterBounds()).toEqual({ x: 10, y: 20, width: 100, height: 80 });
    });

    it('resolves the authored default into the payload at save time', () => {
      // A saved document must mean what it meant: an authored group PINS
      // today's default into the file so a future default change can never
      // re-geometry it.
      const g = new GroupModel({ id: 'g', name: 'G' });
      const json = g.serialize();
      expect(json.padding).toBe(DEFAULT_GROUP_PADDING);
      expect(json.headerHeight).toBe(DEFAULT_GROUP_HEADER_HEIGHT);
      // Untouched non-geometry defaults are still omitted.
      expect(json.zIndex).toBeUndefined();
      expect(json.fitMode).toBeUndefined();
      expect(json.constrainChildren).toBeUndefined();

      // A zeroed group (the legacy shape) writes padding 0 explicitly and omits
      // the band — and 0 is what a loader pins for absent keys, so legacy
      // documents survive load→save with their geometry intact.
      const legacyShaped = zeroed(new GroupModel({ id: 'g0', name: 'G0' }));
      const j0 = legacyShaped.serialize();
      expect(j0.padding).toBe(0);
      expect(j0.headerHeight).toBeUndefined();
    });

    it('a legacy payload (no padding/headerHeight keys) loads to zero, not to the authored defaults', () => {
      const g = new GroupModel({ id: 'g', name: 'G' });
      const json = g.serialize();
      delete (json as { padding?: unknown }).padding;
      delete (json as { headerHeight?: unknown }).headerHeight;
      const restored = GroupModel.fromJSON(JSON.parse(JSON.stringify(json)));
      expect(restored.getPadding()).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
      expect(restored.headerHeight).toBe(0);
    });

    it('an authored group round-trips its padding and band', () => {
      const g = new GroupModel({ id: 'g', name: 'G' });
      const restored = GroupModel.fromJSON(JSON.parse(JSON.stringify(g.serialize())));
      expect(restored.getPadding()).toEqual(g.getPadding());
      expect(restored.headerHeight).toBe(DEFAULT_GROUP_HEADER_HEIGHT);
    });
  });
});
