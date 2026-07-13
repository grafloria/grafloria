import { Injectable } from '@angular/core';
import { InteractionController } from '@grafloria/renderer';

/**
 * Re-exported for backwards compatibility: `LinkPartHit` was declared in this
 * file before the interaction logic moved down into `@grafloria/renderer`. It is
 * part of `@grafloria/renderer-angular`'s public API (the lib barrel re-exports this
 * module), so it must keep resolving from here.
 */
export type { LinkPartHit } from '@grafloria/renderer';

/**
 * Phase 3 / Wave 3: InteractionHandlerService
 *
 * Angular binding for {@link InteractionController} — and nothing else.
 *
 * ALL of the interaction logic (port hover, connection dragging, link
 * reconnection, inline label repositioning, waypoint and control-point editing)
 * now lives in the framework-agnostic {@link InteractionController} in
 * `@grafloria/renderer`, so React / Vue / web-component wrappers get it for free.
 * This class exists purely to make that controller injectable; it adds no
 * behaviour and overrides no methods.
 *
 * ## The separation this encodes
 *
 * - **WHAT changed** → the controller. Its handlers are pure w.r.t. Angular and
 *   return a boolean meaning "a re-render is warranted".
 * - **TELL THE FRAMEWORK TO RENDER** → the caller. `DiagramCanvasComponent`
 *   turns those booleans into `cdr.markForCheck()` / `scheduleRender()`.
 *
 * The controller therefore never imports Angular, never holds a
 * `ChangeDetectorRef`, and is instantiated with a plain `new` in the e2e
 * harness. Do not add Angular-aware behaviour here: put logic in the controller
 * and change detection in the component.
 *
 * @see InteractionController — the real implementation (and its full API).
 */
@Injectable({
  providedIn: 'root',
})
export class InteractionHandlerService extends InteractionController {
  constructor() {
    super();
  }
}
