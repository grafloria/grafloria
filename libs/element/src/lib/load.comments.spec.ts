/**
 * S5 (docs review v4): comments were lost on `render(fromDocument(saved))`.
 *
 * The saved document carries `comments` (threads, replies, anchors, status), but
 * the load never put them back: the reopened canvas had no threads and no pins,
 * and saving it again dropped the discussion for good. Like ink (08d294bc) and
 * groups, `finalize` now brings them back — into the comment store when the
 * canvas has one, into the live model either way.
 */
import type { DiagramInstance } from '@grafloria/renderer';
import { render } from './grafloria';
import { fromDocument } from './load';

function sizedHost(): HTMLElement {
  const el = document.createElement('div');
  Object.defineProperty(el, 'clientWidth', { value: 1200 });
  Object.defineProperty(el, 'clientHeight', { value: 800 });
  el.getBoundingClientRect = () =>
    ({ x: 0, y: 0, top: 0, left: 0, right: 1200, bottom: 800, width: 1200, height: 800 }) as DOMRect;
  document.body.appendChild(el);
  return el;
}

const nodes = [
  { id: 'design', label: 'Design', position: { x: 40, y: 60 }, size: { width: 130, height: 60 } },
  { id: 'review', label: 'Review', position: { x: 230, y: 60 }, size: { width: 130, height: 60 } },
];
const edges = [{ id: 'e1', source: 'design', target: 'review' }];

const mounted: DiagramInstance[] = [];
afterEach(() => {
  for (const api of mounted.splice(0)) api.dispose();
  document.body.innerHTML = '';
});

/** The discussion as a reader sees it: thread, anchor, status, every message. */
const discussion = (api: DiagramInstance) =>
  api
    .getCommentStore()!
    .threads({ includeResolved: true })
    .map((t) => ({
      id: t.id,
      anchor: t.anchor,
      resolved: t.resolved,
      messages: t.messages.map((m) => ({ author: m.author, body: m.body })),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

function discussed(): { api: DiagramInstance; saved: string; host: HTMLElement } {
  const host = sizedHost();
  const api = render({ nodes, edges }, host, { comments: true });
  mounted.push(api);
  const store = api.getCommentStore()!;
  const onNode = store.createThread({ kind: 'node', id: 'review' }, 'Can we tighten the copy?');
  store.reply(onNode, 'I can prepare a draft.');
  store.createThread({ kind: 'link', id: 'e1' }, 'Is this hand-off automatic?');
  const region = store.createThread({ kind: 'region', x: 500, y: 300, width: 80, height: 40 }, 'Room for a QA step');
  store.resolve(region);
  api.renderNow();
  return { api, host, saved: JSON.stringify(api.getModel().serialize()) };
}

describe('S5: comments round-trip through fromDocument', () => {
  it('threads, replies, anchors and status come back into the comment store', () => {
    const { api, saved, host: original } = discussed();
    expect(JSON.parse(saved).comments).toBeDefined();

    const host = sizedHost();
    const reopened = render(fromDocument(saved), host, { comments: true });
    mounted.push(reopened);
    reopened.renderNow();

    expect(discussion(reopened)).toEqual(discussion(api));
    expect(discussion(reopened)).toHaveLength(3);
    // …and the open threads are pinned on the canvas, like the original.
    const pins = original.querySelectorAll('.grafloria-comment-pin').length;
    expect(pins).toBeGreaterThan(0);
    expect(host.querySelectorAll('.grafloria-comment-pin').length).toBe(pins);
  });

  it('a canvas without the comments option still keeps them in the model, so a re-save keeps them', () => {
    const { saved } = discussed();
    const reopened = render(fromDocument(saved), sizedHost());
    mounted.push(reopened);
    expect(Object.keys(reopened.getModel().comments)).toHaveLength(3);
    expect(JSON.parse(JSON.stringify(reopened.getModel().serialize())).comments).toEqual(JSON.parse(saved).comments);
  });

  it('a second finalize does not duplicate or reset threads', () => {
    const { saved } = discussed();
    const spec = fromDocument(saved);
    const reopened = render(spec, sizedHost(), { comments: true });
    mounted.push(reopened);
    const store = reopened.getCommentStore()!;
    const [first] = store.threads();
    store.reply(first.id, 'Added after the load');
    spec.finalize(reopened);
    expect(store.thread(first.id)!.messages.map((m) => m.body)).toContain('Added after the load');
    expect(store.threads({ includeResolved: true })).toHaveLength(3);
  });
});
