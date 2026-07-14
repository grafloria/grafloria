// Wave 9 (Collaboration) — Card 5, Part B: LIVE PRESENCE.
//
// Remote cursors, remote selections, name badges. And the single most important line in
// this file is the one that is NOT here:
//
//     THE OVERLAY NEVER ENTERS THE VNODE TREE.
//
// =============================================================================
// THE PERF TRAP, AND WHY THE OBVIOUS FIX IS THE WRONG ONE
// =============================================================================
//
// Wave 8 gave the renderer a FRAME GATE: `render()` skips a frame entirely when the model
// and the viewport are unchanged, handing the patcher back the SAME VNode object. That is
// what makes an idle 10,000-node frame cost 0.0ms, and it is the headline result of the
// previous wave.
//
// A remote cursor moving changes the PICTURE without changing the MODEL or the VIEWPORT.
// So if cursors were VNodes, the gate would look at (epoch, viewport) — both unchanged —
// and skip the frame, and the cursors would FREEZE. This exact bug bit three separate
// branches last wave.
//
// The renderer exposes `invalidateFrame()` for precisely this, and calling it from the
// cursor loop is the obvious fix. IT IS THE WRONG ONE, and the arithmetic says so:
//
//     4 peers × 60Hz = 240 cursor samples a second.
//     Each one calls invalidateFrame() → the gate opens → render() runs.
//     render() at 10k nodes = three whole-diagram geometry passes + a full VNode rebuild
//     + a full patcher reconcile.
//
// That is a 10,000-node diagram being re-derived and re-reconciled 240 times a second TO
// MOVE A 12-PIXEL ARROW. It would take the headline number of Wave 8 — an idle frame at
// 0.0ms — and turn it into the worst frame in the engine, and it would do it precisely
// when the CPU is busiest (four people editing at once).
//
// The cursors are not part of the diagram. They are not persisted, not exported, not
// hit-tested, not selectable, not in the undo stack, not in the a11y tree and not in the
// SVG. Routing them through a data structure whose entire job is to describe THE DOCUMENT
// is a category error that happens to also be slow.
//
// SO: A SEPARATE DOM LAYER. `<div class="grafloria-presence-layer">`, a sibling of the SVG and
// HTML layers, carrying the same camera transform. A cursor move writes one CSS transform
// on one absolutely-positioned div. It touches no VNode, trips no epoch, calls no
// `invalidateFrame()`, and schedules no frame. The diagram's frame gate stays shut, the
// idle frame stays at 0.0ms, and 240 cursor samples a second cost 240 transform writes —
// which is what the browser's compositor is for.
//
// MEASURED, not asserted: `perf-run.mjs` has an `idle-frame-presence` scenario — a 10k-node
// diagram, idle, with four remote cursors moving at 60Hz — and it reports the same 0.0ms as
// the plain idle frame. `presence-overlay.spec.ts` asserts the mechanism directly: with the
// overlay live and cursors moving, `scheduler.stats.painted` does not move.
//
// =============================================================================
// A11Y: aria-hidden, AND NOT BECAUSE IT IS CONVENIENT
// =============================================================================
// A remote cursor is not content. It is a live-updating, 60Hz decoration describing someone
// else's mouse — announcing it to a screen reader would flood the buffer with noise that
// changes faster than it can be read, and it is not the user's own pointer, so it is not
// even actionable. The layer is `aria-hidden="true"` and `pointer-events: none`, so it is
// invisible to AT and to hit-testing alike. The overlay is MOUNTED INSIDE the cell axe
// scans in `a11y-harness.ts`, so this is audited rather than asserted — and that audit
// immediately found a real bug the unit tests could not (see `contrastingTextColor`).
//
// The USEFUL a11y signal — "Bob has joined", "Bob selected 3 nodes" — is a job for the
// existing aria-live region and belongs with the comments/roster card, not with a mouse
// pointer moving at 60 frames a second.

import type { ViewportController } from '../viewport/viewport-controller';

/** One peer, as far as the overlay is concerned. Ephemeral by construction. */
export interface PresencePeer {
  actor: string;
  name?: string;
  color?: string;
  /** WORLD coordinates — never screen: peers have different cameras. */
  cursor?: { x: number; y: number } | null;
  /** Entity ids this peer has selected. */
  selection?: string[];
}

/** World-space box of an entity, so the overlay can outline a remote selection. */
export type BoundsLookup = (entityId: string) => { x: number; y: number; width: number; height: number } | null;

export interface PresenceOverlayOptions {
  /** The mounted diagram's root — `.grafloria-diagram-root`. */
  root: HTMLElement;
  viewport: ViewportController;
  /** Where a selected entity is, in world space. Usually `model.getNode(id)`. */
  getBounds?: BoundsLookup;
  /** Interpolate remote cursors toward their target. 0 disables (jumps straight there). */
  smoothing?: number;
  /** Injectable rAF, so the interpolation tests are deterministic. */
  requestFrame?: (cb: () => void) => number;
  cancelFrame?: (handle: number) => void;
}

export const PRESENCE_LAYER_CLASS = 'grafloria-presence-layer';

/**
 * Deterministic per-actor colour.
 *
 * Deterministic MATTERS: the colour must be the same on every peer's screen, or "the blue
 * cursor is Ana" is true for you and false for me. Derived from the actor id, so no
 * coordination, no allocation table, and no message on the wire to agree.
 */
export function actorColor(actor: string): string {
  let hash = 0;
  for (let i = 0; i < actor.length; i++) hash = (Math.imul(hash, 31) + actor.charCodeAt(i)) | 0;
  // Golden-angle hues spread adjacent hashes far apart, so two peers rarely collide.
  const hue = Math.abs(hash * 137.508) % 360;
  return `hsl(${hue.toFixed(0)}, 72%, 52%)`;
}

/**
 * Black or white — whichever is actually READABLE on `background`.
 *
 * ---------------------------------------------------------------------------
 * FOUND BY AXE, IN THE a11y GATE, AFTER THE UNIT TESTS WERE ALL GREEN
 * ---------------------------------------------------------------------------
 * The name badge was white text on the peer's colour. For a blue or purple actor that is
 * fine. For a green or yellow one — `hsl(124, 72%, 52%)` — it is white on light green, a
 * contrast ratio of about 2:1, and a user with low vision simply cannot read whose cursor
 * it is. It is a coin flip decided by a hash of the actor id, which is the worst kind of
 * accessibility bug: it works on your machine, for your account, every time you test it.
 *
 * The unit tests could not have caught this. They assert `aria-hidden="true"`, which is
 * about ASSISTIVE TECH — and this is not an AT problem at all. It is a problem for someone
 * looking straight at the screen with their eyes. Only the real axe audit over a real page
 * with real badges on it could find it, which is the entire argument for that gate existing.
 *
 * (Note that `aria-hidden` does NOT excuse it, and axe is right to say so: hiding text from
 * a screen reader does not hide it from a sighted user with poor contrast sensitivity.)
 *
 * THE MATH. Pick whichever of pure black and pure white contrasts better. The two curves
 * cross at a background luminance of ~0.179, where BOTH give 4.58:1 — above the 4.5:1 WCAG
 * AA threshold for normal text. So this choice is guaranteed to pass for EVERY hue, not
 * merely for the ones I happened to look at.
 */
export function contrastingTextColor(background: string): string {
  const rgb = parseColor(background);
  if (!rgb) return '#fff'; // unparseable custom colour: keep the old behaviour, do not throw

  const lum = relativeLuminance(rgb);
  const onWhite = 1.05 / (lum + 0.05); // contrast against #fff
  const onBlack = (lum + 0.05) / 0.05; // contrast against #000
  return onWhite >= onBlack ? '#fff' : '#000';
}

/** WCAG relative luminance. */
function relativeLuminance([r, g, b]: [number, number, number]): number {
  const channel = (c: number): number => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** `#rgb`, `#rrggbb`, `rgb(...)` and `hsl(...)` — the forms a caller plausibly passes. */
function parseColor(css: string): [number, number, number] | null {
  const s = css.trim().toLowerCase();

  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(s);
  if (hex) {
    const h = hex[1];
    const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
    return [
      parseInt(full.slice(0, 2), 16),
      parseInt(full.slice(2, 4), 16),
      parseInt(full.slice(4, 6), 16),
    ];
  }

  const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/.exec(s);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];

  const hsl = /^hsla?\(\s*([\d.]+)[\s,]+([\d.]+)%[\s,]+([\d.]+)%/.exec(s);
  if (hsl) return hslToRgb(Number(hsl[1]), Number(hsl[2]) / 100, Number(hsl[3]) / 100);

  return null;
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const m = l - c / 2;

  const [r, g, b] =
    hp < 1 ? [c, x, 0]
    : hp < 2 ? [x, c, 0]
    : hp < 3 ? [0, c, x]
    : hp < 4 ? [0, x, c]
    : hp < 5 ? [x, 0, c]
    : [c, 0, x];

  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ];
}

export function actorInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

interface PeerView {
  peer: PresencePeer;
  /** The cursor element, and the selection outlines. */
  cursorEl: HTMLElement;
  selectionEls: Map<string, HTMLElement>;
  /** Where the cursor is being DRAWN (interpolated), vs where the peer says it is. */
  drawn: { x: number; y: number } | null;
  target: { x: number; y: number } | null;
}

/**
 * The presence layer.
 *
 * Owns one `<div>` inside the diagram root, and nothing else. It does not know about the
 * SVGRenderer, the VNodePatcher, the RenderScheduler or the model, and it must not: the
 * moment it can reach the render loop, someone will make it call into it.
 */
export class PresenceOverlay {
  private readonly layer: HTMLElement;
  private readonly world: HTMLElement;
  private readonly peers = new Map<string, PeerView>();
  private readonly doc: Document;

  private frame: number | null = null;
  /** A frame is pending. See `tick()` for why this is not `frame !== null`. */
  private scheduled = false;
  private disposed = false;
  private readonly unsubViewport: () => void;

  private readonly smoothing: number;
  private readonly requestFrameFn: (cb: () => void) => number;
  private readonly cancelFrameFn: (handle: number) => void;

  /** Interpolation frames actually run. An idle overlay must add ZERO. */
  framesRun = 0;

  constructor(private readonly options: PresenceOverlayOptions) {
    this.doc = options.root.ownerDocument;
    this.smoothing = options.smoothing ?? 0.35;
    this.requestFrameFn =
      options.requestFrame ??
      ((cb) =>
        typeof requestAnimationFrame === 'function'
          ? requestAnimationFrame(() => cb())
          : (setTimeout(cb, 16) as unknown as number));
    this.cancelFrameFn =
      options.cancelFrame ??
      ((h) => {
        if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(h);
        else clearTimeout(h as unknown as ReturnType<typeof setTimeout>);
      });

    this.layer = this.doc.createElement('div');
    this.layer.className = PRESENCE_LAYER_CLASS;
    // aria-hidden: a 60Hz mouse pointer is not content. See the header.
    this.layer.setAttribute('aria-hidden', 'true');
    this.layer.setAttribute(
      'style',
      'position:absolute;top:0;left:0;width:100%;height:100%;overflow:hidden;pointer-events:none'
    );

    // The camera-transformed sub-layer. Cursors are positioned in WORLD coordinates and the
    // browser does the projection — so a pan or a zoom moves every cursor with ONE transform
    // write on ONE element, instead of N re-projections in JS.
    this.world = this.doc.createElement('div');
    this.world.setAttribute(
      'style',
      `position:absolute;top:0;left:0;transform-origin:0 0;pointer-events:none;transform:${options.viewport.getHtmlLayerTransform()}`
    );
    this.layer.appendChild(this.world);
    options.root.appendChild(this.layer);

    // The camera moved. Re-register the layer — and NOT by scheduling a diagram frame: the
    // diagram is already repainting for its own reasons (the viewport changed, which its
    // gate DOES see). We only have to keep our own transform in step.
    this.unsubViewport = options.viewport.onChange(() => this.syncCamera());
  }

  /** For the tests and the a11y audit — the DOM this owns, and nothing more. */
  get element(): HTMLElement {
    return this.layer;
  }

  get peerCount(): number {
    return this.peers.size;
  }

  /**
   * Publish the full peer set. Idempotent, and a peer that is gone is REMOVED — presence
   * has no tombstones and no history; the current picture is the entire truth.
   */
  setPeers(peers: readonly PresencePeer[]): void {
    if (this.disposed) return;

    const seen = new Set<string>();
    for (const peer of peers) {
      seen.add(peer.actor);
      this.upsert(peer);
    }
    for (const actor of [...this.peers.keys()]) {
      if (!seen.has(actor)) this.remove(actor);
    }

    this.tick();
  }

  remove(actor: string): void {
    const view = this.peers.get(actor);
    if (!view) return;
    view.cursorEl.remove();
    for (const el of view.selectionEls.values()) el.remove();
    this.peers.delete(actor);
  }

  clear(): void {
    for (const actor of [...this.peers.keys()]) this.remove(actor);
    this.stopFrame();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clear();
    this.unsubViewport();
    this.layer.remove();
  }

  // -------------------------------------------------------------------------

  private syncCamera(): void {
    if (this.disposed) return;
    this.world.style.transform = this.options.viewport.getHtmlLayerTransform();
  }

  private upsert(peer: PresencePeer): void {
    let view = this.peers.get(peer.actor);
    if (!view) {
      view = {
        peer,
        cursorEl: this.buildCursor(peer),
        selectionEls: new Map(),
        drawn: peer.cursor ? { ...peer.cursor } : null,
        target: peer.cursor ? { ...peer.cursor } : null,
      };
      this.world.appendChild(view.cursorEl);
      this.peers.set(peer.actor, view);
    } else {
      view.peer = peer;
      // A cursor that has just appeared jumps to its position; one that MOVED interpolates
      // toward it. Interpolating from nowhere would make every new peer's cursor fly in from
      // the origin, across the whole canvas, which reads as a glitch rather than a person.
      view.target = peer.cursor ? { ...peer.cursor } : null;
      if (view.target && !view.drawn) view.drawn = { ...view.target };
      this.paintLabel(view);
    }

    view.cursorEl.style.display = peer.cursor ? 'block' : 'none';
    this.syncSelection(view);
  }

  private buildCursor(peer: PresencePeer): HTMLElement {
    const color = peer.color ?? actorColor(peer.actor);
    const el = this.doc.createElement('div');
    el.className = 'grafloria-presence-cursor';
    el.setAttribute('data-actor', peer.actor);
    el.setAttribute(
      'style',
      'position:absolute;left:0;top:0;will-change:transform;pointer-events:none;display:none'
    );

    // The arrow. Inline SVG, no external asset, no network fetch, no CSP surprise.
    el.innerHTML =
      `<svg width="14" height="20" viewBox="0 0 14 20" style="display:block;filter:drop-shadow(0 1px 1px rgba(0,0,0,.3))">` +
      `<path d="M1 1 L1 15 L4.7 11.5 L7.2 17.5 L9.8 16.4 L7.3 10.6 L12.4 10.4 Z" fill="${color}" stroke="#fff" stroke-width="1"/>` +
      `</svg>` +
      `<span class="grafloria-presence-label" style="position:absolute;left:13px;top:16px;` +
      `background:${color};color:${contrastingTextColor(color)};font:600 11px/1.4 system-ui,sans-serif;` +
      `padding:1px 6px;border-radius:9px;white-space:nowrap"></span>`;

    const label = el.querySelector('.grafloria-presence-label') as HTMLElement;
    label.textContent = peer.name ?? peer.actor;
    return el;
  }

  private paintLabel(view: PeerView): void {
    const label = view.cursorEl.querySelector('.grafloria-presence-label');
    if (label) label.textContent = view.peer.name ?? view.peer.actor;
  }

  /**
   * Remote SELECTION — an outline around what a peer has selected.
   *
   * Note what this is NOT: it does not touch `node.state.selected`. Selection is per-VIEWER,
   * and the model's `selected` flag is a single shared register — so writing a peer's
   * selection into the model would mean MY clicking a node deselects YOURS. It lives here,
   * in the overlay, where it belongs. (`sync-adapter.spec.ts` asserts the same thing from
   * the other side: selection travels as awareness, not as a document edit.)
   */
  private syncSelection(view: PeerView): void {
    const getBounds = this.options.getBounds;
    const wanted = new Set(getBounds ? (view.peer.selection ?? []) : []);
    const color = view.peer.color ?? actorColor(view.peer.actor);

    for (const [id, el] of [...view.selectionEls]) {
      if (!wanted.has(id)) {
        el.remove();
        view.selectionEls.delete(id);
      }
    }

    for (const id of wanted) {
      const box = getBounds?.(id);
      if (!box) {
        // The entity is not here (yet, or any more). Drop a stale outline rather than draw a
        // box around nothing.
        const stale = view.selectionEls.get(id);
        if (stale) {
          stale.remove();
          view.selectionEls.delete(id);
        }
        continue;
      }

      let el = view.selectionEls.get(id);
      if (!el) {
        el = this.doc.createElement('div');
        el.className = 'grafloria-presence-selection';
        el.setAttribute('data-actor', view.peer.actor);
        el.setAttribute('data-entity', id);
        this.world.appendChild(el);
        view.selectionEls.set(id, el);
      }
      // Border width is in WORLD units under the camera scale, so it thickens as you zoom
      // in. That is the same behaviour the SVG selection outline has, and matching it is why
      // this looks like part of the canvas rather than pasted on top.
      el.setAttribute(
        'style',
        `position:absolute;left:${box.x}px;top:${box.y}px;width:${box.width}px;height:${box.height}px;` +
          `border:2px solid ${color};border-radius:3px;pointer-events:none;box-sizing:border-box`
      );
    }
  }

  // -------------------------------------------------------------------------
  // THE INTERPOLATION LOOP
  //
  // Awareness arrives at ~20Hz (throttled — see SyncAdapter). Drawn raw, a remote cursor
  // visibly STEPS: twenty discrete jumps a second, which reads as lag even when the network
  // is fine. Interpolating toward the target at 60fps turns the same twenty samples into
  // smooth motion, and costs one transform write per cursor per frame.
  //
  // THE LOOP ONLY RUNS WHILE SOMETHING IS MOVING. `tick()` schedules a frame; the frame
  // moves every cursor a fraction of the way to its target and schedules ANOTHER only if any
  // cursor is still short of it. Once everyone has arrived — which, for a still mouse, is
  // within a few frames — the loop STOPS DEAD and the overlay costs literally nothing.
  //
  // That is the whole reason an idle diagram with presence mounted still costs 0.0ms: not
  // because the cursor work is cheap, but because there is NO cursor work. A perpetual rAF
  // loop that ticks whether or not anything moved would keep the main thread awake forever,
  // defeat every idle optimisation in the renderer, and drain a laptop battery on a diagram
  // nobody is touching.
  // -------------------------------------------------------------------------

  private tick(): void {
    if (this.disposed || this.scheduled) return;

    // The guard is `scheduled`, NOT `frame !== null`, and that is not fussiness.
    //
    // `this.frame = requestFrame(cb)` assigns AFTER `cb` has been called — which is fine for
    // a real rAF (async, always) and a trap for any synchronous one. Under a synchronous
    // frame source the callback runs first, sets `this.frame = null`, finishes… and THEN the
    // outer assignment writes the handle back. `frame` is left non-null with no frame
    // pending, every later `tick()` returns early, and the cursors never move again — the
    // exact freeze this whole layer exists to avoid, reintroduced by the guard meant to
    // prevent double-scheduling. Found by the reachability test, which drives rAF
    // synchronously so it does not have to race one.
    this.scheduled = true;
    const handle = this.requestFrameFn(() => {
      this.scheduled = false;
      this.frame = null;
      if (this.disposed) return;
      this.framesRun++;

      let moving = false;
      for (const view of this.peers.values()) {
        if (!view.target) continue;
        if (!view.drawn) {
          view.drawn = { ...view.target };
        } else {
          const dx = view.target.x - view.drawn.x;
          const dy = view.target.y - view.drawn.y;
          // Snap when close enough. Without this, exponential easing never quite arrives and
          // the loop runs for the rest of the session, one frame at a time, forever — an
          // idle overlay burning 60 frames a second to move a cursor by 0.0001px.
          if (Math.abs(dx) < 0.05 && Math.abs(dy) < 0.05) {
            view.drawn = { ...view.target };
          } else {
            view.drawn = {
              x: view.drawn.x + dx * this.smoothing,
              y: view.drawn.y + dy * this.smoothing,
            };
            moving = true;
          }
        }
        view.cursorEl.style.transform = `translate(${view.drawn.x}px, ${view.drawn.y}px)`;
      }

      if (moving) this.tick();
    });

    // Only remember a handle for a frame that is genuinely still pending. If the callback
    // already ran (synchronous rAF), `scheduled` is false again and storing the handle would
    // leave a stale one that `stopFrame()` would later try to cancel.
    if (this.scheduled) this.frame = handle;
  }

  private stopFrame(): void {
    if (this.frame !== null) {
      this.cancelFrameFn(this.frame);
      this.frame = null;
    }
    this.scheduled = false;
  }
}
