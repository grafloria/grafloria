import { ChangeDetectorRef, Component, ElementRef, OnDestroy, ViewEncapsulation, inject, viewChild } from '@angular/core';
import { GrafloriaDiagramComponent } from '@grafloria/angular';
import type { RenderOptions } from '@grafloria/element';
import type { DiagramInstance } from '@grafloria/renderer';
import { markReady } from '../demo-ready';
import { MarketingAutomation, initialUi, RENDER_OPTIONS, DELAY_UNITS, type MaUi } from './marketing-automation-controller';

/**
 * A marketing-automation studio on the Grafloria engine, built top-down:
 *
 *   • The automation is a TREE kept as plain JSON (marketing-automation-model.ts):
 *     a trigger, a spine of steps, Branches that fan out into named paths. The
 *     tidy-tree layout there decides every position — nothing is hand-placed —
 *     and every edit re-flows the whole tree with a short animation.
 *   • Steps are HTML cards (metadata.html) on rounded-rect nodes. Lines are real
 *     links, orthogonal with rounded corners (manual waypoints from the layout),
 *     and each Branch path carries its name as a chip (a link label).
 *   • The "+" buttons are WORLD-SPACE portals (createViewportPortal) — they pan
 *     and zoom with the canvas. Every line has one; so does the end of every
 *     path; the dashed one beside a Branch adds a path.
 *   • Every edit is a snapshot command on the engine's own CommandManager, so
 *     the toolbar, ⌘Z / Ctrl+Z and ⇧⌘Z all walk one history.
 *   • Test flow plans the run a sample contact would take and animates it: a
 *     token rides the lines, steps light up, delays fast-forward.
 *
 * <grafloria-diagram> mounts the same render() instance the JS page drives.
 * The engine side (layout, re-flow, "+" buttons, history, keyboard, minimap, the
 * Test flow's token) lives in MarketingAutomation (marketing-automation-controller.ts,
 * shared by the four framework versions); this component renders the chrome —
 * top bar, property panel, step menu, dialogs, toast, navigator — from its `MaUi`.
 */
@Component({
  standalone: true,
  imports: [GrafloriaDiagramComponent],
  encapsulation: ViewEncapsulation.None,
  templateUrl: './marketing-automation.component.html',
  styleUrl: './marketing-automation.component.css',
})
export class MarketingAutomationComponent implements OnDestroy {
  readonly c = new MarketingAutomation();
  readonly stage = viewChild.required<ElementRef<HTMLElement>>('stage');
  // The flow goes in from the controller once this component (and its
  // stylesheet) is on the page — the trigger card and the note are measured in
  // it — so the canvas mounts empty.
  readonly spec = { nodes: [], edges: [] };
  readonly options = RENDER_OPTIONS as RenderOptions;
  readonly units = DELAY_UNITS;
  ui: MaUi = initialUi();
  private readonly cdr = inject(ChangeDetectorRef);
  // Before the diagram exists (its component is created after this one): the
  // keydown listener must be on window ahead of the diagram's own Delete.
  private readonly unhook = this.c.hookKeys();

  constructor() {
    this.c.onChange = (next) => { this.ui = next; this.cdr.markForCheck(); };
  }

  onReady(instance: DiagramInstance): void {
    // (ready) fires inside the diagram's ngAfterViewInit, mid change detection:
    // fill it a microtask later, and zone.js renders the chrome after that.
    void Promise.resolve().then(() => this.c.init(instance, this.stage().nativeElement)).then(() => markReady());
  }

  ngOnDestroy(): void {
    this.unhook();
    this.c.destroy();
  }

  val(e: Event): string { return (e.target as HTMLInputElement).value; }
  blur(e: Event): void { (e.target as HTMLElement).blur(); }
  onDialogClick(e: MouseEvent): void { if (e.target === e.currentTarget) this.c.closeDialog(); }
}
