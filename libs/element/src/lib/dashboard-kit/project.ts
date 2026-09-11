/**
 * THE PROJECTION (tile first, step 4b-i): cells to pixels, and the chrome that
 * rides on the projection — the board's own height, the placeholder under a
 * ghost, the ghost's transition exemption, the glide every pushed tile gets.
 * Moved out of the binder unchanged in behaviour; the binder keeps calling
 * these by the same names.
 */
import type { WorldRect } from './grid-mapping';
import { cellToRect } from './grid-mapping';
import type { BoardCtx } from './board-ctx';

const GLIDE_OFF_DELAY = 400;

export interface Projection {
  /** Write one member's projected rect (derived state → system write). */
  writeRect(id: string, r: WorldRect): void;
  /** Enforce the board-frame height the sizing mode implies. */
  enforceBoardHeight(): void;
  /** Project every member from its engine cells (the ghost is exempt). */
  project(): void;
  /** The placeholder follows the ghost's cell; gone when there is no ghost on this board. */
  syncPlaceholder(): void;
  /** Take the placeholder down now (an accent overlay says which half; the grey cell under it is noise). */
  hidePlaceholder(): void;
  armGlide(): void;
  disarmGlideSoon(): void;
  /** Lift a pending ghost NOW. */
  flushGhost(): void;
  setGhost(id: string, on: boolean): void;
  dispose(): void;
}

export function createProjection(ctx: BoardCtx, deps: { afterProject(): void }): Projection {
  const { api, group, diagram } = ctx;
  let placeholder: HTMLElement | null = null;
  let glideTimer: ReturnType<typeof setTimeout> | null = null;
  let ghostTimer: ReturnType<typeof setTimeout> | null = null;
  /** The host whose ghost class the pending timer will lift. */
  let ghostHost: HTMLElement | null = null;

  const writeRect = (id: string, r: WorldRect): void => {
    const node = diagram.getNode(id);
    if (node) {
      if (
        Math.abs(node.position.x - r.x) > 0.25 ||
        Math.abs(node.position.y - r.y) > 0.25 ||
        Math.abs(node.size.width - r.width) > 0.25 ||
        Math.abs(node.size.height - r.height) > 0.25
      ) {
        diagram.runSystemWrite(() => {
          node.setPosition(r.x, r.y);
          node.setSize(r.width, r.height, node.size.depth ?? 0);
        });
      }
      return;
    }
    const grp = diagram.getGroup(id);
    if (grp) {
      const p = grp.position;
      const s = ctx.sizeOf(grp);
      if (
        Math.abs(p.x - r.x) > 0.25 ||
        Math.abs(p.y - r.y) > 0.25 ||
        Math.abs(s.width - r.width) > 0.25 ||
        Math.abs(s.height - r.height) > 0.25
      ) {
        diagram.runSystemWrite(() => grp.setFrame({ ...r }));
      }
    }
  };

  const enforceBoardHeight = (): void => {
    const designH = ctx.designH();
    if (designH <= 0) return;
    const r = ctx.rows();
    // FIT keeps its design height, full stop — the user's rule: "the board
    // stays the same and the widgets change size so all of them fit". Only
    // overflow:'scroll' lets the frame EXTEND to hold the rows at the floor
    // height (and the canvas pan). Grow extends at the base row height.
    const target =
      ctx.sizing() === 'fit'
        ? ctx.overflow === 'scroll'
          ? Math.max(designH, 2 * ctx.padding + r * ctx.minRowHeight + (r - 1) * ctx.gap)
          : designH
        : Math.max(designH, 2 * ctx.padding + r * ctx.baseRowHeight + (r - 1) * ctx.gap);
    const f = ctx.frame();
    if (Math.abs(f.height - target) > 0.5) {
      ctx.write(() => diagram.runSystemWrite(() => group.setFrame({ x: f.x, y: f.y, width: f.width, height: target })));
    }
  };

  /** The placeholder exists ONLY while a gesture is live — so at any moment
   *  the DOM holds at most one `.axdb-ph` per active gesture, not one idle
   *  div per bound board. */
  const syncPlaceholder = (): void => {
    const ghostId = ctx.ghostId();
    const item = ghostId ? ctx.engine().getItem(ghostId) : undefined;
    if (!item) {
      placeholder?.remove();
      placeholder = null;
      return;
    }
    const layer = ctx.htmlLayer();
    if (!layer) return;
    if (!placeholder || placeholder.parentElement !== layer) {
      placeholder?.remove();
      placeholder = document.createElement('div');
      placeholder.className = 'axdb-ph';
      layer.prepend(placeholder);
    }
    const r = cellToRect(item, ctx.frame(), ctx.geom(), ctx.rows());
    placeholder.style.display = 'block';
    placeholder.style.left = `${r.x}px`;
    placeholder.style.top = `${r.y}px`;
    placeholder.style.width = `${r.width}px`;
    placeholder.style.height = `${r.height}px`;
  };

  const hidePlaceholder = (): void => {
    placeholder?.remove();
    placeholder = null;
  };

  const project = (): void => {
    enforceBoardHeight();
    ctx.write(() => {
      const f = ctx.frame();
      const g = ctx.geom();
      const r = ctx.rows();
      const ghost = ctx.ghostId();
      for (const item of ctx.engine().getItems()) {
        if (item.id === ghost) continue; // the ghost — this board's own, or one adopted from another binder
        writeRect(item.id, cellToRect(item, f, g, r));
      }
    });
    syncPlaceholder();
    // The section overlays are projected chrome like the placeholder: they
    // follow every frame write, not only a rebuild. Painted at bind time only,
    // a section two levels down kept the geometry of its parent's placeholder
    // frame (100 × 34) after the view board had laid the parent out (the kit
    // lab's L47, 2026-09-08).
    deps.afterProject();
  };

  const armGlide = (): void => {
    ctx.htmlLayer()?.classList.add('axdb-glide');
    if (glideTimer) clearTimeout(glideTimer);
  };

  const disarmGlideSoon = (): void => {
    if (glideTimer) clearTimeout(glideTimer);
    glideTimer = setTimeout(() => ctx.htmlLayer()?.classList.remove('axdb-glide'), GLIDE_OFF_DELAY);
  };

  /**
   * Lift a pending ghost NOW. One timer serves every host, so superseding it
   * (a new gesture within 60 ms of the last drop — ③ then ④ in the
   * nested-containers checks — or a dispose on a rebind) used to clear the
   * timer and leave the previous tile lifted for good: a permanent drop
   * shadow the visual gate finally caught.
   */
  const flushGhost = (): void => {
    if (ghostTimer) clearTimeout(ghostTimer);
    ghostTimer = null;
    ghostHost?.classList.remove('axdb-ghost', 'axdb-out');
    ghostHost = null;
  };
  const setGhost = (id: string, on: boolean): void => {
    const host = ctx.hostOf(id);
    if (!host) return;
    if (ghostHost && ghostHost !== host) flushGhost();
    if (on) {
      if (ghostTimer) clearTimeout(ghostTimer);
      ghostTimer = null;
      host.classList.add('axdb-ghost');
      host.classList.remove('axdb-out');
      ghostHost = host;
    } else {
      host.classList.remove('axdb-out');
      // Keep transition-exemption through the drop write so the snap into the
      // placeholder is INSTANT (gridstack-style), then let glides resume.
      if (ghostTimer) clearTimeout(ghostTimer);
      ghostHost = host;
      ghostTimer = setTimeout(() => {
        host.classList.remove('axdb-ghost');
        ghostTimer = null;
        if (ghostHost === host) ghostHost = null;
      }, 60);
    }
  };

  const dispose = (): void => {
    hidePlaceholder();
    if (glideTimer) clearTimeout(glideTimer);
    glideTimer = null;
    // A rebind inside the 60 ms window (a layout switch right after an undo)
    // disposed this binder with the timer pending — the host kept its
    // lifted ghost for good (visual gate, nested-containers ⑤).
    flushGhost();
    ctx.htmlLayer()?.classList.remove('axdb-glide');
    void api;
  };

  return { writeRect, enforceBoardHeight, project, syncPlaceholder, hidePlaceholder, armGlide, disarmGlideSoon, flushGhost, setGhost, dispose };
}
