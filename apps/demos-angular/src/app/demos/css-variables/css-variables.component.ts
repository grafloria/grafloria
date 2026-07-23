import { AfterViewInit, Component } from '@angular/core';
import { DiagramCanvasComponent } from '@grafloria/renderer-angular';
import { LIGHT_THEME, DARK_THEME, type Theme } from '@grafloria/renderer';
import { markReady } from '../demo-ready';

const SPEC = () => ({
  nodes: [
    { id: 'a', position: { x: 40, y: 70 }, size: { width: 150, height: 70 }, data: { label: 'Alpha' } },
    { id: 'b', position: { x: 260, y: 70 }, size: { width: 150, height: 70 }, data: { label: 'Beta' } },
    { id: 'c', position: { x: 150, y: 200 }, size: { width: 150, height: 70 }, data: { label: 'Gamma' } },
  ],
  edges: [{ id: 'e1', source: 'a', target: 'b' }, { id: 'e2', source: 'a', target: 'c' }],
});

/** Two diagrams, two themes, one page, one shared stylesheet: each instance
 *  writes only its own [data-grafloria-instance]-scoped variable block, so the
 *  light one and the dark one never clobber each other. */
@Component({
  standalone: true,
  imports: [DiagramCanvasComponent],
  template: `
    <div style="display:flex;height:100vh">
      <div style="flex:1;min-width:0;position:relative;border-right:1px solid rgba(127,127,127,.3)">
        <span style="position:absolute;top:8px;left:8px;z-index:2;font:11px ui-monospace,monospace;background:rgba(127,127,127,.2);padding:2px 6px;border-radius:4px">instance A — light</span>
        <grafloria-diagram-canvas [nodes]="a.nodes" [edges]="a.edges" [theme]="light" style="display:block;height:100%" />
      </div>
      <div style="flex:1;min-width:0;position:relative">
        <span style="position:absolute;top:8px;left:8px;z-index:2;font:11px ui-monospace,monospace;background:rgba(127,127,127,.2);padding:2px 6px;border-radius:4px">instance B — dark</span>
        <grafloria-diagram-canvas [nodes]="b.nodes" [edges]="b.edges" [theme]="dark" style="display:block;height:100%" />
      </div>
    </div>
  `,
})
export class CssVariablesComponent implements AfterViewInit {
  light: Theme = LIGHT_THEME;
  dark: Theme = DARK_THEME;
  a = SPEC();
  b = SPEC();
  ngAfterViewInit() { markReady(); }
}
