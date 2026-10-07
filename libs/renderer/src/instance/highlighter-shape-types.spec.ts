/**
 * The outline layer (`highlighterConfig: true`) does not flag BUILT-IN SHAPES.
 *
 * The engine's ValidationEngine reports every node whose `type` is not in its
 * TypeRegistry as "Node type '…' is not registered" — including the shapes the
 * renderer draws: `rect` (every node spec's default), `ellipse`, `diamond`, …
 * So every plain node wore the amber warning outline. Angular's canvas dropped
 * exactly that warning when the renderer has a shape for the type (f2466582);
 * the shared canvas does the same. A type nobody can draw is still flagged.
 */
import { createDiagram } from './create-diagram';
import type { DiagramInstance } from './create-diagram';

const tick = () => jest.advanceTimersByTime(32);

describe('outline layer — built-in shapes are not "unregistered types"', () => {
  let container: HTMLElement;
  let diagram: DiagramInstance;
  const warnings = () => Array.from(container.querySelectorAll('.grafloria-highlighter-validation'));

  beforeEach(() => {
    jest.useFakeTimers();
    container = document.createElement('div');
    container.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600 }) as DOMRect;
    document.body.appendChild(container);
  });
  afterEach(() => {
    diagram?.dispose();
    container.remove();
    jest.useRealTimers();
  });

  it('plain nodes (type rect by default) and other built-in shapes draw no warning outline', () => {
    diagram = createDiagram(container, {
      nodes: [
        { id: 'a', position: { x: 100, y: 100 }, size: { width: 120, height: 60 }, label: 'A' },
        { id: 'b', type: 'ellipse', position: { x: 300, y: 100 }, size: { width: 120, height: 60 }, label: 'B' },
        { id: 'c', type: 'diamond', position: { x: 500, y: 100 }, size: { width: 120, height: 60 }, label: 'C' },
      ],
      edges: [{ source: 'a', target: 'b' }],
      highlighterConfig: true,
    } as never);
    tick();
    expect(warnings()).toHaveLength(0);
  });

  it('a type no registry and no shape knows is still flagged', () => {
    diagram = createDiagram(container, {
      nodes: [
        { id: 'a', position: { x: 100, y: 100 }, size: { width: 120, height: 60 }, label: 'A' },
        { id: 'x', type: 'no-such-type-anywhere', position: { x: 300, y: 100 }, size: { width: 120, height: 60 }, label: 'X' },
      ],
      highlighterConfig: true,
    } as never);
    tick();
    expect(warnings()).toHaveLength(1);
  });
});
