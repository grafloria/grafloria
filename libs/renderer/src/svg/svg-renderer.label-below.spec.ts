// Outside labels — `metadata.labelPlacement: 'below'` (stencil-master fidelity).
//
// The glyph-caption class from the master-sheet audit: a 36px BPMN event, an
// 18px flowchart connector or an 8px fork bar CANNOT carry its caption inside —
// the clip path shears it into garbage ("onnect", "xclusiv iatewa"). Real
// Visio/BPMN paints the NAME BELOW such shapes. These tests pin the renderer
// contract for that placement:
//   - the caption paints UNDER the silhouette (top edge ≥ height + gap),
//   - it is never clipped (no <clipPath>) and never shrunk below theme size,
//   - the shape body / ports are byte-identical to the inside-label render
//     (placement is pure paint, not geometry).

import { SVGRenderer } from './svg-renderer';
import { DiagramEngine, NodeModel } from '@grafloria/engine';
import type { VNode } from '../types/vnode.types';

const GAP_MIN = 4;
const GAP_MAX = 6;

function collect(vnode: VNode | undefined, pred: (v: VNode) => boolean, out: VNode[] = []): VNode[] {
  if (!vnode) return out;
  if (pred(vnode)) out.push(vnode);
  for (const c of vnode.children ?? []) collect(c as VNode, pred, out);
  return out;
}

function byKey(vnode: VNode, key: string): VNode | undefined {
  return collect(vnode, (v) => v.props?.['key'] === key || (v as any).key === key)[0];
}

describe('SVGRenderer — labelPlacement: below (outside labels)', () => {
  let engine: DiagramEngine;
  let renderer: SVGRenderer;
  let diagram: any;
  const viewport = { x: 0, y: 0, width: 1200, height: 900 };

  const makeNode = (label: string, size = { width: 36, height: 36 }, below = true) => {
    const node = new NodeModel({ type: 'test', position: { x: 100, y: 100 }, size });
    node.setMetadata('shape', { type: 'circle', fill: '#fff', stroke: '#334155', strokeWidth: 2 });
    if (below) node.setMetadata('labelPlacement', 'below');
    node.setData('label', label);
    diagram.addNode(node);
    return node;
  };

  beforeEach(() => {
    engine = new DiagramEngine();
    diagram = engine.createDiagram('t')!;
    renderer = new SVGRenderer(engine);
  });

  afterEach(() => renderer.dispose());

  it('paints the caption centred UNDER the silhouette, with a 4–6px gap', () => {
    const node = makeNode('Start Event');
    const tree = renderer.render(viewport, 1.0);
    const g = byKey(tree, `node-${node.id}`)!;
    const texts = collect(g, (v) => v.type === 'text' && String(v.props?.['className'] ?? '').includes('gf-label-below'));
    expect(texts).toHaveLength(1);
    const t = texts[0];
    // centred on the node's horizontal middle
    expect(t.props['x']).toBe(18);
    // block top = y - blockHeight/2 must sit gap px below the 36px silhouette
    // (CSS mode emits no fontSize attribute; the block math uses theme md = 14)
    const fontSize = 14;
    const lineHeight = fontSize * 1.2;
    const top = Number(t.props['y']) - lineHeight / 2; // single line
    expect(top).toBeGreaterThanOrEqual(36 + GAP_MIN);
    expect(top).toBeLessThanOrEqual(36 + GAP_MAX);
  });

  it('never clips and never shrinks an outside label', () => {
    const node = makeNode('Intermediate Event'); // far wider than 36px
    const tree = renderer.render(viewport, 1.0);
    const g = byKey(tree, `node-${node.id}`)!;
    // No clipPath is emitted for a below-label…
    expect(collect(g, (v) => v.type === 'clipPath')).toHaveLength(0);
    const t = collect(g, (v) => v.type === 'text')[0];
    // …the text carries no clip-path prop…
    expect(t.props['clipPath']).toBeUndefined();
    // …and no shrink-to-fit inline style is applied (the inside path stamps
    // `style.fontSize` when it shrinks; an outside label never does).
    const style = t.props['style'] as Record<string, unknown> | undefined;
    expect(style?.['fontSize']).toBeUndefined();
  });

  it('wraps a long caption below the shape instead of ellipsising it', () => {
    const node = makeNode('Business Rule Task With A Deliberately Long Caption');
    const tree = renderer.render(viewport, 1.0);
    const g = byKey(tree, `node-${node.id}`)!;
    const t = collect(g, (v) => v.type === 'text')[0];
    const tspans = collect(t, (v) => v.type === 'tspan');
    expect(tspans.length).toBeGreaterThan(1);
    // every character survives — outside labels are never truncated
    const joined = tspans.map((s) => s.props['textContent']).join(' ');
    expect(joined.replace(/\s+/g, ' ')).toBe('Business Rule Task With A Deliberately Long Caption');
    expect(joined).not.toContain('…');
    // every line is anchored on the node centre, and the FIRST line's ink starts
    // below the silhouette (dy math must not raise it into the shape)
    for (const s of tspans) expect(s.props['x']).toBe(18);
    const blockH = tspans.length * 14 * 1.2;
    const top = Number(t.props['y']) - blockH / 2;
    expect(top).toBeGreaterThanOrEqual(36 + GAP_MIN);
  });

  it('is pure paint: shape body and ports are identical with and without it', () => {
    const below = makeNode('Connector', { width: 40, height: 40 }, true);
    const inside = makeNode('Connector', { width: 40, height: 40 }, false);
    const tree = renderer.render(viewport, 1.0);
    const bodyOf = (id: string) => {
      const g = byKey(tree, `node-${id}`)!;
      const shape = collect(g, (v) => v.type === 'circle' || v.type === 'ellipse' || v.type === 'path')[0];
      return JSON.stringify({ type: shape.type, geom: { ...shape.props, key: undefined } });
    };
    expect(bodyOf(below.id)).toBe(bodyOf(inside.id));
    expect(below.ports.size).toBe(inside.ports.size);
  });

  it('default placement still clips to the inner rect (regression guard)', () => {
    const node = makeNode('Connector', { width: 40, height: 40 }, false);
    const tree = renderer.render(viewport, 1.0);
    const g = byKey(tree, `node-${node.id}`)!;
    expect(collect(g, (v) => v.type === 'clipPath')).toHaveLength(1);
    const t = collect(g, (v) => v.type === 'text')[0];
    expect(String(t.props['clipPath'] ?? '')).toContain(`node-clip-${node.id}`);
  });
});
