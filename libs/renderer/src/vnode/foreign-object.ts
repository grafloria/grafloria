/**
 * foreignObject VNode Helpers
 *
 * Provides utility functions for creating and working with SVG foreignObject elements.
 * foreignObject allows embedding HTML content inside SVG, enabling rich components
 * like tables, charts, and forms within diagram nodes.
 *
 * @remarks
 * - foreignObject VNodes have type='foreignObject'
 * - Each foreignObject must have a unique containerId for Angular to target
 * - Default children include an XHTML div wrapper for proper rendering
 *
 * @example
 * ```typescript
 * // Create a foreignObject VNode
 * const vnode = createForeignObject({
 *   nodeId: 'node-1',
 *   x: 10,
 *   y: 20,
 *   width: 200,
 *   height: 150
 * });
 *
 * // Check if a VNode is a foreignObject
 * if (isForeignObject(vnode)) {
 *   const containerId = getContainerId(vnode);
 *   // Render Angular component to containerId...
 * }
 * ```
 *
 * @packageDocumentation
 */

import { ContainerIdGenerator } from './container-id-generator';
import type { VNode } from '../types/vnode.types';

/**
 * Options for creating a foreignObject VNode
 */
export interface ForeignObjectOptions {
  /**
   * Node ID - used to generate container ID
   */
  nodeId: string;

  /**
   * X coordinate (top-left corner)
   */
  x: number;

  /**
   * Y coordinate (top-left corner)
   */
  y: number;

  /**
   * Width in pixels
   */
  width: number;

  /**
   * Height in pixels
   */
  height: number;

  /**
   * Optional custom container ID
   * If not provided, will be auto-generated using ContainerIdGenerator
   */
  containerId?: string;

  /**
   * Optional children VNodes
   * If not provided, creates a default XHTML div wrapper
   */
  children?: VNode[];

  /**
   * Optional key for React/Angular diffing optimization
   */
  key?: string;
}

/**
 * Create a foreignObject VNode
 *
 * Creates a VNode representing an SVG foreignObject element, which allows
 * embedding HTML content inside SVG. Automatically generates a container ID
 * if not provided, and includes a default XHTML div wrapper.
 *
 * @param options - Configuration options for the foreignObject
 * @returns A VNode of type 'foreignObject'
 *
 * @example
 * ```typescript
 * const vnode = createForeignObject({
 *   nodeId: 'node-1',
 *   x: 10,
 *   y: 20,
 *   width: 200,
 *   height: 150
 * });
 * // Returns: { type: 'foreignObject', props: { x: 10, y: 20, ... }, children: [...] }
 * ```
 *
 * @example With custom container ID and children
 * ```typescript
 * const vnode = createForeignObject({
 *   nodeId: 'node-1',
 *   x: 10,
 *   y: 20,
 *   width: 200,
 *   height: 150,
 *   containerId: 'my-custom-id',
 *   children: [
 *     { type: 'div', props: { className: 'custom-content' } }
 *   ]
 * });
 * ```
 */
export function createForeignObject(options: ForeignObjectOptions): VNode {
  const {
    nodeId,
    x,
    y,
    width,
    height,
    containerId,
    children,
    key
  } = options;

  // Auto-generate container ID if not provided
  const finalContainerId = containerId || ContainerIdGenerator.generate(nodeId);

  // Create default XHTML wrapper if no children provided
  const defaultChildren: VNode[] = [
    {
      type: 'div',
      props: {
        xmlns: 'http://www.w3.org/1999/xhtml',
        style: {
          width: '100%',
          height: '100%',
          overflow: 'hidden'
        }
      },
      children: []
    }
  ];

  const vnode: VNode = {
    type: 'foreignObject',
    props: {
      x,
      y,
      width,
      height,
      containerId: finalContainerId
    },
    children: children || defaultChildren
  };

  // Only add key if provided
  if (key !== undefined) {
    vnode.key = key;
  }

  return vnode;
}

/**
 * Check if a VNode is a foreignObject element
 *
 * Type guard function that checks if the given VNode represents
 * a foreignObject element.
 *
 * @param vnode - The VNode to check
 * @returns True if the VNode is a foreignObject, false otherwise
 *
 * @example
 * ```typescript
 * const foNode = createForeignObject({ ... });
 * const rectNode = { type: 'rect', props: { ... } };
 *
 * isForeignObject(foNode);   // true
 * isForeignObject(rectNode); // false
 * ```
 */
export function isForeignObject(vnode: VNode): boolean {
  return vnode.type === 'foreignObject';
}

/**
 * Get the container ID from a foreignObject VNode
 *
 * Extracts the container ID from a foreignObject VNode's props.
 * Returns undefined if the VNode is not a foreignObject or doesn't have a container ID.
 *
 * @param vnode - The VNode to extract the container ID from
 * @returns The container ID if the VNode is a foreignObject, undefined otherwise
 *
 * @example
 * ```typescript
 * const vnode = createForeignObject({
 *   nodeId: 'node-1',
 *   x: 0, y: 0, width: 100, height: 100
 * });
 *
 * const containerId = getContainerId(vnode);
 * // Returns: 'fo-node-1-1'
 * ```
 *
 * @example Non-foreignObject returns undefined
 * ```typescript
 * const rectNode = { type: 'rect', props: { ... } };
 * const containerId = getContainerId(rectNode);
 * // Returns: undefined
 * ```
 */
export function getContainerId(vnode: VNode): string | undefined {
  if (!isForeignObject(vnode)) {
    return undefined;
  }
  return vnode.props?.containerId;
}
