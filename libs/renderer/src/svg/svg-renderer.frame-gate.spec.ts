// wave8/dirty — Card 0: the FRAME GATE.
//
// The contract under test is a single sentence: *a frame whose inputs did not
// change must be the same object as the frame before it, and a frame whose
// inputs DID change must not be.*
//
// The first half is the optimisation. The second half is the only thing that
// makes the first half safe — every test below that ends `not.toBe(first)` is
// guarding against a stale picture, which is the failure mode of every dirty-set
// optimisation ever written. They matter more than the fast path does.

import { DiagramEngine, DiagramModel, NodeModel, LinkModel, PortModel } from '@grafloria/engine';
import { SVGRenderer } from './svg-renderer';
import type { VNode } from '../types';

const VIEWPORT = { x: 0, y: 0, width: 800, height: 600 };

function scene(): { engine: DiagramEngine; diagram: DiagramModel; renderer: SVGRenderer } {
  const engine = new DiagramEngine();
  const diagram = engine.createDiagram('frame-gate')!;

  for (const [id, x] of [['a', 0], ['b', 300]] as Array<[string, number]>) {
    const node = new NodeModel({
      type: 'basic',
      position: { x, y: 100 },
      size: { width: 120, height: 60 },
    });
    (node as unknown as { id: string }).id = id;
    node.addPort(new PortModel({ id: `${id}-out`, type: 'output', side: 'right' }));
    node.addPort(new PortModel({ id: `${id}-in`, type: 'input', side: 'left' }));
    node.setMetadata('label', id.toUpperCase());
    diagram.addNode(node);
  }

  const link = new LinkModel('a-out', 'b-in', 'orthogonal');
  (link as unknown as { id: string }).id = 'ab';
  diagram.addLink(link);

  return { engine, diagram, renderer: new SVGRenderer(engine, {}) };
}

/** Paint once so the gate is armed, and hand back that frame. */
function warm(renderer: SVGRenderer): VNode {
  renderer.render(VIEWPORT, 1);
  return renderer.render(VIEWPORT, 1) as VNode;
}

describe('SVGRenderer — frame gate (wave8/dirty, Card 0)', () => {
  describe('the fast path', () => {
    it('returns the SAME root object when nothing changed', () => {
      const { renderer } = scene();
      const first = warm(renderer);
      const second = renderer.render(VIEWPORT, 1);

      // Identity, not deep equality: the patcher short-circuits on `===`, so an
      // equal-but-fresh tree would still cost a full reconcile walk.
      expect(second).toBe(first);
      renderer.dispose();
    });

    it('builds ONE frame across many idle renders', () => {
      const { renderer } = scene();
      warm(renderer);
      const builtAfterWarm = renderer.getFrameStats().built;

      for (let i = 0; i < 10; i++) renderer.render(VIEWPORT, 1);

      const stats = renderer.getFrameStats();
      expect(stats.built).toBe(builtAfterWarm);
      expect(stats.skipped).toBeGreaterThanOrEqual(10);
      renderer.dispose();
    });

    it('does not gate when caching is off', () => {
      const engine = new DiagramEngine();
      engine.createDiagram('no-cache');
      const renderer = new SVGRenderer(engine, { enableCaching: false });

      const first = renderer.render(VIEWPORT, 1);
      expect(renderer.render(VIEWPORT, 1)).not.toBe(first);
      renderer.dispose();
    });
  });

  describe('what MUST reopen the gate', () => {
    it('a node moving', () => {
      const { diagram, renderer } = scene();
      const first = warm(renderer);

      diagram.getNode('a')!.setPosition(10, 120);

      expect(renderer.render(VIEWPORT, 1)).not.toBe(first);
      renderer.dispose();
    });

    it('a node moving AGAIN while it is still dirty', () => {
      // The epoch must count every markDirty, not just clean→dirty transitions.
      // Off-screen entities are never marked clean (nothing renders them), so an
      // epoch that only counted transitions would go deaf to everything that
      // happens outside the viewport — which, in a 10k-node scene, is almost
      // everything.
      const { diagram, renderer } = scene();
      const node = diagram.getNode('a')!;

      warm(renderer);
      node.markDirty('test');           // dirty, and never rendered clean
      const dirtyFrame = renderer.render(VIEWPORT, 1);
      node.markDirty('test-again');     // still dirty; no transition to observe

      expect(renderer.render(VIEWPORT, 1)).not.toBe(dirtyFrame);
      renderer.dispose();
    });

    it('a node being selected', () => {
      const { diagram, renderer } = scene();
      const first = warm(renderer);

      diagram.getNode('b')!.setSelected(true);

      expect(renderer.render(VIEWPORT, 1)).not.toBe(first);
      renderer.dispose();
    });

    it('a label change', () => {
      const { diagram, renderer } = scene();
      const first = warm(renderer);

      diagram.getNode('a')!.setMetadata('label', 'RENAMED');

      expect(renderer.render(VIEWPORT, 1)).not.toBe(first);
      renderer.dispose();
    });

    it('adding a node', () => {
      const { diagram, renderer } = scene();
      const first = warm(renderer);

      const node = new NodeModel({
        type: 'basic',
        position: { x: 150, y: 300 },
        size: { width: 80, height: 40 },
      });
      (node as unknown as { id: string }).id = 'c';
      diagram.addNode(node);

      expect(renderer.render(VIEWPORT, 1)).not.toBe(first);
      renderer.dispose();
    });

    it('removing a link', () => {
      const { diagram, renderer } = scene();
      const first = warm(renderer);

      diagram.removeLink('ab');

      expect(renderer.render(VIEWPORT, 1)).not.toBe(first);
      renderer.dispose();
    });

    it('a link path regenerated in place (generatePath bypasses trackChange)', () => {
      const { diagram, renderer } = scene();
      const first = warm(renderer);

      diagram
        .getLink('ab')!
        .generatePath({ x: 0, y: 0 }, { x: 500, y: 500 }, 'right', 'left');

      expect(renderer.render(VIEWPORT, 1)).not.toBe(first);
      renderer.dispose();
    });

    it('panning', () => {
      const { renderer } = scene();
      const first = warm(renderer);

      expect(renderer.render({ ...VIEWPORT, x: 40 }, 1)).not.toBe(first);
      renderer.dispose();
    });

    it('zooming', () => {
      const { renderer } = scene();
      const first = warm(renderer);

      expect(renderer.render(VIEWPORT, 0.5)).not.toBe(first);
      renderer.dispose();
    });

    it('a theme swap', () => {
      const { renderer } = scene();
      const first = warm(renderer);

      renderer.setTheme({
        ...renderer.getTheme(),
        colors: { ...renderer.getTheme().colors, primary: '#ff0000' },
      } as never);

      expect(renderer.render(VIEWPORT, 1)).not.toBe(first);
      renderer.dispose();
    });

    it('moving keyboard focus', () => {
      const { renderer } = scene();
      const first = warm(renderer);

      renderer.setAccessibleFocus({ type: 'node', id: 'b' });

      expect(renderer.render(VIEWPORT, 1)).not.toBe(first);
      renderer.dispose();
    });

    it('an explicit invalidateFrame()', () => {
      const { renderer } = scene();
      const first = warm(renderer);

      renderer.invalidateFrame();

      expect(renderer.render(VIEWPORT, 1)).not.toBe(first);
      renderer.dispose();
    });
  });

  describe('the returned frame is not merely a different object — it is CORRECT', () => {
    it('a moved node renders at its new transform', () => {
      const { diagram, renderer } = scene();
      warm(renderer);

      diagram.getNode('a')!.setPosition(400, 400);
      const root = renderer.render(VIEWPORT, 1) as VNode;

      const nodes = (root.children![1] as VNode).children as VNode[];
      const moved = nodes.find((n) => n.key === 'node-a');
      expect(String(moved!.props!['transform'])).toContain('400');
      renderer.dispose();
    });

    it('a node added after the gate closed appears in the next frame', () => {
      const { diagram, renderer } = scene();
      warm(renderer);

      const node = new NodeModel({
        type: 'basic',
        position: { x: 200, y: 300 },
        size: { width: 80, height: 40 },
      });
      (node as unknown as { id: string }).id = 'fresh';
      diagram.addNode(node);

      const root = renderer.render(VIEWPORT, 1) as VNode;
      const nodes = (root.children![1] as VNode).children as VNode[];
      expect(nodes.some((n) => n.key === 'node-fresh')).toBe(true);
      renderer.dispose();
    });
  });
});
