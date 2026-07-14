// Wave 9 — Card 6: the comment side PANEL.
//
// ===========================================================================
// WHY THIS IS HTML AND NOT SVG
// ===========================================================================
// The pin in the canvas is a POINTER. The conversation is TEXT — paragraphs, authors,
// timestamps, a reply box — and text is what HTML is for. Rendering a threaded discussion
// inside SVG would mean hand-rolling line wrapping, and it would hand a screen-reader user
// a pile of `<text>` elements with no headings, no list semantics, no form controls and no
// focus order. The panel is therefore ordinary DOM: `<article>`s with headings, an
// ordinary `<ul>` of messages, and a real `<form>` with a labelled `<textarea>`.
//
// That is not a concession. It is the thing that makes the feature reachable at all: an
// AT user browses the panel with the same list/heading keys they use on every other page
// in the world, and the canvas keeps its ONE tab stop.
//
// ===========================================================================
// NOT A KEYBOARD TRAP — the failure this kind of panel ships with
// ===========================================================================
// Everything focusable is in natural DOM order; nothing is trapped, nothing is aria-hidden
// while focused, and ESCAPE always leaves (onDismiss → the host returns focus to the
// canvas). Focus is MOVED, never stolen: opening a thread focuses its heading (which is
// `tabindex=-1`, i.e. programmatically focusable but not in the Tab sequence), so a
// keyboard user lands on the conversation they just opened instead of at the top of a list
// they have to walk again.
//
// THRASH CONTROL, same discipline as the outline mirror: `update()` is safe to call every
// frame. It compares a SIGNATURE and returns immediately when nothing that appears in the
// panel has changed. `getRebuildCount()` exists so a test can prove that rather than
// believe it.

import type { CommentStore, CommentThreadView } from '@grafloria/engine';

export interface CommentPanelOptions {
  /** Accessible name of the region. */
  label?: string;
  /** Show resolved threads too. Default false — a resolved thread is an answered one. */
  showResolved?: boolean;
  /** Called when the user picks a thread (the host selects it and pans to it). */
  onSelect?: (threadId: string | null) => void;
  /** Called on Escape. The host MUST return focus to the canvas. */
  onDismiss?: () => void;
  /** Render a wall-clock timestamp. Injectable so tests are not clock-dependent. */
  formatTime?: (ms: number) => string;
}

/** The panel's own signature: everything it DISPLAYS, and nothing it does not. */
function panelSignature(threads: readonly CommentThreadView[], selected: string | null): string {
  return (
    selected +
    '|' +
    threads
      .map(
        (t) =>
          `${t.id}:${t.resolved ? 'r' : 'o'}:${t.unread}:${t.resolvedAnchor.attached ? 'a' : 'd'}:` +
          `${t.resolvedAnchor.targetLabel}:` +
          t.messages.map((m) => `${m.id}${m.deleted ? 'x' : ''}${m.editedAt ?? ''}`).join(',')
      )
      .join(';')
  );
}

export class CommentPanelView {
  private readonly root: HTMLElement;
  private readonly listEl: HTMLUListElement;
  private readonly emptyEl: HTMLParagraphElement;
  private readonly options: Required<Omit<CommentPanelOptions, 'onSelect' | 'onDismiss'>> &
    Pick<CommentPanelOptions, 'onSelect' | 'onDismiss'>;

  private signature: string | null = null;
  private rebuilds = 0;
  private selected: string | null = null;
  private pendingFocus: string | null = null;

  constructor(
    container: HTMLElement,
    private readonly store: CommentStore,
    options: CommentPanelOptions = {}
  ) {
    this.options = {
      label: options.label ?? 'Comments',
      showResolved: options.showResolved ?? false,
      formatTime: options.formatTime ?? ((ms: number) => new Date(ms).toISOString()),
      onSelect: options.onSelect,
      onDismiss: options.onDismiss,
    };

    const doc = container.ownerDocument;
    this.root = doc.createElement('section');
    // `complementary` (not `region`): a comments sidebar is exactly what the landmark is
    // for, and it means the AT's landmark rotor can jump straight here.
    this.root.setAttribute('role', 'complementary');
    this.root.setAttribute('aria-label', this.options.label);
    this.root.className = 'grafloria-comment-panel';
    this.root.setAttribute('data-grafloria-comment-panel', '');

    const heading = doc.createElement('h3');
    heading.className = 'grafloria-comment-panel__title';
    heading.textContent = this.options.label;
    this.root.appendChild(heading);

    this.emptyEl = doc.createElement('p');
    this.emptyEl.textContent = 'No comments yet.';
    this.root.appendChild(this.emptyEl);

    this.listEl = doc.createElement('ul');
    // A `<ul>` may contain ONLY `<li>` — axe checks this, and a list that lies about its
    // structure is worse than a div.
    this.listEl.className = 'grafloria-comment-panel__threads';
    this.listEl.setAttribute('aria-label', 'Comment threads');
    this.root.appendChild(this.listEl);

    // ESCAPE ALWAYS LEAVES. A panel you can tab into and not out of is a trap, and a trap
    // is a WCAG failure (2.1.2) whatever else it does well.
    this.root.addEventListener('keydown', (e) => {
      const ev = e as KeyboardEvent;
      if (ev.key === 'Escape') {
        ev.stopPropagation();
        this.options.onDismiss?.();
      }
    });

    container.appendChild(this.root);
  }

  getElement(): HTMLElement {
    return this.root;
  }

  getRebuildCount(): number {
    return this.rebuilds;
  }

  /** Which thread is open. Setting it re-renders and moves focus onto the conversation. */
  select(threadId: string | null, opts?: { focus?: boolean }): void {
    if (this.selected === threadId) return;
    this.selected = threadId;
    if (threadId && opts?.focus !== false) this.pendingFocus = threadId;
    // Opening a thread is READING it — that is what "unread" means.
    if (threadId) this.store.markRead(threadId);
    this.update();
    this.options.onSelect?.(threadId);
  }

  getSelected(): string | null {
    return this.selected;
  }

  /**
   * Rebuild if — and only if — something the panel SHOWS has changed.
   *
   * Safe on every frame. A drag, a pan and a zoom all change the diagram and change
   * nothing here, and must therefore cost zero DOM operations.
   */
  update(): boolean {
    const threads = this.store
      .threads({ includeResolved: this.options.showResolved })
      .sort(orderForReading);
    const sig = panelSignature(threads, this.selected);
    if (sig === this.signature && !this.pendingFocus) return false;
    this.signature = sig;
    this.rebuilds++;

    this.emptyEl.hidden = threads.length > 0;
    this.listEl.replaceChildren(...threads.map((t) => this.renderThread(t)));

    if (this.pendingFocus) {
      const h = this.listEl.querySelector<HTMLElement>(
        `[data-thread-heading="${cssEscape(this.pendingFocus)}"]`
      );
      // Focus is MOVED to the thing the user just opened, never STOLEN from elsewhere.
      h?.focus();
      this.pendingFocus = null;
    }
    return true;
  }

  dispose(): void {
    this.root.remove();
  }

  // -------------------------------------------------------------------------

  private renderThread(t: CommentThreadView): HTMLLIElement {
    const doc = this.root.ownerDocument;
    const li = doc.createElement('li');
    li.className = 'grafloria-comment-thread';
    li.setAttribute('data-thread-id', t.id);
    if (t.unread > 0) li.setAttribute('data-unread', String(t.unread));

    const article = doc.createElement('article');
    const open = this.selected === t.id;

    // --- the heading: a button, so it is operable by keyboard AND mouse ------
    const h = doc.createElement('h4');
    const btn = doc.createElement('button');
    btn.type = 'button';
    btn.setAttribute('data-thread-heading', t.id);
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    btn.className = 'grafloria-comment-thread__heading';
    btn.textContent = this.threadTitle(t);
    btn.addEventListener('click', () => this.select(open ? null : t.id));
    h.appendChild(btn);
    article.appendChild(h);

    // A DETACHED thread says so IN TEXT — not only in an amber colour. WCAG 1.4.1.
    if (!t.resolvedAnchor.attached) {
      const warn = doc.createElement('p');
      warn.className = 'grafloria-comment-thread__detached';
      warn.textContent = `Detached — the ${
        t.resolvedAnchor.targetKind === 'link' ? 'edge' : 'node'
      } this thread was about ("${t.resolvedAnchor.targetLabel}") has been deleted. The conversation is kept.`;
      article.appendChild(warn);
    }

    if (open) {
      article.appendChild(this.renderMessages(t));
      article.appendChild(this.renderReplyForm(t));
      article.appendChild(this.renderActions(t));
    }

    li.appendChild(article);
    return li;
  }

  private threadTitle(t: CommentThreadView): string {
    const live = t.messages.filter((m) => !m.deleted);
    const first = live[0]?.body ?? '(no messages)';
    const bits: string[] = [];
    if (t.resolved) bits.push('resolved');
    if (!t.resolvedAnchor.attached) bits.push('detached');
    if (t.unread > 0) bits.push(`${t.unread} unread`);
    const suffix = bits.length ? ` — ${bits.join(', ')}` : '';
    return `${truncate(first, 60)}${suffix}`;
  }

  private renderMessages(t: CommentThreadView): HTMLUListElement {
    const doc = this.root.ownerDocument;
    const ul = doc.createElement('ul');
    ul.className = 'grafloria-comment-thread__messages';
    ul.setAttribute('aria-label', 'Messages');

    for (const m of t.messages) {
      const li = doc.createElement('li');
      li.className = 'grafloria-comment-message';
      li.setAttribute('data-message-id', m.id);
      if (m.deleted) {
        li.classList.add('grafloria-comment-message--deleted');
        const p = doc.createElement('p');
        p.textContent = `${m.author} deleted a message`;
        li.appendChild(p);
      } else {
        const meta = doc.createElement('p');
        meta.className = 'grafloria-comment-message__meta';
        meta.textContent = `${m.author} · ${this.options.formatTime(m.createdAt)}${
          m.editedAt ? ' · edited' : ''
        }`;
        const body = doc.createElement('p');
        body.className = 'grafloria-comment-message__body';
        body.textContent = m.body;
        li.appendChild(meta);
        li.appendChild(body);
      }
      ul.appendChild(li);
    }
    return ul;
  }

  private renderReplyForm(t: CommentThreadView): HTMLFormElement {
    const doc = this.root.ownerDocument;
    const form = doc.createElement('form');
    form.className = 'grafloria-comment-reply';

    const id = `grafloria-reply-${t.id}`;
    // A real <label>, really associated. axe's `label` rule is WCAG 2 A, and a textarea
    // that an AT announces as "edit, blank" is a textarea nobody can use.
    const label = doc.createElement('label');
    label.setAttribute('for', id);
    label.textContent = 'Reply to this thread';
    const ta = doc.createElement('textarea');
    ta.id = id;
    ta.rows = 2;
    ta.setAttribute('data-reply-input', t.id);

    const submit = doc.createElement('button');
    submit.type = 'submit';
    submit.textContent = 'Reply';

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const body = ta.value.trim();
      if (!body) return;
      this.store.reply(t.id, body);
      ta.value = '';
      this.store.markRead(t.id);
      this.update();
    });

    form.appendChild(label);
    form.appendChild(ta);
    form.appendChild(submit);
    return form;
  }

  private renderActions(t: CommentThreadView): HTMLParagraphElement {
    const doc = this.root.ownerDocument;
    const p = doc.createElement('p');
    p.className = 'grafloria-comment-thread__actions';

    const toggle = doc.createElement('button');
    toggle.type = 'button';
    toggle.setAttribute('data-thread-resolve', t.id);
    toggle.textContent = t.resolved ? 'Reopen thread' : 'Resolve thread';
    toggle.addEventListener('click', () => {
      if (t.resolved) this.store.reopen(t.id);
      else this.store.resolve(t.id);
      this.update();
    });
    p.appendChild(toggle);
    return p;
  }
}

/** Unread first (that is why you opened the panel), then oldest first within each group. */
function orderForReading(a: CommentThreadView, b: CommentThreadView): number {
  if (a.unread !== b.unread && (a.unread === 0 || b.unread === 0)) return a.unread ? -1 : 1;
  return a.createdAt - b.createdAt;
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`;
}

/** Ids are minted by us and contain no CSS metacharacters, but a selector must not trust that. */
function cssEscape(v: string): string {
  return v.replace(/["\\]/g, '\\$&');
}
