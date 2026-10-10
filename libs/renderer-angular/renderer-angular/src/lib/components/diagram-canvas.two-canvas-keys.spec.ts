/**
 * Two `<grafloria-diagram-canvas>` on one page: keys act on the canvas last
 * pressed in or focused — the JS canvas's rule. Every canvas listens on `window`
 * (a canvas is rarely focused), so one Delete deleted, and one ⌘Z undid, in every
 * canvas on the page.
 */
import { CanvasHarness, settle } from '../../integration-tests/canvas-harness';

describe('DiagramCanvasComponent — keys act on the canvas last pressed or focused', () => {
  let a: CanvasHarness;
  let b: CanvasHarness;

  beforeEach(async () => {
    await CanvasHarness.configure();
    a = new CanvasHarness();
    b = new CanvasHarness();
    a.addNode({ id: 'n', position: { x: 100, y: 100 } });
    b.addNode({ id: 'n', position: { x: 100, y: 100 } });
    a.mount();
    b.mount();
  });
  afterEach(() => {
    a.destroy();
    b.destroy();
  });

  const key = (k: string, init: KeyboardEventInit = {}) =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init }));

  it('Delete after selecting in A deletes in A only', async () => {
    b.diagram.getNode('n')!.setSelected(true); // B has a selection too
    a.click(a.client(150, 140));
    expect(a.diagram.getNode('n')!.isSelected()).toBe(true);
    key('Delete');
    await settle();
    expect(a.diagram.getNode('n')).toBeUndefined();
    expect(b.diagram.getNode('n')).toBeDefined();
  });

  it('Ctrl+Z after working in B undoes in B only', async () => {
    // A drag in each canvas: two independent history entries.
    a.drag(a.client(150, 140), a.client(250, 140));
    b.drag(b.client(150, 140), b.client(250, 140));
    await settle();
    const ax = a.diagram.getNode('n')!.position.x;
    const bx = b.diagram.getNode('n')!.position.x;
    expect(ax).toBeGreaterThan(150);
    expect(bx).toBeGreaterThan(150);

    key('z', { ctrlKey: true });
    await settle();
    expect(b.diagram.getNode('n')!.position.x).toBe(100);
    expect(a.diagram.getNode('n')!.position.x).toBe(ax);
  });

  it('focus moving into a canvas makes it the one keys act on', async () => {
    a.click(a.client(150, 140));
    b.diagram.getNode('n')!.setSelected(true);
    b.canvas.containerRef.nativeElement.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    key('Delete');
    await settle();
    expect(b.diagram.getNode('n')).toBeUndefined();
    expect(a.diagram.getNode('n')).toBeDefined();
  });
});
