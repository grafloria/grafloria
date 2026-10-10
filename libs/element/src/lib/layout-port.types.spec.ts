/**
 * Off-thread layout, as a reader writes it: a real `Worker` handed straight to
 * `setLayoutPort()`, and the worker's own `self` handed to `serveLayout()`.
 *
 * A COMPILE-TIME test first (ts-jest type-checks this file under `strict` with
 * the DOM lib): `Worker` and `self` must be assignable to the port types with
 * no cast. They were not — the handler was typed `(ev: { data }) => void` and
 * the DOM's handlers take a `MessageEvent`, so TS2345 sent every reader to the
 * `as unknown as LayoutPort` the library's own JSDoc used.
 */
import { render, serveLayout, type LayoutPort, type LayoutServePort } from '../index';

// The DOM types, exactly — not structural look-alikes.
type MainSide = Pick<Worker, 'postMessage' | 'onmessage'>;
type WorkerSide = Pick<typeof self, 'postMessage' | 'onmessage'>;

describe('the layout ports take the DOM objects without a cast', () => {
  it('a Worker is a LayoutPort, and self is a LayoutServePort (compile time)', () => {
    const accept = (worker: Worker, scope: typeof self): [LayoutPort, LayoutServePort] => [worker, scope];
    const assign = (m: MainSide, w: WorkerSide): [LayoutPort, LayoutServePort] => [m, w];
    expect(typeof accept).toBe('function');
    expect(typeof assign).toBe('function');
    expect(typeof serveLayout).toBe('function');
  });

  it('a Worker-typed port runs a layout through setLayoutPort (runtime)', async () => {
    // jsdom has no Worker (nor MessageChannel): two ends that deliver on a
    // timer stand in, the main end typed as the DOM Worker so the call below is
    // the reader's line, cast-free.
    type End = { postMessage(msg: unknown): void; onmessage: ((ev: { data: unknown }) => unknown) | null };
    const workerSide: End = { postMessage: (msg) => setTimeout(() => main.onmessage?.({ data: msg })), onmessage: null };
    let posted = 0;
    const main: End = { postMessage: (msg) => (posted++, setTimeout(() => workerSide.onmessage?.({ data: msg }))), onmessage: null };
    serveLayout(workerSide as unknown as typeof self);
    const worker = main as unknown as Worker;

    const host = document.createElement('div');
    document.body.appendChild(host);
    const instance = render(
      {
        nodes: [
          { id: 'a', position: { x: 0, y: 0 }, size: { width: 80, height: 40 } },
          { id: 'b', position: { x: 0, y: 0 }, size: { width: 80, height: 40 } },
        ],
        edges: [{ id: 'e', source: 'a', target: 'b' }],
      },
      host
    );
    instance.getEngine().setLayoutPort(worker);
    await instance.getEngine().layout('force', { seed: 7, iterations: 40 });
    const [a, b] = ['a', 'b'].map((id) => instance.getModel().getNode(id)!.position);
    expect(a!.x !== b!.x || a!.y !== b!.y).toBe(true);
    expect(posted).toBeGreaterThan(0); // it ran through the port, not inline
    instance.dispose();
    host.remove();
  });
});
