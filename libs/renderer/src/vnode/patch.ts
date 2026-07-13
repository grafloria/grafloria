/**
 * VNode → DOM patcher (keyed reconciler)
 *
 * Framework-agnostic. NO Angular / framework imports — this module is the one
 * place that turns a VNode tree into real DOM and keeps it there across frames.
 * `VNodeRendererService` (Angular) and the e2e harness both delegate to it, and
 * a headless instance API can be built on top of it.
 *
 * Why this exists
 * ---------------
 * The previous Angular implementation did `container.innerHTML = ''` and rebuilt
 * the entire DOM every frame. That is not just slow — it *destroys live state*:
 * focus, text selection, in-flight CSS transitions/animations, and any HTML or
 * component content mounted inside a `<foreignObject>` all die on every render.
 *
 * The reconciler below REUSES existing DOM nodes:
 *   - stable identity: same `key` + same `type` → the same DOM element object
 *     survives across renders (assert with `toBe` on the element),
 *   - reorders are moves (`insertBefore`), not re-creations,
 *   - `<foreignObject>` subtrees are treated as OPAQUE: their props are patched
 *     but their children are never touched, so whatever a framework mounted
 *     inside them stays alive.
 *
 * Invariants
 * ----------
 * 1. The patcher owns the children of every element it creates, EXCEPT inside a
 *    `<foreignObject>` (opaque). It therefore relies on `parent.childNodes[i]`
 *    corresponding to `oldChildren[i]` — which holds because every render places
 *    children at their exact index.
 * 2. VNodes are never mutated. The SVG renderer caches and re-serves the *same*
 *    VNode object for clean entities, so a VNode may be shared between frames and
 *    even between containers; per-node DOM refs are held here, not on the VNode.
 * 3. `oldVNode === newVNode` (identity) ⇒ nothing changed ⇒ the whole subtree is
 *    skipped. This is what makes the renderer's VNode cache pay off.
 */

import type { VNode } from '../types/vnode.types';

/** SVG namespace — everything outside a foreignObject is created here. */
export const SVG_NS = 'http://www.w3.org/2000/svg';

/** XHTML namespace — foreignObject children are HTML, not SVG. */
export const XHTML_NS = 'http://www.w3.org/1999/xhtml';

/**
 * SVG attributes whose genuinely-camelCase names must be preserved verbatim.
 * camelCase→kebab-case would corrupt them (`gradientUnits` → `gradient-units`),
 * silently breaking the paint-server defs (gradients / patterns / drop shadows).
 *
 * Exported because the headless SVG SERIALIZER (`export/vnode-serializer.ts`) is
 * this patcher's DOM-less sibling and must map a VNode prop to an attribute name
 * exactly the same way — a second copy of this list is a divergence waiting to
 * happen (the two would disagree about `gradientUnits` and only one of the two
 * outputs would break).
 */
export const VERBATIM_ATTRS = new Set([
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

/** A child slot in a VNode tree. Strings/numbers materialise as text nodes. */
export type VNodeChild = VNode | string | number | null | undefined;

/** Options for a patcher instance. */
export interface VNodePatcherOptions {
  /**
   * Document used to create nodes. Defaults to the ambient `globalThis.document`.
   * Pass one explicitly for headless / SSR / multi-document use.
   */
  document?: Document;
}

/**
 * Per-reconcile work counters. Reset at the top of every `reconcile()` call.
 * Useful as a cheap regression guard: a steady-state frame should create ~0
 * elements ("no teardown-and-rebuild").
 */
export interface PatchStats {
  /** DOM nodes created from scratch. */
  created: number;
  /** DOM nodes reused in place (patched, not recreated). */
  reused: number;
  /** Reused DOM nodes that had to move to a new sibling index. */
  moved: number;
  /** DOM nodes removed because their VNode disappeared. */
  removed: number;
  /** Subtrees skipped entirely because the VNode object was identical. */
  skipped: number;
}

interface MountState {
  vnode: VNode;
  el: Element;
}

const emptyStats = (): PatchStats => ({
  created: 0,
  reused: 0,
  moved: 0,
  removed: 0,
  skipped: 0,
});

/** camelCase → kebab-case (`strokeWidth` → `stroke-width`). */
export function camelToKebab(str: string): string {
  return str.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

/**
 * The attribute name a VNode prop is written to: `className` → `class`,
 * `gradientUnits` → `gradientUnits` (verbatim), everything else kebab-cased.
 *
 * THE single mapping, shared by the DOM patcher and the headless serializer.
 */
export function attrNameForProp(key: string): string {
  if (key === 'className') return 'class';
  if (VERBATIM_ATTRS.has(key)) return key;
  return camelToKebab(key);
}

/**
 * Serialize a style prop. Accepts the object form the renderer emits
 * (`{ cursor: 'move' }`) as well as a plain string.
 * Returns '' for empty/absent styles.
 */
export function serializeStyle(style: unknown): string {
  if (style === null || style === undefined) return '';
  if (typeof style === 'string') return style;
  if (typeof style !== 'object') return String(style);

  const parts: string[] = [];
  for (const [key, value] of Object.entries(style as Record<string, unknown>)) {
    if (value === null || value === undefined) continue;
    parts.push(`${camelToKebab(key)}:${value}`);
  }
  return parts.join(';');
}

/** A VNode-ish object (vs a text child). */
function isVNode(child: VNodeChild): child is VNode {
  return !!child && typeof child === 'object' && typeof (child as VNode).type === 'string';
}

/**
 * foreignObject subtrees embed live HTML (framework components, form controls,
 * media). They are OPAQUE to the diff: props are patched, children are left
 * exactly as they are. Diffing into them would wipe whatever was mounted there.
 */
export function isOpaqueVNode(vnode: VNode): boolean {
  return vnode.type === 'foreignObject';
}

/**
 * Keyed VNode → DOM reconciler.
 *
 * ```ts
 * const patcher = new VNodePatcher();
 * patcher.reconcile(container, vnodeTree);   // first call: mount
 * patcher.reconcile(container, nextTree);    // later calls: diff + patch in place
 * ```
 */
export class VNodePatcher {
  /** container → {last vnode tree, root DOM element} */
  private readonly mounts = new WeakMap<Element, MountState>();
  private readonly options: VNodePatcherOptions;
  private doc?: Document;
  private _stats: PatchStats = emptyStats();

  constructor(options: VNodePatcherOptions = {}) {
    this.options = options;
  }

  /** Work done during the most recent `reconcile()` call. */
  get stats(): Readonly<PatchStats> {
    return this._stats;
  }

  /**
   * Diff `vnode` against whatever this patcher last rendered into `container`
   * and patch the existing DOM in place. First call (or a lost root) mounts a
   * fresh tree.
   *
   * @returns the root DOM element representing `vnode`
   */
  reconcile(container: Element, vnode: VNode): Element {
    this._stats = emptyStats();

    const prev = this.mounts.get(container);

    // No previous tree, or someone removed/replaced our root behind our back →
    // mount fresh. (Only path that clears the container.)
    if (!prev || prev.el.parentNode !== container) {
      while (container.firstChild) {
        container.removeChild(container.firstChild);
        this._stats.removed++;
      }
      const el = this.createElement(vnode);
      container.appendChild(el);
      this.mounts.set(container, { vnode, el });
      return el;
    }

    const el = this.patchElement(prev.el, prev.vnode, vnode);
    this.mounts.set(container, { vnode, el });
    return el;
  }

  /** The root element currently mounted in `container`, if any. */
  getMountedElement(container: Element): Element | undefined {
    return this.mounts.get(container)?.el;
  }

  /** Remove the mounted tree and forget the container. */
  unmount(container: Element): void {
    const prev = this.mounts.get(container);
    if (prev && prev.el.parentNode === container) {
      container.removeChild(prev.el);
    }
    this.mounts.delete(container);
  }

  /** Build a fresh detached DOM element (deep) for a VNode. */
  createElement(vnode: VNode, namespace: string = SVG_NS): Element {
    const ns = typeof vnode.props?.xmlns === 'string' ? vnode.props.xmlns : namespace;
    const el = this.document.createElementNS(ns, vnode.type);
    this._stats.created++;

    this.applyProps(el, vnode.props ?? {});

    // Keys are part of the contract with the reconciler; surface them in the DOM
    // so tests / devtools / hit-testing can find a node by its VNode identity.
    if (vnode.key !== undefined && vnode.key !== null) {
      el.setAttribute('data-vnode-key', String(vnode.key));
    }

    // Children of a foreignObject are HTML, not SVG.
    const childNs = vnode.type === 'foreignObject' ? XHTML_NS : ns;
    // normalizeChildren keeps DOM index i ⇔ children index i, which the diff relies on.
    for (const child of normalizeChildren(vnode.children as VNodeChild[] | undefined)) {
      el.appendChild(this.createChild(child, childNs));
    }

    return el;
  }

  /**
   * Diff two VNodes onto an existing element.
   *
   * @returns the element representing `newVNode` — the SAME object when it could
   * be reused, a fresh one when type/key changed (in which case it has already
   * replaced `el` in the DOM, if `el` was attached).
   */
  patchElement(el: Element, oldVNode: VNode, newVNode: VNode): Element {
    // Identity: the renderer's VNode cache re-serves the same object for clean
    // entities — nothing can have changed, so skip the whole subtree.
    if (oldVNode === newVNode) {
      this._stats.skipped++;
      return el;
    }

    // Different element or different identity → cannot reuse.
    if (oldVNode.type !== newVNode.type || oldVNode.key !== newVNode.key) {
      const fresh = this.createElement(newVNode, el.namespaceURI ?? SVG_NS);
      if (el.parentNode) {
        el.parentNode.replaceChild(fresh, el);
        this._stats.removed++;
      }
      return fresh;
    }

    this._stats.reused++;
    this.patchProps(el, oldVNode.props ?? {}, newVNode.props ?? {});

    // OPAQUE: never diff into a foreignObject — live HTML/component content
    // lives in there and re-creating it would destroy focus/selection/animation
    // state (and unmount framework components).
    if (isOpaqueVNode(newVNode)) {
      return el;
    }

    // `textContent` OWNS the element's content: setting it creates a text node
    // that is not in `children`. Diffing children here would see an empty child
    // list, decide that text node is a stray, and delete it — every <text> label
    // would go blank on the second render. Elements that render through the prop
    // (text, tspan) never also declare children.
    if (hasTextContentProp(newVNode)) {
      return el;
    }

    this.patchChildren(
      el,
      (oldVNode.children ?? []) as VNodeChild[],
      (newVNode.children ?? []) as VNodeChild[]
    );

    return el;
  }

  /** Apply a prop delta to an element (no children touched). */
  patchProps(
    el: Element,
    oldProps: Record<string, any>,
    newProps: Record<string, any>
  ): void {
    if (oldProps === newProps) return;

    // Props that disappeared entirely.
    for (const key in oldProps) {
      if (!(key in newProps)) {
        this.removeProp(el, key);
      }
    }

    for (const key in newProps) {
      const next = newProps[key];
      const prev = oldProps[key];

      // A prop that went null/undefined must be REMOVED, not skipped: leaving
      // the stale attribute behind is how hover styles used to get stuck on.
      if (next === null || next === undefined) {
        if (prev !== null && prev !== undefined) this.removeProp(el, key);
        continue;
      }

      // Style objects are rebuilt every frame, so compare the serialized form
      // instead of the (always-new) object reference.
      if (key === 'style') {
        const nextStyle = serializeStyle(next);
        if (nextStyle !== serializeStyle(prev)) {
          if (nextStyle) el.setAttribute('style', nextStyle);
          else el.removeAttribute('style');
        }
        continue;
      }

      if (prev === next) continue;

      this.setProp(el, key, next);
    }
  }

  // ---------------------------------------------------------------------------
  // internals
  // ---------------------------------------------------------------------------

  private get document(): Document {
    if (!this.doc) {
      const doc =
        this.options.document ??
        (typeof globalThis !== 'undefined'
          ? ((globalThis as any).document as Document | undefined)
          : undefined);
      if (!doc) {
        throw new Error(
          'VNodePatcher requires a DOM Document (pass { document } for headless use)'
        );
      }
      this.doc = doc;
    }
    return this.doc;
  }

  private createChild(child: VNodeChild, namespace: string): Node {
    if (isVNode(child)) return this.createElement(child, namespace);
    this._stats.created++;
    return this.document.createTextNode(String(child));
  }

  /**
   * Keyed child reconciliation with an index-based fallback.
   *
   * Structural VNodes (nodes, links, ports, layers, foreignObjects, labels,
   * handles) carry stable keys; leaf primitives inside a node group (shape,
   * shadow, selection highlight, text) usually do not — so a child list is
   * routinely a MIX of keyed and keyless children. Keyed children are matched by
   * key (and moved with insertBefore when their order changes); keyless children
   * are matched positionally against the remaining unclaimed keyless children.
   */
  private patchChildren(
    parent: Element,
    rawOldChildren: VNodeChild[],
    rawNewChildren: VNodeChild[]
  ): void {
    // Both lists go through the SAME normalization the create path used, so the
    // DOM stays index-aligned with the (filtered) child list across frames.
    const oldChildren = normalizeChildren(rawOldChildren);
    const newChildren = normalizeChildren(rawNewChildren);

    // Snapshot the DOM children that correspond to oldChildren (index-aligned:
    // every render places children at their exact index).
    const oldDom: Array<Node | undefined> = [];
    for (let i = 0; i < oldChildren.length; i++) {
      oldDom.push(parent.childNodes[i] ?? undefined);
    }

    // key → first old index carrying that key
    const keyedOld = new Map<string, number>();
    for (let i = 0; i < oldChildren.length; i++) {
      const key = childKey(oldChildren[i]);
      if (key !== undefined && !keyedOld.has(key)) keyedOld.set(key, i);
    }

    const claimed = new Array<boolean>(oldChildren.length).fill(false);
    const resolved: Node[] = [];
    const childNs = parent.namespaceURI ?? SVG_NS;
    let cursor = 0; // scan position for keyless positional matching

    for (const child of newChildren) {
      const key = childKey(child);
      let matched = -1;

      if (key !== undefined) {
        const candidate = keyedOld.get(key);
        if (candidate !== undefined && !claimed[candidate]) matched = candidate;
      } else {
        // next unclaimed KEYLESS old child, in order
        while (
          cursor < oldChildren.length &&
          (claimed[cursor] || childKey(oldChildren[cursor]) !== undefined)
        ) {
          cursor++;
        }
        if (cursor < oldChildren.length) matched = cursor;
      }

      const oldChild = matched >= 0 ? oldChildren[matched] : undefined;
      const oldNode = matched >= 0 ? oldDom[matched] : undefined;

      if (matched >= 0) claimed[matched] = true;

      if (oldNode && oldChild !== undefined && sameKind(oldChild, child)) {
        resolved.push(this.patchChild(oldNode, oldChild, child));
      } else {
        resolved.push(this.createChild(child, childNs));
      }
    }

    // Drop the old DOM nodes nothing claimed.
    for (let i = 0; i < oldChildren.length; i++) {
      const node = oldDom[i];
      if (!claimed[i] && node && node.parentNode === parent) {
        parent.removeChild(node);
        this._stats.removed++;
      }
    }

    // Place every resolved node at its index (moves reused nodes, appends new).
    for (let i = 0; i < resolved.length; i++) {
      const want = resolved[i];
      const current = parent.childNodes[i];
      if (current === want) continue;
      const wasMounted = want.parentNode === parent; // reused node changing order
      parent.insertBefore(want, current ?? null);
      if (wasMounted) this._stats.moved++;
    }

    // Anything still trailing beyond the new list (e.g. DOM appended by someone
    // else) is not ours to keep.
    while (parent.childNodes.length > resolved.length) {
      parent.removeChild(parent.lastChild as Node);
      this._stats.removed++;
    }
  }

  /** Patch one child slot (element or text). */
  private patchChild(node: Node, oldChild: VNodeChild, newChild: VNodeChild): Node {
    if (isVNode(oldChild) && isVNode(newChild)) {
      return this.patchElement(node as Element, oldChild, newChild);
    }
    // text ↔ text
    const next = String(newChild);
    if (node.nodeValue !== next) {
      node.nodeValue = next;
      this._stats.reused++;
    } else {
      this._stats.skipped++;
    }
    return node;
  }

  private applyProps(el: Element, props: Record<string, any>): void {
    for (const key in props) {
      this.setProp(el, key, props[key]);
    }
  }

  private setProp(el: Element, key: string, value: any): void {
    // Skip null/undefined: writing stroke-width="undefined" would override CSS
    // (that string is a valid-looking attribute value and beats the stylesheet).
    if (value === null || value === undefined) return;

    // Event handlers are not DOM attributes — the interaction layer binds real
    // listeners on the container. Never stringify a function into an attribute.
    if (typeof value === 'function') return;

    if (key === 'textContent') {
      el.textContent = String(value);
      return;
    }

    if (key === 'className') {
      el.setAttribute('class', String(value));
      return;
    }

    if (key === 'style') {
      const style = serializeStyle(value);
      if (style) el.setAttribute('style', style);
      else el.removeAttribute('style');
      return;
    }

    // className/style/textContent are handled above; everything else goes through
    // THE shared prop → attribute mapping (also used by the headless serializer).
    el.setAttribute(attrNameForProp(key), String(value));
  }

  private removeProp(el: Element, key: string): void {
    if (key === 'textContent') {
      el.textContent = '';
      return;
    }
    if (key === 'className') {
      el.removeAttribute('class');
      return;
    }
    if (key === 'style') {
      el.removeAttribute('style');
      return;
    }
    el.removeAttribute(attrNameForProp(key));
  }
}

/**
 * Drop empty child slots (`null` / `undefined` / `false` — the fallout of
 * conditional children). Both the create and the diff path run children through
 * this, which is what keeps `parent.childNodes[i]` aligned with `children[i]`.
 */
function normalizeChildren(children: VNodeChild[] | undefined): VNodeChild[] {
  if (!children || children.length === 0) return [];
  const out: VNodeChild[] = [];
  for (const child of children) {
    if (child === null || child === undefined || (child as unknown) === false) continue;
    out.push(child);
  }
  return out;
}

/** Does this VNode render its content through the `textContent` prop? */
function hasTextContentProp(vnode: VNode): boolean {
  const text = vnode.props?.textContent;
  return text !== undefined && text !== null;
}

/** The key of a child slot, or undefined for keyless / text children. */
function childKey(child: VNodeChild): string | undefined {
  if (!isVNode(child)) return undefined;
  return child.key === undefined || child.key === null ? undefined : String(child.key);
}

/** Can `newChild` reuse the DOM node built for `oldChild`? */
function sameKind(oldChild: VNodeChild, newChild: VNodeChild): boolean {
  const oldIsVNode = isVNode(oldChild);
  const newIsVNode = isVNode(newChild);
  if (oldIsVNode !== newIsVNode) return false;
  if (!oldIsVNode) return true; // text ↔ text
  return (
    (oldChild as VNode).type === (newChild as VNode).type &&
    childKey(oldChild) === childKey(newChild)
  );
}

/**
 * Process-wide default patcher — convenient for the common "one DOM, one tree"
 * case. Instantiate `VNodePatcher` directly for isolated instances.
 */
export const defaultPatcher = new VNodePatcher();

/** Reconcile `vnode` into `container` using the default patcher. */
export function reconcile(container: Element, vnode: VNode): Element {
  return defaultPatcher.reconcile(container, vnode);
}

/** Build a fresh detached DOM tree for `vnode` using the default patcher. */
export function createDomElement(vnode: VNode, namespace: string = SVG_NS): Element {
  return defaultPatcher.createElement(vnode, namespace);
}
