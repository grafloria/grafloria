/**
 * `affordances` — the "+" a flow editor puts where the next step can go.
 *
 *  - `portAdd`: a "+" just off every OUTPUT port with nothing attached.
 *  - `linkAdd` / `linkDelete`: on a hovered link, a "+" at its midpoint (insert a
 *    step here) and a delete button beside it.
 *
 * A press that MOVES past the drag threshold on a port's "+" starts a connection
 * from that port, exactly as a drag from the port does — the "+" is the bigger
 * target. A press without movement still only asks.
 *
 * They only ASK: a press emits `port:add-request { nodeId, portId, clientPoint }`,
 * `link:add-request { linkId, clientPoint }` or `link:delete-request { linkId,
 * clientPoint }` and changes nothing — the host opens its menu, inserts, deletes.
 * They never show while the view is read-only. Their presses are their own (the
 * canvas never starts a pan or a marquee under one), and a link's buttons stay
 * while the pointer is on them, so moving from the line to the button works.
 *
 * Styling: `.grafloria-port-add` / `.grafloria-link-add` / `.grafloria-link-delete`
 * (`data-side` on the port one), colours from `--grafloria-add-bg`, `-fg`,
 * `-line`, `--grafloria-delete-bg` / `-fg`.
 */
import type { LinkModel, NodeModel, PortModel } from '@grafloria/engine';
import { portWorldPosition } from '../../svg/port-positioning';
import type { Feature, FeatureContext } from './feature';

export interface AffordanceOptions {
  /** "+" on unconnected output ports. `true`, or a predicate choosing which. */
  portAdd?: boolean | ((port: PortModel, node: NodeModel) => boolean);
  /** "+" at a hovered link's midpoint. */
  linkAdd?: boolean;
  /** A delete button beside it. */
  linkDelete?: boolean;
  /**
   * When a link's buttons show. `'hover'` (default): while it is hovered.
   * `'hover-and-selected'`: also while it is SELECTED (a click selects it), until
   * the selection changes — the only way to reach them on a touch screen.
   */
  linkButtons?: 'hover' | 'hover-and-selected';
}

export interface PortAddRequest {
  nodeId: string;
  portId: string;
  clientPoint: { x: number; y: number };
}
export interface LinkAddRequest {
  linkId: string;
  clientPoint: { x: number; y: number };
}

const STYLE_ID = 'grafloria-affordances-css';
const AFF_CSS = `
.grafloria-affordances{position:absolute;left:0;top:0;width:0;height:0;overflow:visible;pointer-events:none;z-index:3}
.grafloria-port-add,.grafloria-link-add,.grafloria-link-delete{position:absolute;box-sizing:border-box;width:22px;height:22px;margin:-11px 0 0 -11px;padding:0;border-radius:6px;display:grid;place-items:center;pointer-events:auto;cursor:pointer;font:600 15px/1 system-ui,-apple-system,"Segoe UI",sans-serif;background:var(--grafloria-add-bg,#fff);color:var(--grafloria-add-fg,#4b5563);border:1.5px solid var(--grafloria-add-line,#9aa3b2);transition:transform .12s,background .12s,color .12s}
.grafloria-port-add:hover,.grafloria-link-add:hover{background:var(--grafloria-add-fg,#4b5563);color:var(--grafloria-add-bg,#fff);transform:scale(1.08)}
.grafloria-port-add::before{content:"";position:absolute;border-color:var(--grafloria-add-line,#9aa3b2);border-style:solid;border-width:0}
.grafloria-port-add[data-side="right"]::before{right:100%;top:50%;width:14px;border-top-width:1.5px}
.grafloria-port-add[data-side="left"]::before{left:100%;top:50%;width:14px;border-top-width:1.5px}
.grafloria-port-add[data-side="bottom"]::before{bottom:100%;left:50%;height:14px;border-left-width:1.5px}
.grafloria-port-add[data-side="top"]::before{top:100%;left:50%;height:14px;border-left-width:1.5px}
.grafloria-link-delete{font-size:13px;background:var(--grafloria-delete-bg,#fff);color:var(--grafloria-delete-fg,#b42318);border-color:var(--grafloria-delete-fg,#b42318)}
.grafloria-link-delete:hover{background:var(--grafloria-delete-fg,#b42318);color:var(--grafloria-delete-bg,#fff)}
@media (prefers-reduced-motion: reduce){.grafloria-port-add,.grafloria-link-add,.grafloria-link-delete{transition:none}}
`;

const OFFSET = 26; // world px from the port to the "+" centre

function midpoint(points: Array<{ x: number; y: number }>): { x: number; y: number } | null {
  if (points.length < 2) return null;
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

export function installAffordances(ctx: FeatureContext, options: AffordanceOptions): Feature {
  const doc = ctx.doc;
  if (!doc.getElementById(STYLE_ID)) {
    const style = doc.createElement('style');
    style.id = STYLE_ID;
    style.textContent = AFF_CSS;
    (doc.head ?? doc.documentElement).appendChild(style);
  }
  const root = doc.createElement('div');
  root.className = 'grafloria-affordances';
  ctx.htmlLayer.appendChild(root);

  const portButtons = new Map<string, HTMLButtonElement>();
  let linkAdd: HTMLButtonElement | null = null;
  let linkDelete: HTMLButtonElement | null = null;
  let shownLink: string | null = null;
  let overButtons = false;

  /** A press on one of ours is ours: the canvas must not pan, select or marquee under it. */
  const own = (el: HTMLElement): void => {
    for (const type of ['pointerdown', 'mousedown', 'dblclick', 'touchstart']) el.addEventListener(type, (e) => e.stopPropagation());
  };
  const button = (cls: string, text: string, label: string): HTMLButtonElement => {
    const b = doc.createElement('button');
    b.type = 'button';
    b.className = cls;
    b.textContent = text;
    b.setAttribute('aria-label', label);
    own(b);
    return b;
  };
  const point = (e: MouseEvent) => ({ x: e.clientX, y: e.clientY });

  const syncPorts = (): void => {
    const want = new Set<string>();
    if (options.portAdd && !ctx.isReadonly()) {
      const model = ctx.getModel();
      const pick = typeof options.portAdd === 'function' ? options.portAdd : null;
      for (const node of model.getNodes() as NodeModel[]) {
        for (const port of node.ports.values() as Iterable<PortModel>) {
          if (port.type !== 'output') continue;
          if (pick ? !pick(port, node) : false) continue;
          if ((model.getLinksForPort(port.id) as LinkModel[]).length > 0) continue;
          want.add(port.id);
          let b = portButtons.get(port.id);
          if (!b) {
            b = button('grafloria-port-add', '+', 'Add a step');
            const nodeId = node.id;
            const portId = port.id;
            const plus = b;
            // A press that moves becomes a connection drag from the port; one that
            // does not stays a click.
            let dragged = false;
            plus.addEventListener('mousedown', (e) => {
              if (e.button !== 0 || ctx.isReadonly()) return;
              dragged = false;
              const x0 = e.clientX;
              const y0 = e.clientY;
              const move = (m: MouseEvent) => {
                if (Math.hypot(m.clientX - x0, m.clientY - y0) < 4) return;
                done();
                dragged = ctx.startConnection(portId, m.clientX, m.clientY);
              };
              const done = () => {
                ctx.doc.removeEventListener('mousemove', move, true);
                ctx.doc.removeEventListener('mouseup', done, true);
              };
              ctx.doc.addEventListener('mousemove', move, true);
              ctx.doc.addEventListener('mouseup', done, true);
            });
            b.addEventListener('click', (e) => {
              if (dragged) {
                dragged = false;
                return;
              }
              ctx.emit('port:add-request', { nodeId, portId, clientPoint: point(e) } satisfies PortAddRequest);
            });
            root.appendChild(b);
            portButtons.set(port.id, b);
          }
          const at = portWorldPosition(port, node);
          const side = port.side ?? 'right';
          const x = at.x + (side === 'right' ? OFFSET : side === 'left' ? -OFFSET : 0);
          const y = at.y + (side === 'bottom' ? OFFSET : side === 'top' ? -OFFSET : 0);
          b.setAttribute('data-side', side);
          b.setAttribute('data-port-id', port.id);
          b.style.left = `${x}px`;
          b.style.top = `${y}px`;
        }
      }
    }
    for (const [id, b] of portButtons) {
      if (want.has(id)) continue;
      b.remove();
      portButtons.delete(id);
    }
  };

  const hideLink = (): void => {
    linkAdd?.remove();
    linkDelete?.remove();
    linkAdd = linkDelete = null;
    shownLink = null;
  };

  const syncLink = (): void => {
    if ((!options.linkAdd && !options.linkDelete) || ctx.isReadonly()) return hideLink();
    const model = ctx.getModel();
    const links = model.getLinks() as LinkModel[];
    const hovered = links.find((l) => l.state === 'hovered');
    const selected = options.linkButtons === 'hover-and-selected' ? links.find((l) => l.state === 'selected') : undefined;
    const id = hovered?.id ?? (overButtons ? shownLink : null) ?? selected?.id ?? null;
    const link = id ? model.getLink(id) : undefined;
    const mid = link ? midpoint(link.points ?? []) : null;
    if (!link || !mid) return hideLink();
    shownLink = link.id;
    if (options.linkAdd) {
      if (!linkAdd) {
        linkAdd = button('grafloria-link-add', '+', 'Insert a step here');
        linkAdd.addEventListener('click', (e) => shownLink && ctx.emit('link:add-request', { linkId: shownLink, clientPoint: point(e) } satisfies LinkAddRequest));
        hold(linkAdd);
        root.appendChild(linkAdd);
      }
      linkAdd.setAttribute('data-link-id', link.id);
      linkAdd.style.left = `${mid.x - (options.linkDelete ? 14 : 0)}px`;
      linkAdd.style.top = `${mid.y}px`;
    }
    if (options.linkDelete) {
      if (!linkDelete) {
        linkDelete = button('grafloria-link-delete', '×', 'Delete this connection');
        linkDelete.addEventListener('click', (e) => shownLink && ctx.emit('link:delete-request', { linkId: shownLink, clientPoint: point(e) } satisfies LinkAddRequest));
        hold(linkDelete);
        root.appendChild(linkDelete);
      }
      linkDelete.setAttribute('data-link-id', link.id);
      linkDelete.style.left = `${mid.x + (options.linkAdd ? 14 : 0)}px`;
      linkDelete.style.top = `${mid.y}px`;
    }
  };
  /** The link un-hovers as the pointer leaves its line for the button: keep the buttons meanwhile. */
  function hold(el: HTMLElement): void {
    el.addEventListener('pointerenter', () => (overButtons = true));
    el.addEventListener('pointerleave', () => {
      overButtons = false;
      ctx.schedule();
    });
  }

  return {
    sync() {
      if (root.parentNode !== ctx.htmlLayer || root.nextSibling) ctx.htmlLayer.appendChild(root);
      syncPorts();
      syncLink();
    },
    dispose() {
      root.remove();
      portButtons.clear();
    },
  };
}
