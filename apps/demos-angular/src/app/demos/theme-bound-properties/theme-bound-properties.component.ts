import { AfterViewInit, Component } from '@angular/core';
import { DiagramCanvasComponent } from '@grafloria/angular';
import { themeRef, LIGHT_THEME, DARK_THEME, HIGH_CONTRAST_LIGHT_THEME, type Theme } from '@grafloria/renderer';
import { markReady } from '../demo-ready';

const SEVERITY: [string, string, number][] = [
  ['critical', 'Disk failure', 60],
  ['warning', 'Latency spike', 250],
  ['success', 'Backup complete', 440],
  ['info', 'Config reloaded', 630],
];

/** themeRef('category.critical') — a theme swap recolours the CALLER's own
 *  semantic colours, not just the chrome. The nodes never name a colour; they
 *  declare a MEANING and the theme decides what it looks like. */
@Component({
  standalone: true,
  imports: [DiagramCanvasComponent],
  template: `
    <div style="display:flex;gap:8px;align-items:center;padding:10px 24px;border-bottom:1px solid rgba(127,127,127,.25)">
      <strong style="font-size:12px">theme:</strong>
      @for (t of themes; track t.key) {
        <button (click)="setTheme(t.key)" [attr.aria-pressed]="t.key === active"
          style="padding:6px 14px;border-radius:6px;border:1px solid rgba(127,127,127,.4);background:transparent;color:inherit;cursor:pointer">{{ t.label }}</button>
      }
    </div>
    <grafloria-diagram-canvas [(nodes)]="nodes" [(edges)]="edges" [theme]="theme"
      style="display:block; height:calc(100vh - 53px)" />
  `,
})
export class ThemeBoundPropertiesComponent implements AfterViewInit {
  themes = [
    { key: 'light', label: 'light', theme: LIGHT_THEME },
    { key: 'dark', label: 'dark', theme: DARK_THEME },
    { key: 'hc', label: 'high contrast', theme: HIGH_CONTRAST_LIGHT_THEME },
  ];
  active = 'light';
  theme: Theme = LIGHT_THEME;
  nodes = [
    ...SEVERITY.map(([cat, label, x]) => ({
      id: cat, position: { x, y: 90 }, size: { width: 170, height: 76 }, data: { label },
      style: {
        fill: themeRef(`category.${cat}`),
        stroke: themeRef(`category.${cat}`),
        strokeWidth: themeRef('numbers.emphasis'),
      },
    })),
    { id: 'sink', position: { x: 340, y: 280 }, size: { width: 200, height: 76 }, data: { label: 'Incident queue' } },
  ];
  edges = SEVERITY.map(([cat]) => ({
    id: `e-${cat}`, source: cat, target: 'sink',
    style: { stroke: themeRef(`category.${cat}`), strokeWidth: themeRef('numbers.regular') },
  }));

  setTheme(key: string) {
    this.active = key;
    this.theme = this.themes.find((t) => t.key === key)!.theme;
  }
  ngAfterViewInit() { markReady(); }
}
