import { InjectionToken, makeEnvironmentProviders, type EnvironmentProviders } from '@angular/core';
import type { Theme } from '@grafloria/renderer';

/**
 * Application-wide Grafloria defaults, set once at bootstrap. Explicit inputs
 * on a specific `<grafloria-diagram-canvas>` always win over these.
 */
export interface GrafloriaConfig {
  /** Default theme for every canvas that does not bind `[theme]` itself. */
  theme?: Theme;
}

export const GRAFLORIA_CONFIG = new InjectionToken<GrafloriaConfig>('GRAFLORIA_CONFIG');

/**
 * The modern Angular configuration idiom:
 *
 * ```ts
 * bootstrapApplication(AppComponent, {
 *   providers: [provideGrafloria({ theme: DARK_THEME })],
 * });
 * ```
 */
export function provideGrafloria(config: GrafloriaConfig): EnvironmentProviders {
  return makeEnvironmentProviders([{ provide: GRAFLORIA_CONFIG, useValue: config }]);
}
