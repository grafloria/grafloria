/**
 * S5 (docs review v4): a loaded document's comments go back on the live diagram.
 * `adoptComments` merges (or, for a whole-document load, replaces); the store's
 * `adopt` does the same and treats every adopted @mention as history, not news.
 */
import { DiagramModel } from '../models/DiagramModel';
import { NodeModel } from '../models/NodeModel';
import { CommentStore, adoptComments } from './comment-store';
import type { MentionEvent } from './mentions';

function saved(): DiagramModel {
  const d = new DiagramModel('src');
  d.addNode(new NodeModel({ id: 'n1', type: 'basic', position: { x: 0, y: 0 } }));
  const store = new CommentStore(d, { viewer: 'ada' });
  const t = store.createThread({ kind: 'node', id: 'n1' }, 'Ping @bob about this');
  store.reply(t, 'And @carol too');
  return d;
}

describe('adoptComments / CommentStore.adopt', () => {
  it('merges loaded threads into a live diagram and keeps a thread it already has', () => {
    const src = saved();
    const live = new DiagramModel('live');
    live.addNode(new NodeModel({ id: 'n1', type: 'basic', position: { x: 0, y: 0 } }));
    expect(adoptComments(live, src.comments)).toBe(true);
    expect(live.comments).toEqual(src.comments);
    expect(live.comments).not.toBe(src.comments);

    const store = new CommentStore(live, { viewer: 'bob' });
    const [thread] = store.threads();
    store.reply(thread.id, 'Done');
    expect(adoptComments(live, src.comments)).toBe(false);
    expect(store.thread(thread.id)!.messages.map((m) => m.body)).toContain('Done');
  });

  it('replace: a whole-document load swaps the threads, and an empty load clears them', () => {
    const live = saved();
    expect(adoptComments(live, {}, { replace: true })).toBe(true);
    expect(live.comments).toEqual({});
    expect(adoptComments(live, {}, { replace: true })).toBe(false);
  });

  it('the store announces the adopted threads but never notifies their old @mentions', () => {
    const src = saved();
    const live = new DiagramModel('live');
    live.addNode(new NodeModel({ id: 'n1', type: 'basic', position: { x: 0, y: 0 } }));
    const fired: MentionEvent[] = [];
    const store = new CommentStore(live, { viewer: 'bob', notifier: { notify: (e) => fired.push(e) } });
    let changes = 0;
    store.onChange(() => changes++);
    expect(store.adopt(src.comments)).toBe(true);
    expect(store.threads()).toHaveLength(1);
    expect(store.threads()[0].messages).toHaveLength(2);
    expect(changes).toBeGreaterThan(0);
    expect(fired).toEqual([]);
  });
});
