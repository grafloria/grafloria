/**
 * Wave 6 — the accessibility layer.
 *
 * Covers the semantic naming (card 0), the graph topology + outline text mirror
 * and its natural-language summary (card 6 — the differentiator), the managed
 * live region (card 5), focus containment (card 4), and the reduced-motion
 * dead-config fix (card 7).
 *
 * Two of these tests are THRASH PROOFS — they assert that a quiet frame does
 * literally zero work, in the spirit of the edge optimizer's existing proof.
 */
import { DiagramEngine, DiagramModel, NodeModel, LinkModel } from '@grafloria/engine';
import { ViewportController } from '../viewport/viewport-controller';
import {
  nodeAccessibleName,
  edgeAccessibleName,
  nodeRoleDescription,
  diagramAccessibleName,
  humaniseType,
  degreeOf,
} from './semantics';
import { analyseTopology, incidentEdges, readingOrder } from './graph-topology';
import { buildOutline, outlineSignature, positionContext } from './diagram-outline';
import { DiagramOutlineView, outlineNodeLabel } from './outline-view';
import { LiveRegionController } from './live-region';
import { FocusContainmentController } from './focus-containment';
import {
  ensureMotionPreferenceStyles,
  removeMotionPreferenceStyles,
  MOTION_PREFERENCE_STYLE_ID,
  MOTION_PREFERENCE_CSS,
} from './reduced-motion';

describe('wave6 a11y', () => {
  let engine: DiagramEngine;
  let diagram: DiagramModel;

  beforeEach(() => {
    engine = new DiagramEngine();
    diagram = engine.createDiagram('wave6-a11y');
  });

  afterEach(() => engine.destroy());

  function addNode(x: number, y: number, label?: string, type = 'process'): NodeModel {
    const node = new NodeModel({
      type,
      position: { x, y },
      size: { width: 100, height: 50, depth: 0 },
    });
    if (label) node.setMetadata('label', label);
    diagram.addNode(node);
    return node;
  }

  function link(a: NodeModel, b: NodeModel, label?: string): LinkModel {
    const source = a.getPortBySide('right')!;
    const target = b.getPortBySide('left')!;
    const l = new LinkModel(source.id, target.id);
    l.setSourcePort(source.id, a.id);
    l.setTargetPort(target.id, b.id);
    l.setPoints([
      { x: a.position.x + 100, y: a.position.y + 25 },
      { x: b.position.x, y: b.position.y + 25 },
    ]);
    if (label) l.labels = [{ text: label } as never];
    diagram.addLink(l);
    return l;
  }

  // ==========================================================================
  // Card 0 — semantics
  // ==========================================================================

  describe('card 0 — semantic naming', () => {
    test('a node is named by shape, label and degree', () => {
      const a = addNode(0, 0, 'Is order valid?', 'decision');
      const b = addNode(200, 0, 'Ship');
      const c = addNode(200, 200, 'Reject');
      link(a, b);
      link(a, c);

      expect(nodeRoleDescription(a)).toBe('Decision');
      expect(nodeAccessibleName(a, diagram)).toBe(
        'Decision, Is order valid?, 0 incoming, 2 outgoing'
      );
    });

    test('EDGES get an accessible name — the gap that made every diagram read as a bag of shapes', () => {
      const a = addNode(0, 0, 'Start', 'start');
      const b = addNode(200, 0, 'Review');
      const l = link(a, b, 'yes');

      expect(edgeAccessibleName(l, diagram)).toBe('Edge from Start to Review, labelled yes');
    });

    test('edge name reflects selection', () => {
      const a = addNode(0, 0, 'A');
      const b = addNode(200, 0, 'B');
      const l = link(a, b);
      l.setState('selected');

      expect(edgeAccessibleName(l, diagram)).toBe('Edge from A to B, selected');
    });

    test('an unknown node type is humanised, never left as a bare symbol', () => {
      expect(humaniseType('my_customNode')).toBe('My custom node');
      const custom = addNode(0, 0, 'X', 'auditStep');
      expect(nodeRoleDescription(custom)).toBe('Audit step');
    });

    test('the diagram names itself with its size', () => {
      addNode(0, 0, 'A');
      addNode(200, 0, 'B');
      expect(diagramAccessibleName(diagram)).toBe('Diagram, 2 nodes, 0 edges');
    });

    test('degree counts self-loops on both sides', () => {
      const a = addNode(0, 0, 'A');
      link(a, a);
      expect(degreeOf(a.id, diagram)).toEqual({ incoming: 1, outgoing: 1 });
    });
  });

  // ==========================================================================
  // Card 6 — topology + outline (the differentiator)
  // ==========================================================================

  describe('card 6 — topology', () => {
    test('finds entry points, terminals and isolated nodes', () => {
      const start = addNode(0, 0, 'Start', 'start');
      const mid = addNode(200, 0, 'Middle');
      const end = addNode(400, 0, 'End', 'end');
      const orphan = addNode(0, 400, 'Orphan');
      link(start, mid);
      link(mid, end);

      const topology = analyseTopology(diagram);
      expect(topology.entryPoints.map((n) => n.id)).toEqual([start.id]);
      expect(topology.terminals.map((n) => n.id)).toEqual([end.id]);
      expect(topology.isolated.map((n) => n.id)).toEqual([orphan.id]);
    });

    test('detects a cycle, once, regardless of where the walk enters it', () => {
      const a = addNode(0, 0, 'Review');
      const b = addNode(200, 0, 'Amend');
      link(a, b);
      link(b, a);

      const topology = analyseTopology(diagram);
      expect(topology.cycles).toHaveLength(1);
      expect(topology.cycles[0]).toHaveLength(2);
    });

    test('reading order is deterministic for coincident nodes', () => {
      const a = addNode(0, 0, 'A');
      const b = addNode(0, 0, 'B');
      const first = readingOrder([a, b]);
      const second = readingOrder([b, a]);
      expect(first.map((n) => n.id)).toEqual(second.map((n) => n.id));
    });

    test('incident edges list outgoing before incoming', () => {
      const hub = addNode(200, 0, 'Hub');
      const upstream = addNode(0, 0, 'Up');
      const downstream = addNode(400, 0, 'Down');
      link(upstream, hub);
      link(hub, downstream);

      const edges = incidentEdges(hub.id, diagram);
      expect(edges.map((e) => e.direction)).toEqual(['outgoing', 'incoming']);
      expect(edges[0]!.otherId).toBe(downstream.id);
    });
  });

  describe('card 6 — outline + natural-language summary', () => {
    test('summarises a flow in the words a colleague would use', () => {
      const start = addNode(0, 0, 'Receive order', 'start');
      const check = addNode(200, 0, 'Is order valid?', 'decision');
      const ship = addNode(400, 0, 'Ship order', 'end');
      link(start, check);
      link(check, ship);

      const outline = buildOutline(diagram);
      expect(outline.summary).toContain('Diagram with 3 nodes and 2 edges.');
      expect(outline.summary).toContain('It starts at Receive order.');
      expect(outline.summary).toContain('It ends at Ship order.');
    });

    test('names loops and disconnected nodes in the summary', () => {
      const a = addNode(0, 0, 'Review');
      const b = addNode(200, 0, 'Amend');
      addNode(0, 400, 'Legacy step');
      link(a, b);
      link(b, a);

      const outline = buildOutline(diagram);
      expect(outline.summary).toContain('1 loop');
      expect(outline.summary).toContain('1 node is disconnected: Legacy step.');
    });

    test('an empty diagram says so, rather than emitting a broken sentence', () => {
      expect(buildOutline(diagram).summary).toBe('Empty diagram. No nodes.');
    });

    test('outline nodes carry position context and topology flags', () => {
      const start = addNode(0, 0, 'Start', 'start');
      const end = addNode(200, 0, 'End', 'end');
      link(start, end);

      const outline = buildOutline(diagram);
      const first = outline.flat[0]!;
      expect(outlineNodeLabel(first)).toBe(
        'Start, Start, node 1 of 2, 0 incoming, 1 outgoing, start of a flow'
      );
      expect(first.targets[0]!.targetName).toBe('End');
    });

    test('a cycle in the PARENT chain cannot hang the outline', () => {
      const a = addNode(0, 0, 'A');
      const b = addNode(200, 0, 'B');
      a.parentId = b.id;
      b.parentId = a.id;

      // Must terminate. (Before the guard, this recursed forever.)
      expect(() => buildOutline(diagram)).not.toThrow();
    });

    test('positionContext reads "node N of M, X incoming, Y outgoing"', () => {
      const a = addNode(0, 0, 'A');
      const b = addNode(200, 0, 'B');
      const c = addNode(400, 0, 'C');
      link(a, b);
      link(c, b);

      expect(positionContext(b.id, diagram)).toBe('node 2 of 3, 2 incoming, 0 outgoing');
    });
  });

  describe('card 6 — the DOM text mirror', () => {
    let container: HTMLElement;

    beforeEach(() => {
      container = document.createElement('div');
      document.body.appendChild(container);
    });
    afterEach(() => container.remove());

    test('emits a tree the AT virtual cursor can browse', () => {
      const start = addNode(0, 0, 'Start', 'start');
      const end = addNode(200, 0, 'End', 'end');
      link(start, end);

      const view = new DiagramOutlineView(container);
      view.update(diagram);

      const root = view.getElement();
      expect(root.getAttribute('role')).toBe('region');
      expect(root.querySelector('[role="tree"]')).toBeTruthy();
      expect(root.querySelectorAll('[role="treeitem"]')).toHaveLength(2);
      expect(root.querySelector('[data-grafloria-outline-summary]')!.textContent).toContain(
        'It starts at Start.'
      );
      // The edge list — the part no competitor exposes to a screen reader at all.
      expect(root.querySelector('[data-grafloria-outline-edge]')!.textContent).toBe(
        'Edge from Start to End'
      );
    });

    test('the mirror is hidden from sight but NOT from the a11y tree', () => {
      const view = new DiagramOutlineView(container);
      view.update(diagram);
      const style = view.getElement().getAttribute('style') ?? '';
      // display:none / visibility:hidden would strip it from the a11y tree — the
      // classic way to ship an outline no screen reader can actually see.
      expect(style).not.toContain('display:none');
      expect(style).not.toContain('visibility:hidden');
      expect(style).toContain('clip-path');
    });

    test('THRASH PROOF: a quiet frame rebuilds the mirror ZERO times', () => {
      addNode(0, 0, 'A');
      const view = new DiagramOutlineView(container);

      expect(view.update(diagram)).toBe(true);
      expect(view.getRebuildCount()).toBe(1);

      for (let i = 0; i < 60; i++) view.update(diagram);
      expect(view.getRebuildCount()).toBe(1);
    });

    test('THRASH PROOF: MOVING a node rebuilds nothing — geometry is not topology', () => {
      const a = addNode(0, 0, 'A');
      const view = new DiagramOutlineView(container);
      view.update(diagram);
      expect(view.getRebuildCount()).toBe(1);

      // A drag: 30 frames of pure movement.
      for (let i = 0; i < 30; i++) {
        a.setPosition(i * 10, i * 10);
        view.update(diagram);
      }
      expect(view.getRebuildCount()).toBe(1);
    });

    test('but a REAL topology change does rebuild it', () => {
      const a = addNode(0, 0, 'A');
      const view = new DiagramOutlineView(container);
      view.update(diagram);

      const b = addNode(200, 0, 'B');
      expect(view.update(diagram)).toBe(true);

      link(a, b);
      expect(view.update(diagram)).toBe(true);
      expect(view.getRebuildCount()).toBe(3);
    });

    test('the signature ignores movement but catches a rename', () => {
      const a = addNode(0, 0, 'A');
      const before = outlineSignature(diagram);

      a.setPosition(999, 999);
      expect(outlineSignature(diagram)).toBe(before);

      a.setMetadata('label', 'Renamed');
      expect(outlineSignature(diagram)).not.toBe(before);
    });
  });

  // ==========================================================================
  // Card 5 — live region
  // ==========================================================================

  describe('card 5 — live region', () => {
    let container: HTMLElement;
    let live: LiveRegionController;

    beforeEach(() => {
      container = document.createElement('div');
      document.body.appendChild(container);
      live = new LiveRegionController(container, { coalesceMs: 0 });
    });
    afterEach(() => {
      live.dispose();
      container.remove();
    });

    test('polite and assertive are SEPARATE regions', () => {
      expect(live.getElement('polite').getAttribute('aria-live')).toBe('polite');
      expect(live.getElement('assertive').getAttribute('aria-live')).toBe('assertive');
      expect(live.getElement('assertive').getAttribute('role')).toBe('alert');
      // Without aria-atomic an AT can read the DIFF of two similar messages.
      expect(live.getElement('polite').getAttribute('aria-atomic')).toBe('true');
    });

    test('announces, and de-duplicates an identical repeat', () => {
      expect(live.announce('Process node, 2 connections')).toBe(true);
      expect(live.getMessage('polite')).toBe('Process node, 2 connections');

      // The spam case: a render loop re-announcing the same thing forever.
      expect(live.announce('Process node, 2 connections')).toBe(false);
      expect(live.getSpeakCount()).toBe(1);
    });

    test('a genuinely repeated ACTION can still be re-announced', () => {
      live.announce('Moved A by 1, 0');
      expect(live.announce('Moved A by 1, 0', 'polite', true)).toBe(true);
      expect(live.getSpeakCount()).toBe(2);
    });

    test('errors are assertive and never suppressed', () => {
      live.announceError('Cannot connect: incompatible ports');
      live.announceError('Cannot connect: incompatible ports');
      expect(live.getMessage('assertive')).toBe('Cannot connect: incompatible ports');
      expect(live.getSpeakCount()).toBe(2);
    });

    test('coalescing collapses a held arrow key into ONE sentence', () => {
      let clock = 0;
      const scheduled: (() => void)[] = [];
      const coalescing = new LiveRegionController(container, {
        coalesceMs: 100,
        now: () => clock,
        schedule: (fn) => {
          scheduled.push(fn);
          return scheduled.length;
        },
        cancel: () => undefined,
      });

      coalescing.announce('Moved A to 1, 0'); // speaks immediately
      for (let i = 2; i <= 50; i++) {
        clock += 1; // still inside the window
        coalescing.announce(`Moved A to ${i}, 0`);
      }
      // 49 further announcements, none spoken yet — one pending.
      expect(coalescing.getSpeakCount()).toBe(1);

      coalescing.flushPending();
      expect(coalescing.getSpeakCount()).toBe(2);
      expect(coalescing.getMessage('polite')).toBe('Moved A to 50, 0');

      coalescing.dispose();
    });

    test('THRASH PROOF: a quiet frame speaks zero times', () => {
      live.announce('Selection cleared');
      const before = live.getSpeakCount();
      for (let i = 0; i < 60; i++) live.announce('Selection cleared');
      expect(live.getSpeakCount()).toBe(before);
    });
  });

  // ==========================================================================
  // Card 4 — focus containment
  // ==========================================================================

  describe('card 4 — focus containment', () => {
    let viewport: ViewportController;
    let containment: FocusContainmentController;

    beforeEach(() => {
      viewport = new ViewportController({
        viewport: { x: 0, y: 0, width: 800, height: 600 },
        zoom: 1,
      });
      containment = new FocusContainmentController(viewport, {
        padding: 50,
        durationMs: 0, // instant, so the tests assert the camera, not the tween
      });
    });
    afterEach(() => containment.dispose());

    test('an element already in view is left ALONE — the most important case', () => {
      const before = viewport.getViewport();
      const result = containment.ensureVisible({ x: 100, y: 100, width: 100, height: 50 });

      expect(result.action).toBe('none');
      expect(viewport.getViewport()).toEqual(before);
    });

    test('focus landing off-screen pans it into view — the WCAG failure this closes', () => {
      const offscreen = { x: 2000, y: 100, width: 100, height: 50 };
      expect(containment.isFullyVisible(offscreen)).toBe(false);

      const result = containment.ensureVisible(offscreen);
      expect(result.action).toBe('pan');
      expect(containment.isFullyVisible(offscreen)).toBe(true);
    });

    test('the pan is MINIMAL — it does not re-centre and destroy the mental map', () => {
      // Just past the right padded edge: needs a nudge, not a jump.
      const justOut = { x: 700, y: 100, width: 100, height: 50 };
      const result = containment.ensureVisible(justOut);

      expect(result.action).toBe('pan');
      // Padded right edge is 800-50=750; box right edge is 800 → dx = 50.
      expect(result.dx).toBeCloseTo(50, 5);
      expect(result.dy).toBe(0);
    });

    test('an element too big for the viewport ZOOMS OUT via the existing fit maths', () => {
      const huge = { x: 0, y: 0, width: 5000, height: 4000 };
      const result = containment.ensureVisible(huge);

      expect(result.action).toBe('zoom');
      expect(viewport.getZoom()).toBeLessThan(1);
      expect(containment.isFullyVisible(huge)).toBe(true);
    });

    test('padding is honoured in SCREEN pixels at any zoom', () => {
      viewport.setZoom(2);
      const inner = containment.paddedViewBox();
      const box = viewport.getViewBox();
      // 50 screen px at zoom 2 == 25 world units.
      expect(inner.x - box.x).toBeCloseTo(25, 5);
    });

    test('reduced motion turns the pan into an instant jump', () => {
      const reduced = new FocusContainmentController(viewport, {
        padding: 50,
        durationMs: 500,
        reducedMotion: () => true,
      });
      const result = reduced.ensureVisible({ x: 2000, y: 100, width: 100, height: 50 });

      expect(result.action).toBe('pan');
      expect(reduced.isAnimating()).toBe(false); // no tween scheduled
      reduced.dispose();
    });
  });

  // ==========================================================================
  // Card 7 — the reduced-motion dead-config fix
  // ==========================================================================

  describe('card 7 — reduced motion is actually CONSUMED', () => {
    afterEach(() => removeMotionPreferenceStyles(document));

    test('the stylesheet injects, and is idempotent', () => {
      expect(document.getElementById(MOTION_PREFERENCE_STYLE_ID)).toBeNull();

      ensureMotionPreferenceStyles(document);
      ensureMotionPreferenceStyles(document);

      expect(document.querySelectorAll(`#${MOTION_PREFERENCE_STYLE_ID}`)).toHaveLength(1);
    });

    test('it styles the class AnimationService actually toggles', () => {
      // The dead-config bug: `body.reduced-motion` was set by AnimationService and
      // styled by NOTHING, because its only rules lived in an orphaned .css file
      // that no bundler ever imported.
      expect(MOTION_PREFERENCE_CSS).toContain('body.reduced-motion');
      expect(MOTION_PREFERENCE_CSS).toContain('@media (prefers-reduced-motion: reduce)');
    });

    test('AnimationService injects it on construction', async () => {
      const { AnimationService } = await import('../services/animation.service');
      const service = new AnimationService();
      expect(document.getElementById(MOTION_PREFERENCE_STYLE_ID)).not.toBeNull();
      void service;
    });
  });
});
