// wave10/whiteboard — the tools drive the REAL model. Every assertion here is a CONSEQUENCE
// (a stroke entity exists / is gone / has fewer points), never "an element appeared".

import { DiagramEngine, DiagramModel, StrokeModel } from '@grafloria/engine';
import { ViewportController } from '../viewport/viewport-controller';
import {
  createDrawTool,
  createRectangleTool,
  createEraserTool,
  createStrokeEditTool,
  type WhiteboardHost,
} from './whiteboard-tools';
import type { ToolPointerEvent, ToolHitContext } from '../ext/tools';

function makeHost(overrides: Partial<WhiteboardHost> = {}): {
  host: WhiteboardHost;
  model: DiagramModel;
  batchCalls: () => number;
} {
  const model = new DiagramModel('wb');
  const container = document.createElement('div');
  document.body.appendChild(container);
  const viewport = new ViewportController({
    viewport: { x: 0, y: 0, width: 800, height: 600 },
    zoom: 1,
  });
  let batchCalls = 0;
  const host: WhiteboardHost = {
    getModel: () => model,
    viewport,
    container,
    render: () => undefined,
    batch: (fn) => {
      batchCalls++;
      fn();
    },
    ...overrides,
  };
  return { host, model, batchCalls: () => batchCalls };
}

const EMPTY_HIT: ToolHitContext = { empty: true };

function pe(type: ToolPointerEvent['type'], x: number, y: number): ToolPointerEvent {
  return {
    type,
    world: { x, y },
    screen: { x, y },
    modifiers: { shift: false, ctrl: false, alt: false, meta: false },
  };
}

describe('DrawTool', () => {
  it('commits ONE stroke on pointerup, and NOTHING lands in the model mid-gesture', () => {
    const { host, model } = makeHost();
    const tool = createDrawTool(host);

    tool.onPointerDown(pe('down', 10, 10), EMPTY_HIT);
    tool.onPointerMove(pe('move', 20, 15), EMPTY_HIT);
    tool.onPointerMove(pe('move', 30, 25), EMPTY_HIT);
    // The in-progress stroke is on the overlay, not the model — the frame gate never sees it.
    expect(model.getStrokes().length).toBe(0);

    tool.onPointerUp(pe('up', 40, 20), EMPTY_HIT);
    expect(model.getStrokes().length).toBe(1);
  });

  it('SIMPLIFIES at commit: a 500-point trace serialises as far fewer points', () => {
    const { host, model } = makeHost();
    const tool = createDrawTool(host, { simplifyEpsilon: 1 });

    // A gently curving trace with hundreds of near-collinear samples — exactly the raw input a
    // real drag produces, and exactly what must NOT be persisted verbatim.
    tool.onPointerDown(pe('down', 0, 0), EMPTY_HIT);
    for (let i = 1; i < 500; i++) {
      tool.onPointerMove(pe('move', i, Math.sin(i / 40) * 3), EMPTY_HIT);
    }
    tool.onPointerUp(pe('up', 500, 0), EMPTY_HIT);

    const stroke = model.getStrokes()[0];
    expect(stroke).toBeDefined();
    expect(stroke.pointCount).toBeGreaterThan(2); // it kept the shape
    expect(stroke.pointCount).toBeLessThan(200); // …but threw away the float noise
  });

  it('a named draw tool commits ink with a label (a NAMED annotation in the a11y tree)', () => {
    const { host, model } = makeHost();
    const tool = createDrawTool(host, { label: 'reject path', color: '#e11d48' });
    tool.onPointerDown(pe('down', 0, 0), EMPTY_HIT);
    tool.onPointerMove(pe('move', 20, 20), EMPTY_HIT);
    tool.onPointerUp(pe('up', 40, 10), EMPTY_HIT);
    expect(model.getStrokes()[0].getLabel()).toBe('reject path');
    expect(model.getStrokes()[0].getStyle().color).toBe('#e11d48');
  });

  it('an inactive tool declines the gesture (this is how a host switches tools)', () => {
    const { host } = makeHost();
    const tool = createDrawTool(host);
    tool.setActive(false);
    expect(tool.hitTest()).toBe(false);
  });
});

describe('RectangleTool', () => {
  it('a drag becomes a rectangle NODE sized to the drag', () => {
    const { host, model } = makeHost();
    const tool = createRectangleTool(host, { label: 'Box' });

    tool.onPointerDown(pe('down', 100, 100), EMPTY_HIT);
    tool.onPointerMove(pe('move', 260, 190), EMPTY_HIT);
    expect(model.getNodes().length).toBe(0); // nothing until release
    tool.onPointerUp(pe('up', 260, 190), EMPTY_HIT);

    const nodes = model.getNodes();
    expect(nodes.length).toBe(1);
    expect(nodes[0].size).toMatchObject({ width: 160, height: 90 });
    expect(nodes[0].position).toMatchObject({ x: 100, y: 100 });
    expect(nodes[0].style.shape).toBe('rectangle');
  });

  it('a click (no drag) makes no node — a rectangle needs a size', () => {
    const { host, model } = makeHost();
    const tool = createRectangleTool(host);
    tool.onPointerDown(pe('down', 50, 50), EMPTY_HIT);
    tool.onPointerUp(pe('up', 51, 51), EMPTY_HIT);
    expect(model.getNodes().length).toBe(0);
  });
});

describe('EraserTool', () => {
  function seedStrokes(model: DiagramModel): void {
    // three separate horizontal strokes, well apart
    model.addStroke(strokeAt('s0', 0));
    model.addStroke(strokeAt('s1', 100));
    model.addStroke(strokeAt('s2', 200));
  }

  it('a sweep removes ONLY the strokes it crosses', () => {
    const { host, model } = makeHost();
    seedStrokes(model);
    const tool = createEraserTool(host, { radius: 5 });

    // Sweep across the middle stroke (y≈100) only.
    tool.onPointerDown(pe('down', -20, 100), EMPTY_HIT);
    tool.onPointerMove(pe('move', 60, 100), EMPTY_HIT);
    tool.onPointerUp(pe('up', 60, 100), EMPTY_HIT);

    expect(model.getStroke('s1')).toBeUndefined(); // wiped
    expect(model.getStroke('s0')).toBeDefined(); // untouched
    expect(model.getStroke('s2')).toBeDefined();
  });

  it('a fast flick that lands samples ACROSS a stroke still erases it (segment, not point)', () => {
    const { host, model } = makeHost();
    seedStrokes(model);
    const tool = createEraserTool(host, { radius: 5 });

    // Two samples 120px apart whose CONNECTING SEGMENT crosses s1 (y=100) — a point test on
    // the two endpoints (y=40, y=160) would miss it entirely.
    tool.onPointerDown(pe('down', 30, 40), EMPTY_HIT);
    tool.onPointerMove(pe('move', 30, 160), EMPTY_HIT);
    tool.onPointerUp(pe('up', 30, 160), EMPTY_HIT);

    expect(model.getStroke('s1')).toBeUndefined(); // the segment swept through it
    expect(model.getStroke('s0')).toBeDefined(); // endpoints nowhere near these
    expect(model.getStroke('s2')).toBeDefined();
  });

  it('the whole sweep is ONE batch — one undo step, not one per stroke', () => {
    const { host, model, batchCalls } = makeHost();
    seedStrokes(model);
    const tool = createEraserTool(host, { radius: 5 });

    tool.onPointerDown(pe('down', 30, -20), EMPTY_HIT);
    tool.onPointerMove(pe('move', 30, 240), EMPTY_HIT); // crosses all three (y=0,100,200)
    tool.onPointerUp(pe('up', 30, 240), EMPTY_HIT);

    expect(model.getStrokes().length).toBe(0);
    expect(batchCalls()).toBe(1); // three removes, ONE batch
  });

  it('a sweep over empty canvas removes nothing and opens no batch', () => {
    const { host, model, batchCalls } = makeHost();
    seedStrokes(model);
    const tool = createEraserTool(host, { radius: 5 });

    tool.onPointerDown(pe('down', 500, 500), EMPTY_HIT);
    tool.onPointerMove(pe('move', 520, 520), EMPTY_HIT);
    tool.onPointerUp(pe('up', 520, 520), EMPTY_HIT);

    expect(model.getStrokes().length).toBe(3);
    expect(batchCalls()).toBe(0);
  });
});

// A horizontal stroke at a given y.
function strokeAt(id: string, y: number): StrokeModel {
  return new StrokeModel(
    [
      { x: 0, y },
      { x: 50, y },
      { x: 100, y },
    ],
    { color: '#000', width: 3 },
    { id }
  );
}

// ===========================================================================
// wave13/stroke-edit — the EDIT tool. Ink could be drawn and erased but never
// TOUCHED: no tool selected, moved, or restyled an existing stroke. Every
// assertion is a consequence on the MODEL (points translated, count unchanged,
// pressure preserved), never "an element appeared".
// ===========================================================================

describe('StrokeEditTool', () => {
  const INK: ReadonlyArray<{ x: number; y: number; pressure?: number }> = [
    { x: 100, y: 100, pressure: 0.3 },
    { x: 150, y: 120, pressure: 0.7 },
    { x: 200, y: 100, pressure: 0.9 },
  ];

  function seedInk(model: DiagramModel, id = 'ink'): StrokeModel {
    const s = new StrokeModel(INK as never, { color: '#111', width: 4 }, { id });
    model.addStroke(s);
    return s;
  }

  it('claims the gesture ONLY over ink — a press elsewhere falls through to the built-in ladder', () => {
    const { host, model } = makeHost();
    seedInk(model);
    const tool = createStrokeEditTool(host);

    expect(tool.hitTest(pe('down', 150, 118))).toBe(true); // on the ink
    expect(tool.hitTest(pe('down', 400, 400))).toBe(false); // empty canvas: NOT claimed
    tool.setActive(false);
    expect(tool.hitTest(pe('down', 150, 118))).toBe(false); // inactive tool declines
  });

  it('a tap SELECTS the stroke under the pointer, and moves nothing', () => {
    const { host, model } = makeHost();
    const ink = seedInk(model);
    const tool = createStrokeEditTool(host);

    tool.onPointerDown(pe('down', 150, 118), EMPTY_HIT);
    tool.onPointerUp(pe('up', 150, 118), EMPTY_HIT);

    expect(tool.getSelectedStroke()).toBe(ink);
    expect(ink.getPoints()).toEqual(INK);
  });

  it('overlapping ink: the TOPMOST (later-drawn) stroke wins the press', () => {
    const { host, model } = makeHost();
    seedInk(model, 'under');
    const over = seedInk(model, 'over'); // identical geometry, drawn later = painted on top
    const tool = createStrokeEditTool(host);

    tool.onPointerDown(pe('down', 150, 118), EMPTY_HIT);
    expect(tool.getSelectedStroke()).toBe(over);
  });

  it('a drag TRANSLATES the whole stroke: same point count, same pressures, all points moved by the delta', () => {
    const { host, model } = makeHost();
    const ink = seedInk(model);
    const tool = createStrokeEditTool(host);

    tool.onPointerDown(pe('down', 150, 118), EMPTY_HIT);
    tool.onPointerMove(pe('move', 170, 130), EMPTY_HIT);
    // Mid-gesture the MODEL is untouched — feedback lives on the overlay only.
    expect(ink.getPoints()).toEqual(INK);

    tool.onPointerMove(pe('move', 250, 58), EMPTY_HIT);
    tool.onPointerUp(pe('up', 250, 58), EMPTY_HIT); // delta = (+100, -60)

    const after = ink.getPoints();
    expect(after.length).toBe(INK.length);
    after.forEach((p, i) => {
      expect(p.x).toBeCloseTo(INK[i].x + 100, 1);
      expect(p.y).toBeCloseTo(INK[i].y - 60, 1);
      expect(p.pressure).toBe(INK[i].pressure); // a translate never touches pressure
    });
  });

  it('with an engine host the translate is ONE undoable command — Ctrl-Z restores the start', async () => {
    const { host, model } = makeHost();
    const ink = seedInk(model);
    const engine = new DiagramEngine();
    engine.setDiagram(model);
    host.getEngine = () => engine;
    const tool = createStrokeEditTool(host);

    tool.onPointerDown(pe('down', 150, 118), EMPTY_HIT);
    tool.onPointerMove(pe('move', 190, 118), EMPTY_HIT);
    tool.onPointerUp(pe('up', 190, 118), EMPTY_HIT); // delta = (+40, 0)

    // The command commit is void-async — let it land on the history stack.
    await new Promise((r) => setTimeout(r, 0));
    expect(ink.getPoints()[0].x).toBeCloseTo(140, 1);

    await engine.undo();
    expect(ink.getPoints()).toEqual(INK);

    await engine.redo();
    expect(ink.getPoints()[0].x).toBeCloseTo(140, 1);
  });

  it('cancel (Escape / pointercancel) mid-drag commits NOTHING and drops the selection', () => {
    const { host, model } = makeHost();
    const ink = seedInk(model);
    const tool = createStrokeEditTool(host);

    tool.onPointerDown(pe('down', 150, 118), EMPTY_HIT);
    tool.onPointerMove(pe('move', 300, 300), EMPTY_HIT);
    tool.onCancel();

    expect(ink.getPoints()).toEqual(INK);
    expect(tool.getSelectedStroke()).toBeNull();

    // The abandoned gesture's trailing pointerup must also be inert.
    tool.onPointerUp(pe('up', 300, 300), EMPTY_HIT);
    expect(ink.getPoints()).toEqual(INK);
  });

  it('restyle rides the same selection: setStyle on the selected stroke changes colour/width', () => {
    const { host, model } = makeHost();
    const ink = seedInk(model);
    const tool = createStrokeEditTool(host);

    tool.onPointerDown(pe('down', 150, 118), EMPTY_HIT);
    tool.onPointerUp(pe('up', 150, 118), EMPTY_HIT);

    tool.getSelectedStroke()!.setStyle({ color: '#e11d48', width: 8 });
    expect(ink.getStyle()).toEqual({ color: '#e11d48', width: 8 });
  });
});
