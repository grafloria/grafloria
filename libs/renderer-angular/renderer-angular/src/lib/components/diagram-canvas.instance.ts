import type { DiagramInstance, DiagramEventMap } from '@grafloria/renderer';

/**
 * The events `<grafloria-diagram-canvas>` raises through its instance — the same
 * names and payloads as `DiagramInstance.on(...)`.
 */
export type GrafloriaCanvasEventMap = Pick<
  DiagramEventMap,
  'selection:change' | 'nodes:change' | 'edges:change' | 'viewport:change' | 'connect'
>;
export type GrafloriaCanvasEventName = keyof GrafloriaCanvasEventMap;

/**
 * What `<grafloria-diagram-canvas (ready)>` hands the host: the `DiagramInstance`
 * API the canvas can honour (model and engine, events, export, Mermaid text, fit,
 * repaint, the nodes/edges setters), plus the canvas history (`undo`/`redo`).
 *
 * The canvas owns its lifecycle — there is no `dispose()`; remove the element.
 */
export type GrafloriaCanvasInstance = Pick<
  DiagramInstance,
  | 'getModel'
  | 'getEngine'
  | 'getCommentStore'
  | 'setNodes'
  | 'setEdges'
  | 'export'
  | 'exportSvgString'
  | 'exportPdf'
  | 'exportText'
  | 'loadText'
  | 'fitView'
  | 'render'
  | 'renderNow'
  | 'batchUpdate'
> & {
  on<K extends GrafloriaCanvasEventName>(event: K, handler: (payload: GrafloriaCanvasEventMap[K]) => void): () => void;
  off<K extends GrafloriaCanvasEventName>(event: K, handler: (payload: GrafloriaCanvasEventMap[K]) => void): void;
  /** Undo the last canvas command (the same history ⌘Z walks). */
  undo(): Promise<void>;
  /** Redo the last undone canvas command. */
  redo(): Promise<void>;
};

/** A tiny typed emitter the canvas feeds; handlers may unsubscribe themselves. */
export class CanvasEventHub {
  private readonly listeners = new Map<string, Set<(payload: unknown) => void>>();

  on(event: string, handler: (payload: never) => void): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(handler as (payload: unknown) => void);
    return () => set?.delete(handler as (payload: unknown) => void);
  }

  off(event: string, handler: (payload: never) => void): void {
    this.listeners.get(event)?.delete(handler as (payload: unknown) => void);
  }

  has(event: string): boolean {
    return (this.listeners.get(event)?.size ?? 0) > 0;
  }

  emit<K extends GrafloriaCanvasEventName>(event: K, payload: GrafloriaCanvasEventMap[K]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const listener of [...set]) listener(payload);
  }

  clear(): void {
    this.listeners.clear();
  }
}
