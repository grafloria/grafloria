// wave10/whiteboard — the ink layer renders committed strokes as <path>, with the a11y
// story argued in stroke-layer.ts actually enforced here.

import { StrokeModel } from '@grafloria/engine';
import {
  renderStroke,
  renderStrokesLayer,
  strokePolylineData,
  strokeOutlineData,
} from './stroke-layer';

describe('stroke-layer: committed ink → <path>', () => {
  it('an empty ink set produces NO layer — a canvas never drawn on pays nothing', () => {
    expect(renderStrokesLayer([])).toBeNull();
  });

  it('renders one <path> per stroke inside a strokes-layer group', () => {
    const strokes = [
      new StrokeModel([{ x: 0, y: 0 }, { x: 10, y: 10 }], { color: '#f00', width: 3 }),
      new StrokeModel([{ x: 5, y: 5 }, { x: 20, y: 1 }], { color: '#00f', width: 2 }),
    ];
    const layer = renderStrokesLayer(strokes)!;
    expect(layer.type).toBe('g');
    expect(layer.props.className).toBe('grafloria-strokes-layer');
    expect(layer.children).toHaveLength(2);
    for (const child of layer.children!) expect((child as { type: string }).type).toBe('path');
  });

  it('a plain (mouse) stroke is a stroked polyline the model can hit-test', () => {
    const s = new StrokeModel([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], {
      color: '#123456',
      width: 4,
    });
    const vnode = renderStroke(s);
    expect(vnode.props['d']).toBe('M 0 0 L 10 0 L 10 10');
    expect(vnode.props['fill']).toBe('none');
    expect(vnode.props['stroke']).toBe('#123456');
    expect(vnode.props['strokeWidth']).toBe(4);
    expect(vnode.props['strokeLinecap']).toBe('round');
    // Ink never eats a click — the eraser hit-tests the model, not the DOM.
    expect(vnode.props['pointerEvents']).toBe('none');
  });

  it('PRESSURE CHANGES THE PICTURE: a varying-pressure stroke is a filled ribbon, not a line', () => {
    // The whole point of storing pressure is that it is drawn. A varying-pressure stroke must
    // NOT render as a constant-width line (that would be "machinery wired to nothing").
    const s = new StrokeModel([
      { x: 0, y: 0, pressure: 0.2 },
      { x: 10, y: 0, pressure: 0.9 },
      { x: 20, y: 0, pressure: 0.4 },
    ]);
    const vnode = renderStroke(s);
    expect(vnode.props['fill']).not.toBe('none'); // filled ribbon
    expect(vnode.props['stroke']).toBe('none');
    expect(String(vnode.props['d'])).toMatch(/Z$/); // a closed outline
  });

  it('A11Y — anonymous ink is aria-hidden; named ink is a role=img with its label', () => {
    const anon = renderStroke(new StrokeModel([{ x: 0, y: 0 }, { x: 5, y: 5 }]));
    expect(anon.props['aria-hidden']).toBe('true');
    expect(anon.props['role']).toBeUndefined();

    const named = renderStroke(
      new StrokeModel([{ x: 0, y: 0 }, { x: 5, y: 5 }], undefined, { label: 'Q3 target' })
    );
    expect(named.props['role']).toBe('img');
    expect(named.props['aria-label']).toBe('Q3 target');
    expect(named.props['aria-hidden']).toBeUndefined();
  });

  it('a single-point stroke paints a dot (a zero-length round-capped line)', () => {
    expect(strokePolylineData([{ x: 3, y: 4 }])).toBe('M 3 4 L 3 4');
  });

  it('the outline is a closed polygon with as many vertices as it has samples, doubled', () => {
    const d = strokeOutlineData(
      [{ x: 0, y: 0, pressure: 0.5 }, { x: 10, y: 0, pressure: 0.5 }, { x: 20, y: 0, pressure: 0.5 }],
      6
    );
    expect(d.startsWith('M ')).toBe(true);
    expect(d.endsWith('Z')).toBe(true);
    // 3 samples → 3 left + 3 right vertices = 6 line/move commands + close.
    expect((d.match(/[ML]/g) ?? []).length).toBe(6);
  });
});
