import { AfterViewInit, Component } from '@angular/core';
import { DiagramCanvasComponent } from '@grafloria/angular';
import { LIGHT_THEME, DARK_THEME, type Theme } from '@grafloria/renderer';
import { markReady } from '../demo-ready';

/** Theme is an input: swap [theme] between the built-in token sets at runtime
 *  and every painted element re-skins — no CSS surgery. */
@Component({
  standalone: true,
  imports: [DiagramCanvasComponent],
  templateUrl: './dark-mode.component.html',
})
export class DarkModeComponent implements AfterViewInit {
  dark = true;
  light: Theme = LIGHT_THEME;
  darkTheme: Theme = DARK_THEME;
  nodes = [
    { id: 'a', position: { x: 120, y: 140 }, size: { width: 160, height: 70 }, label: 'Tokens' },
    { id: 'b', position: { x: 480, y: 140 }, size: { width: 160, height: 70 }, label: 'not CSS hacks' },
  ];
  edges = [{ id: 'e1', source: 'a', target: 'b', label: 'theme-bound' }];
  ngAfterViewInit() { markReady(); }
}
