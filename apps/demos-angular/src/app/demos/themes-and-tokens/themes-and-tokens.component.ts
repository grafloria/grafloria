import { AfterViewInit, Component } from '@angular/core';
import { DiagramCanvasComponent } from '@grafloria/renderer-angular';
import {
  LIGHT_THEME, type Theme, type TokenBridge,
  shadcnBridge, muiBridge, tailwindBridge,
} from '@grafloria/renderer';
import { markReady } from '../demo-ready';

const SPEC = {
  nodes: [
    { id: 'a', position: { x: 70, y: 60 }, size: { width: 180, height: 72 }, data: { label: 'Order' } },
    { id: 'b', position: { x: 380, y: 60 }, size: { width: 180, height: 72 }, data: { label: 'Payment' } },
    { id: 'c', position: { x: 690, y: 60 }, size: { width: 180, height: 72 }, data: { label: 'Fulfil' } },
    { id: 'd', position: { x: 380, y: 190 }, size: { width: 180, height: 72 }, data: { label: 'Refund' } },
  ],
  edges: [
    { id: 'e1', source: 'a', target: 'b' },
    { id: 'e2', source: 'b', target: 'c' },
    { id: 'e3', source: 'b', target: 'd' },
  ],
};

/** A design-token bridge: the HOST's shadcn / MUI / Tailwind variables paint the
 *  diagram. One setTokenBridge() call re-skins the engine from the host's own
 *  CSS variables — flip the host palette and the diagram follows. */
@Component({
  standalone: true,
  imports: [DiagramCanvasComponent],
  styles: [`
    :host { display: block; }
    #app {
      --background: 0 0% 100%; --card: 0 0% 100%; --card-foreground: 222.2 84% 4.9%;
      --border: 214.3 31.8% 91.4%; --primary: 221.2 83.2% 53.3%; --secondary: 210 40% 96.1%;
      --accent: 210 40% 96.1%; --muted: 210 40% 96.1%; --muted-foreground: 215.4 16.3% 46.9%;
      --destructive: 0 84.2% 60.2%; --ring: 221.2 83.2% 53.3%;
      --mui-palette-background-paper: #fffbf2; --mui-palette-divider: #b8860b;
      --mui-palette-primary-main: #6750a4; --mui-palette-text-primary: #1c1b1f;
      --mui-palette-action-selected: #eaddff; --mui-palette-action-hover: #f7f2fa;
      --mui-palette-action-disabled: #e7e0ec; --mui-palette-error-main: #b3261e;
      --mui-palette-secondary-main: #625b71;
      --color-white: #ffffff; --color-slate-50: #f8fafc; --color-slate-100: #f1f5f9;
      --color-slate-200: #e2e8f0; --color-slate-300: #a5b4c8; --color-slate-400: #7b8fa8;
      --color-slate-500: #64748b; --color-slate-900: #0f172a; --color-blue-50: #eff6ff;
      --color-blue-600: #2563eb; --color-amber-100: #fef3c7; --color-amber-500: #f59e0b;
      --color-red-100: #fee2e2; --color-red-500: #ef4444; --color-emerald-500: #10b981;
      --color-violet-500: #8b5cf6;
    }
    #app.dark {
      --background: 222.2 84% 4.9%; --card: 222.2 47% 11%; --card-foreground: 210 40% 98%;
      --border: 217.2 32.6% 25%; --primary: 217.2 91.2% 59.8%; --secondary: 217.2 32.6% 17.5%;
      --accent: 217.2 32.6% 17.5%; --muted: 217.2 32.6% 17.5%; --muted-foreground: 215 20.2% 65.1%;
      --destructive: 0 62.8% 30.6%; --ring: 224.3 76.3% 48%;
    }
    .bar { display:flex; gap:8px; align-items:center; padding:10px 24px; border-bottom:1px solid rgba(127,127,127,.25); flex-wrap:wrap; }
    .bar button { padding:6px 14px; border-radius:6px; border:1px solid rgba(127,127,127,.4); background:transparent; color:inherit; cursor:pointer; }
    .bar button[aria-pressed="true"] { background:#2563eb; border-color:#2563eb; color:#fff; }
  `],
  template: `
    <div id="app" [class.dark]="hostDark">
      <div class="bar">
        <strong style="font-size:12px">drive Grafloria from:</strong>
        @for (b of bridges; track b.key) {
          <button (click)="use(b.key)" [attr.aria-pressed]="b.key === active">{{ b.label }}</button>
        }
        <button (click)="flipHost()" style="margin-left:16px">flip the HOST palette (.dark)</button>
      </div>
      <grafloria-diagram-canvas [(nodes)]="nodes" [(edges)]="edges" [theme]="theme"
        [tokenBridge]="bridge" style="display:block; height:calc(100vh - 53px)" />
    </div>
  `,
})
export class ThemesAndTokensComponent implements AfterViewInit {
  theme: Theme = LIGHT_THEME;
  hostDark = false;
  active = 'none';
  bridge: TokenBridge | undefined = undefined;
  nodes = SPEC.nodes;
  edges = SPEC.edges;
  private map: Record<string, TokenBridge | undefined> = {
    none: undefined, shadcn: shadcnBridge(), mui: muiBridge(), tailwind: tailwindBridge(),
  };
  bridges = [
    { key: 'none', label: "Grafloria's own theme" },
    { key: 'shadcn', label: 'shadcn tokens' },
    { key: 'mui', label: 'MUI tokens' },
    { key: 'tailwind', label: 'Tailwind tokens' },
  ];

  use(which: string) { this.active = which; this.bridge = this.map[which]; }
  flipHost() { this.hostDark = !this.hostDark; }
  ngAfterViewInit() { markReady(); }
}
