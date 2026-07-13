// Wave 7 (Auto-layout) — Card 3: the bug that only a real Worker could find.
//
// The layout worker used to build EVERY built-in adapter the moment it started
// serving. Building them all means building ELK, and `new ELKLayoutAdapter()`
// calls elkjs's constructor, which spawns elkjs's OWN nested Worker. Inside a Web
// Worker that throws `_Worker is not a constructor` — so the layout worker died
// on the line that started it, before reading a single message, and every request
// to it hung forever. Not failed: HUNG. There was no error to see.
//
// Nothing caught it, because in Node — where the unit tests run — elkjs
// constructs perfectly happily. It appeared the instant a real Worker ran in a
// real browser, which is exactly the sin the deleted 750-line worker stack
// committed: it passed its tests and had never once been run.
//
// This file is the jest guard for it. ELK's constructor is mocked to throw the
// way it does inside a Worker; a `force` run must be entirely unbothered, because
// a lazy resolver never asks for an algorithm nobody wanted.

jest.mock('./elk-layout-adapter', () => ({
  ELKLayoutAdapter: class {
    readonly name = 'elk';
    constructor() {
      // Precisely what elkjs does inside a Worker.
      throw new TypeError('_Worker is not a constructor');
    }
  },
}));

import { LayoutHost } from './layout-host';
import type { LayoutGraph } from './layout-graph';
import { DEFAULT_LAYOUT_SEED } from './rng';

const graph: LayoutGraph = {
  nodes: [
    { id: 'a', type: 'basic', position: { x: 0, y: 0 }, size: { width: 10, height: 10 }, ports: [] },
    { id: 'b', type: 'basic', position: { x: 5, y: 5 }, size: { width: 10, height: 10 }, ports: [] },
    { id: 'c', type: 'basic', position: { x: 9, y: 1 }, size: { width: 10, height: 10 }, ports: [] },
  ],
  links: [{ id: 'a->b', sourceNodeId: 'a', targetNodeId: 'b' }],
};

describe('Card 3 — adapters are built lazily, by name', () => {
  it('a force run does not construct ELK — one bad adapter must not kill the worker', async () => {
    // If resolution were eager this would throw ELK's TypeError, and in a real
    // worker it would not even throw: it would hang, forever, with no message.
    const result = await new LayoutHost().run('force', graph, {
      seed: DEFAULT_LAYOUT_SEED,
      iterations: 5,
    });

    expect(result.nodePositions.size).toBe(3);
    expect(result.partial).toBe(false);
  });

  it('dagre likewise', async () => {
    const result = await new LayoutHost().run('dagre', graph, {});
    expect(result.nodePositions.size).toBe(3);
  });

  it('and if you DO ask for the broken one, it fails loudly and names itself', async () => {
    // The bare rethrow read "_Worker is not a constructor" — true, useless, and
    // silent about which of five algorithms had just detonated.
    await expect(new LayoutHost().run('elk', graph, {})).rejects.toThrow(
      /Layout 'elk' could not be constructed in this context/
    );
  });
});
