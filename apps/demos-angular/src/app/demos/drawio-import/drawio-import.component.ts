import { AfterViewInit, Component, ElementRef, ViewEncapsulation, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GrafloriaDiagramComponent } from '@grafloria/angular';
import { fromDocument, DiagramSerializer, type RenderSpec } from '@grafloria/element';
import { importDrawio, type DrawioImportResult } from '@grafloria/engine';
import type { DiagramInstance } from '@grafloria/renderer';
import { markReady } from '../demo-ready';
import { mountCodeEditor } from '../../code-editor';

// A small order flow, hand-written in the exact XML draw.io saves: a rounded
// start box, a rhombus decision, a SWIMLANE CONTAINER whose children carry
// PARENT-RELATIVE geometry, an edge with MANUAL WAYPOINTS that detours under
// the decision, and an edge that ends ON the container itself — the four
// constructs this importer exists for.
const PLAIN_XML = `<mxGraphModel dx="800" dy="600" grid="1">
  <root>
    <mxCell id="0"/>
    <mxCell id="1" parent="0"/>
    <mxCell id="start" value="New order" style="rounded=1;fillColor=#dae8fc;strokeColor=#6c8ebf;" vertex="1" parent="1">
      <mxGeometry x="40" y="70" width="150" height="60" as="geometry"/>
    </mxCell>
    <mxCell id="check" value="In stock?" style="rhombus;fillColor=#fff2cc;strokeColor=#d6b656;" vertex="1" parent="1">
      <mxGeometry x="45" y="220" width="140" height="90" as="geometry"/>
    </mxCell>
    <mxCell id="lane" value="Fulfilment" style="swimlane;" vertex="1" parent="1">
      <mxGeometry x="330" y="70" width="380" height="280" as="geometry"/>
    </mxCell>
    <mxCell id="pick" value="Pick items" style="rounded=0;fillColor=#d5e8d4;strokeColor=#82b366;" vertex="1" parent="lane">
      <mxGeometry x="30" y="50" width="130" height="60" as="geometry"/>
    </mxCell>
    <mxCell id="pack" value="Pack &amp; ship" style="rounded=0;" vertex="1" parent="lane">
      <mxGeometry x="210" y="170" width="130" height="60" as="geometry"/>
    </mxCell>
    <mxCell id="e1" style="edgeStyle=orthogonalEdgeStyle;" edge="1" parent="1" source="start" target="check">
      <mxGeometry relative="1" as="geometry"/>
    </mxCell>
    <mxCell id="e2" value="yes" style="edgeStyle=orthogonalEdgeStyle;" edge="1" parent="1" source="check" target="pick">
      <mxGeometry relative="1" as="geometry">
        <Array as="points"><mxPoint x="115" y="420"/><mxPoint x="425" y="420"/></Array>
      </mxGeometry>
    </mxCell>
    <mxCell id="e3" edge="1" parent="lane" source="pick" target="pack">
      <mxGeometry relative="1" as="geometry"/>
    </mxCell>
    <mxCell id="e4" value="escalate" style="dashed=1;" edge="1" parent="1" source="check" target="lane">
      <mxGeometry relative="1" as="geometry"/>
    </mxCell>
  </root>
</mxGraphModel>`;

// A TWO-PAGE file, both pages inline (uncompressed) — the page picker appears
// and each page renders as its own diagram.
const MULTI_XML = `<mxfile host="grafloria-demo" version="24.0">
  <diagram id="p1" name="Overview"><mxGraphModel><root>
    <mxCell id="0"/><mxCell id="1" parent="0"/>
    <mxCell id="m1" value="PageOneNode" style="rounded=1;fillColor=#dae8fc;" vertex="1" parent="1"><mxGeometry x="40" y="40" width="170" height="60" as="geometry"/></mxCell>
  </root></mxGraphModel></diagram>
  <diagram id="p2" name="Detail"><mxGraphModel><root>
    <mxCell id="0"/><mxCell id="1" parent="0"/>
    <mxCell id="m2" value="PageTwoNode" style="ellipse;fillColor=#d5e8d4;" vertex="1" parent="1"><mxGeometry x="40" y="60" width="180" height="80" as="geometry"/></mxCell>
    <mxCell id="m3" value="Second" vertex="1" parent="1"><mxGeometry x="330" y="70" width="120" height="60" as="geometry"/></mxCell>
    <mxCell id="me" edge="1" parent="1" source="m2" target="m3"><mxGeometry relative="1" as="geometry"/></mxCell>
  </root></mxGraphModel></diagram>
</mxfile>`;

// The COMPRESSED example is generated from the SAME XML, through the browser's
// own CompressionStream — the exact inverse of the decode path importDrawio
// runs — so the two examples can never drift apart, and importing both proves
// compressed ≡ plain end to end.
async function compressedCopy(xml: string): Promise<string> {
  const bytes = new TextEncoder().encode(encodeURIComponent(xml));
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  const buf = new Uint8Array(await new Response(stream).arrayBuffer());
  let bin = '';
  for (const b of buf) bin += String.fromCharCode(b);
  return `<mxfile host="grafloria-demo" version="24.0"><diagram id="d1" name="Page-1">${btoa(bin)}</diagram></mxfile>`;
}

type Model = NonNullable<DrawioImportResult['diagram']>;
type Page = NonNullable<DrawioImportResult['pages']>[number];
/** The status line: the counts and every named warning — or the import's error. */
interface Status { head?: string; warnings: string[]; error?: string }

function statusOf(model: Model, warnings: string[], pageNote: string): Status {
  const counts = `${model.getNodes().length} nodes · ${model.getLinks().length} links · ${model.getGroups().length} groups`;
  return {
    head: (pageNote ? `${pageNote} · ` : '') + counts + (warnings.length ? ` · ${warnings.length} warning(s):` : ' · no warnings'),
    warnings,
  };
}

/** .drawio (mxGraph XML) import — the migration on-ramp from draw.io /
 *  diagrams.net. importDrawio() reads plain <mxGraphModel> XML and the default
 *  compressed <mxfile> save; every page of a multi-page file imports, and every
 *  construct the import drops is named in a warning. The imported model goes
 *  serialize → fromDocument → render, the same public loader an embedder uses:
 *  <grafloria-diagram> hosts the loaded spec, and each import mounts a fresh one. */
@Component({
  standalone: true,
  imports: [GrafloriaDiagramComponent, FormsModule],
  // The editor and the canvas are built outside this template: unscoped styles,
  // every selector under .di-page.
  encapsulation: ViewEncapsulation.None,
  template: `
    <div class="di-page">
      <div class="note">
        <b>.drawio (mxGraph XML) import</b> — the migration on-ramp from draw.io / diagrams.net.
        Reads plain <code>&lt;mxGraphModel&gt;</code> XML <i>and</i> the default compressed
        <code>&lt;mxfile&gt;</code> save (base64 → raw-deflate → URI-encoded). Vertices, styles,
        swimlane containers with real membership, edges with labels, arrow markers, <b>manual
        waypoints</b> (applied, not parked), edges that end <b>on a container</b>, and
        <b>multi-page files</b> (every page imports; pick one below) all map onto the engine's
        own models — and every construct the import drops is <b>named in a warning</b>, never
        lost in silence.
      </div>
      <div class="di-canvas">
        <div class="di-stage">
          <!-- One mounted document at a time; a new id remounts the canvas, as the JS page swaps its host. -->
          @for (m of mounted(); track m.id) {
            <grafloria-diagram [spec]="m.spec" (ready)="onReady($event)" style="position:absolute; inset:0" />
          }
        </div>
        <div class="di-side">
          <textarea #source class="di-text" spellcheck="false" placeholder="Paste .drawio / mxGraph XML here…"
            [ngModel]="text()" (ngModelChange)="text.set($event)"></textarea>
          <div class="foot">
            <button (click)="load(PLAIN_XML)">example: plain XML</button>
            <button (click)="loadCompressed()">example: compressed</button>
            <button (click)="load(MULTI_XML)">example: 2 pages</button>
            <button (click)="show(text())">import</button>
            <select class="di-pagepick" [hidden]="!pages()" [ngModel]="page()" (ngModelChange)="pickPage($event)">
              @for (p of pages() ?? []; track $index) {
                <option [value]="'' + $index" [disabled]="!!p.error">page {{ $index + 1 }}: {{ p.name }}{{ p.error ? ' (unreadable)' : '' }}</option>
              }
            </select>
          </div>
          <div class="di-status">
            @if (status(); as s) {
              @if (s.error) {
                <span class="bad">{{ s.error }}</span>
              } @else {
                <div>{{ s.head }}</div>
                @for (w of s.warnings; track $index) { <span class="warn">⚠ {{ w }}</span> }
              }
            } @else { — }
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .di-page { display: flex; flex-direction: column; height: 100vh; }
    .di-page, .di-page * { box-sizing: border-box; }
    .di-page .note { font-size: 12px; opacity: .8; padding: 10px 24px; border-bottom: 1px solid rgba(127,127,127,.25); line-height: 1.6; }
    .di-page code { background: rgba(127,127,127,.15); padding: 1px 5px; border-radius: 4px; }
    .di-canvas { display: flex; flex: 1; min-height: 0; }
    .di-stage { flex: 1; min-width: 0; position: relative; }
    .di-side { width: 400px; border-left: 1px solid rgba(127,127,127,.3); display: flex; flex-direction: column; }
    .di-text { flex: 1; font: 11px ui-monospace, Menlo, monospace; border: 0; border-bottom: 1px solid rgba(127,127,127,.3); padding: 10px; resize: none; background: transparent; color: inherit; white-space: pre; }
    .di-side .foot { padding: 8px 10px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    .di-side button { padding: 6px 12px; border-radius: 6px; border: 1px solid rgba(127,127,127,.4); background: transparent; color: inherit; cursor: pointer; }
    .di-pagepick { padding: 5px 8px; border-radius: 6px; border: 1px solid rgba(127,127,127,.4); background: transparent; color: inherit; }
    .di-status { font-size: 12px; padding: 6px 10px 10px; line-height: 1.5; max-height: 130px; overflow: auto; }
    .di-status .bad { color: #dc2626; font-weight: 600; }
    .di-status .warn { opacity: .75; display: block; }
  `],
})
export class DrawioImportComponent implements AfterViewInit {
  readonly PLAIN_XML = PLAIN_XML;
  readonly MULTI_XML = MULTI_XML;
  // Syntax-coloured XML over the textarea, which stays canonical beneath.
  source = viewChild<ElementRef<HTMLTextAreaElement>>('source');
  text = signal(PLAIN_XML);
  status = signal<Status | null>(null);
  pages = signal<Page[] | null>(null);
  page = signal('0');
  mounted = signal<Array<{ id: number; spec: RenderSpec }>>([]);
  private mountId = 0;
  private painted = false;

  // Import → serialize → fromDocument → render: the LOADED path is the same
  // public one-liner an embedder writes, so groups (frames + membership),
  // applied waypoints and link styles all arrive through the supported
  // loader instead of a demo-only rebuild.
  private renderModel(model: Model) {
    const json = JSON.stringify(new DiagramSerializer().serialize(model));
    this.mounted.set([{ id: ++this.mountId, spec: fromDocument(json) as unknown as RenderSpec }]);
  }

  async show(src: string) {
    const result = await importDrawio(src);
    if (result.error && !result.diagram) {
      // Error path leaves the PREVIOUS diagram (and picker) fully intact.
      this.status.set({ error: result.error, warnings: [] });
      return result;
    }
    const all = result.pages ?? null;
    this.pages.set(all);
    this.page.set('0');
    this.renderModel(result.diagram!);
    this.status.set(statusOf(result.diagram!, result.warnings, all ? `page 1/${all.length} "${all[0]!.name}"` : ''));
    return result;
  }

  pickPage(value: string) {
    this.page.set(value);
    const all = this.pages();
    const p = all?.[Number(value)];
    if (!all || !p || !p.diagram) return;
    this.renderModel(p.diagram);
    this.status.set(statusOf(p.diagram, p.warnings, `page ${p.index + 1}/${all.length} "${p.name}"`));
  }

  load(xml: string) { this.text.set(xml); void this.show(xml); }
  async loadCompressed() { this.load(await compressedCopy(PLAIN_XML)); }

  onReady(api: DiagramInstance) {
    api.renderNow();
    api.fitView?.(40);
    if (!this.painted) { this.painted = true; markReady(); }
  }

  ngAfterViewInit() {
    // Monaco's built-in xml tokenizer colours without workers.
    void mountCodeEditor(this.source()?.nativeElement, { language: 'xml' });
    void this.show(PLAIN_XML);
  }
}
