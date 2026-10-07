import { component$, $, noSerialize, useSignal, type NoSerialize } from '@builder.io/qwik';
import { GrafloriaFlow, GrafloriaCommentPanel, type DiagramInstance } from '@grafloria/qwik';
import type { CommentStore } from '@grafloria/engine';
import { markReady } from '../ready';

const nodes = [
  { id: 'design', position: { x: 80, y: 120 },  size: { width: 150, height: 66 }, data: { label: 'Design' } },
  { id: 'review', position: { x: 330, y: 120 }, size: { width: 150, height: 66 }, data: { label: 'Review' } },
  { id: 'ship',   position: { x: 580, y: 120 }, size: { width: 150, height: 66 }, data: { label: 'Ship' } },
];
const edges = [
  { id: 'e1', source: 'design', target: 'review' },
  { id: 'e2', source: 'review', target: 'ship' },
];

/** Resolve once the comment panel has mounted inside `root` — it subscribes to
 *  the store in the same tick it mounts. Gives up after ~2 s rather than hang. */
function panelBound(root: HTMLElement | undefined): Promise<void> {
  return new Promise((resolve) => {
    let frames = 0;
    const poll = () => {
      if (root?.querySelector('[data-grafloria-comment-panel]') || ++frames > 120) resolve();
      else requestAnimationFrame(poll);
    };
    poll();
  });
}

/** Anchored comment threads: comments turns the capability on; the
 *  conversation panel binds to the canvas's own CommentStore.
 *
 *  The thread is seeded AFTER the panel binds: the panel paints on store
 *  changes, so a thread created before it mounted would only appear on the
 *  next change. */
export default component$(() => {
  const root = useSignal<HTMLDivElement>();
  // The store is a live object with subscribers — noSerialize keeps it out of state.
  const store = useSignal<NoSerialize<CommentStore>>();
  return (
    <div ref={root} style={{ display: 'flex', height: '100vh' }}>
      <GrafloriaFlow
        defaultNodes={nodes}
        defaultEdges={edges}
        comments
        style={{ flex: '1' }}
        onInit$={$(async (instance: DiagramInstance) => {
          const s = instance.getCommentStore();
          if (s) {
            store.value = noSerialize(s);
            await panelBound(root.value);
            const t = s.createThread({ kind: 'node', id: 'review' }, 'Can we tighten the hero copy?');
            s.reply(t, 'On it — draft by Friday.');
          }
          markReady();
        })}
      />
      {store.value && (
        <div style={{ width: '300px', borderLeft: '1px solid #E3E7F2', overflow: 'auto' }}>
          <GrafloriaCommentPanel store={store.value} />
        </div>
      )}
    </div>
  );
});
