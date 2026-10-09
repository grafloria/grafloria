/**
 * The RUN OVERLAY — `api.setOverlay()` / `api.clearOverlay()`.
 *
 * A run drawn ON the flow without becoming part of it: a status frame and badge
 * per node, a label chip and a moving dash per link. It lives only in the DOM
 * (its own element at the end of the HTML layer) and reads the model without
 * writing it, so it can never reach undo, serialization or collab — unlike
 * `node.state.status`, which is document state (serialized, shared in collab).
 * An update repaints straight away, without waiting for a frame, so a run that
 * streams in many times a second costs only the entries it names.
 *
 * The frame FOLLOWS THE CARD'S SHAPE: on an HTML card it takes the corner
 * radius of the card's top element (a "D"-shaped trigger gets a "D"-shaped
 * frame), or hugs the element marked `data-run-shape` when the visible shape is
 * something inside the card (a round badge with a caption under it). Frames
 * also carry `data-node-type`, for host CSS per kind.
 *
 * Styling: classes `grafloria-run-frame` / `-badge` / `-label` / `-flow`, the
 * status on `data-status`, colours from `--grafloria-run-<status>` and
 * `--grafloria-run-label-bg` / `-fg` / `-line`. A node's HTML host also carries
 * `data-run-status` while it has one, for the host's own CSS.
 */
import type { LinkModel, NodeModel } from '@grafloria/engine';
import type { Feature, FeatureContext } from './feature';

export type RunStatus = 'idle' | 'pending' | 'running' | 'completed' | 'error' | 'warning';

export interface RunOverlay {
  nodes?: Record<string, { status?: RunStatus; badge?: string }>;
  links?: Record<string, { label?: string; animate?: boolean }>;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const STYLE_ID = 'grafloria-run-overlay-css';
const RUN_CSS = `
.grafloria-run-overlay{position:absolute;left:0;top:0;width:0;height:0;overflow:visible;pointer-events:none;z-index:2}
.grafloria-run-overlay>svg{position:absolute;left:0;top:0;width:1px;height:1px;overflow:visible}
.grafloria-run-frame{position:absolute;box-sizing:border-box;border-radius:var(--grafloria-run-radius,10px);border:2px solid var(--_grc);box-shadow:0 0 0 3px color-mix(in srgb,var(--_grc) 20%,transparent)}
.grafloria-run-frame[data-status="idle"]{display:none}
.grafloria-run-frame[data-status="pending"]{border-style:dashed;box-shadow:none}
.grafloria-run-frame[data-status="running"]{animation:grafloria-run-pulse 1.2s ease-in-out infinite}
.grafloria-run-badge{position:absolute;transform:translate(-70%,-50%);white-space:nowrap;background:var(--_grc);color:var(--grafloria-run-badge-fg,#fff);font:600 11px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;padding:0 7px;border-radius:999px;box-shadow:0 1px 3px rgba(16,24,40,.25)}
.grafloria-run-label{position:absolute;transform:translate(-50%,-50%);white-space:nowrap;background:var(--grafloria-run-label-bg,#fff);color:var(--grafloria-run-label-fg,#1f2430);border:1px solid var(--grafloria-run-label-line,rgba(31,36,48,.16));font:600 11px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;padding:0 8px;border-radius:999px}
.grafloria-run-flow{fill:none;stroke:var(--grafloria-run-flow,var(--grafloria-run-running,#2563eb));stroke-width:2.5;stroke-linecap:round;stroke-dasharray:6 8;animation:grafloria-run-dash .7s linear infinite}
[data-status="idle"]{--_grc:var(--grafloria-run-idle,#94a3b8)}
[data-status="pending"]{--_grc:var(--grafloria-run-pending,#94a3b8)}
[data-status="running"]{--_grc:var(--grafloria-run-running,#2563eb)}
[data-status="completed"]{--_grc:var(--grafloria-run-completed,#16a34a)}
[data-status="error"]{--_grc:var(--grafloria-run-error,#dc2626)}
[data-status="warning"]{--_grc:var(--grafloria-run-warning,#d97706)}
@keyframes grafloria-run-pulse{50%{box-shadow:0 0 0 7px color-mix(in srgb,var(--_grc) 10%,transparent)}}
@keyframes grafloria-run-dash{to{stroke-dashoffset:-14}}
@media (prefers-reduced-motion: reduce){.grafloria-run-frame,.grafloria-run-flow{animation:none}}
`;

interface NodeView {
  frame: HTMLElement;
  badge: HTMLElement | null;
  /** What was last written, so an unchanged update writes nothing. */
  status: string;
  frameStyle: string;
  badgeStyle: string;
  /** The node's HTML host carrying `data-run-status`, if it has one. */
  host: HTMLElement | null;
  /** The shape the frame hugs, in card units — measured on (re)host, cached between updates. */
  shape: Shape | null;
}

/** Where, inside the node box, the visible shape sits, and its corner radius (already 3 px out). */
interface Shape {
  dx: number;
  dy: number;
  w: number;
  h: number;
  radius: string;
}
interface LinkView {
  label: HTMLElement | null;
  flow: SVGPathElement | null;
}

/** The point halfway along a polyline. */
function midpoint(points: Array<{ x: number; y: number }>): { x: number; y: number } | null {
  if (points.length === 0) return null;
  if (points.length === 1) return { ...points[0]! };
  let total = 0;
  for (let i = 1; i < points.length; i++) total += Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y);
  let left = total / 2;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    if (seg >= left && seg > 0) return { x: a.x + ((b.x - a.x) * left) / seg, y: a.y + ((b.y - a.y) * left) / seg };
    left -= seg;
  }
  return { ...points[points.length - 1]! };
}

export interface RunOverlayFeature extends Feature {
  set(overlay: RunOverlay): void;
  get(): RunOverlay;
}

export function installRunOverlay(ctx: FeatureContext): RunOverlayFeature {
  const doc = ctx.doc;
  if (!doc.getElementById(STYLE_ID)) {
    const style = doc.createElement('style');
    style.id = STYLE_ID;
    style.textContent = RUN_CSS;
    (doc.head ?? doc.documentElement).appendChild(style);
  }

  let overlay: RunOverlay = {};
  let root: HTMLElement | null = null;
  let svg: SVGSVGElement | null = null;
  const nodeViews = new Map<string, NodeView>();
  const linkViews = new Map<string, LinkView>();

  const ensureRoot = (): HTMLElement => {
    if (!root || root.parentNode !== ctx.htmlLayer) {
      root = doc.createElement('div');
      root.className = 'grafloria-run-overlay';
      root.setAttribute('aria-hidden', 'true');
      svg = doc.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
      root.appendChild(svg);
      ctx.htmlLayer.appendChild(root);
      // A fresh root: every view it held is gone with the old one.
      nodeViews.clear();
      linkViews.clear();
    } else if (root.nextSibling) {
      // Stay LAST in the layer: hosts appended after us would paint above.
      ctx.htmlLayer.appendChild(root);
    }
    return root;
  };

  const findHost = (id: string): HTMLElement | null =>
    ctx.container.querySelector(`.grafloria-node-host[data-node-id="${cssEscape(id)}"]`) as HTMLElement | null;

  /** Three px outside a corner radius: `36px` → `39px`; a percentage stays a percentage. */
  const outset = (r: string): string => {
    const px = /^([\d.]+)px$/.exec(r.trim());
    return px ? `${parseFloat(px[1]!) + 3}px` : r.trim() || '0px';
  };
  const measureShape = (node: NodeModel, host: HTMLElement | null): Shape | null => {
    if (!host) return null;
    const marked = host.querySelector('[data-run-shape]') as HTMLElement | null;
    const target = marked ?? (host.firstElementChild as HTMLElement | null);
    if (!target) return null;
    const cs = getComputedStyle(target);
    let raw = [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomRightRadius, cs.borderBottomLeftRadius];
    if (raw.every((c) => !c)) {
      // An engine that does not expand the shorthand: read it (1–4 values, circular corners).
      const v = (cs.borderRadius || target.style.borderRadius || '').split('/')[0]!.trim().split(/\s+/).filter(Boolean);
      raw = v.length === 0 ? ['', '', '', ''] : [v[0]!, v[1] ?? v[0]!, v[2] ?? v[0]!, v[3] ?? v[1] ?? v[0]!];
    }
    const corners = raw.map((c) => outset(c || '0px'));
    const radius = corners.every((c) => c === corners[0]) ? corners[0]! : corners.join(' ');
    const w = node.size?.width ?? 0;
    const h = node.size?.height ?? 0;
    let box = { dx: 0, dy: 0, w, h };
    if (marked) {
      const hr = host.getBoundingClientRect();
      const r = marked.getBoundingClientRect();
      const scale = w > 0 && hr.width > 0 ? hr.width / w : 1;
      // An unlaid-out element (width 0) cannot say where it is: keep the node box.
      if (r.width > 0) box = { dx: (r.left - hr.left) / scale, dy: (r.top - hr.top) / scale, w: r.width / scale, h: r.height / scale };
    }
    return { ...box, radius };
  };

  const dropNodeView = (id: string, view: NodeView): void => {
    view.frame.remove();
    view.badge?.remove();
    view.host?.removeAttribute('data-run-status');
    nodeViews.delete(id);
  };

  /** `rehost`: look the HTML hosts up again (a painted frame may have made or culled them). */
  const paintNodes = (rehost: boolean): void => {
    const model = ctx.getModel();
    const want = overlay.nodes ?? {};
    for (const [id, view] of nodeViews) if (!want[id] || !model.getNode(id)) dropNodeView(id, view);
    for (const id in want) {
      const entry = want[id]!;
      const node: NodeModel | undefined = model.getNode(id);
      if (!node) continue;
      const status = entry.status ?? 'idle';
      let view = nodeViews.get(id);
      if (!view) {
        const frame = doc.createElement('div');
        frame.className = 'grafloria-run-frame';
        frame.setAttribute('data-node-id', id);
        root!.appendChild(frame);
        frame.setAttribute('data-node-type', node.type);
        view = { frame, badge: null, status: '', frameStyle: '', badgeStyle: '', host: null, shape: null };
        nodeViews.set(id, view);
        rehost = true;
      }
      if (rehost || (view.host && !view.host.isConnected)) {
        const host = findHost(id);
        if (host !== view.host) {
          view.host?.removeAttribute('data-run-status');
          view.host = host;
          host?.setAttribute('data-run-status', status);
        }
        view.shape = measureShape(node, view.host);
      }
      const pos = node.getWorldPosition();
      const w = node.size?.width ?? 0;
      const h = node.size?.height ?? 0;
      const sh = view.shape ?? { dx: 0, dy: 0, w, h, radius: '' };
      const frameStyle =
        `left:${pos.x + sh.dx - 3}px;top:${pos.y + sh.dy - 3}px;width:${sh.w + 6}px;height:${sh.h + 6}px` +
        (sh.radius ? `;border-radius:${sh.radius}` : '');
      if (view.frameStyle !== frameStyle) view.frame.setAttribute('style', (view.frameStyle = frameStyle));
      const statusChanged = view.status !== status;
      if (statusChanged) {
        view.status = status;
        view.frame.setAttribute('data-status', status);
      }
      if (entry.badge) {
        if (!view.badge) {
          view.badge = doc.createElement('div');
          view.badge.className = 'grafloria-run-badge';
          root!.appendChild(view.badge);
          view.badgeStyle = '';
          view.badge.setAttribute('data-status', status);
        } else if (statusChanged) view.badge.setAttribute('data-status', status);
        if (view.badge.textContent !== entry.badge) view.badge.textContent = entry.badge;
        const badgeStyle = `left:${pos.x + sh.dx + sh.w}px;top:${pos.y + sh.dy}px`;
        if (view.badgeStyle !== badgeStyle) view.badge.setAttribute('style', (view.badgeStyle = badgeStyle));
      } else if (view.badge) {
        view.badge.remove();
        view.badge = null;
      }
      if (statusChanged) view.host?.setAttribute('data-run-status', status);
    }
  };

  const paintLinks = (): void => {
    const model = ctx.getModel();
    const want = overlay.links ?? {};
    for (const [id, view] of linkViews) {
      if (!want[id] || !model.getLink(id)) {
        view.label?.remove();
        view.flow?.remove();
        linkViews.delete(id);
      }
    }
    for (const [id, entry] of Object.entries(want)) {
      const link: LinkModel | undefined = model.getLink(id);
      if (!link) continue;
      const points = link.points ?? [];
      let view = linkViews.get(id);
      if (!view) {
        view = { label: null, flow: null };
        linkViews.set(id, view);
      }
      if (entry.animate && points.length >= 2) {
        if (!view.flow) {
          view.flow = doc.createElementNS(SVG_NS, 'path') as SVGPathElement;
          view.flow.setAttribute('class', 'grafloria-run-flow');
          view.flow.setAttribute('data-link-id', id);
          svg!.appendChild(view.flow);
        }
        view.flow.setAttribute('d', points.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join(' '));
      } else if (view.flow) {
        view.flow.remove();
        view.flow = null;
      }
      const mid = entry.label ? midpoint(points) : null;
      if (entry.label && mid) {
        if (!view.label) {
          view.label = doc.createElement('div');
          view.label.className = 'grafloria-run-label';
          view.label.setAttribute('data-link-id', id);
          root!.appendChild(view.label);
        }
        if (view.label.textContent !== entry.label) view.label.textContent = entry.label;
        view.label.setAttribute('style', `left:${mid.x}px;top:${mid.y}px`);
      } else if (view.label) {
        view.label.remove();
        view.label = null;
      }
    }
  };

  const isEmpty = (): boolean =>
    Object.keys(overlay.nodes ?? {}).length === 0 && Object.keys(overlay.links ?? {}).length === 0;

  const paint = (rehost = false): void => {
    if (isEmpty()) {
      for (const [id, view] of nodeViews) dropNodeView(id, view);
      nodeViews.clear();
      linkViews.clear();
      root?.remove();
      root = null;
      svg = null;
      return;
    }
    ensureRoot();
    paintNodes(rehost);
    paintLinks();
  };

  return {
    set(next) {
      // A copy: the host may keep mutating its object between updates.
      overlay = {
        nodes: next.nodes ? { ...next.nodes } : undefined,
        links: next.links ? { ...next.links } : undefined,
      };
      paint();
    },
    get: () => ({
      nodes: overlay.nodes ? { ...overlay.nodes } : undefined,
      links: overlay.links ? { ...overlay.links } : undefined,
    }),
    // Nodes move and routes change on painted frames: follow them.
    sync: () => (isEmpty() ? undefined : paint(true)),
    dispose: () => {
      overlay = {};
      paint();
    },
  };
}

function cssEscape(id: string): string {
  const escape = (globalThis as { CSS?: { escape?(s: string): string } }).CSS?.escape;
  return escape ? escape(id) : id.replace(/["\\]/g, '\\$&');
}
