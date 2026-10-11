// `engine.setInteractionConfig(...)` after the canvas has settled is painted on the
// frames the library schedules — no renderNow(), no pointer move. The renderer
// already dropped its cache and invalidated the frame on `config:interaction-changed`,
// but nothing scheduled a frame, so a port-visibility change (the instance-events
// docs sample sets `portVisibility: ALWAYS` from its init callback) showed nothing
// until an unrelated repaint. Angular's canvas always scheduled one.
import { PortVisibilityStrategy } from '@grafloria/engine';
import { createDiagram } from './create-diagram';
import type { DiagramInstance } from './create-diagram';

function makeContainer(): HTMLElement {
  const el = document.createElement('div');
  el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 400, right: 800, bottom: 400 }) as DOMRect;
  document.body.appendChild(el);
  return el;
}
const frames = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

describe('an interaction-config change is painted on the next scheduled frame', () => {
  let container: HTMLElement;
  let d: DiagramInstance | undefined;
  beforeEach(() => (container = makeContainer()));
  afterEach(() => {
    d?.dispose();
    d = undefined;
    container.remove();
  });

  it('portVisibility: always shows the port dots without renderNow()', async () => {
    d = createDiagram(container, {
      nodes: [
        { id: 'src', position: { x: 100, y: 120 }, size: { width: 120, height: 60 }, ports: [{ id: 'src.out', side: 'right', type: 'output' }] },
        { id: 'dst', position: { x: 400, y: 120 }, size: { width: 120, height: 60 }, ports: [{ id: 'dst.in', side: 'left', type: 'input' }] },
      ],
      edges: [],
    });
    await frames();
    await frames();
    const dots = () => container.querySelectorAll('[data-port-id="src.out"], [data-port-id="dst.in"]').length;
    expect(dots()).toBe(0); // hover-only by default

    d.getEngine().setInteractionConfig({ portVisibility: PortVisibilityStrategy.ALWAYS });
    await frames();
    await frames();
    expect(dots()).toBe(2);
  });
});
