/**
 * Comment pins repaint ON THEIR OWN when comments change.
 *
 * The docs review found that a new thread showed no pin until something else
 * repainted (a hover). The overlay drops the cached frame on every store change,
 * but dropping the cache paints nothing: nobody asked the canvas for a frame.
 * The existing spec hid it by calling renderNow() right after createThread.
 * None of these may call renderNow().
 */
import { createDiagram } from './create-diagram';
import type { DiagramInstance } from './create-diagram';

beforeAll(() => {
  Element.prototype.getBoundingClientRect = function () {
    return { left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
  };
});

/** Wait for a real animation frame (the scheduler paints on rAF), then a macrotask. */
const frame = async () => {
  await new Promise((r) => requestAnimationFrame(() => r(undefined)));
  await new Promise((r) => setTimeout(r, 0));
};

describe('comment pins repaint on comment changes', () => {
  let container: HTMLElement;
  let instance: DiagramInstance;

  beforeEach(async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    instance = createDiagram(container, {
      nodes: [{ id: 'a', position: { x: 100, y: 100 }, size: { width: 120, height: 60 }, label: 'A' }],
      edges: [],
      comments: true,
    });
    await frame();
  });

  afterEach(() => {
    instance.dispose();
    container.remove();
  });

  const pin = (id: string) => container.querySelector(`[data-comment-thread-id="${id}"]`);

  it('a new thread shows its pin without any other repaint', async () => {
    const store = instance.getCommentStore()!;
    const id = store.createThread({ kind: 'node', id: 'a' } as never, 'looks wrong');
    await frame();
    expect(pin(id)).toBeTruthy();
  });

  it('a resolved thread loses its pin without any other repaint', async () => {
    const store = instance.getCommentStore()!;
    const id = store.createThread({ kind: 'node', id: 'a' } as never, 'looks wrong');
    await frame();
    expect(pin(id)).toBeTruthy();

    store.resolve(id);
    await frame();
    expect(pin(id)).toBeNull();
  });

  it('a re-anchored thread moves its pin without any other repaint', async () => {
    instance.setNodes([
      { id: 'a', position: { x: 100, y: 100 }, size: { width: 120, height: 60 }, label: 'A' },
      { id: 'b', position: { x: 500, y: 400 }, size: { width: 120, height: 60 }, label: 'B' },
    ]);
    await frame();
    const store = instance.getCommentStore()!;
    const id = store.createThread({ kind: 'node', id: 'a' } as never, 'move me');
    await frame();
    const before = pin(id)?.getAttribute('transform');
    expect(before).toBeTruthy();

    store.reanchor(id, { kind: 'node', id: 'b' } as never);
    await frame();
    const after = pin(id)?.getAttribute('transform');
    expect(after).toBeTruthy();
    expect(after).not.toBe(before);
  });
});
