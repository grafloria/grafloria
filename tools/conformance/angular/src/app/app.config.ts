import { ApplicationConfig, provideExperimentalZonelessChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideGrafloria } from '@grafloria/angular';
import { DARK_THEME } from '@grafloria/renderer';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    // Conformance: the canvas must work with ZONELESS change detection.
    provideExperimentalZonelessChangeDetection(),
    provideRouter(routes),
    // App-wide Grafloria defaults — no [theme] binding anywhere in the app.
    provideGrafloria({ theme: DARK_THEME }),
  ],
};
