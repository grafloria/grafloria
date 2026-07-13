'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { LinkModel, NodeModel } from '@grafloria/engine';
import type { DiagramInstance, EdgeSpec, NodeSpec } from '@grafloria/renderer';
import { toEdgeSpec, toNodeSpec } from '@grafloria/renderer';
import { useGrafloriaStore } from './context';

/**
 * The hooks. Every one of them is a subscription to the headless instance —
 * there is no diagram state in React, and no diagram logic in this file.
 */

/**
 * The live `DiagramInstance`, or `null` until `<GrafloriaFlow>` has mounted.
 *
 * Works from anywhere inside an `<GrafloriaProvider>` (a toolbar, a minimap, a
 * sidebar) and from inside `<GrafloriaFlow>`'s own children.
 *
 * ```tsx
 * const grafloria = useGrafloria();
 * <button onClick={() => grafloria?.fitView()}>Fit</button>
 * ```
 */
export function useGrafloria(): DiagramInstance | null {
  const store = useGrafloriaStore();
  const [instance, setInstance] = useState<DiagramInstance | null>(
    () => store?.get() ?? null
  );

  useEffect(() => {
    if (!store) return;
    setInstance(store.get());
    return store.subscribe(setInstance);
  }, [store]);

  return instance;
}

/** What `useNodesState` hands back — React Flow's tuple, with our types. */
export type NodesState = [
  NodeSpec[],
  Dispatch<SetStateAction<NodeSpec[]>>,
  (nodes: NodeModel[]) => void,
];

/**
 * Controlled node state — the React Flow tuple everyone already knows:
 *
 * ```tsx
 * const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
 * <GrafloriaFlow nodes={nodes} onNodesChange={onNodesChange} … />
 * ```
 *
 * `onNodesChange` is what closes the loop: the user drags a node, the ENGINE
 * moves it, the instance emits `nodes:change`, `<GrafloriaFlow>` calls this, and
 * React state catches up. Without it a controlled `<GrafloriaFlow>` would snap the
 * node back on the next render — the classic controlled-component trap.
 */
export function useNodesState(initial: NodeSpec[] = []): NodesState {
  const [nodes, setNodes] = useState<NodeSpec[]>(initial);

  const onNodesChange = useCallback((next: NodeModel[]) => {
    setNodes(next.map(toNodeSpec));
  }, []);

  return [nodes, setNodes, onNodesChange];
}

export type EdgesState = [
  EdgeSpec[],
  Dispatch<SetStateAction<EdgeSpec[]>>,
  (edges: LinkModel[]) => void,
];

/** Controlled edge state. Mirrors {@link useNodesState}. */
export function useEdgesState(initial: EdgeSpec[] = []): EdgesState {
  const [edges, setEdges] = useState<EdgeSpec[]>(initial);

  const onEdgesChange = useCallback((next: LinkModel[]) => {
    setEdges(next.map(toEdgeSpec));
  }, []);

  return [edges, setEdges, onEdgesChange];
}

export interface SelectionChange {
  nodes: NodeModel[];
  edges: LinkModel[];
}

/**
 * Fire a callback whenever the selection changes.
 *
 * ```tsx
 * useOnSelectionChange(({ nodes }) => setInspected(nodes[0] ?? null));
 * ```
 *
 * The handler is held in a ref, so passing an inline arrow (the common case)
 * does NOT re-subscribe on every render.
 */
export function useOnSelectionChange(handler: (change: SelectionChange) => void): void {
  const instance = useGrafloria();
  const [ref] = useState(() => ({ current: handler }));
  ref.current = handler;

  useEffect(() => {
    if (!instance) return;
    return instance.on('selection:change', (change) => ref.current(change));
  }, [instance, ref]);
}

/** The current selection as state (for rendering an inspector panel). */
export function useSelection(): SelectionChange {
  const instance = useGrafloria();
  const [selection, setSelection] = useState<SelectionChange>({ nodes: [], edges: [] });

  useEffect(() => {
    if (!instance) {
      setSelection({ nodes: [], edges: [] });
      return;
    }
    const model = instance.getModel();
    setSelection({
      nodes: model.getSelectedNodes(),
      edges: model.getLinks().filter((l: LinkModel) => l.state === 'selected'),
    });
    return instance.on('selection:change', setSelection);
  }, [instance]);

  return selection;
}

/** The live camera (zoom + world rect) as state — for a minimap or a zoom badge. */
export function useViewport(): { zoom: number; x: number; y: number } {
  const instance = useGrafloria();
  const [state, setState] = useState({ zoom: 1, x: 0, y: 0 });

  useEffect(() => {
    if (!instance) return;
    const read = () => {
      const v = instance.viewport.getViewport();
      setState({ zoom: instance.viewport.getZoom(), x: v.x, y: v.y });
    };
    read();
    return instance.on('viewport:change', read);
  }, [instance]);

  return state;
}
