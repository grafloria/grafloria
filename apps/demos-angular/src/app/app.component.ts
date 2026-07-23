import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

/** Bare host: each route IS a demo, full-bleed. The gallery shell provides all
 *  chrome (menu, header, code drawer) — this app renders only the diagrams. */
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  template: '<router-outlet />',
  styles: [':host { display: block; height: 100%; }'],
})
export class AppComponent {}
