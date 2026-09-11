/**
 * THE CHROME (tile first, step 4b-i): everything a board paints that is not a
 * widget — section slabs and their selection ring, a tab container's frame and
 * tinted surface, caption bands, the carried subtree of a moving group, the
 * corner resize handles and the painted grips on member hosts, the edge
 * cursors, the refused cell of a section move, and the static guard that lets
 * content be clicked on a read-only board. Moved out of the binder unchanged
 * in behaviour; the binder keeps calling these by the same names.
 */
import type { GroupModel } from '@grafloria/engine';
import { cellToRect } from './grid-mapping';
import { captionKey, captionOfGroup, captionPainted, paintCaptionBand, sizeCaptionBand } from './caption';
import { cursorFor, edgesNear, EDGE_GRIP, type ResizeEdges } from './edges';
import { gripOf, syncGrip, type DragHandleOption } from './grip';
import type { BoardCtx } from './board-ctx';

/**
 * A TAB CONTAINER's frame is its drag handle (0.4.43): its 8-px margin —
 * under the strip, beside the pages — moves the group, so the edge-resize
 * zone shrinks to 3 px there (the corner handle still resizes). A section's
 * edges keep the full grip: its empty band is a drop target, not a handle.
 */
export const TAB_FRAME_GRIP = 3;

export const isTabsGroup = (grp: GroupModel): boolean => (grp.getMetadata('containerWidget') as { layout?: string } | undefined)?.layout === 'tabs';
export const edgeGripFor = (grp: GroupModel): number => (isTabsGroup(grp) ? TAB_FRAME_GRIP : EDGE_GRIP);

export interface ChromeDeps {
  /** The selected member (a widget or a section), for the slab's ring. */
  selectedId(): string | undefined;
  /** The accessible chrome on every member host — the binder's, since it owns the focus and the selection. */
  syncA11y(only?: ReadonlySet<string>): void;
  /** A section is being moved by hand right now (the refusal cell's cursor, the hover cursor). */
  grabbing(): boolean;
  /** A tile gesture is live (the hover affordance stays out of its way). */
  gestureRunning(): boolean;
  /** The member SECTION whose frame holds the world point, if any. */
  memberGroupAt(x: number, y: number): string | null;
  /** Which of a section frame's edges a world point is within its grip of. */
  slabEdgesNear(grp: GroupModel, x: number, y: number): ResizeEdges;
  dragHandle(): DragHandleOption;
  wantHandles: boolean;
}

export interface Chrome {
  /** The section overlays: projected chrome like the placeholder, following every frame write. */
  syncSlabs(): void;
  /** The chrome on every member host: the painted grip (or none) and the corner resize handle. */
  syncHandles(only?: ReadonlySet<string>): void;
  /** Start answering host churn (a mount, a repaint that wiped the handle) with a re-sync of those hosts. */
  observe(layer: HTMLElement): void;
  ensureStaticGuard(): void;
  /** The pointer over the container: edge cursors on hosts, section-edge cursors, `show: 'hover'` captions. */
  onHover(e: PointerEvent): void;
  onHoverLeave(): void;
  /** Everything in a group's subtree — tiles, strips, slabs, the surface — transition-exempt while it is carried. */
  setCarried(id: string, on: boolean): void;
  flushCarried(): void;
  /** The cell a slab move asked for and could not have — painted so the refusal is visible; null clears it. */
  showRefusal(cell: { x: number; y: number } | null, w: number, h: number): void;
  dispose(): void;
}

export function createChrome(ctx: BoardCtx, deps: ChromeDeps): Chrome {
  const { api, group, diagram, options } = ctx;

  // -- section slabs, group frames, caption bands ----------------------------

  /**
   * SECTION CHROME. A section (member group) paints no card of its own, so it
   * had nothing to press: a click on its empty band cleared the selection and
   * its frame had no handle and no edge — a section with many children could
   * not be selected at all, and could only be resized by pulling a child
   * (Quantia, Groups page). Every section gets a pointer-transparent overlay
   * in the HTML layer that wears the selection ring and, while selected, the
   * corner handle; its frame edges answer the resize cursor.
   */
  const slabEls = new Map<string, HTMLElement>();
  /**
   * GROUP FRAME (0.4.43): a TAB CONTAINER wears a frame by default — its slab
   * is bordered and a tinted surface lies under its pages, first in the layer
   * so the tiles paint over it. A page torn out with two widgets under its tab
   * read as a strip floating over two loose cards: nothing said the second
   * card was the tab's. A plain section keeps its invisible slab.
   */
  const groupBgs = new Map<string, HTMLElement>();
  const syncGroupBg = (layer: HTMLElement, id: string, on: boolean, x: number, y: number, w: number, h: number): void => {
    let bg = groupBgs.get(id) ?? null;
    if (!on) {
      bg?.remove();
      groupBgs.delete(id);
      return;
    }
    if (!bg || bg.parentElement !== layer) {
      bg?.remove();
      bg = document.createElement('div');
      bg.className = 'axdb-group-bg';
      bg.setAttribute('data-group-bg', id);
      layer.prepend(bg);
      groupBgs.set(id, bg);
    }
    bg.style.left = `${x}px`;
    bg.style.top = `${y}px`;
    bg.style.width = `${w}px`;
    bg.style.height = `${h}px`;
  };

  /**
   * A `show: 'hover'` caption cannot ride CSS `:hover`: the slab overlay takes
   * no pointer (by design — it must never steal a press), and while the band
   * is hidden it takes none either, so nothing in the section is ever hovered
   * in CSS terms. The binder already tracks the pointer; it marks the section
   * under it instead.
   */
  /** Only the sections carrying a `show: 'hover'` band — usually none, so the
   *  pointer handler costs nothing on a board that has no hover caption. */
  const hoverSlabs = new Set<HTMLElement>();
  const markHotSection = (clientX: number, clientY: number): void => {
    if (!hoverSlabs.size) return;
    for (const el of hoverSlabs) {
      const r = el.getBoundingClientRect();
      el.classList.toggle('axdb-slab--hot', clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom);
    }
  };
  const onHoverLeave = (): void => {
    for (const el of hoverSlabs) el.classList.remove('axdb-slab--hot');
  };

  /**
   * THE CAPTION BAND of a section, on its slab overlay. Painted from the
   * group's persisted caption; repainted only when its identity changes (the
   * options, RTL, static, the tier) so a custom `renderCaption` is not run
   * per frame. The band takes the pointer (the slab itself does not): a press
   * on it selects the section, an action fires, pass-through reaches content.
   */
  const syncCaption = (el: HTMLElement, id: string, grp: GroupModel, sectionH: number): void => {
    const cap = captionOfGroup(grp);
    const isStatic = ctx.isStatic();
    let band = el.querySelector(':scope > .axdb-slab-h') as HTMLElement | null;
    if (!cap || !captionPainted(cap, isStatic)) {
      band?.remove();
      hoverSlabs.delete(el);
      el.classList.remove('axdb-slab--hot');
      el.removeAttribute('aria-label');
      el.removeAttribute('role');
      return;
    }
    if (cap.show === 'hover') hoverSlabs.add(el);
    else {
      hoverSlabs.delete(el);
      el.classList.remove('axdb-slab--hot');
    }
    const cctx = { rtl: ctx.rtl(), static: isStatic, sectionH };
    const key = captionKey(cap, cctx);
    if (band && band.getAttribute('data-key') === key) {
      sizeCaptionBand(band, cap, sectionH); // the tier follows the live size
      return;
    }
    band?.remove();
    band = document.createElement('div');
    el.prepend(band);
    const render = options.renderCaption;
    paintCaptionBand(band, cap, {
      ...cctx,
      ...(render ? { render: (host: HTMLElement) => render(id, host) } : {}),
      onAction: (actionId: string) => options.onCaptionAction?.(id, actionId),
    });
    band.setAttribute('data-key', key);
    // A named group, so the caption text is the section's name in the
    // accessibility tree rather than a stray label on an unnamed div. (The
    // band is not a tab stop yet — the actions are deliberately out of the
    // tab order so a board keeps exactly ONE stop; see the plan.)
    if (cap.text) {
      el.setAttribute('role', 'group');
      el.setAttribute('aria-label', cap.text);
    } else {
      el.removeAttribute('role');
      el.removeAttribute('aria-label');
    }
  };

  let slabLayer: HTMLElement | null = null;
  const syncSlabs = (): void => {
    if (ctx.disposed()) return;
    const layer = slabLayer?.isConnected ? slabLayer : (slabLayer = ctx.htmlLayer());
    if (!layer) return;
    const seen = new Set<string>();
    const selectedId = deps.selectedId();
    const isStatic = ctx.isStatic();
    const rtl = ctx.rtl();
    for (const id of group.members ?? []) {
      const grp = diagram.getGroup(id);
      if (!grp || diagram.getNode(id)) continue;
      seen.add(id);
      let el = slabEls.get(id);
      if (!el || el.parentElement !== layer) {
        el?.remove();
        el = document.createElement('div');
        el.className = 'axdb-slab';
        el.setAttribute('data-slab-id', id);
        const rs = document.createElement('div');
        rs.className = 'axdb-rs';
        rs.setAttribute('title', 'Resize section');
        el.appendChild(rs);
        layer.appendChild(el);
        slabEls.set(id, el);
      }
      const p = grp.position;
      const sz = ctx.sizeOf(grp);
      el.style.left = `${p.x}px`;
      el.style.top = `${p.y}px`;
      el.style.width = `${sz.width}px`;
      el.style.height = `${sz.height}px`;
      el.classList.toggle('axdb-slab--selected', selectedId === id);
      el.classList.toggle('axdb-slab--static', isStatic);
      el.querySelector(':scope > .axdb-rs')?.classList.toggle('axdb-rs--rtl', rtl);
      const tabs = isTabsGroup(grp);
      el.classList.toggle('axdb-slab--tabs', tabs);
      syncGroupBg(layer, id, tabs, p.x, p.y, sz.width, sz.height);
      syncCaption(el, id, grp, sz.height);
    }
    for (const [id, el] of slabEls) {
      if (!seen.has(id)) {
        el.remove();
        hoverSlabs.delete(el);
        slabEls.delete(id);
        groupBgs.get(id)?.remove();
        groupBgs.delete(id);
      }
    }
  };

  // -- the carried subtree ---------------------------------------------------

  /**
   * CARRIED (0.4.43): a group dragged by its strip or band moves as ONE thing.
   * The held TILE is transition-exempt (the ghost), but a group has no host of
   * its own: its strip jumped to the pointer while its pages' tiles GLIDED
   * after it — on the live demo the content trailed the strip by up to 140 px
   * at every step. Everything in the group's subtree — tiles, strips, slabs,
   * the surface — is exempt for the gesture and, like the ghost, through the
   * drop write; then the glides resume.
   */
  const carriedEls = new Set<Element>();
  let carriedTimer: ReturnType<typeof setTimeout> | null = null;
  const subtreeIds = (id: string): { groups: string[]; nodes: string[] } => {
    const groups: string[] = [];
    const nodes: string[] = [];
    const queue = [id];
    const seen = new Set<string>();
    while (queue.length) {
      const cur = queue.shift()!;
      if (seen.has(cur)) continue;
      seen.add(cur);
      const grp = diagram.getGroup(cur);
      if (grp) {
        groups.push(cur);
        for (const m of grp.members ?? []) queue.push(m);
      } else if (diagram.getNode(cur)) nodes.push(cur);
    }
    return { groups, nodes };
  };
  const cssId = (id: string): string => (typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : id.replace(/"/g, '\\"'));
  const setCarried = (id: string, on: boolean): void => {
    const layer = ctx.htmlLayer();
    if (!layer) return;
    if (carriedTimer) {
      clearTimeout(carriedTimer);
      carriedTimer = null;
    }
    if (on) {
      const { groups, nodes } = subtreeIds(id);
      const els: Element[] = [];
      for (const n of nodes) {
        const h = ctx.hostOf(n);
        if (h) els.push(h);
      }
      for (const g of groups) {
        els.push(...Array.from(layer.querySelectorAll(`:scope > .axdb-tabs[data-tabs-id="${cssId(g)}"], :scope > .axdb-slab[data-slab-id="${cssId(g)}"], :scope > .axdb-group-bg[data-group-bg="${cssId(g)}"]`)));
      }
      for (const el of els) {
        el.classList.add('axdb-carried');
        carriedEls.add(el);
      }
      return;
    }
    carriedTimer = setTimeout(() => {
      for (const el of carriedEls) el.classList.remove('axdb-carried');
      carriedEls.clear();
      carriedTimer = null;
    }, 60);
  };
  const flushCarried = (): void => {
    if (carriedTimer) clearTimeout(carriedTimer);
    carriedTimer = null;
    for (const el of carriedEls) el.classList.remove('axdb-carried');
    carriedEls.clear();
  };

  // -- the refused cell ------------------------------------------------------

  let refusal: HTMLElement | null = null;
  const showRefusal = (cell: { x: number; y: number } | null, w: number, h: number): void => {
    const layer = ctx.htmlLayer();
    if (!cell || !layer) {
      refusal?.remove();
      refusal = null;
      api.container.style.cursor = deps.grabbing() ? 'grabbing' : '';
      return;
    }
    if (!refusal || refusal.parentElement !== layer) {
      refusal?.remove();
      refusal = document.createElement('div');
      refusal.className = 'axdb-ph axdb-ph--no';
      layer.prepend(refusal);
    }
    const r = cellToRect({ x: cell.x, y: cell.y, w, h }, ctx.frame(), ctx.geom(), ctx.rows());
    refusal.style.left = `${r.x}px`;
    refusal.style.top = `${r.y}px`;
    refusal.style.width = `${r.width}px`;
    refusal.style.height = `${r.height}px`;
    api.container.style.cursor = 'not-allowed';
  };

  // -- the static guard ------------------------------------------------------

  /**
   * STATIC BOARDS LET CONTENT BE CLICKED. The renderer prevents the default of
   * every press a tool claims, which cancels the compatibility mouse events —
   * a chart inside a read-only board could not be clicked. So under `static`
   * a press inside a member's CONTENT (not on kit chrome) is stopped on the
   * HTML layer, in the bubble phase: the content has already received it, the
   * renderer never does, nothing is prevented.
   */
  const staticGuard = (e: Event): void => {
    if (!ctx.isStatic() || ctx.disposed()) return;
    const t = e.target as Element | null;
    const host = t?.closest?.('.grafloria-node-host') as HTMLElement | null;
    if (!host || !(group.members ?? new Set<string>()).has(host.getAttribute('data-node-id') ?? '')) return;
    if (t?.closest?.('.axdb-rs, .axdb-grip, .axdb-div')) return;
    e.stopPropagation();
  };
  let guardedLayer: HTMLElement | null = null;
  const ensureStaticGuard = (): void => {
    if (guardedLayer?.isConnected) return;
    const layer = ctx.htmlLayer();
    if (!layer) return;
    guardedLayer?.removeEventListener('pointerdown', staticGuard);
    guardedLayer = layer;
    layer.addEventListener('pointerdown', staticGuard);
  };

  // -- handles and grips on member hosts -------------------------------------

  /**
   * The chrome on every member host: the painted grip (or none) and the corner
   * resize handle — ONE host lookup per member, which the host observer's
   * budget counts (a repaint of one host must cost that host's lookup, not a
   * second pass).
   */
  const syncHandles = (only?: ReadonlySet<string>): void => {
    deps.syncA11y(only);
    if (ctx.disposed()) return;
    ensureStaticGuard();
    syncSlabs();
    const grip = gripOf(deps.dragHandle());
    const isStatic = ctx.isStatic();
    const rtl = ctx.rtl();
    for (const id of group.members ?? []) {
      if (only && !only.has(id)) continue;
      const node = diagram.getNode(id);
      if (!node) continue;
      const host = ctx.hostOf(id);
      if (!host) continue;
      syncGrip(host, grip, node.state?.locked !== true && !isStatic && node.getMetadata?.('widgetMovable') !== false);
      if (!deps.wantHandles) continue;
      const existing = host.querySelector(':scope > .axdb-rs');
      if (node.state?.locked === true || isStatic || node.getMetadata?.('widgetResizable') === false) {
        existing?.remove();
        continue;
      }
      const rs = existing ?? document.createElement('div');
      if (!existing) {
        rs.className = 'axdb-rs';
        rs.setAttribute('title', 'Resize');
        host.appendChild(rs);
      }
      // The grab corner mirrors with the board: bottom-right LTR, bottom-left
      // RTL — the same corner the tile actually grows from in each direction.
      rs.classList.toggle('axdb-rs--rtl', rtl);
    }
  };

  /**
   * Only a HOST-LEVEL change matters: a host arriving (a mount) or a host's
   * own children changing (a repaint that wiped the injected handle). A
   * chart's internal churn — most of what a live dashboard mutates — targets
   * deeper nodes and is ignored, and the hosts the records DO name are the
   * only ones re-synced. This was members × repaints `querySelector` calls
   * per wave (9,216 at 96 widgets, review D10); it is now proportional to the
   * hosts that actually changed.
   */
  const hostObserver = new MutationObserver((records) => {
    const touched = new Set<string>();
    const noteHost = (el: Node | null): void => {
      const e = el as Element | null;
      if (e?.classList?.contains('grafloria-node-host')) {
        const id = e.getAttribute('data-node-id');
        if (id) touched.add(id);
      }
    };
    for (const r of records) {
      // Our own re-injected handle arriving is not a change to answer — it
      // would echo one more pass per repaint.
      const ownEcho =
        r.removedNodes.length === 0 &&
        r.addedNodes.length > 0 &&
        Array.from(r.addedNodes).every((n) => (n as Element).classList?.contains('axdb-rs'));
      if (ownEcho) continue;
      noteHost(r.target);
      r.addedNodes.forEach((n) => noteHost(n));
    }
    if (touched.size) syncHandles(touched);
  });
  const observe = (layer: HTMLElement): void => hostObserver.observe(layer, { childList: true, subtree: true });

  // -- the hover affordance --------------------------------------------------

  /**
   * Edge affordance: the cursor says which border a press would take, the
   * way gridstack's invisible edge handles do. One passive listener on the
   * container; the corner handle keeps its own cursor from the stylesheet.
   */
  let hoverHost: HTMLElement | null = null;
  const onHover = (e: PointerEvent): void => {
    if (ctx.disposed() || deps.gestureRunning()) return;
    markHotSection(e.clientX, e.clientY);
    let host = (e.target as Element | null)?.closest?.('.grafloria-node-host') as HTMLElement | null;
    if (!host) {
      for (const id of group.members ?? []) {
        const h = ctx.hostOf(id);
        if (!h) continue;
        const r = h.getBoundingClientRect();
        if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
          host = h;
          break;
        }
      }
    }
    if (hoverHost && hoverHost !== host) {
      hoverHost.style.cursor = '';
      hoverHost.removeAttribute('data-axdb-edge'); // the affordance follows the pointer off a tile
    }
    hoverHost = host;
    const grabbing = deps.grabbing();
    if (!host) {
      const wpt = api.viewport?.clientToWorld ? api.viewport.clientToWorld(e.clientX, e.clientY, api.container.getBoundingClientRect()) : null;
      const sid = wpt ? deps.memberGroupAt(wpt.x, wpt.y) : null;
      const grp = sid ? diagram.getGroup(sid) : undefined;
      const c = grp && wpt && !ctx.isStatic() ? cursorFor(deps.slabEdgesNear(grp, wpt.x, wpt.y)) : '';
      if (!grabbing) api.container.style.cursor = c;
      return;
    }
    if (!grabbing && api.container.style.cursor) api.container.style.cursor = '';
    const id = host.getAttribute('data-node-id') ?? '';
    if (!(group.members ?? new Set<string>()).has(id)) return;
    const node = diagram.getNode(id);
    const resizable =
      !!node && !ctx.isStatic() && node.state?.locked !== true && node.getMetadata?.('widgetResizable') !== false;
    const cursor = resizable ? cursorFor(edgesNear(host, e.clientX, e.clientY)) : '';
    if (cursor) host.setAttribute('data-axdb-edge', cursor);
    else host.removeAttribute('data-axdb-edge');
  };

  const dispose = (): void => {
    guardedLayer?.removeEventListener('pointerdown', staticGuard);
    hostObserver.disconnect();
    for (const el of slabEls.values()) el.remove();
    slabEls.clear();
    hoverSlabs.clear();
    for (const bg of groupBgs.values()) bg.remove();
    groupBgs.clear();
    refusal?.remove();
    refusal = null;
    flushCarried();
  };

  return { syncSlabs, syncHandles, observe, ensureStaticGuard, onHover, onHoverLeave, setCarried, flushCarried, showRefusal, dispose };
}
