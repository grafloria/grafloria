import { Component, ElementRef, OnDestroy, ViewEncapsulation, viewChild } from '@angular/core';
import { GrafloriaDiagramComponent } from '@grafloria/angular';
import type { RenderOptions } from '@grafloria/element';
import type { DiagramInstance } from '@grafloria/renderer';
import { markReady } from '../demo-ready';
import { METRICS, RULE_OPS } from './workflow-builder-catalog';
import { WorkflowBuilderController } from './workflow-builder-controller';

/**
 * A workflow automation builder on the Grafloria engine.
 *
 *   • Steps are NODES whose `data` is the step ({ action, props, outputs }): the
 *     tile, its two-line label, its ports and its "+" buttons are all painted
 *     from that data, so the model is the only truth. Save writes the ENGINE's
 *     JSON; Load reads it back through DiagramSerializer.
 *   • Every edit is ONE undo step on the engine's own command stack: drags,
 *     group drags, connects and reconnects are the engine's commands; the
 *     page's edits (add, delete, property edits, layout) push a DocCommand that
 *     holds the workflow before and after. So Ctrl/⌘+Z undoes either kind.
 *   • "+" on an output inserts a step there and the flow re-arranges itself
 *     (workflow-builder-layout.ts) with an animated move.
 *   • A sticky note is an engine GROUP: its members ride along when the note is
 *     dragged (the engine's group drag). The note itself is drawn on a layer
 *     UNDER the diagram that carries the camera transform.
 *   • Test workflow walks the links from the trigger: the Condition evaluates
 *     its rule on the sample commit, the Switch evaluates its rules on the
 *     simulated health metrics, and only the chosen output's lines run.
 *
 * <grafloria-diagram> mounts the same render() instance the JS page drives.
 * The catalog, the step painting and the layout live in workflow-builder-*.ts
 * (framework-free); the engine side in WorkflowBuilderController. This
 * component owns the markup — the top bar, the property panel, the add-step
 * menu, the run card, the navigator, the toast — and zone.js re-renders it
 * after every event, frame and timer. (The JS page's thumbnail pose,
 * showcase(), is not ported: it only stages a screenshot.)
 */
@Component({
  standalone: true,
  imports: [GrafloriaDiagramComponent],
  encapsulation: ViewEncapsulation.None,
  templateUrl: './workflow-builder.component.html',
  styleUrl: './workflow-builder.component.css',
})
export class WorkflowBuilderComponent implements OnDestroy {
  readonly c = new WorkflowBuilderController();
  readonly stage = viewChild.required<ElementRef<HTMLElement>>('stage');
  // The flow goes in from the controller once this component (and its
  // stylesheet) is on the page — the note headers are measured in it — so the
  // canvas mounts empty.
  readonly spec = { nodes: [], edges: [] };
  readonly options: RenderOptions = { interaction: { portVisibility: 'always', connectionLineStyle: 'bezier' } as never };
  readonly metrics = METRICS;
  readonly ruleOps = RULE_OPS;

  constructor() {
    // Armed BEFORE the canvas mounts (the diagram renders in its own
    // ngAfterViewInit): the page's capturing Delete is registered ahead of the engine's.
    this.c.armKeys();
  }

  onReady(instance: DiagramInstance): void {
    // (ready) fires inside the diagram's ngAfterViewInit, mid change detection:
    // fill it a microtask later, and zone.js renders the chrome after that.
    void Promise.resolve().then(() => {
      this.c.init(instance, this.stage().nativeElement);
      markReady();
    });
  }

  ngOnDestroy(): void { this.c.destroy(); }

  val(e: Event): string { return (e.target as HTMLInputElement).value; }
  rect(e: Event): DOMRect { return (e.currentTarget as HTMLElement).getBoundingClientRect(); }
  blur(e: Event): void { (e.target as HTMLElement).blur(); }
  onSearchKey(e: KeyboardEvent): void {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter') e.preventDefault();
    this.c.menuKey(e.key);
  }
}
