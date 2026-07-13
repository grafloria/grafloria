'use client';

import { createContext, useContext, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import type { DiagramInstance } from '@grafloria/renderer';

/**
 * The provider + the store behind `useGrafloria()`.
 *
 * React Flow's ergonomics come from exactly this shape: a `<ReactFlowProvider>`
 * that lets a toolbar, a sidebar or a minimap — components that are SIBLINGS of
 * the canvas, not children of it — reach the live instance. We keep that shape,
 * but the thing being shared is our framework-agnostic `DiagramInstance`, so the
 * provider is a 40-line store and NOT a re-implementation of the diagram.
 *
 * Why a hand-rolled store rather than `useSyncExternalStore`: that hook is React
 * 18+, and this package supports React 17–19. Subscribe + `useState` costs one
 * extra render on attach and works everywhere.
 */
export interface GrafloriaStore {
  /** The live instance, or null before `<GrafloriaFlow>` has mounted. */
  get(): DiagramInstance | null;
  /** Called by `<GrafloriaFlow>` on mount/unmount. */
  set(instance: DiagramInstance | null): void;
  /** Notified whenever the instance is attached or detached. */
  subscribe(listener: (instance: DiagramInstance | null) => void): () => void;
}

export function createGrafloriaStore(): GrafloriaStore {
  let current: DiagramInstance | null = null;
  const listeners = new Set<(instance: DiagramInstance | null) => void>();

  return {
    get: () => current,
    set(instance) {
      if (current === instance) return;
      current = instance;
      for (const listener of [...listeners]) listener(instance);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export const GrafloriaContext = createContext<GrafloriaStore | null>(null);

export interface GrafloriaProviderProps {
  children?: ReactNode;
}

/**
 * Wrap anything that needs `useGrafloria()` outside of `<GrafloriaFlow>`'s subtree.
 *
 * ```tsx
 * <GrafloriaProvider>
 *   <Toolbar />           // useGrafloria() works here…
 *   <GrafloriaFlow … />       // …because the flow publishes its instance to the store
 * </GrafloriaProvider>
 * ```
 *
 * `<GrafloriaFlow>` also creates its own store when there is no provider, so the
 * simple single-canvas case needs no wrapper at all.
 */
export function GrafloriaProvider({ children }: GrafloriaProviderProps) {
  const storeRef = useRef<GrafloriaStore>(undefined);
  if (!storeRef.current) storeRef.current = createGrafloriaStore();

  const store = storeRef.current;
  const value = useMemo(() => store, [store]);

  return <GrafloriaContext.Provider value={value}>{children}</GrafloriaContext.Provider>;
}

/** The nearest store, or null when there is no provider above us. */
export function useGrafloriaStore(): GrafloriaStore | null {
  return useContext(GrafloriaContext);
}
