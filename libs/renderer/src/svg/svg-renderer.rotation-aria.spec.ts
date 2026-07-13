/**
 * Wave 4 — the rendered output of two things the model already had but the SVG
 * renderer never emitted:
 *
 *  1. LATENT BUG: `node.rotation`. The model has setRotation/rotate, serializes
 *     it, and NodeModel's hierarchy maths factors it in — but renderNode() only
 *     ever emitted `translate(x, y)`, so a rotated node rendered UNROTATED.
 *     (Card 5's rotate handle would have had nothing to show.)
 *  2. Card 7: the accessible name / selected state of a node, so a screen reader
 *     can read the canvas at all.
 */
import { DiagramEngine, DiagramModel, NodeModel } from '@grafloria/engine';
import { SVGRenderer } from './svg-renderer';
import type { VNode } from '../types/vnode.types';

describe('SVGRenderer — node rotation + ARIA (wave4/interaction)', () => {
  let engine: DiagramEngine;
  let diagram: DiagramModel;
  let renderer: SVGRenderer;

  beforeEach(() => {
    engine = new DiagramEngine();
    diagram = engine.createDiagram('wave4-render');
    renderer = new SVGRenderer(engine, { enableCaching: false });
  });

  afterEach(() => {
    renderer.dispose();
    engine.destroy();
  });

  function addNode(label?: string): NodeModel {
    const node = new NodeModel({
      type: 'task',
      position: { x: 100, y: 50 },
      size: { width: 120, height: 60, depth: 0 },
    });
    if (label) node.setMetadata('label', label);
    diagram.addNode(node);
    return node;
  }

  /** Depth-first search for the node's <g> in the rendered VNode tree. */
  function findNodeGroup(tree: VNode, nodeId: string): VNode | null {
    if (tree.key === `node-${nodeId}`) return tree;
    for (const child of tree.children ?? []) {
      const hit = findNodeGroup(child as VNode, nodeId);
      if (hit) return hit;
    }
    return null;
  }

  function render(): VNode {
    return renderer.render({ x: 0, y: 0, width: 800, height: 600 }, 1);
  }

  test('an unrotated node still emits a plain translate (no behaviour change)', () => {
    const node = addNode();
    const group = findNodeGroup(render(), node.id)!;
    expect(group.props['transform']).toBe('translate(100, 50)');
  });

  test('a ROTATED node emits rotate() about its box centre — this used to be dropped', () => {
    const node = addNode();
    node.setRotation(45);

    const group = findNodeGroup(render(), node.id)!;
    expect(group.props['transform']).toBe('translate(100, 50) rotate(45, 60, 30)');
  });

  test('rotating a node marks it dirty so the next frame actually repaints it', () => {
    const node = addNode();
    node.markClean();
    expect(node.isDirty).toBe(false);

    node.setRotation(90);
    expect(node.isDirty).toBe(true);
  });

  test('a node exposes an accessible name and its selected state', () => {
    const node = addNode('Review invoice');

    let group = findNodeGroup(render(), node.id)!;
    expect(group.props['role']).toBe('group');
    expect(group.props['aria-label']).toBe('Review invoice');
    expect(group.props['aria-selected']).toBe('false');

    diagram.selectNode(node);
    group = findNodeGroup(render(), node.id)!;
    expect(group.props['aria-selected']).toBe('true');
  });

  test('an unlabelled node falls back to its type for the accessible name', () => {
    const node = addNode();
    const group = findNodeGroup(render(), node.id)!;
    expect(group.props['aria-label']).toBe('task node');
  });
});
