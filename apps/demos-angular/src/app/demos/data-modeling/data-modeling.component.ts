import { Component, ElementRef, OnDestroy, ViewEncapsulation, viewChild } from '@angular/core';
import { GrafloriaDiagramComponent } from '@grafloria/angular';
import type { RenderOptions } from '@grafloria/element';
import type { DiagramInstance } from '@grafloria/renderer';
import { markReady } from '../demo-ready';
import { mountCodeEditor } from '../../code-editor';
import { DataModelingController, DIALECTS, ENGINES, ON_DELETE, ICON, RESULT_IDLE } from './data-modeling-controller';

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * A data modeling studio on the Grafloria engine: design a database on the
 * board and read its SQL as you go.
 *
 *   • The SCHEMA is plain data (tables, columns, relationships, groups, notes).
 *     The board is a projection of it: every edit — a rename, a UQ switch, a
 *     new foreign key, a hidden group, an import — is ONE Command on the
 *     engine's own undo stack that swaps the schema for its next version and
 *     reconciles the board. Dragging cards is the engine's own undoable move,
 *     so Ctrl/⌘+Z walks both kinds of step in order.
 *   • A table card is the page's own HTML tree (UQ / NN switches, a footer,
 *     a grip on each row's edges) that keeps the diagram kit's class contract,
 *     so the kit's live join guidance tints the rows while a key is dragged.
 *   • Each row has two ports — the grips. Dragging one onto a column of another
 *     table makes a foreign key; the engine draws the wire while you aim.
 *   • Group zones are nodes behind their tables: drag one and its tables come
 *     along, hide one and its tables fold away (their keys then point at it).
 *   • The DDL panel regenerates on every change, per dialect; Run SQL loads
 *     sql.js or PGlite on demand and runs your query against real rows.
 *
 * <grafloria-diagram> mounts the same render() instance the JS page drives.
 * The SQL writer, the DDL parser, the seed rows and the in-browser engines live
 * in data-modeling-sql.ts / -db.ts, the cards in data-modeling-cards.ts, and the
 * engine side (the schema's undoable step, the board, the grip drag, the keys,
 * the editors and menus ON the cards) in DataModelingController. This component
 * owns the markup around the board — toolbar, side panel, import dialog — and
 * zone.js re-renders it after every event and timer. The three code boxes (DDL,
 * query, import) are bound textareas that the gallery's Monaco editor colours.
 *
 * Next to the JS page: the studio is full-bleed (this app has no gallery header),
 * and the page's test hooks (ctx.state(), ctx.ddl(), ctx.lastRun …) are not
 * exposed — what a visitor sees and does is the same. (Run on PostgreSQL needs a
 * zone.js workaround, in data-modeling-db.ts: zone.js patches Promise#then.)
 */
@Component({
  standalone: true,
  imports: [GrafloriaDiagramComponent],
  // The studio styles DOM the engine paints (not Angular's): no encapsulation.
  encapsulation: ViewEncapsulation.None,
  templateUrl: './data-modeling.component.html',
  styleUrl: './data-modeling.component.css',
})
export class DataModelingComponent implements OnDestroy {
  readonly c = new DataModelingController();
  readonly spec = { nodes: [], edges: [] };
  readonly options: RenderOptions = { colorMode: 'system', interaction: { portVisibility: 'on-hover' as never } };
  readonly dialects = Object.values(DIALECTS);
  readonly engineKinds = ['sqlite', 'postgresql'] as const;
  readonly engines = ENGINES;
  readonly onDelete = ON_DELETE;
  readonly icon = ICON;
  readonly resultIdle = RESULT_IDLE;

  private readonly studio = viewChild.required<ElementRef<HTMLElement>>('studio');
  private readonly board = viewChild.required<ElementRef<HTMLElement>>('board');
  private readonly layer = viewChild.required<ElementRef<HTMLElement>>('layer');
  private readonly sqlTa = viewChild.required<ElementRef<HTMLTextAreaElement>>('sqlTa');
  private readonly runTa = viewChild.required<ElementRef<HTMLTextAreaElement>>('runTa');
  private readonly impTa = viewChild.required<ElementRef<HTMLTextAreaElement>>('impTa');

  constructor() { this.c.mountCode = mountCodeEditor; }

  /** The result box's view (a union the template reads by its `kind`). */
  get res(): any { return this.c.result; }

  onReady(instance: DiagramInstance): void {
    // (ready) fires inside the diagram's ngAfterViewInit, mid change detection:
    // mount a microtask later, and zone.js renders the panels after that.
    void Promise.resolve().then(() => this.c.init(instance, {
      studio: this.studio().nativeElement, board: this.board().nativeElement, layer: this.layer().nativeElement,
      sqlTa: this.sqlTa().nativeElement, runTa: this.runTa().nativeElement, impTa: this.impTa().nativeElement,
    })).then((done) => { if (done) markReady(); });
  }

  ngOnDestroy(): void { this.c.destroy(); }

  val(e: Event): string { return (e.target as HTMLInputElement).value; }
  onSearchKey(e: KeyboardEvent): void {
    if (e.key === 'Enter') e.preventDefault();
    this.c.searchKey(e.key);
  }
  onModalDown(e: Event): void { if (e.target === e.currentTarget) this.c.closeImport(); }
}
