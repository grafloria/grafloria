// Draw-call parity: what the VNode tree SAYS vs what the canvas actually DOES.
//
// The recording context makes this an exact, structural comparison instead of an
// image diff: for every element in the tree we can assert the fill/stroke style,
// the line width, the dash pattern, the transform and the path geometry the
// painter issued. If the canvas backend ever stops agreeing with the tree, one
// of these fails with a readable diff.

import { SVGRenderer } from '../svg/svg-renderer';
import { linkBodyHitTolerance } from '../svg/link-hit-test';
import { LIGHT_THEME } from '../themes';
import type { VNode } from '../types/vnode.types';
import { RecordingContext2D, type DrawCall } from './canvas-context';
import { IDENTITY, pathBounds } from './path-geometry';
import { CanvasStyleResolver } from './style-resolution';
import { VIEWPORT, buildScene, type TestScene } from './test-scene';
import {
  VNodePainter,
  collectDefinitions,
  entityOf,
  geometryOf,
  nextColorKey,
  textLines,
} from './vnode-painter';

const makePainter = () => new VNodePainter(new CanvasStyleResolver({ theme: LIGHT_THEME }));

const paint = (root: VNode) => {
  const ctx = new RecordingContext2D();
  const result = makePainter().paint(ctx, root, { worldToDevice: IDENTITY });
  return { ctx, result };
};

const fills = (ctx: RecordingContext2D) =>
  ctx.calls.filter((c): c is Extract<DrawCall, { op: 'fill' }> => c.op === 'fill');
const strokes = (ctx: RecordingContext2D) =>
  ctx.calls.filter((c): c is Extract<DrawCall, { op: 'stroke' }> => c.op === 'stroke');
const texts = (ctx: RecordingContext2D) =>
  ctx.calls.filter((c): c is Extract<DrawCall, { op: 'fillText' }> => c.op === 'fillText');

describe('VNodePainter — primitives', () => {
  it('fills and strokes a rect with the resolved paint', () => {
    const { ctx } = paint({
      type: 'rect',
      props: {
        x: 10,
        y: 20,
        width: 100,
        height: 50,
        fill: '#eeeeee',
        stroke: '#333333',
        strokeWidth: 2,
      },
    });

    expect(fills(ctx)).toHaveLength(1);
    expect(fills(ctx)[0].fillStyle).toBe('#eeeeee');

    expect(strokes(ctx)).toHaveLength(1);
    expect(strokes(ctx)[0].strokeStyle).toBe('#333333');
    expect(strokes(ctx)[0].lineWidth).toBe(2);

    const b = pathBounds(fills(ctx)[0].path)!;
    expect([b.minX, b.minY, b.maxX, b.maxY]).toEqual([10, 20, 110, 70]);
  });

  it('does not fill an element with fill="none" (a link path)', () => {
    const { ctx } = paint({
      type: 'path',
      props: { d: 'M 0 0 L 100 0', fill: 'none', stroke: '#000000', strokeWidth: 2 },
    });
    expect(fills(ctx)).toHaveLength(0);
    expect(strokes(ctx)).toHaveLength(1);
  });

  it('does not stroke when strokeWidth is 0', () => {
    const { ctx } = paint({
      type: 'rect',
      props: { x: 0, y: 0, width: 10, height: 10, fill: '#fff', stroke: '#000', strokeWidth: 0 },
    });
    expect(strokes(ctx)).toHaveLength(0);
  });

  it('passes the dash pattern through to setLineDash', () => {
    const { ctx } = paint({
      type: 'path',
      props: { d: 'M 0 0 L 50 0', fill: 'none', stroke: '#000', strokeDasharray: '5,5' },
    });
    expect(strokes(ctx)[0].lineDash).toEqual([5, 5]);
  });

  it('applies opacity as globalAlpha', () => {
    const { ctx } = paint({
      type: 'circle',
      props: { cx: 0, cy: 0, r: 5, fill: '#000', opacity: 0.25 },
    });
    expect(fills(ctx)[0].globalAlpha).toBeCloseTo(0.25);
  });

  it('composites a group opacity onto its children', () => {
    const { ctx } = paint({
      type: 'g',
      props: { opacity: 0.5 },
      children: [{ type: 'circle', props: { cx: 0, cy: 0, r: 5, fill: '#000', opacity: 0.5 } }],
    });
    expect(fills(ctx)[0].globalAlpha).toBeCloseTo(0.25);
  });

  it('skips an invisible element entirely', () => {
    const { ctx } = paint({
      type: 'rect',
      props: { x: 0, y: 0, width: 10, height: 10, fill: '#000', display: 'none' },
    });
    expect(ctx.paintCalls()).toHaveLength(0);
  });

  it('resolves the geometry of every primitive the renderer emits', () => {
    expect(geometryOf({ type: 'rect', props: { width: 10, height: 10 } })).not.toHaveLength(0);
    expect(geometryOf({ type: 'circle', props: { r: 5 } })).not.toHaveLength(0);
    expect(geometryOf({ type: 'ellipse', props: { rx: 5, ry: 3 } })).not.toHaveLength(0);
    expect(geometryOf({ type: 'line', props: { x2: 5 } })).not.toHaveLength(0);
    expect(geometryOf({ type: 'polygon', props: { points: '0,0 1,1' } })).not.toHaveLength(0);
    expect(geometryOf({ type: 'polyline', props: { points: '0,0 1,1' } })).not.toHaveLength(0);
    expect(geometryOf({ type: 'path', props: { d: 'M 0 0 L 1 1' } })).not.toHaveLength(0);
  });
});

describe('VNodePainter — transforms', () => {
  it('composes a group transform onto the child element', () => {
    const { ctx } = paint({
      type: 'g',
      props: { transform: 'translate(100, 200)' },
      children: [{ type: 'rect', props: { x: 0, y: 0, width: 10, height: 10, fill: '#000' } }],
    });

    const call = fills(ctx)[0];
    // Path is issued in LOCAL coordinates, under a transform that carries the
    // translate — exactly how SVG does it, and what keeps stroke widths honest.
    expect(call.transform).toEqual({ a: 1, b: 0, c: 0, d: 1, e: 100, f: 200 });
    expect(pathBounds(call.path)!.minX).toBe(0);
  });

  it('nests transforms', () => {
    const { ctx } = paint({
      type: 'g',
      props: { transform: 'translate(10, 10)' },
      children: [
        {
          type: 'g',
          props: { transform: 'translate(5, 5)' },
          children: [{ type: 'rect', props: { width: 1, height: 1, fill: '#000' } }],
        },
      ],
    });
    expect(fills(ctx)[0].transform.e).toBe(15);
    expect(fills(ctx)[0].transform.f).toBe(15);
  });

  it('folds the world→device matrix into every draw', () => {
    const ctx = new RecordingContext2D();
    // zoom 2 on a dpr-2 screen → scale 4; viewBox origin at world (50, 50).
    const worldToDevice = { a: 4, b: 0, c: 0, d: 4, e: -200, f: -200 };

    makePainter().paint(
      ctx,
      {
        type: 'g',
        props: { transform: 'translate(100, 100)' },
        children: [{ type: 'rect', props: { width: 10, height: 10, fill: '#000' } }],
      },
      { worldToDevice }
    );

    // world (100,100) is 50 world units past the viewBox origin → 200 device px.
    expect(fills(ctx)[0].transform).toEqual({ a: 4, b: 0, c: 0, d: 4, e: 200, f: 200 });

    // The path stays in LOCAL units, so a stroke is scaled by the device matrix
    // exactly as SVG scales it — rather than being pre-multiplied here (which is
    // how canvas ports get hairline strokes at high zoom).
    expect(pathBounds(fills(ctx)[0].path)!.maxX).toBe(10);
  });
});

describe('VNodePainter — text', () => {
  it('draws a single-line label with the resolved font and alignment', () => {
    const { ctx } = paint({
      type: 'text',
      props: {
        x: 50,
        y: 25,
        textContent: 'Hello',
        className: 'diagram-label',
        textAnchor: 'middle',
        dominantBaseline: 'middle',
      },
    });

    const call = texts(ctx)[0];
    expect(call.text).toBe('Hello');
    expect([call.x, call.y]).toEqual([50, 25]);
    expect(call.textAlign).toBe('center');
    expect(call.textBaseline).toBe('middle');
    // font + colour came from `.diagram-label` — i.e. from CSS, which canvas
    // cannot read, resolved through the shared cascade.
    expect(call.fillStyle).toBe(LIGHT_THEME.colors.text.primary);
    expect(call.font).toContain(`${LIGHT_THEME.typography.fontSize.md}px`);
  });

  it('flattens a multi-line tspan block into one fillText per line, accumulating dy', () => {
    const { ctx } = paint({
      type: 'text',
      props: { x: 50, y: 100, textAnchor: 'middle' },
      children: [
        { type: 'tspan', props: { x: 50, dy: -7.2, textContent: 'line one' } },
        { type: 'tspan', props: { x: 50, dy: 14.4, textContent: 'line two' } },
      ],
    });

    const calls = texts(ctx);
    expect(calls.map((c) => c.text)).toEqual(['line one', 'line two']);
    expect(calls[0].y).toBeCloseTo(92.8);
    expect(calls[1].y).toBeCloseTo(107.2); // dy accumulates, it does not reset
  });

  it('draws nothing for an empty label', () => {
    const { ctx } = paint({ type: 'text', props: { x: 0, y: 0, textContent: '' } });
    expect(texts(ctx)).toHaveLength(0);
  });

  it('textLines is the single source of the line layout', () => {
    expect(textLines({ type: 'text', props: { textContent: 'x' } }, 1, 2)).toEqual([
      { text: 'x', x: 1, y: 2 },
    ]);
  });
});

describe('VNodePainter — clipping and definitions', () => {
  it('applies a clipPath referenced by a label (the shape-fit backstop)', () => {
    const { ctx } = paint({
      type: 'g',
      props: {},
      children: [
        {
          type: 'clipPath',
          props: { id: 'node-clip-1' },
          children: [{ type: 'rect', props: { x: 8, y: 8, width: 84, height: 44 } }],
        },
        {
          type: 'text',
          props: { x: 50, y: 30, textContent: 'clipped', clipPath: 'url(#node-clip-1)' },
        },
      ],
    });

    expect(ctx.calls.filter((c) => c.op === 'clip')).toHaveLength(1);
    // the clipPath element itself is a DEFINITION — never painted
    expect(fills(ctx)).toHaveLength(0);
  });

  it('collects definitions from anywhere in the tree, including a trailing <defs>', () => {
    const defs = collectDefinitions({
      type: 'svg',
      props: {},
      children: [
        {
          type: 'g',
          props: {},
          children: [{ type: 'clipPath', props: { id: 'c1' }, children: [] }],
        },
        {
          type: 'defs',
          props: {},
          children: [{ type: 'linearGradient', props: { id: 'g1' }, children: [] }],
        },
      ],
    });
    expect([...defs.keys()].sort()).toEqual(['c1', 'g1']);
  });

  it('resolves url(#gradient) into a real canvas gradient with its stops', () => {
    const { ctx } = paint({
      type: 'g',
      props: {},
      children: [
        {
          type: 'defs',
          props: {},
          children: [
            {
              type: 'linearGradient',
              props: { id: 'grad', x1: 0, y1: 0, x2: 1, y2: 0 },
              children: [
                { type: 'stop', props: { offset: 0, stopColor: '#ff0000' } },
                { type: 'stop', props: { offset: 1, stopColor: '#0000ff' } },
              ],
            },
          ],
        },
        { type: 'rect', props: { width: 100, height: 50, fill: 'url(#grad)' } },
      ],
    });

    const gradient = fills(ctx)[0].fillStyle as { __gradient: string; stops: unknown[] };
    expect(gradient.__gradient).toBe('linear');
    expect(gradient.stops).toEqual([
      { offset: 0, color: '#ff0000' },
      { offset: 1, color: '#0000ff' },
    ]);
  });

  it('a missing paint server falls back to a flat colour rather than blanking the node', () => {
    const { ctx } = paint({ type: 'rect', props: { width: 10, height: 10, fill: 'url(#gone)' } });
    expect(fills(ctx)).toHaveLength(1);
    expect(fills(ctx)[0].fillStyle).toBe('#999999');
  });

  it('reports foreignObject as unpaintable instead of silently dropping it', () => {
    const { ctx, result } = paint({
      type: 'g',
      props: {},
      children: [
        { type: 'foreignObject', props: { x: 0, y: 0, width: 10, height: 10 }, children: [] },
      ],
    });
    expect(result.unpaintableNodes).toHaveLength(1);
    expect(ctx.paintCalls()).toHaveLength(0);
  });
});

describe('VNodePainter — hit records', () => {
  it('attributes a link path to its link group', () => {
    const { result } = paint({
      type: 'g',
      key: 'link-l1',
      props: { className: 'link-group' },
      children: [
        {
          type: 'path',
          props: { d: 'M 0 0 L 100 0', fill: 'none', stroke: '#000', strokeWidth: 2 },
        },
      ],
    });

    expect(result.hitRecords).toHaveLength(1);
    expect(result.hitRecords[0]).toMatchObject({
      kind: 'link',
      id: 'l1',
      filled: false,
      // The per-link grab distance, NOT a flat constant: same formula the SVG
      // hit-area stroke is painted with (max(12, stroke+8)/2 → 6 for a 2px
      // stroke), so canvas picking matches SVG's painted invitation.
      tolerance: linkBodyHitTolerance(2),
    });
  });

  it('does not make the shadow or the selection ring pickable', () => {
    const { result } = paint({
      type: 'g',
      key: 'node-n1',
      props: {},
      children: [
        { type: 'rect', props: { width: 10, height: 10, fill: '#000', className: 'node-shadow' } },
        {
          type: 'rect',
          props: { width: 10, height: 10, fill: 'none', className: 'selection-highlight' },
        },
        { type: 'rect', props: { width: 10, height: 10, fill: '#fff', className: 'diagram-node' } },
      ],
    });

    expect(result.hitRecords).toHaveLength(1);
    expect(result.hitRecords[0].vnode.props['className']).toBe('diagram-node');
  });

  it('does not consume the SVG wide interaction stroke as the link hit region', () => {
    const { result } = paint({
      type: 'g',
      key: 'link-l1',
      props: {},
      children: [
        {
          type: 'path',
          props: {
            d: 'M 0 0 L 10 0',
            stroke: 'transparent',
            strokeWidth: 12,
            className: 'link-hit-area',
          },
        },
      ],
    });
    expect(result.hitRecords).toHaveLength(0);
  });

  it('skips pointer-events:none elements (node labels)', () => {
    const { result } = paint({
      type: 'g',
      key: 'node-n1',
      props: {},
      children: [
        { type: 'rect', props: { width: 10, height: 10, fill: '#fff' } },
        { type: 'circle', props: { r: 3, fill: '#000', pointerEvents: 'none' } },
      ],
    });
    expect(result.hitRecords).toHaveLength(1);
  });

  it('nests a port inside its node — both pickable, port on top', () => {
    const { result } = paint({
      type: 'g',
      key: 'node-n1',
      props: {},
      children: [
        { type: 'rect', props: { width: 100, height: 50, fill: '#fff' } },
        { type: 'circle', key: 'port-p1', props: { cx: 100, cy: 25, r: 6, fill: '#0af' } },
      ],
    });

    expect(result.hitRecords.map((r) => r.kind)).toEqual(['node', 'port']);
    // the port is painted last, so it wins a pick where they overlap
    expect(result.hitRecords[1].zIndex).toBeGreaterThan(result.hitRecords[0].zIndex);
    // and the node's bounds grew to include the port that sticks out past its edge
    expect(result.entityBounds.get('node-n1')!.maxX).toBeGreaterThan(100);
  });

  it('gives every pickable element a distinct colour key', () => {
    const { result } = paint({
      type: 'g',
      props: {},
      children: [
        {
          type: 'g',
          key: 'node-a',
          props: {},
          children: [{ type: 'rect', props: { width: 5, height: 5, fill: '#fff' } }],
        },
        {
          type: 'g',
          key: 'node-b',
          props: {},
          children: [{ type: 'rect', props: { width: 5, height: 5, fill: '#fff' } }],
        },
      ],
    });

    const keys = result.hitRecords.map((r) => r.colorKey);
    expect(new Set(keys).size).toBe(keys.length);
    expect(result.colorKeyIndex.get(keys[0])!.id).toBe('a');
  });

  it('colour keys are spread far apart so an antialiased blend cannot alias onto a valid key', () => {
    const a = parseInt(nextColorKey(0).slice(1), 16);
    const b = parseInt(nextColorKey(1).slice(1), 16);
    expect(Math.abs(a - b)).toBeGreaterThan(1000);
  });

  it('entityOf reads identity off the VNode key, and ignores the HTML-layer placeholder', () => {
    expect(entityOf({ type: 'g', key: 'node-n1', props: {} })).toEqual({
      kind: 'node',
      id: 'n1',
      key: 'node-n1',
    });
    expect(entityOf({ type: 'g', key: 'node-n1-html-layer', props: {} })).toBeNull();
    expect(entityOf({ type: 'g', key: 'links-layer', props: {} })).toBeNull();
  });
});

describe('VNodePainter — against a REAL diagram tree', () => {
  let scene: TestScene;
  let producer: SVGRenderer;

  const build = () => {
    scene = buildScene([
      { name: 'a', x: 100, y: 100, label: 'Alpha' },
      { name: 'b', x: 400, y: 300, shape: 'diamond' },
    ]);
    producer = new SVGRenderer(scene.engine);
    return scene.nodes;
  };

  afterEach(() => producer?.dispose());

  it('paints the real tree: node bodies, the link, and the label', () => {
    const { a } = build();
    const tree = producer.render(VIEWPORT, 1);
    const { ctx, result } = paint(tree);

    // Node bodies are filled with the THEME colour, which in CSS mode exists
    // only in the stylesheet — the whole point of the style resolver.
    const bodyFills = fills(ctx).filter((c) => c.fillStyle === LIGHT_THEME.colors.node.default.fill);
    expect(bodyFills.length).toBeGreaterThanOrEqual(2);

    // The link is stroked with the theme link colour.
    const linkStrokes = strokes(ctx).filter(
      (c) => c.strokeStyle === LIGHT_THEME.colors.link.default
    );
    expect(linkStrokes.length).toBeGreaterThanOrEqual(1);

    // The label is drawn.
    expect(texts(ctx).map((t) => t.text)).toContain('Alpha');

    // Every node in the tree produced at least one pick region.
    const ids = new Set(result.hitRecords.filter((r) => r.kind === 'node').map((r) => r.id));
    expect(ids.has(a.id)).toBe(true);
  });

  it('a selected node paints its selected colours (state beats base, on canvas too)', () => {
    const { a } = build();
    a.setState({ selected: true });

    const { ctx } = paint(producer.render(VIEWPORT, 1));
    expect(fills(ctx).some((c) => c.fillStyle === LIGHT_THEME.colors.node.selected.fill)).toBe(true);
  });

  it('paints the diamond as a polygon, not as its bounding box', () => {
    build();
    const { ctx } = paint(producer.render(VIEWPORT, 1));

    // A diamond and a rect both flatten to 4 segments + close, so a count proves
    // nothing — the GEOMETRY does: a diamond's vertices sit at the edge
    // MIDPOINTS, so its first point is (width/2, 0) and its bbox corners are NOT
    // on the path. If the canvas backend had fallen back to a bounding box (the
    // easy bug), this would be a rect.
    const diamond = fills(ctx).find(
      (c) => c.path[0]?.op === 'M' && c.path[0].x === 60 && c.path[0].y === 0
    );
    expect(diamond).toBeDefined();
    expect(diamond!.path.map((c) => c.op)).toEqual(['M', 'L', 'L', 'L', 'Z']);
    expect(diamond!.path.slice(0, 4)).toEqual([
      { op: 'M', x: 60, y: 0 },
      { op: 'L', x: 120, y: 30 },
      { op: 'L', x: 60, y: 60 },
      { op: 'L', x: 0, y: 30 },
    ]);
  });
});
