/**
 * WHAT A BOARD'S MODULES SEE OF THE BINDER (tile first, step 4b-i).
 *
 * `bindDashboardGrid` is one closure: the engine, the group, the options and
 * a few dozen live values. The modules that left it — the projection, the
 * chrome, the keyboard — read that state through this context instead of
 * sharing the closure. Everything that can change during the binder's life
 * is a call (`engine()`, `frame()`, `isStatic()`), never a copied value, so a
 * module sees the engine the binder holds NOW, not the one it was created
 * with (the binder rebuilds its engine on every sync).
 */
import type { DiagramModel, GridPackEngine, GroupModel, NodeModel } from '@grafloria/engine';
import type { DashboardGridGeometry, WorldRect } from './grid-mapping';
import type { DashboardGridApi, DashboardGridOptions } from './grid-binder';

/**
 * Small overshoots CLAMP onto the board instead of counting as off-board — the
 * plan prototype cannot leave its board at all (cells clamp at the edges), so a
 * 60 px slip past the frame must not dim or delete.
 */
export const EDGE_GRACE = 60;

export interface BoardCtx {
  readonly api: DashboardGridApi;
  readonly group: GroupModel;
  readonly diagram: DiagramModel;
  readonly options: DashboardGridOptions;
  readonly gap: number;
  readonly padding: number;
  readonly baseRowHeight: number;
  readonly minRowHeight: number;
  readonly overflow: 'bounded' | 'scroll';
  /** The engine the binder holds now (it is rebuilt on every sync). */
  engine(): GridPackEngine;
  frame(): WorldRect;
  geom(): DashboardGridGeometry;
  rows(): number;
  sizing(): 'fit' | 'grow';
  /** The board's design height in px, 0 when it has none. */
  designH(): number;
  rtl(): boolean;
  isStatic(): boolean;
  disposed(): boolean;
  htmlLayer(): HTMLElement | null;
  hostOf(id: string): HTMLElement | null;
  memberEntity(id: string): NodeModel | GroupModel | undefined;
  sizeOf(e: { size?: { width: number; height: number; depth?: number } }): { width: number; height: number; depth?: number };
  /**
   * The tile the projection leaves alone — this board's own ghost while its
   * gesture runs, or a ghost another board's gesture placed here through its
   * leg — and the tile the placeholder is drawn for. Null when none.
   */
  ghostId(): string | null;
  /**
   * A system write of DERIVED state (a projected rect, the board's own
   * height). The binder's `writing` flag guards its bounds handler while it
   * runs, so a frame the projection wrote is not re-projected as a change.
   */
  write(fn: () => void): void;
}
