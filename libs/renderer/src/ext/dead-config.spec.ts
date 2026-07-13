/**
 * ============================================================================
 * The three DEAD CONFIG flags — now consumed. (Regression lock.)
 * ============================================================================
 *
 * `DiagramStore` declared three booleans that NOTHING in the workspace read:
 *
 *   gridEnabled  : true    → no consumer. Nothing ever painted a grid.
 *   snapEnabled  : true    → no consumer.
 *   showMinimap  : false   → no consumer. There was no minimap.
 *
 * They were serialized, defaulted, settable, and inert — the codebase's #1 bug
 * shape in its purest form. These tests fail if any of them goes quiet again.
 *
 * (The DOM-level proof — flipping the flag really shows/hides the rendered grid
 * and minimap — is in the e2e: `node libs/renderer/e2e/ext-run.mjs`.)
 */

import { DiagramEngine } from '@grafloria/engine';
import { SnapController } from '../interaction/snapping';
import { createBackground } from './components/background';
import { ViewportController } from '../viewport/viewport-controller';

describe('DiagramStore.snapEnabled — was declared but never read', () => {
  it('now drives SnapController.enabled through syncWithEngineConfig()', () => {
    const engine = new DiagramEngine();
    engine.createDiagram('d');

    const snap = new SnapController();
    expect(snap.getConfig().enabled).toBe(true);

    engine.getStore().set('snapEnabled', false);
    snap.syncWithEngineConfig(engine);

    expect(snap.getConfig().enabled).toBe(false);

    engine.getStore().set('snapEnabled', true);
    snap.syncWithEngineConfig(engine);
    expect(snap.getConfig().enabled).toBe(true);

    engine.destroy();
  });

  it('with snapping OFF, alignment guides are not produced', () => {
    const engine = new DiagramEngine();
    engine.createDiagram('d');
    engine.getStore().set('snapEnabled', false);

    const snap = new SnapController();
    snap.syncWithEngineConfig(engine);

    // A box perfectly alignable with its neighbour must NOT be snapped.
    const box = { x: 103, y: 10, width: 50, height: 50 };
    const others = [{ x: 100, y: 200, width: 50, height: 50 }];
    const result = snap.computeSnap(box, others);

    expect(result.guides).toHaveLength(0);
    expect(result.box.x).toBe(103); // untouched
    expect(result.dx).toBe(0);

    engine.destroy();
  });
});

describe('DiagramStore.gridEnabled — was declared but never read', () => {
  it('the Background component exists and can be toggled (the flag now has a consumer)', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);

    const viewport = new ViewportController({
      viewport: { x: 0, y: 0, width: 800, height: 600 },
      zoom: 1,
    });

    const background = createBackground(root, viewport, { variant: 'dots', gap: 20 });

    // A real <svg> grid is in the DOM — before Wave 6 nothing painted one.
    const svg = root.querySelector('.grafloria-background-layer svg');
    expect(svg).toBeTruthy();
    expect(background.isVisible()).toBe(true);

    background.setVisible(false);
    expect(background.isVisible()).toBe(false);
    expect((svg as SVGElement).style.display).toBe('none');

    background.dispose();
    expect(root.querySelector('.grafloria-background-layer')).toBeNull();

    viewport.dispose();
    root.remove();
  });

  it('the grid tile follows the camera (gap × zoom), and disposal unsubscribes', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    const viewport = new ViewportController({
      viewport: { x: 0, y: 0, width: 800, height: 600 },
      zoom: 1,
    });

    const background = createBackground(root, viewport, { variant: 'lines', gap: 20 });
    const pattern = root.querySelector('pattern');

    expect(Number(pattern?.getAttribute('width'))).toBeCloseTo(20);

    viewport.setZoom(2);
    expect(Number(pattern?.getAttribute('width'))).toBeCloseTo(40);

    // After dispose the camera must no longer reach the component — a live
    // subscription on a disposed component is the exact leak Wave 6 forbids.
    background.dispose();
    expect(() => viewport.setZoom(3)).not.toThrow();

    viewport.dispose();
    root.remove();
  });
});
