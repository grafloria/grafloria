// Export scope: WHICH parts of the diagram end up in the file.
//
// Tightening the viewBox around a selection is not enough on its own. SVG clips to
// the viewBox, so an un-selected node outside it is invisible — but its markup is
// still IN THE FILE. That is a bloated artifact and, for a "share just this bit"
// export, an information leak: the bytes carry every label of every node the user
// did not choose to share. So a selection export PRUNES the tree as well as the box.
//
// The prune keeps:
//   • every container (layers, <defs>) — a kept node may reference a gradient or a
//     marker that lives in <defs>, and dropping it would leave a dangling url(#…);
//   • every identified diagram object (`node-<id>` / `link-<id>`) whose id is in scope,
//     with its whole subtree intact (a node's label and ports are part of the node).
//
// and drops every identified object that is not in scope.

import type { VNode } from '../types/vnode.types';

/** The VNode `key` prefixes the renderer stamps on identified diagram objects. */
const IDENTIFIED = /^(node|link)-/;

/**
 * Every key shape the renderer can mint for a given diagram id.
 *
 * `renderNode` has a second early-return path for HTML-layer nodes that keys them
 * `node-<id>-html-layer`, so an exact-match set built only from `node-<id>` would
 * silently drop those from a selection export.
 */
export function selectionKeys(ids: Iterable<string>): Set<string> {
  const keys = new Set<string>();
  for (const id of ids) {
    keys.add(`node-${id}`);
    keys.add(`node-${id}-html-layer`);
    keys.add(`link-${id}`);
  }
  return keys;
}

/**
 * Prune a rendered tree down to the given node/link ids.
 *
 * Returns a new tree; the input is not mutated (the caller's tree is the live
 * render, and mutating it would corrupt the next frame).
 */
export function filterTreeByIds(root: VNode, ids: Iterable<string>): VNode {
  const keys = selectionKeys(ids);
  return prune(root, keys);
}

function prune(vnode: VNode, keys: Set<string>): VNode {
  const children = vnode.children ?? [];

  const kept: VNode[] = [];
  for (const child of children) {
    if (!child || typeof child !== 'object') continue;

    const key = child.key;
    const identified = typeof key === 'string' && IDENTIFIED.test(key);

    if (identified) {
      // An identified object is all-or-nothing: in scope → keep the whole subtree.
      if (keys.has(key as string)) kept.push(child);
      continue;
    }

    // A container: keep it and recurse. (Containers are layers and <defs>; a kept
    // node may reference a def, so defs are never pruned.)
    kept.push(prune(child, keys));
  }

  return { ...vnode, children: kept };
}
