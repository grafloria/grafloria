/**
 * DiagramInstance comments seam — `comments: true` wires a CommentStore and
 * the overlay, so anchored pins render inside the VNode tree.
 */
import { createDiagram } from './create-diagram';

beforeAll(() => {
  Element.prototype.getBoundingClientRect = function () {
    return { left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
  };
});

describe('instance comments', () => {
  let container: HTMLElement;
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });
  afterEach(() => container.remove());

  it('comments: true exposes a store, and a thread renders a pin on its node', () => {
    const instance = createDiagram(container, {
      nodes: [{ id: 'a', position: { x: 100, y: 100 }, size: { width: 120, height: 60 }, label: 'A' }],
      edges: [],
      comments: true,
    });
    const store = instance.getCommentStore()!;
    expect(store).toBeTruthy();

    const threadId = store.createThread({ kind: 'node', id: 'a' } as never, 'looks wrong');
    instance.renderNow();
    const pin = container.querySelector(`[data-comment-thread-id="${threadId}"]`);
    expect(pin).toBeTruthy();
    instance.dispose();
  });

  it('without the option there is no store', () => {
    const instance = createDiagram(container, { nodes: [], edges: [] });
    expect(instance.getCommentStore()).toBeNull();
    instance.dispose();
  });
});
