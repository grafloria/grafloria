// One bad custom node must not take the canvas down with it.
//
// A `renderCustomNode` that threw SYNCHRONOUSLY propagated straight out of the
// mount paint — which runs before `const instance` is built — so createDiagram()
// never returned. The caller got an exception instead of a diagram, and with no
// handle there was no way to dispose the instance that had, in fact, been
// created: its ResizeObserver went on driving the viewport, and retrying the
// call (a React error boundary, or StrictMode's double-invoke) stacked more
// undisposable instances into the same container.
//
// The async path already contained a rejecting painter — same failure map, same
// export warning. This is the sync half of that same contract.

import { createDiagram } from './create-diagram';
import type { DiagramInstance } from './create-diagram';
import type { NodeSpec } from './model-input';

const NODES: NodeSpec[] = [
  { id: 'n1', position: { x: 0, y: 0 }, size: { width: 100, height: 60 }, label: 'A', custom: true },
  { id: 'n2', position: { x: 160, y: 0 }, size: { width: 100, height: 60 }, label: 'B', custom: true },
  { id: 'n3', position: { x: 320, y: 0 }, size: { width: 100, height: 60 }, label: 'C', custom: true },
];

describe('a custom-node painter that throws', () => {
  let container: HTMLElement;
  let diagram: DiagramInstance | undefined;

  beforeEach(() => {
    container = document.createElement('div');
    container.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600 }) as DOMRect;
    document.body.appendChild(container);
  });

  afterEach(() => {
    diagram?.dispose();
    diagram = undefined;
    container.remove();
  });

  it('still returns an instance the caller can dispose', () => {
    expect(() => {
      diagram = createDiagram(container, {
        nodes: NODES,
        edges: [],
        renderCustomNode: (node) => {
          if (node.id === 'n2') throw new Error('boom');
        },
      });
    }).not.toThrow();

    expect(diagram).toBeDefined();
    expect(() => diagram!.dispose()).not.toThrow();
    diagram = undefined;
  });

  it('paints the OTHER custom nodes — one failure is not a blank canvas', () => {
    const painted: string[] = [];
    diagram = createDiagram(container, {
      nodes: NODES,
      edges: [],
      renderCustomNode: (node, host) => {
        painted.push(node.id);
        if (node.id === 'n2') throw new Error('boom');
        host.textContent = node.id;
      },
    });

    // Every painter was called, and the two good ones drew.
    expect(painted).toEqual(['n1', 'n2', 'n3']);
    const hosts = Array.from(container.querySelectorAll('.grafloria-node-host'));
    expect(hosts.map((h) => h.textContent).filter(Boolean).sort()).toEqual(['n1', 'n3']);
  });

  it('retrying into the same container does not stack undisposable instances', () => {
    // The React-retry / StrictMode shape. Each failed attempt used to leave a
    // live instance behind, so five attempts meant five stacked SVG roots.
    const made: DiagramInstance[] = [];
    for (let i = 0; i < 3; i++) {
      const d = createDiagram(container, {
        nodes: NODES,
        edges: [],
        renderCustomNode: () => {
          throw new Error('boom');
        },
      });
      made.push(d);
    }

    expect(made).toHaveLength(3);
    for (const d of made) d.dispose();

    // Disposing every handle leaves the container empty — which is only possible
    // because every attempt HANDED BACK a handle.
    expect(container.querySelectorAll('svg').length).toBe(0);
  });

  it('reports the failure in an export warning rather than swallowing it', () => {
    diagram = createDiagram(container, {
      nodes: NODES,
      edges: [],
      renderCustomNode: (node) => {
        if (node.id === 'n2') throw new Error('painter exploded');
      },
    });

    const warnings: string[] = [];
    diagram.exportSvgString({ onWarnings: (w) => warnings.push(...w) });

    expect(warnings.join(' ')).toContain('painter exploded');
  });
});
