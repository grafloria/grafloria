/**
 * @packageDocumentation
 * VNode foreignObject Support Module
 *
 * This module provides utilities for working with SVG foreignObject elements
 * in the VNode system, enabling rich HTML content within diagram nodes.
 *
 * @example Basic Usage
 * ```typescript
 * import { createForeignObject, isForeignObject, getContainerId } from '@grafloria/renderer';
 *
 * // Create a foreignObject VNode
 * const vnode = createForeignObject({
 *   nodeId: 'node-1',
 *   x: 10,
 *   y: 20,
 *   width: 200,
 *   height: 150
 * });
 *
 * // Check if VNode is foreignObject and get container ID
 * if (isForeignObject(vnode)) {
 *   const containerId = getContainerId(vnode);
 *   console.log(containerId); // 'fo-node-1-1'
 * }
 * ```
 *
 * @example Advanced Usage with Custom Container ID
 * ```typescript
 * import { createForeignObject, ContainerIdGenerator } from '@grafloria/renderer';
 *
 * // Generate a custom container ID
 * const customId = ContainerIdGenerator.generate('my-node');
 *
 * const vnode = createForeignObject({
 *   nodeId: 'my-node',
 *   x: 0,
 *   y: 0,
 *   width: 300,
 *   height: 200,
 *   containerId: customId,
 *   children: [
 *     {
 *       type: 'div',
 *       props: {
 *         xmlns: 'http://www.w3.org/1999/xhtml',
 *         className: 'custom-content'
 *       }
 *     }
 *   ]
 * });
 * ```
 */

// Export ContainerIdGenerator
export { ContainerIdGenerator } from './container-id-generator';

// Export foreignObject helper functions and types
export {
  createForeignObject,
  isForeignObject,
  getContainerId,
  type ForeignObjectOptions
} from './foreign-object';

// VNode → DOM patcher: the framework-agnostic keyed reconciler that every DOM
// consumer (Angular VNodeRendererService, e2e harness, headless instances)
// materializes VNode trees through.
export {
  VNodePatcher,
  defaultPatcher,
  reconcile,
  createDomElement,
  isOpaqueVNode,
  serializeStyle,
  camelToKebab,
  SVG_NS,
  XHTML_NS,
  type VNodePatcherOptions,
  type VNodeChild,
  type PatchStats,
} from './patch';
