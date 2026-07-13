import { Injectable } from '@angular/core';
import { VNodePatcher, type PatchStats } from '@grafloria/renderer';
import type { VNode } from '@grafloria/renderer';

/**
 * VNodeRendererService
 *
 * Angular-facing wrapper around the framework-agnostic VNode → DOM patcher
 * (`VNodePatcher` in `@grafloria/renderer`). This service holds NO rendering logic
 * of its own: the diff/patch rules live in one place so the Angular canvas, the
 * e2e harness and any headless consumer all materialize VNodes identically.
 *
 * `render()` used to wipe the container (`innerHTML = ''`) and rebuild the whole
 * DOM on every frame, which destroyed focus, text selection, running CSS
 * animations and anything mounted inside a `<foreignObject>`. It now reconciles:
 * existing DOM elements are reused, reordered by key, and only genuinely-changed
 * attributes are written.
 */
@Injectable({
  providedIn: 'root',
})
export class VNodeRendererService {
  private readonly patcher = new VNodePatcher();

  /**
   * Render (or re-render) a VNode tree into a container, reusing the DOM that is
   * already there. This is the hot path — it runs once per frame.
   *
   * @returns the root DOM element for the tree
   */
  render(vnode: VNode, container: HTMLElement): void {
    this.patcher.reconcile(container, vnode);
  }

  /**
   * Reconcile a VNode tree into a container and hand back the root element.
   * Same as {@link render}, for callers that want the element.
   */
  reconcile(container: HTMLElement, vnode: VNode): Element {
    return this.patcher.reconcile(container, vnode);
  }

  /**
   * Build a fresh, detached DOM element for a VNode (deep).
   * Used for one-shot materialization; `render()` is what you want for a canvas.
   */
  renderVNode(vnode: VNode): Element {
    return this.patcher.createElement(vnode);
  }

  /**
   * Diff two VNodes onto an existing element: props AND children.
   * (The old implementation only diffed props and left a "TODO: handle children"
   * behind — children are now reconciled by key.)
   */
  updateVNode(element: Element, oldVNode: VNode, newVNode: VNode): void {
    this.patcher.patchElement(element, oldVNode, newVNode);
  }

  /** Remove the tree this service mounted in `container` and forget it. */
  unmount(container: HTMLElement): void {
    this.patcher.unmount(container);
  }

  /**
   * Work done by the last `render()` — created / reused / moved / removed /
   * skipped node counts. A steady-state frame should create ~nothing.
   */
  getLastPatchStats(): Readonly<PatchStats> {
    return this.patcher.stats;
  }
}
