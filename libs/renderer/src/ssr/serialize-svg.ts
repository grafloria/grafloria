import type { VNode } from '../types/vnode.types';
import { camelToKebab, serializeStyle, SVG_NS, XHTML_NS } from '../vnode/patch';

/**
 * VNode → SVG string. NO DOM: this is the server half of Card 6.
 *
 * ⚠️ SCOPE / MERGE NOTE. This is the MINIMAL serializer the SSR path needs, and
 * it is deliberately confined to this one file so it can be swapped wholesale.
 * A sibling wave-4 card is building a fuller VNode→SVG serializer for *export*
 * (which additionally has to inline styles, embed fonts, handle `<image>` data
 * URIs, …). When the two land, delete this file and point `render-to-static.ts`
 * at that one — the only contract SSR needs is:
 *
 *     serializeVNodeToSVG(vnode) must byte-match the DOM the VNodePatcher would
 *     build from the SAME vnode (attribute rules and all), or hydration flashes.
 *
 * That is why every attribute decision below is delegated to the patcher's own
 * helpers ({@link camelToKebab}, {@link serializeStyle}) and why the
 * VERBATIM/`className`/`textContent` special cases mirror `VNodePatcher.setProp`
 * exactly. `ssr-hydration.spec.ts` asserts the agreement rather than trusting it.
 */

/** SVG attributes whose camelCase spelling must survive verbatim (see patch.ts). */
const VERBATIM_ATTRS = new Set([
  'viewBox',
  'preserveAspectRatio',
  'gradientUnits',
  'gradientTransform',
  'spreadMethod',
  'patternUnits',
  'patternContentUnits',
  'patternTransform',
  'stdDeviation',
]);

/** Elements that are always written as `<x />` when empty. */
const XML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
};

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => XML_ESCAPES[c]);
}

function escapeText(value: string): string {
  return value.replace(/[&<>]/g, (c) => XML_ESCAPES[c]);
}

export interface SerializeOptions {
  /** Stamp `xmlns` on the root element (needed for a standalone `.svg` file). */
  standalone?: boolean;
}

/**
 * Serialize a VNode tree to an SVG string, applying exactly the attribute rules
 * `VNodePatcher` applies when it builds DOM (so `outerHTML` of the patched DOM
 * and this string describe the same element).
 */
export function serializeVNodeToSVG(vnode: VNode, options: SerializeOptions = {}): string {
  return serializeNode(vnode, SVG_NS, options.standalone === true);
}

function serializeNode(vnode: VNode, namespace: string, addXmlns: boolean): string {
  const attrs: string[] = [];
  const props = vnode.props ?? {};

  if (addXmlns && !props['xmlns']) {
    attrs.push(`xmlns="${SVG_NS}"`);
  }

  let textContent: string | undefined;

  for (const key of Object.keys(props)) {
    const value = props[key];

    // Same skips as VNodePatcher.setProp: nullish props and event handlers are
    // never attributes.
    if (value === null || value === undefined) continue;
    if (typeof value === 'function') continue;

    if (key === 'textContent') {
      textContent = String(value);
      continue;
    }

    if (key === 'className') {
      attrs.push(`class="${escapeXml(String(value))}"`);
      continue;
    }

    if (key === 'style') {
      const style = serializeStyle(value);
      if (style) attrs.push(`style="${escapeXml(style)}"`);
      continue;
    }

    const name = VERBATIM_ATTRS.has(key) ? key : camelToKebab(key);
    attrs.push(`${name}="${escapeXml(String(value))}"`);
  }

  // The patcher mirrors the VNode key into the DOM as `data-vnode-key`; the
  // server MUST do the same or hydration would see a different attribute set.
  if (vnode.key !== undefined && vnode.key !== null) {
    attrs.push(`data-vnode-key="${escapeXml(String(vnode.key))}"`);
  }

  const open = attrs.length > 0 ? `<${vnode.type} ${attrs.join(' ')}` : `<${vnode.type}`;

  // `textContent` OWNS the element's content — children are never also emitted
  // (same invariant the patcher relies on).
  if (textContent !== undefined) {
    return `${open}>${escapeText(textContent)}</${vnode.type}>`;
  }

  const childNs = vnode.type === 'foreignObject' ? XHTML_NS : namespace;
  const children = (vnode.children ?? []).filter(
    (child) => child !== null && child !== undefined && (child as unknown) !== false
  );

  if (children.length === 0) {
    return `${open}></${vnode.type}>`;
  }

  const inner = children
    .map((child) =>
      typeof child === 'object' && child !== null && typeof (child as VNode).type === 'string'
        ? serializeNode(child as VNode, childNs, false)
        : escapeText(String(child))
    )
    .join('');

  return `${open}>${inner}</${vnode.type}>`;
}
