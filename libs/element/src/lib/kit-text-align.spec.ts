/**
 * A kit card lays out its own text; it must not inherit the HOST's `text-align`.
 * React's Vite template sets `#root { text-align: center }`, and every ER/UML card and
 * dashboard widget under it came out centred. Each kit card ROOT declares `text-align:
 * start`, so a host's alignment stops at the card's edge.
 */
import { ensureDiagramKitStyles, DIAGRAM_KIT_STYLE_ID } from './diagram-kit/styles';
import { ensureDashboardKitStyles, DASHBOARD_KIT_STYLE_ID } from './dashboard-kit/styles';

/**
 * The `text-align` values the sheet's top-level rules for exactly `selector` declare. Read
 * from the CSS TEXT: jsdom's CSS parser gives up on the dashboard sheet, so its CSSOM is empty.
 */
function declared(styleId: string, selector: string): string[] {
  const css = document.getElementById(styleId)!.textContent ?? '';
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const blocks = css.matchAll(new RegExp(`(?:^|\\n)${escaped} \\{([^}]*)\\}`, 'g'));
  return [...blocks].flatMap((m) => [...m[1].matchAll(/text-align:\s*([a-z-]+)/g)].map((t) => t[1]));
}

describe('kit cards do not inherit the host text-align', () => {
  beforeAll(() => {
    ensureDiagramKitStyles(document);
    ensureDashboardKitStyles(document);
  });

  it.each([
    [DIAGRAM_KIT_STYLE_ID, '.axk-entity'],
    [DIAGRAM_KIT_STYLE_ID, '.axk-uml'],
    [DASHBOARD_KIT_STYLE_ID, '.axdb-widget'],
    [DASHBOARD_KIT_STYLE_ID, '.axdb-slab, .axdb-tabs'],
  ])('%s %s sets text-align: start', (id, selector) => {
    expect(declared(id, selector)).toContain('start');
  });
});
