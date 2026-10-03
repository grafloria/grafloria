import { Component, ElementRef, OnDestroy, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GrafloriaDiagramComponent } from '@grafloria/angular';
import { importDiagramText } from '@grafloria/element';
import type { DiagramInstance } from '@grafloria/renderer';
import { markReady } from '../demo-ready';
import { mountCodeEditor } from '../../code-editor';

/** Architecture layout: the look of an AI-drawn architecture diagram — zones as
 *  regions, boxes sized to their words in rows, straight lines where boxes line
 *  up, bends in the gutters, a note beside what it warns about — from Grafloria
 *  Mermaid with no coordinates in it (`%%grafloria:layout architecture`). The
 *  Layout toggle shows the same text through a graph layout for comparison;
 *  editing the text re-draws as you type. */

/** Only structure and relations — no position, size, pixel anchor or bend. */
const SOURCE = `flowchart LR
  %%grafloria:layout architecture
  customer["<b>Customer</b><br/>phone or browser"]
  subgraph hp["HEALTHPAY'S SIDE · CARDS ARE TYPED HERE"]
    direction LR
    page["<b>HealthPay payment page</b><br/>the card is typed here"]
    wallets["<b>HealthPay wallets</b><br/>hold the customer's money"]
  end
  subgraph ours["OUR SIDE · MUST NEVER SEE A CARD"]
    direction LR
    api["<b>Our API</b><br/><code>sherkety-erp-api</code>"]
    db["<b>Our database</b><br/>keys, ledger, bank numbers"]
  end
  fake["<b>Fake card page</b><br/>not HealthPay's"]:::bad
  note@{ shape: text, label: "if someone swaps the link, the customer lands here (M1)" }
  customer -->|card number and CVV| page
  page -->|adds money| wallets
  api -->|asks HealthPay to move money| wallets
  api -->|saves keys| db
  api -->|sends the payment link| customer
  customer -.->|"card typed as a<br/>#quot;bank account#quot; (H1)"| api
  customer -.-> fake
  classDef box fill:#ffffff,stroke:#d0d5dd,shadow:none,rx:4,font-size:13px
  classDef bad fill:#fdecec,stroke:#e5a0a0,shadow:none,rx:4,font-size:13px
  class customer,page,wallets,api,db box
  style note color:#cf222e,font-weight:bold,font-size:11px
  style hp fill:#e9f2f3,stroke:#7aabb3,stroke-dasharray:5 4,color:#2a7a86,font-weight:bold,letter-spacing:1px
  style ours fill:#f3f4f6,stroke:#d7dbe0,color:#4b5563,font-weight:bold,letter-spacing:1px
  linkStyle default interpolate stepBefore
  linkStyle 0 stroke:#1a7f37,color:#1a7f37,font-weight:bold,font-size:11px,stroke-width:1.5px
  linkStyle 1,2,3,4 stroke:#6b7785,color:#5f6b7a,font-size:11px,stroke-width:1.5px
  linkStyle 5,6 stroke:#cf222e,color:#cf222e,font-weight:bold,font-size:11px,stroke-width:1.5px
  %%grafloria:group ours caption:bottom-left
  %%grafloria:edge * * label:above
  %%grafloria:edge customer api label:below
  %%grafloria:edge api wallets from:top, to:bottom
  %%grafloria:edge customer fake from:bottom, to:top
  %%grafloria:near note fake right
`;

type Layout = 'architecture' | 'layered';
const LAYOUTS: Array<[Layout, string]> = [['architecture', 'architecture'], ['layered', 'layered (for comparison)']];
const NOTE = 'The Mermaid below has no coordinates. Edit it — the drawing follows.';

/** Draw the text: null when drawn, else why it does not parse yet (the last
 *  drawing then stays). "layered" drops the layout line and runs a graph layout. */
async function draw(api: DiagramInstance, text: string, which: Layout): Promise<string | null> {
  let d: any;
  try {
    const body = which === 'architecture' ? text : text.replace(/^\s*%%grafloria:layout\s+architecture\s*$/m, '');
    d = (importDiagramText(body) as any).diagram;
  } catch (e: any) {
    return `That text does not parse yet (${e && e.message ? e.message : e}) — the last drawing stays.`;
  }
  // Clear first: a live model with an id already on the canvas would be kept, not replaced.
  api.setEdges([]); api.setGroups([]); api.setNodes([]);
  api.setNodes(d.getNodes()); api.setGroups(d.getGroups()); api.setEdges(d.getLinks());
  if (which === 'layered') await api.getEngine().layout('layered', { direction: 'LR' });
  api.renderNow();
  api.fitView(28);
  api.renderNow();
  return null;
}

const HOST_CSS = `
#al-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; padding: 8px 12px; border-bottom: 1px solid var(--gf-line, #e5e7eb); background: #fff; font: 500 12.5px ui-sans-serif, system-ui, sans-serif; color: var(--gf-ink, #111827); }
#al-bar .seg { display: inline-flex; border: 1px solid var(--gf-line, #e5e7eb); border-radius: 7px; overflow: hidden; }
#al-bar .seg button { border: 0; background: none; padding: 4px 11px; cursor: pointer; white-space: nowrap; font: 600 12px ui-sans-serif, system-ui, sans-serif; color: var(--gf-mut, #6b7280); }
#al-bar .seg button + button { border-left: 1px solid var(--gf-line, #e5e7eb); }
#al-bar .seg button.on { background: var(--gf-ink, #111827); color: #fff; }
#al-bar .seg button:focus-visible { outline: 2px solid var(--gf-accent, #2563eb); outline-offset: 2px; }
#al-note { color: var(--gf-mut, #6b7280); }
#al-note.err { color: #b42318; }
#al-canvas { height: 540px; background: #fff; }
/* The source box: the gallery's editor mounts in it (Mermaid colouring); the
   textarea is the fallback and stays the value the page reads. */
#al-src-box { height: 420px; border-top: 1px solid var(--gf-line, #e5e7eb); background: #f8fafc; }
#al-src { display: block; box-sizing: border-box; width: 100%; height: 100%; margin: 0; padding: 14px 18px; border: 0; background: #f8fafc; color: #1f2937; font: 12px/1.55 ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre; overflow: auto; resize: vertical; tab-size: 2; }
#al-src:focus-visible { outline: 2px solid var(--gf-accent, #2563eb); outline-offset: -2px; }
`;

@Component({
  standalone: true,
  imports: [GrafloriaDiagramComponent, FormsModule],
  template: `
    <div id="al-bar">
      <span>Layout</span>
      <span class="seg" id="al-layout" role="group" aria-label="Layout">
        @for (l of layouts; track l[0]) {
          <button type="button" [attr.data-layout]="l[0]" [class.on]="layout() === l[0]"
            [attr.aria-pressed]="layout() === l[0]" (click)="redraw(l[0])">{{ l[1] }}</button>
        }
      </span>
      <span id="al-note" role="status" [class.err]="!!error()">{{ error() ?? note }}</span>
    </div>
    <div id="al-canvas">
      <grafloria-diagram [spec]="spec" (ready)="onReady($event)" style="display:block; height:100%" />
    </div>
    <label for="al-src" class="visually-hidden" style="position:absolute;left:-9999px">Grafloria Mermaid source</label>
    <div id="al-src-box">
      <textarea id="al-src" #source [ngModel]="text" (ngModelChange)="onType($event)"
        spellcheck="false" aria-label="Grafloria Mermaid source"></textarea>
    </div>
  `,
  styles: [HOST_CSS],
})
export class ArchitectureLayoutComponent implements OnDestroy {
  readonly layouts = LAYOUTS;
  readonly note = NOTE;
  readonly spec = { nodes: [], edges: [] };
  readonly layout = signal<Layout>('architecture');
  readonly error = signal<string | null>(null);
  text = SOURCE;
  private readonly source = viewChild<ElementRef<HTMLTextAreaElement>>('source');
  private api?: DiagramInstance;
  private timer?: ReturnType<typeof setTimeout>;

  async redraw(which: Layout) {
    if (!this.api) return false;
    const err = await draw(this.api, this.text, which);
    this.error.set(err);
    if (!err) this.layout.set(which);
    return !err;
  }

  async onReady(instance: DiagramInstance) {
    this.api = instance;
    instance.getEngine().setInteractionConfig({ portVisibility: 'hidden' as never });
    await this.redraw('architecture');
    // Mermaid colouring over the textarea; its keystrokes arrive as the input
    // events ngModel (and so the redraw) listens for.
    void mountCodeEditor(this.source()?.nativeElement, { language: 'mermaid' });
    markReady();
  }

  /** Edit the text: the drawing re-composes 300 ms after the last keystroke. */
  onType(value: string) {
    this.text = value;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.redraw(this.layout()), 300);
  }

  ngOnDestroy() { clearTimeout(this.timer); }
}
