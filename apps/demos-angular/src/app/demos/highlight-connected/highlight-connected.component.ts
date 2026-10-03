import { Component, ViewEncapsulation, computed, signal } from '@angular/core';
import { GrafloriaDiagramComponent } from '@grafloria/angular';
import type { RenderOptions } from '@grafloria/element';
import type { DiagramInstance } from '@grafloria/renderer';
import { markReady } from '../demo-ready';

// A seven-step ad-campaign flow — two inputs, a research step, two generators,
// a video step and the campaign. Select a step and its lines come forward.
const card = (kind: string, glyph: string, title: string, body: string) => ({
  tag: 'div', className: 'hc-card k-' + kind,
  children: [
    { tag: 'div', className: 'hc-head', children: [{ tag: 'span', className: 'hc-glyph', text: glyph }, { tag: 'span', text: title }] },
    { tag: 'div', className: 'hc-body', text: body },
  ],
});
const PORT = { shape: 'circle', size: 10 };
// Ports sit on the header band's centre line, left in and right out — or, for
// a step fed from below, in at the middle of its bottom edge.
const ports = (id: string, w: number, h: number, ins: boolean | 'bottom', outs: boolean) => [
  ...(ins === 'bottom' ? [{ id: id + '_in', side: 'bottom', type: 'input', shape: PORT, layout: { strategy: 'absolute', args: { units: 'px', x: w / 2, y: h } } }]
    : ins ? [{ id: id + '_in', side: 'left', type: 'input', shape: PORT, layout: { strategy: 'absolute', args: { units: 'px', x: 0, y: 24 } } }] : []),
  ...(outs ? [{ id: id + '_out', side: 'right', type: 'output', shape: PORT, layout: { strategy: 'absolute', args: { units: 'px', x: w, y: 24 } } }] : []),
];
const N = (id: string, x: number, y: number, w: number, h: number, kind: string, glyph: string, title: string, body: string, ins: boolean | 'bottom', outs: boolean) => ({
  id, position: { x, y }, size: { width: w, height: h },
  metadata: { html: { content: card(kind, glyph, title, body), padding: 0 } },
  shape: { type: 'rect', fill: 'none', stroke: 'none' },
  style: { fill: 'transparent', stroke: 'transparent', strokeWidth: 0 },
  ports: ports(id, w, h, ins, outs),
});
const LINE = { stroke: '#9aa0a6', strokeWidth: 1.6, arrowHead: { type: 'arrow', size: 7, filled: false } };
const E = (s: string, t: string) => ({ id: `${s}-${t}`, source: s, target: t, sourceHandle: s + '_out', targetHandle: t + '_in', type: 'bezier', style: LINE });

const NODES: any[] = [
  N('name',      100, 490, 300, 104, 'input',  '☰', 'Product Name',          'Enter the name of product', false, true),
  N('audience',  100, 850, 300, 104, 'input',  '☰', 'Describe Target Audience', 'Describe the target audience', false, true),
  N('research',  580, 270, 300, 150, 'step',   '✦', 'Research Product',      'Research the product’s specifications and value proposition using web search.', true, true),
  N('adtext',    930, 498, 300, 154, 'step',   '≡', 'Generate Ad Text',      'Generate the ad text based on the product’s specifications and the target audience.', true, true),
  N('videodesc', 930, 850, 300, 154, 'step',   '≡', 'Generate Video Description', 'Generate the video description based on the product’s specifications.', true, true),
  N('video',    1290, 498, 300, 128, 'step',   '▶', 'Generate Video',        'Generate the video based on the video description.', 'bottom', true),
  N('campaign', 1650, 498, 300, 128, 'output', '▦', 'Generate Ad Campaign',  'Combine the ad text and the video into an HTML webpage.', true, false),
];
const EDGES: any[] = [
  E('name', 'research'), E('name', 'adtext'), E('name', 'videodesc'),
  E('research', 'adtext'), E('research', 'videodesc'),
  E('audience', 'adtext'), E('audience', 'videodesc'),
  // The campaign combines the ad text and the video: Ad Text feeds it directly,
  // past "Generate Video", which is fed from below by the video description.
  // That line carries a HAND-PLACED bend on its own row, so it runs straight
  // across "Generate Video" the way the reference draws it — left to itself,
  // the router would take it around the card.
  { ...E('adtext', 'campaign'), points: [{ x: 1230, y: 522 }, { x: 1440, y: 522 }, { x: 1650, y: 522 }], metadata: { hasManualWaypoints: true } },
  E('videodesc', 'video'),
  E('video', 'campaign'),
];

type HighlightOption = boolean | { depth?: number; outgoing?: 'dashed' };

/** Select a node and its lines come forward in ink while the rest fade; a line
 *  crossing a card is lifted above it and dashed. One option,
 *  highlightConnected, and a trace mode that follows the whole path. */
@Component({
  standalone: true,
  imports: [GrafloriaDiagramComponent],
  // The cards are drawn by the renderer, outside this template: unscoped styles.
  encapsulation: ViewEncapsulation.None,
  template: `
    <div style="display:flex; flex-direction:column; height:100vh">
      <div id="hc-bar">
        <label><input type="checkbox" id="hc-on" [checked]="on()" (change)="change({ on: $any($event.target).checked })"> Highlight the selected step’s lines</label>
        <span class="seg" id="hc-depth" role="group" aria-label="How far to follow" [attr.aria-disabled]="!on()">
          <button type="button" data-depth="1" [class.on]="depth() === 1" [attr.aria-pressed]="depth() === 1" (click)="change({ depth: 1 })">Its own lines</button>
          <button type="button" data-depth="trace" [class.on]="depth() === 'trace'" [attr.aria-pressed]="depth() === 'trace'" (click)="change({ depth: 'trace' })">Trace the path</button>
        </span>
        <span class="seg" id="hc-out" role="group" aria-label="Outgoing lines" [attr.aria-disabled]="!on()">
          <button type="button" data-out="solid" [class.on]="outgoing() === 'solid'" [attr.aria-pressed]="outgoing() === 'solid'" (click)="change({ outgoing: 'solid' })">Outgoing solid</button>
          <button type="button" data-out="dashed" [class.on]="outgoing() === 'dashed'" [attr.aria-pressed]="outgoing() === 'dashed'" (click)="change({ outgoing: 'dashed' })">Dashed</button>
        </span>
        <code id="hc-code">{{ code() }}</code>
      </div>
      <div id="hc-canvas">
        <grafloria-diagram [spec]="spec" [options]="options" (ready)="onReady($event)"
          style="display:block; height:100%" />
      </div>
    </div>
  `,
  styles: [`
    #hc-canvas { flex: 1; min-height: 0; position: relative; background: #f1f1f1; }
    /* The control bar: a row above the canvas, so it never covers a step. */
    #hc-bar {
      display: flex; flex-wrap: wrap; align-items: center; gap: 10px;
      padding: 8px 12px; border-bottom: 1px solid var(--gf-line, #E3E7F2);
      background: #fff;
      font: 500 12.5px ui-sans-serif, system-ui, sans-serif; color: var(--gf-ink, #232A3D);
    }
    #hc-bar label { display: inline-flex; align-items: center; gap: 6px; cursor: pointer; white-space: nowrap; }
    #hc-bar .seg { display: inline-flex; border: 1px solid var(--gf-line, #E3E7F2); border-radius: 7px; overflow: hidden; }
    #hc-bar .seg button {
      border: 0; background: none; padding: 4px 10px; cursor: pointer; white-space: nowrap;
      font: 600 12px ui-sans-serif, system-ui, sans-serif; color: var(--gf-mut, #5A6478);
    }
    #hc-bar .seg button + button { border-left: 1px solid var(--gf-line, #E3E7F2); }
    #hc-bar .seg button.on { background: var(--gf-ink, #232A3D); color: #fff; }
    #hc-bar .seg button:focus-visible, #hc-bar input:focus-visible { outline: 2px solid var(--gf-accent, #3B52D9); outline-offset: 2px; }
    #hc-bar .seg[aria-disabled="true"] { opacity: .45; pointer-events: none; }
    #hc-code { font: 12px ui-monospace, Menlo, monospace; color: var(--gf-mut, #5A6478); white-space: nowrap; }

    /* The step cards — a flow editor's: a coloured header band, then what the step does. */
    .hc-card {
      box-sizing: border-box; width: 100%; height: 100%; overflow: hidden;
      border-radius: 12px; background: #fff; border: 1px solid #e3e5e8;
      font: 14px ui-sans-serif, system-ui, sans-serif; color: #1f2328;
    }
    .hc-head { display: flex; align-items: center; gap: 9px; height: 48px; padding: 0 18px; font-weight: 600; font-size: 16px; }
    .hc-glyph { width: 18px; text-align: center; font-size: 15px; }
    .hc-body { padding: 12px 18px; line-height: 1.6; color: #30343a; }
    .hc-card.k-input .hc-head { background: #f1fcaa; }
    .hc-card.k-step .hc-head { background: #c9d8fb; }
    .hc-card.k-output .hc-head { background: #c8f5d2; }
    /* The selected step: a heavy ink frame, like the reference. */
    .grafloria-node-host[data-selected="true"] .hc-card,
    [data-selected="true"] .hc-card { border: 3px solid #111827; }
  `],
})
export class HighlightConnectedComponent {
  spec = { nodes: NODES, edges: EDGES };
  options: RenderOptions = { highlightConnected: true, interaction: { portVisibility: 'always' } };
  on = signal(true);
  depth = signal<1 | 'trace'>(1);
  outgoing = signal<'solid' | 'dashed'>('solid');
  /** The one option each choice on the bar sets. */
  option = computed<HighlightOption>(() => (!this.on() ? false
    : this.depth() === 1 && this.outgoing() === 'solid' ? true
    : { ...(this.depth() !== 1 ? { depth: Infinity } : {}), ...(this.outgoing() !== 'solid' ? { outgoing: 'dashed' as const } : {}) }));
  code = computed(() => {
    const o = this.option();
    return 'highlightConnected: ' + (typeof o === 'object' ? JSON.stringify(o).replace('null', 'Infinity').replace(/"(\w+)":/g, '$1: ') : String(o));
  });
  private api?: DiagramInstance;

  /** Each choice applies the option to the live canvas right away, as the JS page does. */
  change(next: { on?: boolean; depth?: 1 | 'trace'; outgoing?: 'solid' | 'dashed' }) {
    if (next.on !== undefined) this.on.set(next.on);
    if (next.depth !== undefined) this.depth.set(next.depth);
    if (next.outgoing !== undefined) this.outgoing.set(next.outgoing);
    this.api?.setHighlightConnected(this.option());
    this.api?.renderNow();
  }

  selectOnly(...ids: string[]) {
    const api = this.api;
    if (!api) return;
    const model = api.getModel();
    model.clearSelection();
    for (const id of ids) model.addToSelection(model.getNode(id)!);
    api.renderNow();
  }

  onReady(api: DiagramInstance) {
    this.api = api;
    api.fitView(40);
    api.setHighlightConnected(this.option());
    api.renderNow();
    this.selectOnly('adtext');
    markReady();
  }
}
