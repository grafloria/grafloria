// VNode → XML string. The headless sibling of `vnode/patch.ts`.
//
// The patcher turns a VNode tree into live DOM; this turns the SAME tree into a
// string, with ZERO DOM: no `document`, no `XMLSerializer`, no `innerHTML`. It
// runs in plain Node, in a worker, in an SSR pass. That is the whole point of the
// card: one VNode contract, two consumers, identical picture.
//
// It shares THE prop → attribute mapping with the patcher (`attrNameForProp`,
// `serializeStyle`) so the two cannot drift.
//
// Three things this does that the patcher does not:
//
//   1. FLATTENS the stylesheet. The patcher can rely on the injected
//      `var(--grafloria-*)` stylesheet being in the document; a file cannot. A
//      {@link ClassStyleResolver} turns each element's class list into concrete
//      presentation attributes, inserted at the correct point of the CSS priority
//      order (see below).
//
//   2. DROPS live-pipeline-only attributes. `data-grafloria-instance` (the CSS scope)
//      and `container-id` (the foreignObject component-injection handle) are both
//      derived from PROCESS-GLOBAL COUNTERS. They mean nothing in a file, and
//      keeping them would make the output depend on how many renderers/nodes the
//      process happened to create first — i.e. it would destroy determinism.
//
//   3. TRANSLATES `filter: blur(Npx)` into a real `<filter>` def. The renderer's
//      node shadow uses the CSS filter shorthand, which browsers accept on SVG
//      but standalone rasterizers (resvg / librsvg / Inkscape) do not. Emitting an
//      feGaussianBlur def keeps shadows in the exported picture.
//
// CSS PRIORITY ORDER — reproduced exactly, then COLLAPSED:
//     presentation attribute  <  author stylesheet rule  <  inline style
// The winner of that order is emitted as a presentation attribute and the `style`
// attribute is dropped, so every property appears exactly once, in the form the
// widest range of SVG consumers understands. (HTML inside a foreignObject is the
// exception — HTML has no presentation attributes, so there the `style` attribute
// is kept verbatim.)

import type { VNode } from '../types/vnode.types';
import { attrNameForProp, serializeStyle, SVG_NS } from '../vnode/patch';
import type { ClassStyleResolver } from './style-flattener';

/** What the serializer does with a `<foreignObject>` (HTML-in-SVG) subtree. */
export type ForeignObjectMode = 'serialize' | 'placeholder' | 'omit';

/**
 * WHO is going to read this string — the only axis on which the two callers differ.
 *
 *   'file' (default)  A standalone `.svg` a rasterizer / Inkscape / an email client
 *                     will read. It has no stylesheet, so the cascade is FLATTENED
 *                     into presentation attributes; live-pipeline attributes minted
 *                     from process-global counters are DROPPED (they mean nothing in
 *                     a file and would destroy determinism); CSS `filter: blur()` is
 *                     translated into a real `<filter>` def.
 *
 *   'dom'             An SSR snapshot the client's VNodePatcher will ADOPT. Here the
 *                     string must describe exactly the DOM the patcher would have
 *                     built from the same tree — otherwise hydration sees a different
 *                     attribute set, tears the node down and rebuilds it, and the
 *                     diagram flashes. So: `style` is kept verbatim, nothing is
 *                     dropped, no cascade flattening, and the patcher's `data-vnode-key`
 *                     mirror is reproduced.
 *
 * ONE traversal serves both. Keeping two would have meant two copies of the
 * prop→attribute rules, and the moment one learned a new verbatim attribute and the
 * other did not, exported files and hydrated pages would quietly disagree about what
 * the diagram looks like.
 */
export type SerializeFidelity = 'file' | 'dom';

/**
 * Props that address the LIVE pipeline, not the picture. Both are minted from
 * process-global counters, so serializing them would make byte-identical output
 * impossible across processes.
 */
const DROPPED_PROPS = new Set(['containerId', 'data-grafloria-instance']);

/** `blur(4px)` / `blur(4)` → the radius in px. */
const CSS_BLUR = /^blur\(\s*([\d.]+)(?:px)?\s*\)$/;

export interface SerializeOptions {
  /** Who reads the output. Default `'file'`. See {@link SerializeFidelity}. */
  fidelity?: SerializeFidelity;

  /** Stamp `xmlns` on the root element (needed for a standalone `.svg` file). */
  standalone?: boolean;

  /**
   * Resolves an element's classes to the presentation attributes the renderer's
   * stylesheet would have painted. Omit for a tree rendered in programmatic mode
   * (there is no stylesheet there — every value is already on the element).
   * Ignored under `fidelity: 'dom'` — the client has the real stylesheet.
   */
  classStyles?: ClassStyleResolver;

  /** How to handle `<foreignObject>` subtrees. Default `'serialize'`. */
  foreignObject?: ForeignObjectMode;

  /**
   * Faithful foreignObject export. The VNode tree does NOT contain the HTML a
   * framework mounted into a foreignObject (the patcher treats those subtrees as
   * opaque and never touches their children) — so a headless serializer CANNOT
   * know what is in there. A browser-side caller that has the live DOM can hand
   * the markup back through this hook (e.g. `el.outerHTML` of the mounted
   * content); it is emitted verbatim inside the `<foreignObject>`.
   */
  captureForeignObject?: (vnode: VNode) => string | undefined;

  /** Collector for fidelity caveats hit while serializing. */
  warnings?: string[];

  /** Collector for `<defs>` elements the serializer had to synthesize (blur filters). */
  extraDefs?: Map<string, string>;

  /**
   * This subtree is XHTML, not SVG (i.e. it is inside a `<foreignObject>`). Set
   * automatically when recursing into one — HTML has no presentation attributes,
   * so there the `style` attribute is kept verbatim and no class flattening is
   * attempted (the host's own CSS, which we do not own, styles that content).
   */
  html?: boolean;
}

/** XML-escape an attribute value. */
export function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** XML-escape text content. */
export function escapeText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Split a `class` string into its tokens. */
function classList(className: unknown): string[] {
  if (typeof className !== 'string' || className.trim() === '') return [];
  return className.trim().split(/\s+/);
}

/**
 * Turn `filter: blur(4px)` into a real SVG filter def and return the `url(#…)`
 * reference. CSS `blur(r)` is a Gaussian blur of std-deviation r/2.
 *
 * The def id is derived from the radius alone → the same radius always yields the
 * same id (determinism), and N shadows share ONE def.
 */
function translateBlurFilter(value: string, extraDefs: Map<string, string>): string {
  const match = CSS_BLUR.exec(value.trim());
  if (!match) return value; // not a blur shorthand — pass through untouched

  const radius = Number(match[1]);
  const id = `grafloria-blur-${String(radius).replace('.', '_')}`;
  if (!extraDefs.has(id)) {
    extraDefs.set(
      id,
      `<filter id="${id}" x="-50%" y="-50%" width="200%" height="200%">` +
        `<feGaussianBlur stdDeviation="${radius / 2}"/>` +
        `</filter>`
    );
  }
  return `url(#${id})`;
}

/**
 * Serialize ONE VNode (and its subtree) to an XML string.
 *
 * Pure: same VNode in, same string out — no ambient state, no DOM, no clock, no
 * randomness. Attribute order follows prop insertion order, which the renderer
 * builds deterministically, so two calls on the same tree are byte-identical.
 */
export function serializeVNode(vnode: VNode, options: SerializeOptions = {}): string {
  const warnings = options.warnings ?? [];
  const extraDefs = options.extraDefs ?? new Map<string, string>();
  const foMode = options.foreignObject ?? 'serialize';
  const dom = options.fidelity === 'dom';

  if (vnode.type === 'foreignObject') {
    return serializeForeignObject(vnode, { ...options, warnings, extraDefs }, foMode);
  }

  const { attrs, text } = elementAttrs(vnode, options, extraDefs, options.html === true);
  const children = (vnode.children ?? []).filter(isRenderable);

  // A standalone file needs the namespace declared; an SSR snapshot needs it too,
  // because the client parses the markup before the patcher adopts it.
  if (options.standalone && !attrs.has('xmlns') && !options.html) {
    attrs.set('xmlns', SVG_NS);
  }

  // Children are serialized as SVG unless we have crossed into a foreignObject.
  // `standalone` is a ROOT-only concern — never inherit it.
  const childOpts: SerializeOptions = { ...options, warnings, extraDefs, standalone: false };

  const open = `<${vnode.type}${renderAttrs(attrs)}`;

  // `textContent` OWNS the element's content (the patcher has the same rule):
  // elements that render through the prop never also declare children.
  if (text !== undefined) {
    return `${open}>${escapeText(text)}</${vnode.type}>`;
  }

  if (children.length === 0) {
    // Under 'dom' fidelity always write the long form: the patcher builds
    // `<g></g>`, and the snapshot the client parses should read the same.
    return dom ? `${open}></${vnode.type}>` : `${open}/>`;
  }

  const inner = children
    .map(child =>
      isVNodeChild(child)
        ? serializeVNode(child as VNode, childOpts)
        : escapeText(String(child))
    )
    .join('');

  return `${open}>${inner}</${vnode.type}>`;
}

/**
 * foreignObject: the honest story.
 *
 * The VNode tree carries only what the RENDERER declared — for component nodes
 * that is an empty XHTML `<div>` shell whose real content is mounted into the
 * live DOM by the host framework, and which the patcher deliberately never
 * touches again. Headless, that content simply does not exist.
 *
 *   'serialize'   (default) emit the `<foreignObject>` and whatever children the
 *                 VNode declares. Faithful to the contract, and lossless for
 *                 trees that DO declare HTML children. Warns, because (a) the
 *                 host-mounted content is not in the tree and (b) essentially no
 *                 non-browser SVG rasterizer implements foreignObject at all.
 *   'placeholder' replace it with a dashed rect of the same geometry, so a server
 *                 thumbnail shows a box where the component is instead of a hole.
 *   'omit'        drop it.
 *
 * `captureForeignObject` is the escape hatch: a caller WITH a live DOM can hand
 * back the mounted markup and get a faithful export.
 */
function serializeForeignObject(
  vnode: VNode,
  options: SerializeOptions & { warnings: string[]; extraDefs: Map<string, string> },
  mode: ForeignObjectMode
): string {
  const { warnings } = options;
  const props = vnode.props ?? {};

  if (mode === 'omit') {
    warnings.push('foreignObject dropped (foreignObject: "omit")');
    return '';
  }

  if (mode === 'placeholder') {
    warnings.push('foreignObject replaced by a placeholder rect (foreignObject: "placeholder")');
    return (
      `<rect x="${props.x ?? 0}" y="${props.y ?? 0}" ` +
      `width="${props.width ?? 0}" height="${props.height ?? 0}" ` +
      `fill="none" stroke="#94a3b8" stroke-width="1" stroke-dasharray="4,4" ` +
      `class="grafloria-foreign-placeholder"/>`
    );
  }

  // The <foreignObject> element itself is SVG; its CHILDREN are HTML.
  const { attrs } = elementAttrs(vnode, options, options.extraDefs, false);
  const open = `<foreignObject${renderAttrs(attrs)}`;

  const captured = options.captureForeignObject?.(vnode);
  if (captured !== undefined) {
    return `${open}>${captured}</foreignObject>`;
  }

  warnings.push(
    'foreignObject serialized from the VNode tree only — host-mounted HTML/components are NOT in the tree ' +
      '(pass captureForeignObject to supply it). Note that most non-browser SVG rasterizers ignore foreignObject entirely.'
  );

  const children = (vnode.children ?? []).filter(isRenderable);
  if (children.length === 0) return `${open}/>`;

  // Children are XHTML from here down.
  const htmlOptions: SerializeOptions = { ...options, html: true };
  const inner = children
    .map(child =>
      isVNodeChild(child) ? serializeVNode(child as VNode, htmlOptions) : escapeText(String(child))
    )
    .join('');
  return `${open}>${inner}</foreignObject>`;
}

/**
 * Declarations that only exist in CSS. They have no presentation-attribute
 * equivalent, and none of them means anything in a still picture.
 */
const CSS_ONLY_DECLS = new Set([
  'transition',
  'cursor',
  'will-change',
  'animation',
  'animation-name',
  'animation-duration',
  'animation-direction',
  'animation-iteration-count',
  'animation-timing-function',
  'user-select',
  'transform-origin',
]);

/** `'fill: red; stroke-width: 2'` (or the object form) → `{ fill: 'red', 'stroke-width': '2' }`. */
function parseStyleDecls(style: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  const serialized = serializeStyle(style); // handles BOTH forms the renderer emits
  if (!serialized) return out;

  for (const part of serialized.split(';')) {
    const colon = part.indexOf(':');
    if (colon < 0) continue;
    const prop = part.slice(0, colon).trim();
    const value = part.slice(colon + 1).trim();
    if (prop && value) out[prop] = value;
  }
  return out;
}

/**
 * Build an element's FULLY RESOLVED attribute map.
 *
 * The cascade is applied in CSS priority order …
 *
 *   1. props            → presentation attributes (lowest)
 *   2. class rules      → OVERWRITE them (an author rule beats a presentation attr)
 *   3. inline `style`   → OVERWRITES both (highest)
 *
 * … and then every winner is emitted as a PRESENTATION ATTRIBUTE, with no `style`
 * attribute left behind.
 *
 * WHY collapse to attributes rather than keep the winning value in a `style=`:
 * a standalone file is read by things that are not browsers, and presentation
 * attributes are the most universally understood form there is. Leaving
 * `fill="#ffffff" style="fill: #123456"` on an element would render correctly in
 * a browser and WRONG (theme white instead of the node's own red) in any consumer
 * that skips inline CSS — which is the exact class of bug this card exists to
 * kill. One property, one value, one place.
 */
function elementAttrs(
  vnode: VNode,
  options: SerializeOptions,
  extraDefs: Map<string, string>,
  html: boolean
): { attrs: Map<string, string>; text?: string } {
  const props = vnode.props ?? {};
  const attrs = new Map<string, string>();
  let text: string | undefined;
  let inline: Record<string, string> = {};

  // 'dom': describe the DOM the patcher would build, verbatim. No dropping, no
  // flattening, no filter translation — the client HAS the stylesheet, and any
  // difference here is a hydration mismatch (torn-down + rebuilt nodes = a flash).
  const dom = options.fidelity === 'dom';

  for (const key of Object.keys(props)) {
    const value = props[key];

    if (value === null || value === undefined) continue;
    // Event handlers are not attributes. Stringifying a function into the output
    // would emit a JS source dump as an attribute value.
    if (typeof value === 'function') continue;
    // Live-pipeline attributes: meaningless in a file, and minted from process-global
    // counters, so keeping them would make the bytes depend on how many renderers the
    // process happened to build first. In a DOM snapshot they must SURVIVE — the CSS
    // scope (`data-grafloria-instance`) and the component-mount handle both depend on them.
    if (!dom && DROPPED_PROPS.has(key)) continue;

    if (key === 'textContent') {
      text = String(value);
      continue;
    }

    if (key === 'style') {
      // HTML has no presentation attributes: keep the style attribute verbatim.
      // Same for a DOM snapshot — the patcher writes `style`, so we must too.
      if (html || dom) {
        const serialized = serializeStyle(value);
        if (serialized) attrs.set('style', serialized);
      } else {
        inline = parseStyleDecls(value);
      }
      continue;
    }

    if (key === 'filter' && !dom) {
      attrs.set('filter', translateBlurFilter(String(value), extraDefs));
      continue;
    }

    attrs.set(attrNameForProp(key), String(value));
  }

  if (dom) {
    // The patcher mirrors the VNode key into the DOM as `data-vnode-key`; a snapshot
    // that omitted it would present a different attribute set on every keyed element.
    if (vnode.key !== undefined && vnode.key !== null) {
      attrs.set('data-vnode-key', String(vnode.key));
    }
    return { attrs, text };
  }

  // Inside a foreignObject the host's CSS owns the content — we neither know nor
  // flatten it.
  if (html) return { attrs, text };

  // (2) the stylesheet layer, flattened
  const resolver = options.classStyles;
  if (resolver) {
    for (const [prop, value] of Object.entries(resolver(classList(props['className'])))) {
      attrs.set(prop, value);
    }
  }

  // (3) the element's own inline style — the cascade's winner
  for (const [prop, value] of Object.entries(inline)) {
    if (CSS_ONLY_DECLS.has(prop)) continue;
    attrs.set(prop, prop === 'filter' ? translateBlurFilter(value, extraDefs) : value);
  }

  return { attrs, text };
}

function renderAttrs(attrs: Map<string, string>): string {
  let out = '';
  for (const [name, value] of attrs) {
    out += ` ${name}="${escapeAttr(value)}"`;
  }
  return out;
}

/** Empty child slots (the fallout of conditional children) — same rule as the patcher. */
function isRenderable(child: unknown): boolean {
  return child !== null && child !== undefined && (child as unknown) !== false;
}

function isVNodeChild(child: unknown): boolean {
  return !!child && typeof child === 'object' && typeof (child as VNode).type === 'string';
}
