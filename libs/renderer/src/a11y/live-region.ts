/**
 * The managed `aria-live` REGION — the canvas's voice.
 *
 * Two live regions, not one: an AT will not reliably re-announce a node whose
 * politeness changed, and mixing an error into the polite queue means it waits
 * behind whatever selection chatter is already in flight. So:
 *
 *   - `polite`    — selection, movement, focus, connect/disconnect;
 *   - `assertive` — validation failures and errors, which interrupt.
 *
 * DE-DUPLICATION is the whole design problem. A naive live region wired to a
 * render loop says "Process node, 2 connections" sixty times a second and is
 * worse than useless — the user turns it off. Three defences, all here:
 *
 *   1. IDENTICAL-MESSAGE SUPPRESSION. The same text in the same channel is
 *      dropped, unless `force` is set (a repeated action the user *did* repeat
 *      — nudging twice — is legitimately worth re-announcing).
 *   2. COALESCING. Announcements inside a short window replace, rather than
 *      queue behind, the previous one. Holding an arrow key produces the FINAL
 *      position, not fifty intermediate ones.
 *   3. MODEL-CHANGE DRIVEN. The controller is called on model change, never
 *      from the render loop. `getSpeakCount()` lets a test prove a quiet frame
 *      speaks zero times.
 *
 * Framework-free: takes a container, owns two divs, no Angular anywhere.
 *
 * Wave 6 (a11y card 5).
 */

export type Politeness = 'polite' | 'assertive';

export interface LiveRegionOptions {
  /**
   * Announcements arriving within this many ms of the previous one REPLACE it
   * rather than following it. 0 disables coalescing (tests use this).
   */
  coalesceMs?: number;
  /** Injected clock, so tests need no timers. */
  now?: () => number;
  /** Injected scheduler, so tests need no real setTimeout. */
  schedule?: (fn: () => void, ms: number) => unknown;
  cancel?: (handle: unknown) => void;
}

const VISUALLY_HIDDEN =
  'position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;' +
  'clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;border:0;';

export class LiveRegionController {
  private readonly politeEl: HTMLElement;
  private readonly assertiveEl: HTMLElement;
  private readonly coalesceMs: number;
  private readonly now: () => number;
  private readonly schedule: (fn: () => void, ms: number) => unknown;
  private readonly cancel: (handle: unknown) => void;

  private lastMessage: Record<Politeness, string> = { polite: '', assertive: '' };
  /**
   * When the last message was spoken. `-Infinity`, NOT 0 — with 0, the very
   * first announcement of the session looks like it arrived inside the coalesce
   * window of a previous announcement that never happened, so it gets deferred
   * instead of spoken. (An injected clock starting at 0 makes this obvious; a
   * `Date.now()` clock hides it, which is exactly why the tests inject one.)
   */
  private lastAt = -Infinity;
  private pending: { message: string; politeness: Politeness } | null = null;
  private timer: unknown = null;
  private speakCount = 0;

  constructor(container: HTMLElement, options: LiveRegionOptions = {}) {
    this.coalesceMs = options.coalesceMs ?? 120;
    this.now = options.now ?? (() => Date.now());
    this.schedule =
      options.schedule ?? ((fn, ms) => (globalThis as typeof globalThis).setTimeout(fn, ms));
    this.cancel =
      options.cancel ?? ((handle) => (globalThis as typeof globalThis).clearTimeout(handle as never));

    const doc = container.ownerDocument;

    this.politeEl = this.makeRegion(doc, 'polite');
    this.assertiveEl = this.makeRegion(doc, 'assertive');
    container.appendChild(this.politeEl);
    container.appendChild(this.assertiveEl);
  }

  private makeRegion(doc: Document, politeness: Politeness): HTMLElement {
    const el = doc.createElement('div');
    el.setAttribute('role', politeness === 'assertive' ? 'alert' : 'status');
    el.setAttribute('aria-live', politeness);
    // `aria-atomic` — read the whole message, not just the changed words. Without
    // it an AT can read the diff of two similar messages, which is gibberish.
    el.setAttribute('aria-atomic', 'true');
    el.setAttribute('data-grafloria-live', politeness);
    el.setAttribute('style', VISUALLY_HIDDEN);
    return el;
  }

  /** The live elements, for tests and for hosts that relocate them. */
  getElement(politeness: Politeness): HTMLElement {
    return politeness === 'assertive' ? this.assertiveEl : this.politeEl;
  }

  /** What the region currently says. */
  getMessage(politeness: Politeness): string {
    return this.getElement(politeness).textContent ?? '';
  }

  /** How many times we have actually written to the DOM. The thrash proof. */
  getSpeakCount(): number {
    return this.speakCount;
  }

  /**
   * Announce. Returns true if the message will be spoken, false if it was
   * suppressed as a duplicate.
   */
  announce(message: string, politeness: Politeness = 'polite', force = false): boolean {
    const text = message.trim();
    if (!text) return false;

    // (1) identical-message suppression.
    if (!force && text === this.lastMessage[politeness]) return false;

    // Errors must never wait behind a coalescing window — they interrupt.
    if (politeness === 'assertive') {
      this.flushPending();
      this.speak(text, 'assertive');
      return true;
    }

    const at = this.now();
    const withinWindow = this.coalesceMs > 0 && at - this.lastAt < this.coalesceMs;

    if (!withinWindow) {
      this.speak(text, politeness);
      this.lastAt = at;
      return true;
    }

    // (2) coalesce: the newest message REPLACES any still-pending one, and we
    // speak once when the window closes. Fifty arrow-key repeats → one sentence.
    this.pending = { message: text, politeness };
    if (this.timer === null) {
      this.timer = this.schedule(() => {
        this.timer = null;
        this.flushPending();
      }, this.coalesceMs);
    }
    return true;
  }

  /** Errors and validation failures. Always assertive, never coalesced. */
  announceError(message: string): boolean {
    return this.announce(message, 'assertive', true);
  }

  /** Speak any coalesced message immediately. */
  flushPending(): void {
    if (this.timer !== null) {
      this.cancel(this.timer);
      this.timer = null;
    }
    const pending = this.pending;
    this.pending = null;
    if (pending) {
      this.speak(pending.message, pending.politeness);
      this.lastAt = this.now();
    }
  }

  private speak(text: string, politeness: Politeness): void {
    const el = this.getElement(politeness);

    // An AT only announces a live region when its content CHANGES. Re-setting
    // the same string is a no-op to the DOM and therefore silent — which is why
    // `force` (a legitimately repeated action) has to clear first.
    if (el.textContent === text) {
      el.textContent = '';
    }

    el.textContent = text;
    this.lastMessage[politeness] = text;
    this.speakCount++;
  }

  /** Clear both regions (e.g. on blur) without announcing anything. */
  clear(): void {
    this.flushPendingSilently();
    this.politeEl.textContent = '';
    this.assertiveEl.textContent = '';
    this.lastMessage = { polite: '', assertive: '' };
  }

  private flushPendingSilently(): void {
    if (this.timer !== null) {
      this.cancel(this.timer);
      this.timer = null;
    }
    this.pending = null;
  }

  dispose(): void {
    this.flushPendingSilently();
    this.politeEl.remove();
    this.assertiveEl.remove();
  }
}
