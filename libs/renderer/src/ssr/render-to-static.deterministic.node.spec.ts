/**
 * @jest-environment node
 *
 * C13 (docs review v3): `renderToStaticSVG` in a Next 16 server component failed to
 * prerender under the default `cacheComponents`, because building the model read the
 * CLOCK (`Date.now()` in every entity constructor) — and Next refuses a prerender
 * that reads the clock or a random source outside a cache boundary. The same goes
 * for the random ids every entity mints (nanoid / uuid → crypto).
 *
 * The guard is simulated here the way Next applies it: every clock and random
 * source THROWS for the length of the call. A static render must not touch any of
 * them — and must therefore also be byte-for-byte reproducible.
 */
import * as nanoidModule from 'nanoid';
import * as uuidModule from 'uuid';
import { NodeModel } from '@grafloria/engine';
import { renderToStaticSVG } from './render-to-static';
import type { EdgeSpec, NodeSpec } from '../instance/model-input';

const NODES: NodeSpec[] = [
  { id: 'a', position: { x: 80, y: 90 }, size: { width: 140, height: 60 }, label: 'Start' },
  { id: 'b', position: { x: 420, y: 260 }, size: { width: 140, height: 60 }, label: 'End' },
];
const EDGES: EdgeSpec[] = [{ id: 'e1', source: 'a', target: 'b', type: 'orthogonal' }];

function guardNondeterminism(): () => void {
  const boom = (what: string) => () => {
    throw new Error(`prerender guard: ${what} was read during a static render`);
  };
  const spies: Array<{ mockRestore(): void }> = [
    jest.spyOn(Date, 'now').mockImplementation(boom('Date.now()')),
    jest.spyOn(Math, 'random').mockImplementation(boom('Math.random()')),
    jest.spyOn(nanoidModule, 'nanoid').mockImplementation(boom('nanoid (crypto)')),
    jest.spyOn(uuidModule, 'v4').mockImplementation(boom('uuid v4 (crypto)')),
  ];
  const c = globalThis.crypto as Crypto | undefined;
  if (c) {
    spies.push(jest.spyOn(c, 'getRandomValues').mockImplementation(boom('crypto.getRandomValues()') as never));
    if (typeof c.randomUUID === 'function') {
      spies.push(jest.spyOn(c, 'randomUUID').mockImplementation(boom('crypto.randomUUID()') as never));
    }
  }
  return () => spies.forEach((s) => s.mockRestore());
}

describe('renderToStaticSVG reads no clock and no random source (C13)', () => {
  it('renders under a guard that throws on Date.now / Math.random / crypto / random ids', () => {
    const release = guardNondeterminism();
    try {
      expect(() =>
        renderToStaticSVG({ nodes: NODES, edges: EDGES, fitView: true, width: 640, height: 400 })
      ).not.toThrow();
      // …with the rest of a typical page too: a labelled edge, a group frame, shapes.
      expect(() =>
        renderToStaticSVG({
          nodes: [
            ...NODES,
            { id: 'c', position: { x: 80, y: 300 }, size: { width: 100, height: 100 }, label: 'Gate', shape: { type: 'diamond' } } as NodeSpec,
          ],
          edges: [...EDGES, { id: 'e2', source: 'a', target: 'c', label: 'maybe' }],
          groups: [{ id: 'g', label: 'Zone', children: ['a', 'b'], padding: 30 }] as never,
          fitView: true,
        })
      ).not.toThrow();
    } finally {
      release();
    }
  });

  it('is byte-for-byte reproducible', () => {
    const a = renderToStaticSVG({ nodes: NODES, edges: EDGES });
    const b = renderToStaticSVG({ nodes: NODES, edges: EDGES });
    expect(a.html).toBe(b.html);
    expect(a.svg).toBe(b.svg);
  });

  it('only the static render is deterministic — live models still mint random ids', () => {
    renderToStaticSVG({ nodes: NODES, edges: EDGES });
    const spy = jest.spyOn(nanoidModule, 'nanoid');
    const first = new NodeModel({ type: 'basic', position: { x: 0, y: 0 } });
    const second = new NodeModel({ type: 'basic', position: { x: 0, y: 0 } });
    expect(spy).toHaveBeenCalled();
    expect(first.id).not.toBe(second.id);
    spy.mockRestore();
  });
});
