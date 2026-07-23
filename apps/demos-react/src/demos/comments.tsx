import { useState } from 'react';
import { GrafloriaFlow, GrafloriaCommentPanel } from '@grafloria/react';
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

/** Anchored comment threads: comments turns the capability on; the
 *  conversation panel binds to the canvas's own CommentStore. */
export default function CommentsDemo() {
  const [store, setStore] = useState<CommentStore | null>(null);
  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      <GrafloriaFlow
        defaultNodes={nodes}
        defaultEdges={edges}
        comments
        style={{ flex: 1 }}
        onInit={(instance) => {
          const s = instance.getCommentStore();
          if (s) {
            const t = s.createThread({ kind: 'node', id: 'review' }, 'Can we tighten the hero copy?');
            s.reply(t, 'On it — draft by Friday.');
            setStore(s);
          }
          markReady();
        }}
      />
      {store && (
        <div style={{ width: 300, borderLeft: '1px solid #E3E7F2', overflow: 'auto' }}>
          <GrafloriaCommentPanel store={store} />
        </div>
      )}
    </div>
  );
}
