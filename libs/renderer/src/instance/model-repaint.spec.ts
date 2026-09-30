/**
 * A change made to the model IN CODE paints on the next frame — with no other
 * event to wake the renderer.
 *
 * The instance repaints on the model's events, but only on the ones it lists.
 * Ink was never listed: `addStroke` from code (a saved board loaded, the eraser
 * demo's seeded lines, a collaborator's stroke arriving through
 * `applyIncremental`) stayed invisible until the user happened to touch the
 * canvas. The pen looked fine because the draw tool asks for its own repaint.
 * The bulk clears (`clearNodes/Links/Groups/Strokes`) were missing the same way.
 * Found by the gallery's thumbnail gate: the eraser demo's card was blank.
 */
import { createDiagram } from './create-diagram';
import type { DiagramInstance } from './create-diagram';
import { StrokeModel } from '@grafloria/engine';

const WIDTH = 800;
const HEIGHT = 600;

function makeContainer(): HTMLElement {
  const el = document.createElement('div');
  el.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: WIDTH, height: HEIGHT, right: WIDTH, bottom: HEIGHT }) as DOMRect;
  document.body.appendChild(el);
  return el;
}

/** Run every queued frame — and nothing else. */
const tick = () => jest.advanceTimersByTime(32);
const ink = (id: string, y: number) => new StrokeModel([{ x: 100, y }, { x: 300, y }, { x: 500, y }], { color: '#1f2933', width: 4 }, { id });

describe('a model change made in code paints on the next frame', () => {
  let container: HTMLElement;
  let diagram: DiagramInstance;
  const count = (sel: string) => container.querySelectorAll(sel).length;

  beforeEach(() => {
    jest.useFakeTimers();
    container = makeContainer();
    diagram = createDiagram(container, {
      nodes: [
        { id: 'a', position: { x: 100, y: 100 }, size: { width: 120, height: 60 }, label: 'A' },
        { id: 'b', position: { x: 400, y: 100 }, size: { width: 120, height: 60 }, label: 'B' },
      ],
      edges: [{ source: 'a', target: 'b' }],
      groups: [{ id: 'g', label: 'G', children: ['a'] }],
    } as never);
    tick();
  });

  afterEach(() => {
    diagram.dispose();
    container.remove();
    jest.useRealTimers();
  });

  it('addStroke — seeded or loaded ink shows without a pointer touching the canvas', () => {
    diagram.getModel().addStroke(ink('s1', 120));
    diagram.getModel().addStroke(ink('s2', 240));
    tick();
    expect(count('[data-stroke-id]')).toBe(2);
  });

  it('removeStroke and clearStrokes — erased ink leaves the page', () => {
    const m = diagram.getModel();
    m.addStroke(ink('s1', 120));
    m.addStroke(ink('s2', 240));
    tick();
    m.removeStroke('s1');
    tick();
    expect(count('[data-stroke-id]')).toBe(1);
    m.clearStrokes();
    tick();
    expect(count('[data-stroke-id]')).toBe(0);
  });

  it("applyIncremental — a collaborator's stroke arrives and shows", () => {
    const m = diagram.getModel();
    m.applyIncremental({
      format: 'grafloria-incremental',
      schemaVersion: 1,
      baseVersion: m.version,
      targetVersion: m.version + 1,
      added: { nodes: [], links: [], groups: [], strokes: [ink('remote', 300).serialize()] },
      removed: { nodes: [], links: [], groups: [] },
      modified: { nodes: [], links: [], groups: [] },
    } as never);
    tick();
    expect(count('[data-stroke-id="remote"]')).toBe(1);
  });

  it('clearNodes / clearLinks / clearGroups — a bulk clear empties the page', () => {
    const m = diagram.getModel();
    expect([count('[data-node-id]') > 0, count('[data-link-id]') > 0, count('[data-group-id]') > 0]).toEqual([true, true, true]);
    m.clearLinks();
    tick();
    expect(count('[data-link-id]')).toBe(0);
    m.clearGroups();
    tick();
    expect(count('[data-group-id]')).toBe(0);
    m.clearNodes();
    tick();
    expect(count('[data-node-id]')).toBe(0);
  });
});
