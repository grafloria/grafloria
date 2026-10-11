/**
 * S5 (docs review v4), the text sibling: `exportText()`'s lossless sidecar
 * carries the document's `comments`, so `loadText()` brings the threads back —
 * replaced like the ink: plain text carries none and clears them.
 */
import { createDiagram } from './create-diagram';
import type { DiagramInstance } from './create-diagram';

const made: Array<{ container: HTMLElement; instance: DiagramInstance }> = [];
function fresh(comments = true): DiagramInstance {
  const container = document.createElement('div');
  container.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  document.body.appendChild(container);
  const instance = createDiagram(container, {
    nodes: [{ id: 'a', label: 'A', position: { x: 0, y: 0 } }],
    comments,
  });
  made.push({ container, instance });
  return instance;
}
afterEach(() => {
  for (const { instance, container } of made.splice(0)) {
    instance.dispose();
    container.remove();
  }
});

describe('loadText brings comment threads back', () => {
  it('the lossless sidecar restores threads, replies and anchors on another canvas', () => {
    const source = fresh();
    const store = source.getCommentStore()!;
    const t = store.createThread({ kind: 'node', id: 'a' }, 'Why A?');
    store.reply(t, 'Because.');
    store.createThread({ kind: 'region', x: 300, y: 200 }, 'Empty corner');
    const text = source.exportText();

    const target = fresh();
    target.loadText(text);
    const threads = target.getCommentStore()!.threads();
    expect(threads.map((x) => x.messages.map((m) => m.body)).sort()).toEqual([['Empty corner'], ['Why A?', 'Because.']]);
    expect(threads.find((x) => x.anchor.kind === 'node')?.anchor).toMatchObject({ kind: 'node', id: 'a' });

    // A canvas without a store still keeps them in the model.
    const bare = fresh(false);
    bare.loadText(text);
    expect(Object.keys(bare.getModel().comments)).toHaveLength(2);
  });

  it('plain text (no sidecar) clears the old threads, like it clears the ink', () => {
    const instance = fresh();
    instance.getCommentStore()!.createThread({ kind: 'node', id: 'a' }, 'old');
    instance.loadText('flowchart LR\n  x --> y\n');
    expect(instance.getCommentStore()!.threads({ includeResolved: true })).toHaveLength(0);
  });
});
