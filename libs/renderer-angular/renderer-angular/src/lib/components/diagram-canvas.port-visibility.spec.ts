/**
 * The interaction config's port visibility reaches the HTML-layer port handles
 * (custom nodes), and a config change repaints on its own — no host
 * `scheduleRender()`. The docs review: "Hidden" had no visible effect.
 */
import { CanvasHarness } from '../../integration-tests/canvas-harness';

const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));

describe('DiagramCanvasComponent — port visibility from the interaction config', () => {
  let h: CanvasHarness;
  beforeEach(async () => {
    await CanvasHarness.configure();
    h = new CanvasHarness();
    h.addNode({ id: 'card', custom: true, position: { x: 60, y: 60 } } as never);
    h.mount();
    h.fixture.detectChanges();
  });
  afterEach(() => h.destroy());

  const handles = () => (h.fixture.nativeElement as HTMLElement).querySelectorAll('.html-port-handle').length;

  it('Hidden hides the custom node port handles, Always brings them back — each on the next frame', async () => {
    const shown = handles();
    expect(shown).toBeGreaterThan(0);

    h.engine.setInteractionConfig({ portVisibility: 'hidden' } as never);
    await frame();
    expect(handles()).toBe(0);

    h.engine.setInteractionConfig({ portVisibility: 'always' } as never);
    await frame();
    expect(handles()).toBe(shown);
  });

  it('a port that asks to be visible itself still wins over a hidden global default', async () => {
    const port = h.diagram.getNode('card')!.getPorts()[0]!;
    port.setMetadata('visibility', 'always');
    h.engine.setInteractionConfig({ portVisibility: 'hidden' } as never);
    await frame();
    expect(handles()).toBe(1);
  });
});
