/**
 * Defect #29 — the Angular canvas's exports skipped custom-node capture and image
 * inlining.
 *
 * An Angular custom node is an `<ng-template grafloriaNode>` rendered in the canvas's
 * own HTML layer. `SVGRenderer.export()` only serializes the VNode tree, where such a
 * node is an EMPTY `<g>` — so `exportDiagram()` (documented as "the full pipeline")
 * exported a blank card and left every `<img src="https://…">` as a URL, and the
 * synchronous `exportSvg()` / `exportPdf()` skipped the capture too.
 *
 * These specs export a canvas whose only custom node is a template card holding a
 * title and an external image, and assert on the bytes: the card's text and box are in
 * the file, the awaited export embeds the image as a `data:` URI, and the synchronous
 * exports capture the card without ever touching the network. The port handle the
 * canvas draws on the card is interaction chrome and must NOT be in the file.
 */
import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { DiagramCanvasComponent } from './diagram-canvas.component';
import { GrafloriaNodeDefDirective } from '../directives/grafloria-node-def.directive';
import type { NodeSpec, EdgeSpec, AssetFetcher } from '@grafloria/renderer';

const URL_IMG = 'https://cdn.example.test/avatar.png';
// 1×1 PNG — what the "CDN" (here: the app's assetFetcher) serves.
const PNG_1x1 = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYGD4DwABBAEAwS2OUAAAAABJRU5ErkJggg==',
    'base64'
  )
);

@Component({
  imports: [DiagramCanvasComponent, GrafloriaNodeDefDirective],
  template: `
    <grafloria-diagram-canvas
      style="display:block;width:800px;height:600px"
      [viewport]="{ x: 0, y: 0, width: 800, height: 600 }"
      [zoom]="1"
      [(nodes)]="nodes"
      [(edges)]="edges">
      <ng-template grafloriaNode="card" let-node let-data="data">
        <div class="tpl-card" style="background: rgb(12, 34, 56)">
          <span class="tpl-title">{{ data['title'] }}</span>
          <img class="tpl-avatar" [attr.src]="data['avatar']" alt="" />
        </div>
      </ng-template>
    </grafloria-diagram-canvas>
  `,
})
class ExportHost {
  nodes = signal<NodeSpec[]>([
    {
      id: 'card-1',
      type: 'card',
      position: { x: 40, y: 40 },
      size: { width: 200, height: 100 },
      data: { title: 'Quarterly Owner', avatar: URL_IMG },
      ports: [{ id: 'out', side: 'right', type: 'output' }],
    },
  ]);
  edges = signal<EdgeSpec[]>([]);
}

const box = (w: number, h: number) => () =>
  ({ left: 0, top: 0, width: w, height: h, right: w, bottom: h, x: 0, y: 0 }) as DOMRect;

describe('diagram-canvas export — Angular custom nodes and their images (#29)', () => {
  let fixture: ComponentFixture<ExportHost>;
  let canvas: DiagramCanvasComponent;
  const globals = globalThis as { fetch?: unknown };
  const realFetch = globals.fetch;
  let fetched: string[];
  const assetFetcher: AssetFetcher = async () => ({ data: PNG_1x1, mimeType: 'image/png' });

  beforeEach(async () => {
    fetched = [];
    // The environment fetch refuses (what a CORS refusal looks like); tier 2 — the
    // app's assetFetcher — is what embeds the bytes. Any call is recorded, so the sync
    // exports can be held to "never touches the network".
    globals.fetch = async (url: string) => {
      fetched.push(String(url));
      throw new TypeError('Failed to fetch');
    };

    await TestBed.configureTestingModule({ imports: [ExportHost] }).compileComponents();
    fixture = TestBed.createComponent(ExportHost);
    fixture.detectChanges();
    canvas = fixture.debugElement.query(By.directive(DiagramCanvasComponent)).componentInstance;
    (canvas as unknown as { renderNow(): void }).renderNow();
    fixture.detectChanges();

    // jsdom has no layout: give the template's elements the boxes a browser would.
    const root = fixture.nativeElement as HTMLElement;
    const wrapper = root.querySelector<HTMLElement>('.html-node-wrapper[data-node-id="card-1"]')!;
    expect(wrapper).toBeTruthy();
    wrapper.getBoundingClientRect = box(200, 100);
    root.querySelector<HTMLElement>('.tpl-card')!.getBoundingClientRect = box(200, 100);
    root.querySelector<HTMLElement>('.tpl-title')!.getBoundingClientRect = box(120, 20);
    root.querySelector<HTMLElement>('.tpl-avatar')!.getBoundingClientRect = box(48, 48);
    const handle = root.querySelector<HTMLElement>('.html-port-handle');
    expect(handle).toBeTruthy(); // the chrome the export must leave out IS on screen
    handle!.getBoundingClientRect = box(8, 8);
  });

  afterEach(() => {
    fixture.destroy();
    if (realFetch === undefined) delete globals.fetch;
    else globals.fetch = realFetch;
  });

  it('exportDiagram("svg") captures the template card and embeds its external image', async () => {
    const svg = await canvas.exportDiagram('svg', { assetFetcher });

    expect(svg).toContain('Quarterly Owner'); // the card's text
    expect(svg).toContain('rgb(12, 34, 56)'); // the card's box
    expect(svg).not.toContain(URL_IMG); // the URL is gone …
    expect(svg).toContain('href="data:image/png;base64,'); // … its bytes are in the file
  });

  it('exportDiagram("pdf") embeds the fetched image as a real XObject', async () => {
    const href = await canvas.exportDiagram('pdf', { assetFetcher });
    const pdf = Buffer.from(href.split(',')[1], 'base64').toString('latin1');
    expect(pdf).toContain('/Subtype /Image'); // the only image in the board is the URL one
  });

  it('exportSvg() captures the card synchronously, keeps the URL and never fetches', () => {
    const result = canvas.exportSvg();
    expect(result.svg).toContain('Quarterly Owner');
    expect(result.svg).toContain(`href="${URL_IMG}"`);
    expect(result.warnings.some((w: string) => /EXTERNAL URL/.test(w))).toBe(true);
    expect(fetched).toEqual([]);
  });

  it('exportPdf() captures the card synchronously and says the URL image cannot be in it', () => {
    const result = canvas.exportPdf();
    expect(result.warnings.some((w: string) => /EXTERNAL URL/.test(w))).toBe(true);
    expect(fetched).toEqual([]);
  });

  it('the port handle drawn on the card is chrome, not content — it is not exported', async () => {
    const svg = await canvas.exportDiagram('svg', { assetFetcher });
    expect(svg).toContain('Quarterly Owner');
    expect(svg).not.toContain('rgb(85, 85, 85)'); // the handle's #555 fill
  });

  it('a caller’s own customNodes still win (customNodes: [] = no widgets)', async () => {
    const svg = await canvas.exportDiagram('svg', { customNodes: [], assetFetcher });
    expect(svg).not.toContain('Quarterly Owner');
  });
});
