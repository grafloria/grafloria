import { Component } from '@angular/core';
import { RouterModule, Router } from '@angular/router';
import { CommonModule } from '@angular/common';

@Component({
    imports: [CommonModule, RouterModule],
    selector: 'app-root',
    templateUrl: './app.component.html',
    styleUrl: './app.component.css'
})
export class AppComponent {
  title = 'Grafloria Renderer Examples';

  constructor(public router: Router) {}

  get isHomePage(): boolean {
    return this.router.url === '/' || this.router.url === '';
  }
}
