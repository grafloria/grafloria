// svg-renderer.zorder.spec.ts — Wave-5 Card 3 (grouping): the renderer honors
// a model-level z-order (node style.zIndex) instead of relying solely on the
// visible-query iteration order, and does so with a STABLE sort so diagrams
// that never set zIndex are unaffected.

import { SVGRenderer } from './svg-renderer';
import { DiagramEngine, DiagramModel, NodeModel } from '@grafloria/engine';
import type { VNode } from '../types/vnode.types';

function findLayer(vnode: VNode | undefined, className: string): VNode | undefined {
  if (!vnode || typeof vnode !== 'object') return undefined;
  if ((vnode.props as any)?.className === className) return vnode;
  for (const child of (vnode.children ?? []) as VNode[]) {
    const hit = findLayer(child, className);
    if (hit) return hit;
  }
  return undefined;
}

function nodeOrder(root: VNode): string[] {
  const layer = findLayer(root, 'nodes-layer');
  return ((layer?.children ?? []) as VNode[])
    .map((c) => c.key as string)
    .filter((k) => typeof k === 'string' && k.startsWith('node-'));
}

describe('SVGRenderer node z-order (Wave-5 Card 3)', () => {
  let engine: DiagramEngine;
  let diagram: DiagramModel;
  let renderer: SVGRenderer;

  beforeEach(() => {
    engine = new DiagramEngine();
    diagram = engine.createDiagram('Z')!;
    renderer = new SVGRenderer(engine);
  });

  function addNode(id: string, x: number, zIndex?: number): void {
    const n = new NodeModel({ id, type: 'default', position: { x, y: 0 }, size: { width: 40, height: 40 } });
    if (zIndex !== undefined) {
      n.style = { ...n.style, zIndex };
    }
    diagram.addNode(n);
  }

  it('paints nodes ascending by style.zIndex', () => {
    addNode('a', 0, 2);
    addNode('b', 100, -1);
    addNode('c', 200, 0);

    const root = renderer.render({ x: -1000, y: -1000, width: 4000, height: 4000 }, 1);
    expect(nodeOrder(root)).toEqual(['node-b', 'node-c', 'node-a']);
  });

  it('is a stable no-op when no node sets zIndex (insertion order preserved)', () => {
    addNode('a', 0);
    addNode('b', 100);
    addNode('c', 200);

    const root = renderer.render({ x: -1000, y: -1000, width: 4000, height: 4000 }, 1);
    // All zero → keep the incoming (insertion/spatial-query) order deterministically.
    expect(nodeOrder(root)).toEqual(['node-a', 'node-b', 'node-c']);
  });

  it('keeps ties in incoming order (stable sort within a zIndex band)', () => {
    addNode('a', 0, 5);
    addNode('b', 100, 5);
    addNode('c', 200, 5);

    const root = renderer.render({ x: -1000, y: -1000, width: 4000, height: 4000 }, 1);
    expect(nodeOrder(root)).toEqual(['node-a', 'node-b', 'node-c']);
  });
});
