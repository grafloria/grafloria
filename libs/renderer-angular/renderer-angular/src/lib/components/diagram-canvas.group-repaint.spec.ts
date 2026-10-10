/**
 * Group-only changes repaint on their own. The canvas subscribed to node:* and
 * link:* only, so `addGroup` and a membership change stayed invisible until
 * something else painted — the docs had to tell readers to call scheduleRender().
 */
import { GroupModel } from '@grafloria/engine';
import { CanvasHarness } from '../../integration-tests/canvas-harness';

const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));

describe('DiagramCanvasComponent — group events schedule a frame', () => {
  let h: CanvasHarness;
  beforeEach(async () => {
    await CanvasHarness.configure();
    h = new CanvasHarness();
    h.addNode({ id: 'a', position: { x: 100, y: 100 } });
    h.addNode({ id: 'b', position: { x: 400, y: 100 } });
    h.mount();
  });
  afterEach(() => h.destroy());

  const frameRect = (id: string) =>
    (h.fixture.nativeElement as HTMLElement).querySelector(`svg.grafloria-diagram [data-group-id="${id}"]`);
  const frameWidth = (id: string) => {
    const el = frameRect(id);
    const rect = el?.tagName === 'rect' ? el : el?.querySelector('rect');
    return Number(rect?.getAttribute('width') ?? NaN);
  };

  it('addGroup paints the frame on the next frame, with no host repaint', async () => {
    const group = new GroupModel({ id: 'g', name: 'Group' });
    group.addMember('a', h.diagram);
    h.diagram.addGroup(group);
    group.fitToContents(h.diagram);
    await frame();
    expect(frameRect('g')).not.toBeNull();
  });

  it('a membership change (the frame refits) repaints too', async () => {
    const group = new GroupModel({ id: 'g', name: 'Group' });
    group.addMember('a', h.diagram);
    h.diagram.addGroup(group);
    group.fitToContents(h.diagram);
    h.paint();
    const before = frameWidth('g');

    group.addMember('b', h.diagram);
    group.fitToContents(h.diagram);
    await frame();
    expect(frameWidth('g')).toBeGreaterThan(before + 200);
  });

  it('removeGroup clears the frame', async () => {
    const group = new GroupModel({ id: 'g', name: 'Group' });
    group.addMember('a', h.diagram);
    h.diagram.addGroup(group);
    group.fitToContents(h.diagram);
    h.paint();
    expect(frameRect('g')).not.toBeNull();
    h.diagram.removeGroup('g');
    await frame();
    expect(frameRect('g')).toBeNull();
  });
});
