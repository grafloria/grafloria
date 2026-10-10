/**
 * @jest-environment jsdom
 */

// A — PUSH-DRIVEN CONTAINER LAYOUT.
//
// `applyLayout` was a real layout engine that nobody ever called: it was PULLED
// (one explicit `applyLayout()` per change, plus a one-shot on `addMember` behind
// a metadata flag) and never PUSHED. So a container could be resized, a widget
// deleted, or a child grown, and the container's children would not reflow —
// which is exactly the set of events a Dashboard Builder is made of.
//
// These tests pin the push edges: container resize (setFrame), member add, member
// remove, and a child's own size change all reflow the container's children, and
// the cascade terminates.

import { DiagramModel } from './DiagramModel';
import { NodeModel } from './NodeModel';
import { GroupModel } from './GroupModel';

function widget(width: number, height: number): NodeModel {
  return new NodeModel({
    type: 'widget',
    position: { x: 0, y: 0 },
    size: { width, height, depth: 0 },
  });
}

describe('GroupModel — push-driven layout (A)', () => {
  let diagram: DiagramModel;

  beforeEach(() => {
    diagram = new DiagramModel('push-layout');
  });

  function dashboard(width = 1200, height = 800): GroupModel {
    const g = new GroupModel({ name: 'Dashboard' });
    g.size = { width, height, depth: 0 };
    diagram.addGroup(g);
    g.setLayout('flexbox', {
      direction: 'row',
      wrap: 'wrap',
      justifyContent: 'start',
      alignItems: 'start',
      alignContent: 'start',
      gap: 0,
      padding: 0,
      columns: 12,
    });
    return g;
  }

  describe('default is reflow-on-change', () => {
    it('reflows on addMember WITHOUT the legacy autoLayout metadata flag', () => {
      const g = dashboard(1200, 800);
      const w = widget(10, 100);
      w.setMetadata('columnSpan', 6);
      diagram.addNode(w);

      g.addMember(w.id);

      // 6 of 12 columns of a 1200-wide container with no gap/padding.
      expect(w.size.width).toBe(600);
      expect(w.position.x).toBe(0);
    });

    it('honours an EXPLICIT opt-out (metadata autoLayout=false)', () => {
      const g = dashboard(1200, 800);
      g.setMetadata('autoLayout', false);
      const w = widget(10, 100);
      w.setMetadata('columnSpan', 6);
      diagram.addNode(w);

      g.addMember(w.id);

      expect(w.size.width).toBe(10); // untouched
      // …but an explicit pull still works.
      g.applyLayout(diagram);
      expect(w.size.width).toBe(600);
    });

    it('does nothing for a container that declares no layout', () => {
      const g = new GroupModel({ name: 'Plain' });
      g.size = { width: 500, height: 500, depth: 0 };
      diagram.addGroup(g);
      const w = widget(10, 10);
      diagram.addNode(w);

      g.addMember(w.id);

      expect(w.size.width).toBe(10);
      expect(w.position.x).toBe(0);
    });
  });

  describe('container resize pushes to children', () => {
    it('reflows children when the container frame changes (setFrame)', () => {
      const g = dashboard(1200, 800);
      const a = widget(10, 100);
      const b = widget(10, 100);
      a.setMetadata('columnSpan', 6);
      b.setMetadata('columnSpan', 6);
      diagram.addNode(a);
      diagram.addNode(b);
      g.addMember(a.id);
      g.addMember(b.id);

      expect(a.size.width).toBe(600);
      expect(b.position.x).toBe(600);

      // Halve the dashboard: children must re-derive their column widths.
      g.setFrame({ x: 0, y: 0, width: 600, height: 800 });

      expect(a.size.width).toBe(300);
      expect(b.size.width).toBe(300);
      expect(b.position.x).toBe(300);
    });

    it('carries the container ORIGIN into children on a frame move', () => {
      const g = dashboard(1200, 800);
      const a = widget(10, 100);
      a.setMetadata('columnSpan', 12);
      diagram.addNode(a);
      g.addMember(a.id);
      expect(a.position.x).toBe(0);

      g.setFrame({ x: 250, y: 90, width: 1200, height: 800 });

      expect(a.position.x).toBe(250);
      expect(a.position.y).toBe(90);
    });
  });

  describe('member removal pushes to survivors', () => {
    it('reflows the remaining children when a member is removed', () => {
      const g = dashboard(1200, 800);
      const a = widget(10, 100);
      const b = widget(10, 100);
      const c = widget(10, 100);
      for (const [n, span] of [[a, 6], [b, 6], [c, 12]] as const) {
        n.setMetadata('columnSpan', span);
        diagram.addNode(n);
        g.addMember(n.id);
      }

      // a,b fill row 1; c wraps to row 2.
      expect(c.position.y).toBe(100);

      g.removeMember(a.id);

      // b now starts row 1 and c rides up behind it.
      expect(b.position.x).toBe(0);
      expect(c.position.y).toBe(100);
      expect(c.position.x).toBe(0);
    });
  });

  describe('child size change pushes to siblings', () => {
    it('reflows siblings when a child node resizes itself', () => {
      const g = dashboard(1200, 800);
      const tall = widget(10, 100);
      const next = widget(10, 100);
      tall.setMetadata('columnSpan', 12);
      next.setMetadata('columnSpan', 12);
      diagram.addNode(tall);
      diagram.addNode(next);
      g.addMember(tall.id);
      g.addMember(next.id);

      expect(next.position.y).toBe(100);

      // The first widget grows — the one below it must move down.
      tall.setSize(tall.size.width, 250, 0);

      expect(next.position.y).toBe(250);
    });

    it('a size change on a NON-member never triggers the container', () => {
      const g = dashboard(1200, 800);
      const member = widget(10, 100);
      member.setMetadata('columnSpan', 12);
      diagram.addNode(member);
      g.addMember(member.id);

      const outsider = widget(10, 100);
      diagram.addNode(outsider);

      const spy = jest.spyOn(g, 'applyLayout');
      outsider.setSize(999, 999, 0);
      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('loop safety', () => {
    it('terminates when the layout itself resizes the children it listens to', () => {
      const g = dashboard(1200, 800);
      const spy = jest.spyOn(g, 'applyLayout');

      const a = widget(10, 100);
      a.setMetadata('columnSpan', 6);
      diagram.addNode(a);
      g.addMember(a.id); // layout resizes `a`, whose setSize notifies `g` again

      // One entry per external trigger — the re-entrant notification is refused.
      expect(spy.mock.calls.length).toBeLessThanOrEqual(2);
      expect(a.size.width).toBe(600);
    });

    it('terminates for a nested container whose parent lays it out', () => {
      const outer = new GroupModel({ name: 'Outer' });
      outer.size = { width: 800, height: 600, depth: 0 };
      diagram.addGroup(outer);
      outer.setLayout('flexbox', {
        direction: 'column',
        wrap: 'nowrap',
        justifyContent: 'start',
        alignItems: 'start',
        alignContent: 'start',
        gap: 0,
        padding: 0,
      });

      const inner = new GroupModel({ name: 'Inner' });
      inner.size = { width: 400, height: 200, depth: 0 };
      diagram.addGroup(inner);
      inner.setLayout('flexbox', {
        direction: 'row',
        wrap: 'nowrap',
        justifyContent: 'start',
        alignItems: 'start',
        alignContent: 'start',
        gap: 0,
        padding: 0,
      });

      const leaf = widget(50, 50);
      diagram.addNode(leaf);
      inner.addMember(leaf.id);

      expect(() => outer.addMember(inner.id)).not.toThrow();

      // Positioning the inner container pushed down to its own child.
      expect(inner.position).toEqual({ x: 0, y: 0 });
      expect(leaf.position.x).toBe(0);
      expect(leaf.position.y).toBe(0);

      outer.setFrame({ x: 100, y: 100, width: 800, height: 600 });
      expect(inner.position.x).toBe(100);
      expect(leaf.position.x).toBe(100);
    });
  });

  // C5 (docs review v3): a container layout placed a nested PLAIN group (no layout
  // of its own) by moving its frame only — its members stayed behind, outside it.
  describe('a nested group without a layout of its own', () => {
    function setup() {
      const outer = new GroupModel({ name: 'Outer' });
      diagram.addGroup(outer);
      outer.setFrame({ x: 80, y: 70, width: 460, height: 300 });
      const a = widget(120, 60);
      a.setPosition(120, 130);
      diagram.addNode(a);
      outer.addMember(a.id, diagram);

      const inner = new GroupModel({ name: 'Inner' });
      diagram.addGroup(inner);
      inner.setFrame({ x: 300, y: 180, width: 200, height: 150 });
      const r = widget(120, 60);
      r.setPosition(340, 230);
      diagram.addNode(r);
      inner.addMember(r.id, diagram);
      const deep = new GroupModel({ name: 'Deep' });
      diagram.addGroup(deep);
      deep.setFrame({ x: 320, y: 200, width: 60, height: 40 });
      inner.addMember(deep.id, diagram);
      inner.setParent(outer.id, diagram);
      outer.addMember(inner.id, diagram);
      return { outer, inner, deep, r };
    }

    it('carries its members (and nested frames) with its frame', () => {
      const { outer, inner, deep, r } = setup();
      const before = { inner: inner.getOuterBounds(), r: { ...r.position }, deep: deep.getOuterBounds() };

      outer.setLayout('flexbox', {
        direction: 'row', wrap: 'nowrap', justifyContent: 'start', alignItems: 'start',
        alignContent: 'start', gap: 24, padding: { top: 48, right: 16, bottom: 16, left: 16 },
      });
      outer.applyLayout(diagram);

      const after = inner.getOuterBounds();
      const dx = after.x - before.inner.x;
      const dy = after.y - before.inner.y;
      expect(Math.abs(dx) + Math.abs(dy)).toBeGreaterThan(0); // the layout did move it
      expect(r.position.x).toBeCloseTo(before.r.x + dx);
      expect(r.position.y).toBeCloseTo(before.r.y + dy);
      expect(deep.getOuterBounds().x).toBeCloseTo(before.deep.x + dx);
      expect(deep.getOuterBounds().y).toBeCloseTo(before.deep.y + dy);
      // …so the member is still inside its group.
      expect(r.position.x).toBeGreaterThanOrEqual(after.x);
      expect(r.position.y).toBeGreaterThanOrEqual(after.y);
      expect(r.position.x + 120).toBeLessThanOrEqual(after.x + after.width);
      expect(r.position.y + 60).toBeLessThanOrEqual(after.y + after.height);
    });

    it('a deeper container WITH its own layout is not moved twice', () => {
      const { outer, deep } = setup();
      const leaf = widget(20, 20);
      diagram.addNode(leaf);
      deep.addMember(leaf.id, diagram);
      deep.setLayout('flexbox', {
        direction: 'row', wrap: 'nowrap', justifyContent: 'start', alignItems: 'start',
        alignContent: 'start', gap: 0, padding: 0,
      });
      outer.setLayout('flexbox', {
        direction: 'row', wrap: 'nowrap', justifyContent: 'start', alignItems: 'start',
        alignContent: 'start', gap: 24, padding: { top: 48, right: 16, bottom: 16, left: 16 },
      });
      outer.applyLayout(diagram);
      // Its own flex layout keeps its member at its (padding-less) origin.
      const b = deep.getOuterBounds();
      expect(leaf.position.x).toBeCloseTo(b.x);
      expect(leaf.position.y).toBeCloseTo(b.y);
    });
  });
});
