// HTML / foreignObject rich-content nodes (Wave 5 / Nodes & shapes — Card 4)
//
// A node whose BODY is arbitrary HTML, sized to `node.size` and living inside a
// `<foreignObject>`. Because it renders as an ordinary child of the node's
// translated+rotated `<g>` (on top of the shape background the registry drew), it
// participates in selection, hit-testing and rotation exactly like any shape —
// no separate code path.
//
// TWO hard-won invariants are honored here:
//
//   1. OPAQUE foreignObject (patch.ts). The VNode patcher patches a
//      foreignObject's PROPS but never diffs its children, so live HTML survives
//      across frames. We therefore KEY the foreignObject by a hash of its
//      content: a data change flips the key → the patcher replaces the whole
//      subtree (fresh content); a hover / selection change keeps the key → the
//      subtree is left untouched.
//
//   2. "Diagram data is user input." NOTHING here uses `innerHTML`. Rich content
//      is a STRUCTURED, allow-listed tree (`HtmlContentNode`) converted to VNodes
//      whose text is emitted via `textContent`; tags, attributes and style
//      declarations are filtered against allow-lists, and image/link URLs pass
//      through `sanitizeAssetUrl`. This is the same rule the earlier
//      foreignObject XSS fix established — it is not reopened.

import type { NodeModel } from '@grafloria/engine';
import type { VNode } from '../types/vnode.types';
import { XHTML_NS } from '../vnode/patch';
import { sanitizeAssetUrl } from './panel';

/** A single node in the structured, sanitized rich-content tree. */
export interface HtmlContentNode {
  /** Element tag — validated against {@link ALLOWED_TAGS}. */
  tag: string;
  /** Text content, emitted via `textContent` (never innerHTML). */
  text?: string;
  /** Inline style (object form); values are sanitized. */
  style?: Record<string, string | number>;
  className?: string;
  /** Extra attributes — filtered against {@link ALLOWED_ATTRS} + sanitized. */
  attrs?: Record<string, string>;
  children?: HtmlContentNode[];
}

/** The HTML-node body spec, stored at `node.metadata.html`. */
export interface HtmlNodeContent {
  /** Plain-text body (safe: rendered through `textContent`). */
  text?: string;
  /** Structured, sanitized rich content. */
  content?: HtmlContentNode;
  /** Inline style for the root container (object form; values sanitized). */
  style?: Record<string, string | number>;
  className?: string;
  /** Inner padding (px). Default 4. */
  padding?: number;
  /**
   * Let the HTML capture pointer events (forms / links). Default false, so the
   * shape background beneath receives clicks and the node stays draggable /
   * selectable like any shape.
   */
  interactive?: boolean;
}

/** Structural HTML tags a content node may use. Deliberately no script/iframe/
 * object/embed/style/link/form-control-with-handlers. */
const ALLOWED_TAGS = new Set([
  'div',
  'span',
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'ul',
  'ol',
  'li',
  'table',
  'thead',
  'tbody',
  'tr',
  'td',
  'th',
  'b',
  'i',
  'strong',
  'em',
  'small',
  'code',
  'pre',
  'br',
  'hr',
  'img',
]);

/** Attributes allowed to survive on a content node (per-tag URL sanitization
 * applies on top of this for `src`). */
const ALLOWED_ATTRS = new Set(['title', 'alt', 'width', 'height', 'colspan', 'rowspan']);

/** Read a node's HTML body spec, or null when it has none. */
export function getHtmlContent(node: NodeModel): HtmlNodeContent | null {
  const raw = node.getMetadata('html');
  return raw && typeof raw === 'object' ? (raw as HtmlNodeContent) : null;
}

/** True when the node renders an HTML body. */
export function hasHtmlContent(node: NodeModel): boolean {
  return getHtmlContent(node) !== null;
}

/** Drop `javascript:` / `expression(` and other executable style payloads. */
function sanitizeStyleValue(value: string | number): string | number | null {
  if (typeof value === 'number') return value;
  const lowered = value.toLowerCase();
  if (
    lowered.includes('javascript:') ||
    lowered.includes('expression(') ||
    lowered.includes('vbscript:') ||
    // url(...) can smuggle a script URL; drop any url() to be safe.
    lowered.includes('url(')
  ) {
    return null;
  }
  return value;
}

function sanitizeStyle(
  style: Record<string, string | number> | undefined
): Record<string, string | number> | undefined {
  if (!style) return undefined;
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(style)) {
    // Block CSS custom properties / anything odd; allow simple property names.
    if (!/^[a-zA-Z-]+$/.test(k)) continue;
    const safe = sanitizeStyleValue(v);
    if (safe !== null) out[k] = safe;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Convert ONE sanitized content node to a VNode. Unknown tags collapse to a
 * `<span>` (their text is kept, their dangerous identity is dropped). Returns
 * null for a node that contributes nothing.
 */
export function sanitizeHtmlContent(spec: HtmlContentNode): VNode | null {
  if (!spec || typeof spec.tag !== 'string') return null;
  const tag = ALLOWED_TAGS.has(spec.tag) ? spec.tag : 'span';

  const props: Record<string, unknown> = { xmlns: XHTML_NS };
  const style = sanitizeStyle(spec.style);
  if (style) props['style'] = style;
  if (typeof spec.className === 'string') props['className'] = spec.className;

  if (spec.attrs) {
    for (const [k, v] of Object.entries(spec.attrs)) {
      if (typeof v !== 'string') continue;
      // Never accept event handlers or arbitrary attrs; `src` is URL-sanitized.
      if (/^on/i.test(k)) continue;
      if (k === 'src' && tag === 'img') {
        const safe = sanitizeAssetUrl(v);
        if (safe) props['src'] = safe;
      } else if (ALLOWED_ATTRS.has(k)) {
        props[k] = v;
      }
    }
  }

  const children: VNode[] = [];
  if (spec.children) {
    for (const child of spec.children) {
      const built = sanitizeHtmlContent(child);
      if (built) children.push(built);
    }
  }

  const vnode: VNode = { type: tag, props };
  // Text OWNS the element's content — never mixed with children (matches the
  // patcher's textContent-owns-the-element rule).
  if (typeof spec.text === 'string' && children.length === 0) {
    props['textContent'] = spec.text;
  } else if (children.length > 0) {
    vnode.children = children;
  }
  return vnode;
}

/** Cheap, stable djb2 hash of a value's JSON form — used to key the FO subtree. */
function hashContent(value: unknown): string {
  const str = JSON.stringify(value) ?? '';
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/**
 * Build the `<foreignObject>` body VNode for an HTML node, sized to the node.
 * Returns null when the node has no HTML content. The wrapper div is
 * `pointer-events: none` unless the content opts into interactivity, so the
 * shape background beneath keeps receiving selection / drag hits.
 */
export function buildHtmlForeignObject(
  node: NodeModel,
  width: number,
  height: number
): VNode | null {
  const html = getHtmlContent(node);
  if (!html) return null;

  const pad = html.padding ?? 4;
  const wrapperStyle: Record<string, string | number> = {
    width: '100%',
    height: '100%',
    boxSizing: 'border-box',
    overflow: 'hidden',
    padding: `${pad}px`,
    ...(html.interactive ? {} : { pointerEvents: 'none' }),
    ...(sanitizeStyle(html.style) ?? {}),
  };

  const inner: VNode[] = [];
  if (html.content) {
    const built = sanitizeHtmlContent(html.content);
    if (built) inner.push(built);
  } else if (typeof html.text === 'string') {
    inner.push({
      type: 'div',
      props: { xmlns: XHTML_NS, textContent: html.text },
    });
  }

  const wrapper: VNode = {
    type: 'div',
    props: {
      xmlns: XHTML_NS,
      className: html.className ? `grafloria-html-node ${html.className}` : 'grafloria-html-node',
      style: wrapperStyle,
    },
    children: inner,
  };

  // Key by content hash so a DATA change replaces the opaque subtree while a
  // hover / selection change (same content) leaves it untouched.
  return {
    type: 'foreignObject',
    key: `html-${node.id}-${hashContent(html)}`,
    props: {
      x: 0,
      y: 0,
      width,
      height,
      // Guard: a rotated node rotates the whole <g>, which includes this FO.
      className: 'grafloria-html-foreign',
    },
    children: [wrapper],
  };
}
