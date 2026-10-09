/**
 * The seam the workflow-editor features plug into `createDiagram()` through.
 *
 * Each feature (connection reasons, the run overlay, "+" affordances, port
 * anchoring, level of detail…) is its own module: it is handed this context
 * once, keeps whatever DOM it owns inside the HTML layer, and is told after
 * every painted frame (`sync`) and every camera-only frame (`camera`). Every
 * feature is OPT-IN — `createDiagram()` installs only the ones its options ask
 * for, so a diagram that names none of them runs exactly the code it always ran.
 */
import type { DiagramEngine, DiagramModel } from '@grafloria/engine';
import type { ViewportController } from '../../viewport/viewport-controller';

export interface FeatureContext {
  readonly doc: Document;
  readonly container: HTMLElement;
  /** The camera-transformed HTML layer: a child at (x, y) sits at WORLD (x, y). */
  readonly htmlLayer: HTMLElement;
  readonly engine: DiagramEngine;
  getModel(): DiagramModel;
  readonly viewport: ViewportController;
  /** Ask for a frame. */
  schedule(): void;
  /** The picture went stale without a model change (a measured port moved): repaint. */
  invalidate(): void;
  /** Emit an instance event (`api.on(name, …)`). */
  emit(event: string, payload: unknown): void;
  /** The binder's read-only answer: the `readonly` option or the model's lock. */
  isReadonly(): boolean;
}

export interface Feature {
  /** After every painted frame. */
  sync?(): void;
  /** After a camera-only frame (pan / zoom with nothing else dirty). */
  camera?(): void;
  dispose(): void;
}
