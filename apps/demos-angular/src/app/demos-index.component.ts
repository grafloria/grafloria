import { Component } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

/** The app's front door (/demos-angular/ with no route): every demo, by
 *  category. It used to be a blank page — where the Angular page's "Open the
 *  demos" led. */
@Component({
  standalone: true,
  imports: [RouterLink],
  template: `
    <main style="padding:28px 32px; max-width:1040px">
      <h1 style="font:700 22px/1.3 system-ui,sans-serif; margin:0 0 6px">Grafloria — Angular demos</h1>
      <p style="margin:0 0 18px; color:#5A6478">
        Every gallery demo as a real Angular component. Pick one here, or open the
        <a href="../demos/">gallery</a> and press Angular on any page.
      </p>
      @for (group of groups; track group.cat) {
        <section style="margin-bottom:18px">
          <h2 style="font:600 13px/1.4 system-ui,sans-serif; text-transform:uppercase; letter-spacing:.06em; color:#5A6478; margin:0 0 6px">{{ group.cat }}</h2>
          <ul style="margin:0; padding:0; list-style:none; display:flex; flex-wrap:wrap; gap:6px 18px">
            @for (route of group.routes; track route) {
              <li><a [routerLink]="'/' + route">{{ title(route) }}</a></li>
            }
          </ul>
        </section>
      }
    </main>
  `,
})
export class DemosIndexComponent {
  readonly groups: Array<{ cat: string; routes: string[] }>;
  constructor(router: Router) {
    const map = new Map<string, string[]>();
    for (const r of router.config) {
      if (!r.path || !r.path.includes('/')) continue;
      const cat = r.path.split('/')[0]!;
      map.set(cat, [...(map.get(cat) ?? []), r.path]);
    }
    this.groups = [...map].map(([cat, routes]) => ({ cat, routes }));
  }
  title(route: string): string {
    const name = route.split('/')[1] ?? route;
    return name.charAt(0).toUpperCase() + name.slice(1).replace(/-/g, ' ');
  }
}
