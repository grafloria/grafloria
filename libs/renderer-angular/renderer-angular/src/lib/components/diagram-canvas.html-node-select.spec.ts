/**
 * A node on the HTML layer (a registered component, a template card, `custom: true`)
 * drags and selects like any other — and its host says so: `data-selected`, the
 * attribute an SVG node group carries. The docs review read the host's
 * `data-selected` (null) and concluded the node could not be selected.
 */
import { CanvasHarness, settle } from '../../integration-tests/canvas-harness';

describe('DiagramCanvasComponent — HTML-layer node selection and drag', () => {
  let h: CanvasHarness;
  beforeEach(async () => {
    await CanvasHarness.configure();
    h = new CanvasHarness();
    h.addNode({ id: 'job', custom: true, position: { x: 60, y: 60 }, size: { width: 200, height: 120 } } as never);
    h.mount();
    h.fixture.detectChanges();
  });
  afterEach(() => h.destroy());

  const wrapper = () =>
    (h.fixture.nativeElement as HTMLElement).querySelector('.html-node-wrapper[data-node-id="job"]') as HTMLElement;

  it('a click selects it, and the host carries data-selected', () => {
    expect(wrapper().getAttribute('data-selected')).toBe('false');
    h.click(h.client(160, 160));
    h.fixture.detectChanges();
    expect(h.diagram.getNode('job')!.isSelected()).toBe(true);
    expect(wrapper().getAttribute('data-selected')).toBe('true');
  });

  it('a hand-speed body drag moves it, and the host follows', async () => {
    h.drag(h.client(160, 160), h.client(260, 220));
    await settle();
    h.fixture.detectChanges();
    expect(h.diagram.getNode('job')!.position).toEqual({ x: 160, y: 120 });
    expect(wrapper().style.left).toBe('160px');
  });
});
