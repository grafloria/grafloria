import { Component, OnDestroy, ViewEncapsulation, signal } from '@angular/core';
import { GrafloriaDiagramComponent } from '@grafloria/angular';
import type { RenderSpec } from '@grafloria/element';
import type { DiagramInstance } from '@grafloria/renderer';
import { markReady } from '../demo-ready';
import {
  BAR, VISIO_NODES, VISIO_EDGES, VisioEditor, barDisabled, initialUi, type VisioUi,
} from './visio-editor-controller';

/**
 * Visio-style editor — the whole authoring surface: a page grid with snap, zoom
 * controls and a minimap, drop a shape OR a real database table, group, align,
 * drop into containers — every edit undoable.
 *
 *   T4/T5  stencil registry + 8 categorized stencils
 *   T6/T7  the palette, and drag-from-palette to place a master
 *   T3     align & distribute over the selection
 *   T8     drop a shape in a container and it joins it
 *   T9     the shape-data panel, driven by each master's dataSchema
 *   T10    double-click to rename
 *   T1/T2  snap guides on drag AND on resize (switched on HERE, not globally)
 *
 * `<grafloria-diagram>` mounts the same render() instance the JS page drives.
 * The engine wiring lives in VisioEditor (visio-editor-controller.ts, shared by
 * the four framework versions); this component renders the chrome — toolbar,
 * zoom cluster, context menu — from the controller's state.
 */
@Component({
  standalone: true,
  imports: [GrafloriaDiagramComponent],
  encapsulation: ViewEncapsulation.None,
  templateUrl: './visio-editor.component.html',
  styleUrl: './visio-editor.component.css',
})
export class VisioEditorComponent implements OnDestroy {
  readonly bar = BAR;
  readonly barDisabled = barDisabled;
  readonly spec = { nodes: VISIO_NODES, edges: VISIO_EDGES } as RenderSpec;
  readonly ui = signal<VisioUi>(initialUi());
  ctl: VisioEditor | null = null;

  onReady(instance: DiagramInstance, canvas: HTMLElement, rail: HTMLElement, panel: HTMLElement): void {
    this.ctl = new VisioEditor(instance, { canvas, rail, panel }, (next) => this.ui.set(next));
    void this.ctl.init().then(() => markReady());
  }

  onContextMenu(e: MouseEvent): void {
    e.preventDefault();
    this.ctl?.openMenuAt(e.clientX, e.clientY);
  }

  ngOnDestroy(): void {
    this.ctl?.dispose();
    this.ctl = null;
  }
}
