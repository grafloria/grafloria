// resize-ux — the DEFAULT renderer paints the resize affordances it hit-tests.
//
// The live audit of nodes/node-resize-gesture.html found the binder hit-testing
// eight resize handles that NO layer painted: the default SVG renderer drew the
// dashed selection ring and nothing else, so the demo hand-rolled an HTML
// overlay (which the mounted SVG then covered). React Flow's NodeResizer paints
// 4 corner dots + 4 edge lines when the node is selected, at a constant SCREEN
// size across zoom. This suite pins our equivalent:
//
//   - a `g.resize-tool-layer` appears for a SINGLE selected, resizable node;
//   - 4 corner dots (rects) + 4 edge lines, each carrying its resize cursor;
//   - geometry matches SelectionToolsController.computeLayer EXACTLY — the
//     painted picture and the binder's hit ladder can never disagree;
//   - glyph sizes scale by 1/zoom (constant on screen, like RF's autoScale);
//   - none of it paints for multi-select / non-resizable / locked / readonly.

import { DiagramEngine, DiagramModel, NodeModel } from '@grafloria/engine';
import { SVGRenderer } from './svg-renderer';
import { SelectionToolsController } from '../interaction/selection-tools';
import type { VNode } from '../types';

const VIEWPORT = { x: 0, y: 0, width: 800, height: 600 };

function scene(): { engine: DiagramEngine; diagram: DiagramModel; node: NodeModel; renderer: SVGRenderer } {
  const engine = new DiagramEngine();
  const diagram = engine.createDiagram('resize-handles')!;
  const node = new NodeModel({
    type: 'basic',
    position: { x: 100, y: 100 },
    size: { width: 200, height: 100 },
  });
  (node as unknown as { id: string }).id = 'n1';
  diagram.addNode(node);
  return { engine, diagram, node, renderer: new SVGRenderer(engine, {}) };
}

function findAll(root: VNode | null, pred: (v: VNode) => boolean, out: VNode[] = []): VNode[] {
  if (!root) return out;
  if (pred(root)) out.push(root);
  for (const child of root.children ?? []) {
    if (child && typeof child === 'object') findAll(child as VNode, pred, out);
  }
  return out;
}

const layerOf = (root: VNode) =>
  findAll(root, (v) => String(v.props?.['className'] ?? '').includes('resize-tool-layer'))[0] ?? null;

describe('SVGRenderer — painted resize handles (resize-ux)', () => {
  it('paints 4 corner dots + 4 edge lines when a single resizable node is selected', () => {
    const { diagram, node, renderer } = scene();
    diagram.selectNode(node);
    const root = renderer.render(VIEWPORT, 1) as VNode;

    const layer = layerOf(root);
    expect(layer).not.toBeNull();

    const dots = findAll(layer, (v) => String(v.props?.['className'] ?? '').includes('resize-handle-dot'));
    const lines = findAll(layer, (v) => String(v.props?.['className'] ?? '').includes('resize-edge-line'));
    expect(dots).toHaveLength(4);
    expect(lines).toHaveLength(4);

    // Every affordance advertises its cursor — the visible glyph and the
    // binder's hover cursor must tell the same story.
    const cursors = dots.map((d) => d.props?.['cursor']);
    expect(cursors).toEqual(
      expect.arrayContaining(['nwse-resize', 'nesw-resize'])
    );
    for (const line of lines) {
      expect(['ns-resize', 'ew-resize']).toContain(line.props?.['cursor']);
    }
    renderer.dispose();
  });

  it('paints EXACTLY where the binder hit-tests (same controller geometry)', () => {
    const { engine, diagram, node, renderer } = scene();
    diagram.selectNode(node);
    const zoom = 2;
    const root = renderer.render(VIEWPORT, zoom) as VNode;

    const tools = new SelectionToolsController({
      showHalo: false, showRotateHandle: false, showRemoveButton: false, showLinkTools: false,
    });
    const layer = tools.computeLayer(engine, zoom);
    const expected = new Map(
      layer.handles.filter((h) => h.kind === 'resize' && !h.segment).map((h) => [h.handleId, h.world])
    );

    const dots = findAll(layerOf(root), (v) => String(v.props?.['className'] ?? '').includes('resize-handle-dot'));
    expect(dots).toHaveLength(4);
    for (const dot of dots) {
      const id = String(dot.props?.['data-resize-handle']);
      const want = expected.get(id as never)!;
      expect(want).toBeDefined();
      const cx = Number(dot.props?.['x']) + Number(dot.props?.['width']) / 2;
      const cy = Number(dot.props?.['y']) + Number(dot.props?.['height']) / 2;
      expect(cx).toBeCloseTo(want.x);
      expect(cy).toBeCloseTo(want.y);
    }
    renderer.dispose();
  });

  it('glyphs hold a constant SCREEN size: world size halves at zoom 2', () => {
    const { diagram, node, renderer } = scene();
    diagram.selectNode(node);

    const at = (zoom: number) => {
      const root = renderer.render(VIEWPORT, zoom) as VNode;
      const dot = findAll(layerOf(root), (v) => String(v.props?.['className'] ?? '').includes('resize-handle-dot'))[0]!;
      return Number(dot.props?.['width']);
    };
    const w1 = at(1);
    node.markDirty('test'); // force a rebuild between frames
    const w2 = at(2);
    expect(w1).toBeGreaterThan(0);
    expect(w2).toBeCloseTo(w1 / 2);
    renderer.dispose();
  });

  it('does not paint for multi-select, non-resizable, locked, unselected or readonly', () => {
    const { diagram, node, renderer } = scene();

    // Unselected.
    expect(layerOf(renderer.render(VIEWPORT, 1) as VNode)).toBeNull();

    // Multi-select.
    const second = new NodeModel({ type: 'basic', position: { x: 400, y: 100 }, size: { width: 80, height: 40 } });
    (second as unknown as { id: string }).id = 'n2';
    diagram.addNode(second);
    diagram.selectNode(node);
    diagram.addToSelection(second);
    expect(layerOf(renderer.render(VIEWPORT, 1) as VNode)).toBeNull();

    // Non-resizable single selection.
    diagram.clearSelection();
    node.setBehavior({ resizable: false });
    diagram.selectNode(node);
    expect(layerOf(renderer.render(VIEWPORT, 1) as VNode)).toBeNull();
    node.setBehavior({ resizable: true });

    // Locked.
    node.setState({ locked: true });
    node.markDirty('test');
    expect(layerOf(renderer.render(VIEWPORT, 1) as VNode)).toBeNull();
    node.setState({ locked: false });

    // Readonly diagram.
    node.markDirty('test');
    diagram.setReadonly(true);
    expect(layerOf(renderer.render(VIEWPORT, 1) as VNode)).toBeNull();
    diagram.setReadonly(false);

    renderer.dispose();
  });
});
