/**
 * `loadText()` replaces the whiteboard ink like it replaces nodes and edges.
 *
 * It reconciled nodes, edges and groups but never touched strokes: loading a
 * DIFFERENT diagram left the previous one's ink drawn over it, and ink carried
 * in the lossless sidecar of the loaded text never came back.
 */
import { StrokeModel } from '@grafloria/engine';
import { createDiagram } from './create-diagram';
import type { DiagramInstance } from './create-diagram';

const make = (): { container: HTMLElement; instance: DiagramInstance } => {
  const container = document.createElement('div');
  container.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  document.body.appendChild(container);
  const instance = createDiagram(container, { nodes: [{ id: 'a', label: 'A', position: { x: 0, y: 0 } }] });
  return { container, instance };
};

describe('loadText replaces whiteboard strokes', () => {
  const made: Array<{ container: HTMLElement; instance: DiagramInstance }> = [];
  const fresh = () => {
    const m = make();
    made.push(m);
    return m.instance;
  };
  afterEach(() => {
    for (const { instance, container } of made.splice(0)) {
      instance.dispose();
      container.remove();
    }
  });

  it('loading a different diagram with no ink clears the old ink', () => {
    const instance = fresh();
    instance.getModel().addStroke(new StrokeModel([{ x: 0, y: 0 }, { x: 50, y: 50 }]));
    instance.loadText('flowchart TD\n  X --> Y\n');
    expect(instance.getModel().getStrokes()).toHaveLength(0);
    expect(instance.getModel().getNodes().map((n) => n.id).sort()).toEqual(['X', 'Y']);
  });

  it('the lossless sidecar brings its ink to a fresh canvas', () => {
    const source = fresh();
    source.getModel().addStroke(new StrokeModel([{ x: 0, y: 0 }, { x: 50, y: 50 }], { color: '#d33', width: 4 }, { id: 'ink-1' }));
    const text = source.exportText();

    const target = fresh();
    target.loadText(text);
    const strokes = target.getModel().getStrokes();
    expect(strokes.map((s) => s.id)).toEqual(['ink-1']);
    expect(strokes[0].getPoints()).toHaveLength(2);
  });

  it('reloading the same text keeps exactly its ink (no duplicates), and removes ink drawn since', () => {
    const instance = fresh();
    instance.getModel().addStroke(new StrokeModel([{ x: 0, y: 0 }, { x: 50, y: 50 }], undefined, { id: 'ink-1' }));
    const text = instance.exportText();
    instance.getModel().addStroke(new StrokeModel([{ x: 9, y: 9 }, { x: 90, y: 90 }], undefined, { id: 'ink-2' }));
    instance.loadText(text);
    expect(instance.getModel().getStrokes().map((s) => s.id)).toEqual(['ink-1']);
  });

  it('a refused text leaves the ink alone', () => {
    const instance = fresh();
    instance.getModel().addStroke(new StrokeModel([{ x: 0, y: 0 }, { x: 50, y: 50 }]));
    expect(() => instance.loadText('flowchart TD\n  A[oops --> B\n')).toThrow();
    expect(instance.getModel().getStrokes()).toHaveLength(1);
  });
});
