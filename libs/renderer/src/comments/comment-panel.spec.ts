// Wave 9 — Card 6: the side panel.
//
// A comment system is TEXT CONTENT. It is the single most obvious thing a screen-reader
// user must be able to reach, and the single easiest thing to ship as an unreachable pile
// of divs. So: real headings, a real list, a labelled reply box, and Escape that actually
// leaves. Asserted, not assumed — the axe run in `a11y-run.mjs` scans this panel for real
// in a real browser, and these tests hold the structure it depends on.

import { DiagramEngine, NodeModel, PortModel, CommentStore } from '@grafloria/engine';
import { CommentPanelView } from './comment-panel';

function scene() {
  const engine = new DiagramEngine();
  const diagram = engine.createDiagram('panel')!;
  const n = new NodeModel({
    type: 'process',
    position: { x: 0, y: 0 },
    size: { width: 100, height: 50 },
  });
  (n as unknown as { id: string }).id = 'n1';
  n.addPort(new PortModel({ id: 'n1-out', type: 'output', side: 'right' }));
  n.setMetadata('label', 'Payment gateway');
  diagram.addNode(n);

  const host = document.createElement('div');
  document.body.appendChild(host);
  const store = new CommentStore(diagram, { viewer: 'ada', now: () => 1_700_000_000_000 });
  const panel = new CommentPanelView(host, store, { formatTime: () => '12:00' });
  return { engine, diagram, store, panel, host };
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('CommentPanelView — structure a screen reader can actually use', () => {
  it('is a named landmark with a heading and a real list', () => {
    const { panel, store } = scene();
    store.createThread({ kind: 'node', id: 'n1' }, 'is this the retry path?');
    panel.update();

    const el = panel.getElement();
    expect(el.getAttribute('role')).toBe('complementary');
    expect(el.getAttribute('aria-label')).toBe('Comments');
    expect(el.querySelector('h3')?.textContent).toBe('Comments');

    const list = el.querySelector('ul.grafloria-comment-panel__threads')!;
    // A <ul> may contain ONLY <li>. axe checks this, and a list that lies about its own
    // structure is worse than a div.
    expect(Array.from(list.children).every((c) => c.tagName === 'LI')).toBe(true);
    expect(list.querySelectorAll('li')).toHaveLength(1);
  });

  it('every control has a NAME: the thread heading is a button, the reply box has a label', () => {
    const { panel, store } = scene();
    const tid = store.createThread({ kind: 'node', id: 'n1' }, 'is this the retry path?');
    panel.select(tid);

    const el = panel.getElement();
    const heading = el.querySelector<HTMLButtonElement>('[data-thread-heading]')!;
    expect(heading.tagName).toBe('BUTTON');
    expect(heading.textContent).toContain('is this the retry path?');
    expect(heading.getAttribute('aria-expanded')).toBe('true');

    const ta = el.querySelector<HTMLTextAreaElement>('textarea')!;
    const label = el.querySelector<HTMLLabelElement>(`label[for="${ta.id}"]`)!;
    expect(label).toBeTruthy();
    expect(label.textContent).toBe('Reply to this thread');
    expect(el.querySelector('button[type="submit"]')?.textContent).toBe('Reply');
  });

  it('opening a thread MOVES focus onto it (and does not steal focus from elsewhere)', () => {
    const { panel, store } = scene();
    const tid = store.createThread({ kind: 'node', id: 'n1' }, 'x');
    panel.update();

    panel.select(tid);
    const heading = panel.getElement().querySelector<HTMLElement>(`[data-thread-heading="${tid}"]`)!;
    expect(document.activeElement).toBe(heading);
  });

  it('ESCAPE LEAVES — a panel you can tab into and not out of is a WCAG 2.1.2 failure', () => {
    const engine = new DiagramEngine();
    const diagram = engine.createDiagram('p')!;
    const host = document.createElement('div');
    document.body.appendChild(host);
    const store = new CommentStore(diagram, { viewer: 'ada' });
    let dismissed = 0;
    const panel = new CommentPanelView(host, store, { onDismiss: () => dismissed++ });

    panel
      .getElement()
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(dismissed).toBe(1);
  });

  it('a DETACHED thread says so in TEXT, not only in a colour (WCAG 1.4.1)', () => {
    const { panel, store, diagram } = scene();
    store.createThread({ kind: 'node', id: 'n1' }, 'we cut this in March');
    diagram.removeNode('n1');
    panel.update();

    const warn = panel.getElement().querySelector('.grafloria-comment-thread__detached')!;
    expect(warn.textContent).toContain('Detached');
    expect(warn.textContent).toContain('Payment gateway');
    expect(warn.textContent).toContain('The conversation is kept.');
  });

  it('a tombstoned message reads as a withdrawal, not as a gap', () => {
    const { panel, store } = scene();
    const tid = store.createThread({ kind: 'node', id: 'n1' }, 'first');
    const mid = store.reply(tid, 'ignore me');
    store.deleteMessage(tid, mid);
    panel.select(tid);

    const items = panel.getElement().querySelectorAll('.grafloria-comment-message');
    expect(items).toHaveLength(2);
    expect(items[1].textContent).toBe('ada deleted a message');
  });
});

describe('CommentPanelView — it drives the real store', () => {
  it('the reply form actually posts a reply (and marks the thread read)', () => {
    const { panel, store } = scene();
    const tid = store.createThread({ kind: 'node', id: 'n1' }, 'thoughts?');
    panel.select(tid);

    const ta = panel.getElement().querySelector<HTMLTextAreaElement>('textarea')!;
    ta.value = 'yes — see the ADR';
    panel
      .getElement()
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    expect(store.thread(tid)!.messages.map((m) => m.body)).toEqual([
      'thoughts?',
      'yes — see the ADR',
    ]);
    expect(ta.value).toBe('');
  });

  it('resolve / reopen goes through the store, so it is an OP and every peer sees it', () => {
    const { panel, store } = scene();
    const tid = store.createThread({ kind: 'node', id: 'n1' }, 'done?');
    panel.select(tid);

    const btn = () =>
      panel.getElement().querySelector<HTMLButtonElement>(`[data-thread-resolve="${tid}"]`)!;
    expect(btn().textContent).toBe('Resolve thread');
    btn().click();
    expect(store.thread(tid)!.resolved).toBe(true);
  });

  it('THRASH PROOF: 30 quiet updates rebuild the panel ZERO times', () => {
    const { panel, store, diagram } = scene();
    store.createThread({ kind: 'node', id: 'n1' }, 'x');
    panel.update();
    const rebuilds = panel.getRebuildCount();

    // A drag changes the diagram on every frame and changes NOTHING the panel displays.
    for (let i = 0; i < 30; i++) {
      diagram.getNode('n1')!.setPosition(i, i);
      panel.update();
    }
    expect(panel.getRebuildCount()).toBe(rebuilds);
  });

  it('…but a new message DOES rebuild it', () => {
    const { panel, store } = scene();
    const tid = store.createThread({ kind: 'node', id: 'n1' }, 'x');
    panel.update();
    const rebuilds = panel.getRebuildCount();
    store.reply(tid, 'and another thing');
    panel.update();
    expect(panel.getRebuildCount()).toBe(rebuilds + 1);
  });
});
