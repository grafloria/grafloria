/**
 * Data-driven NODE TEMPLATES — the renderer half (`nodeTemplates`), with port
 * ANCHORING (`data-port`) and level of detail (`compactBelow`).
 *
 * Register a template once per node type: `(data, ctx) → { html, ports, size }`.
 *  - Nodes of that type become HTML cards; the template paints them, and paints
 *    them again whenever their data changes (`SetNodeDataCommand`, collab, code).
 *  - Their ports and size come from the template too. The engine's
 *    `setNodeTemplateResolver` is what makes a data edit re-derive them INSIDE
 *    the edit's own undo step, wires to a removed port included.
 *  - An element in the card marked `data-port="<port id>"` anchors that port: the
 *    port sits on its side's edge, level with the element (or AT the element,
 *    with `portAnchor: 'element'` / `data-port-anchor="element"`). Re-measured after
 *    every paint, when the card resizes and when fonts finish loading; measured
 *    in card units, so the zoom never moves it.
 *  - Below `compactBelow` zoom a card shows the template's `compact` content
 *    instead of shrinking its text to nothing; the host carries
 *    `data-lod="compact" | "full"` either way, for CSS.
 *
 * `html` is the HOST'S OWN markup and is used as given (it is the host's
 * template, not user input); pass a Node to build it with the DOM instead.
 */
import { applyNodeTemplate } from '@grafloria/engine';
import type { DiagramModel, NodeModel, NodeTemplateResolution, PortModel } from '@grafloria/engine';
import { buildPort } from '../model-input';
import type { PortSpec } from '../model-input';
import type { Feature, FeatureContext } from './feature';

export interface NodeTemplateContext {
  node: NodeModel;
  /** The camera zoom now. */
  zoom: number;
  /** True below `compactBelow`: draw the short form. */
  compact: boolean;
}

export interface NodeTemplateOutput {
  /** The card's content: markup (the host's own, used as given) or a DOM node. */
  html?: string | Node;
  /** The node's ports for this data, in order. Ids are kept stable by the template. */
  ports?: PortSpec[];
  /** The node's size for this data. */
  size?: { width: number; height: number };
}

export type NodeTemplateFn = (data: Record<string, unknown>, ctx: NodeTemplateContext) => NodeTemplateOutput;

export interface NodeTemplateDef {
  render: NodeTemplateFn;
  /** The short form shown below `compactBelow` (an icon and a title, say). Default: `render`'s html. */
  compact?(data: Record<string, unknown>, ctx: NodeTemplateContext): string | Node;
  /** Override the instance's `compactBelow` for this type. */
  compactBelow?: number;
  /**
   * Where an anchored LEFT/RIGHT port sits across the card. `'edge'` (default):
   * on its side's edge, level with its element. `'element'`: at the element's
   * centre, x as well as y — for a card that draws something past its edge (an
   * output's name on the wire), so the wire starts where the element is. One
   * element can ask for it alone with `data-port-anchor="element"`.
   */
  portAnchor?: 'edge' | 'element';
}

export type NodeTemplate = NodeTemplateFn | NodeTemplateDef;

export interface NodeTemplatesConfig {
  templates: Record<string, NodeTemplate>;
  /** Zoom below which cards draw their compact form. Default: never. */
  compactBelow?: number;
  /** Anchor ports to `[data-port]` elements. Default true. */
  anchorPorts?: boolean;
}

const defOf = (t: NodeTemplate): NodeTemplateDef => (typeof t === 'function' ? { render: t } : t);

interface Mounted {
  node: NodeModel;
  host: HTMLElement;
  dataKey: string;
  compact: boolean;
  resize?: ResizeObserver;
}

/** The pure half: what the engine's resolver and node preparation need. Built before any node exists. */
export function createNodeTemplates(config: NodeTemplatesConfig, getZoom: () => number) {
  const defs = new Map(Object.entries(config.templates).map(([type, t]) => [type, defOf(t)]));
  const compactBelowOf = (def: NodeTemplateDef) => def.compactBelow ?? config.compactBelow;
  const isCompact = (def: NodeTemplateDef) => {
    const below = compactBelowOf(def);
    return below !== undefined && getZoom() < below;
  };
  const output = (node: NodeModel): NodeTemplateOutput | undefined => {
    const def = defs.get(node.type);
    if (!def) return undefined;
    return def.render({ ...(node.data ?? {}) }, { node, zoom: getZoom(), compact: isCompact(def) });
  };

  /** The engine resolver: ports + size for the node's current data. */
  const resolve = (node: NodeModel): NodeTemplateResolution | undefined => {
    const out = output(node);
    if (!out) return undefined;
    // Keep a port's measured anchor across a re-derivation: it is the same port.
    const ports = out.ports?.map((spec, i) => {
      const port = buildPort(node.id, spec, i);
      const prev = node.getPort(port.id) as PortModel | undefined;
      if (prev?.layout && !spec.layout && (prev as { anchored?: boolean }).anchored) {
        port.layout = prev.layout;
        (port as { anchored?: boolean }).anchored = true;
      }
      return port;
    });
    return { ports, size: out.size };
  };

  return {
    has: (type: string) => defs.has(type),
    defOf: (type: string) => defs.get(type),
    output,
    resolve,
    isCompact,
    /** Make a node of a templated type an HTML card with the template's ports and size (no undo entry). */
    prepare(model: DiagramModel, node: NodeModel): void {
      if (!defs.has(node.type)) return;
      model.runSystemWrite(() => {
        if (!node.getMetadata('useHTMLLayer')) node.setMetadata('useHTMLLayer', true);
        const answer = resolve(node);
        if (answer) applyNodeTemplate(model, node, answer);
      });
    },
  };
}

export type NodeTemplates = ReturnType<typeof createNodeTemplates>;

const PX = 0.5; // a port moves only when the measure moved by more than this

/** The DOM half: painting cards, anchoring ports, the compact switch. */
export function installNodeTemplates(ctx: FeatureContext, templates: NodeTemplates, config: NodeTemplatesConfig): Feature & {
  mount(node: NodeModel, host: HTMLElement): void;
  unmount(nodeId: string): void;
} {
  const mounted = new Map<string, Mounted>();
  const anchor = config.anchorPorts !== false;

  const paint = (m: Mounted): void => {
    const def = templates.defOf(m.node.type);
    if (!def) return;
    const compact = templates.isCompact(def);
    const data = { ...(m.node.data ?? {}) };
    const tctx = { node: m.node, zoom: ctx.viewport.getZoom(), compact };
    const content = compact && def.compact ? def.compact(data, tctx) : def.render(data, tctx).html;
    m.host.replaceChildren();
    if (typeof content === 'string') m.host.innerHTML = content;
    else if (content) m.host.appendChild(content);
    m.host.setAttribute('data-lod', compact ? 'compact' : 'full');
    m.host.setAttribute('data-node-type', m.node.type);
    m.dataKey = JSON.stringify(m.node.data ?? {});
    m.compact = compact;
    if (!compact) measure(m);
  };

  /** Put each `[data-port]` element's port on its side's edge, level with the element. */
  const measure = (m: Mounted): void => {
    if (!anchor || !m.host.isConnected) return;
    const marks = m.host.querySelectorAll<HTMLElement>('[data-port]');
    if (marks.length === 0) return;
    const hostRect = m.host.getBoundingClientRect();
    const w = m.node.size?.width ?? 0;
    const h = m.node.size?.height ?? 0;
    // The host is scaled by the camera: card units = screen px / scale.
    const scale = w > 0 && hostRect.width > 0 ? hostRect.width / w : ctx.viewport.getZoom() || 1;
    const moved: PortModel[] = [];
    const model = ctx.getModel();
    const template = config.templates[m.node.type];
    const typeAnchor = template ? defOf(template).portAnchor ?? 'edge' : 'edge';
    model.runSystemWrite(() => {
      for (const el of Array.from(marks)) {
        const port = m.node.getPort(el.getAttribute('data-port') ?? '') as PortModel | undefined;
        if (!port) continue;
        const r = el.getBoundingClientRect();
        const cy = (r.top + r.height / 2 - hostRect.top) / scale;
        const cx = (r.left + r.width / 2 - hostRect.left) / scale;
        const side = port.side ?? 'right';
        const atElement = (el.getAttribute('data-port-anchor') ?? typeAnchor) === 'element';
        const x = atElement ? cx : side === 'left' ? 0 : side === 'right' ? w : cx;
        const y = atElement ? cy : side === 'top' ? 0 : side === 'bottom' ? h : cy;
        const args = port.layout?.strategy === 'absolute' ? (port.layout.args as { x?: number; y?: number; units?: string } | undefined) : undefined;
        if (args?.units === 'px' && Math.abs((args.x ?? 0) - x) <= PX && Math.abs((args.y ?? 0) - y) <= PX) continue;
        port.layout = { strategy: 'absolute', args: { units: 'px', x, y } };
        (port as { anchored?: boolean }).anchored = true;
        moved.push(port);
      }
    });
    if (moved.length === 0) return;
    // A port that moved takes its WIRES with it: the links on it (and the node,
    // for its port glyphs) are marked changed, so the next frame re-routes them
    // instead of serving the route they had before the port moved — and, as a
    // model change, that frame is not one the scheduler is allowed to skip.
    m.node.markDirty?.();
    for (const port of moved) for (const link of model.getLinksForPort(port.id)) link.markDirty?.();
    ctx.invalidate();
  };

  // Fonts change text metrics, and with them where every marked row sits.
  const fonts = (ctx.doc as Document & { fonts?: FontFaceSet }).fonts;
  const onFonts = () => {
    for (const m of mounted.values()) if (!m.compact) measure(m);
  };
  fonts?.addEventListener?.('loadingdone', onFonts);

  return {
    mount(node, host) {
      const m: Mounted = { node, host, dataKey: '', compact: false };
      mounted.set(node.id, m);
      paint(m);
      if (anchor && typeof ResizeObserver !== 'undefined') {
        m.resize = new ResizeObserver(() => (m.compact ? undefined : measure(m)));
        m.resize.observe(host);
      }
    },
    unmount(nodeId) {
      mounted.get(nodeId)?.resize?.disconnect();
      mounted.delete(nodeId);
    },
    sync() {
      const model = ctx.getModel();
      for (const [id, m] of mounted) {
        const node = model.getNode(id);
        if (!node) continue;
        m.node = node;
        const def = templates.defOf(node.type);
        if (!def) continue;
        if (JSON.stringify(node.data ?? {}) !== m.dataKey || templates.isCompact(def) !== m.compact) paint(m);
      }
    },
    camera() {
      for (const m of mounted.values()) {
        const def = templates.defOf(m.node.type);
        if (def && templates.isCompact(def) !== m.compact) paint(m);
      }
    },
    dispose() {
      fonts?.removeEventListener?.('loadingdone', onFonts);
      for (const m of mounted.values()) m.resize?.disconnect();
      mounted.clear();
    },
  };
}
