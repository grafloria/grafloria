/**
 * `bindDashboardGrid` on a board whose member cards are PLAIN (SVG-painted)
 * nodes — the "bind an existing grid" path, no custom HTML host per card.
 * The edge test asked the card's HTML host for its rect, so a card without one
 * had no edges: a press on its border was a move and the card could never be
 * resized by hand (the API resized it fine). Driven with real mouse events
 * through the renderer.
 */
import { render } from '../grafloria';
import { bindDashboardGrid } from './grid-binder';

const W = 1000;
const H = 600;

function mount() {
  const host = document.createElement('div');
  host.getBoundingClientRect = () => ({ left: 0, top: 0, width: W, height: H, right: W, bottom: H, x: 0, y: 0 }) as DOMRect;
  document.body.appendChild(host);
  const instance = render(
    {
      nodes: [
        { id: 'orders', label: 'Orders', position: { x: 8, y: 8 }, size: { width: 268, height: 110 } },
        { id: 'revenue', label: 'Revenue', position: { x: 284, y: 8 }, size: { width: 268, height: 110 } },
      ],
      groups: [{ id: 'sales-grid', label: 'Sales', children: ['orders', 'revenue'], bounds: { x: 0, y: 0, width: 560, height: 240 } }],
    },
    host
  );
  const model = instance.getModel();
  const group = model.getGroup('sales-grid')!;
  group.setMetadata('frameChrome', 'none');
  group.position = { x: 0, y: 0 };
  group.size = { width: 560, height: 240, depth: 0 };
  for (const id of ['orders', 'revenue']) {
    const node = model.getNode(id)!;
    node.setMetadata('columnSpan', 3);
    node.setMetadata('rowSpan', 1);
    node.setBehavior({ connectable: false });
    for (const port of node.getPorts()) node.removePort(port.id);
  }
  const grid = bindDashboardGrid(instance as never, group, { columns: 6, gap: 8, padding: 8, sizing: 'grow', baseRowHeight: 110, designHeight: 240 });
  return {
    host,
    model,
    grid,
    dispose() {
      grid.dispose();
      instance.dispose();
      host.remove();
    },
  };
}

const flush = () => new Promise((r) => setTimeout(r, 20));
const mouse = (type: string, x: number, y: number, target: EventTarget) =>
  target.dispatchEvent(new MouseEvent(type, { bubbles: true, button: 0, clientX: x, clientY: y }));
async function drag(target: HTMLElement, x: number, y: number, dx: number, dy: number) {
  mouse('mousedown', x, y, target);
  for (let i = 1; i <= 5; i++) {
    mouse('mousemove', x + (dx * i) / 5, y + (dy * i) / 5, target);
    await flush();
  }
  mouse('mouseup', x + dx, y + dy, target);
  await flush();
}

describe('bindDashboardGrid — SVG-only member cards', () => {
  it('there is no HTML host to measure (the premise)', () => {
    const m = mount();
    expect(m.host.querySelector('[data-node-id="revenue"].grafloria-node-host')).toBeNull();
    m.dispose();
  });

  it('a drag from the bottom edge resizes the card by whole rows', async () => {
    const m = mount();
    const node = m.model.getNode('revenue')!;
    const { x, y } = node.position;
    const { width, height } = node.size;
    expect(height).toBeCloseTo(110, 0);
    await drag(m.host, x + width / 2, y + height - 2, 0, 140);
    expect(m.model.getNode('revenue')!.size.height).toBeGreaterThan(200);
    expect(m.model.getNode('revenue')!.position).toMatchObject({ x, y }); // a resize, not a move
    m.dispose();
  });

  it('a press just OUTSIDE the border (the hit test reads empty canvas there) still resizes', async () => {
    const m = mount();
    const node = m.model.getNode('revenue')!;
    const { x, y } = node.position;
    const { width, height } = node.size;
    await drag(m.host, x + width / 2, y + height + 1, 0, 140);
    expect(m.model.getNode('revenue')!.size.height).toBeGreaterThan(200);
    expect(m.model.getNode('revenue')!.position).toMatchObject({ x, y });
    m.dispose();
  });

  it('a drag from the right edge resizes the card by whole columns', async () => {
    const m = mount();
    const node = m.model.getNode('orders')!;
    const { x, y } = node.position;
    const { width, height } = node.size;
    await drag(m.host, x + width - 2, y + height / 2, -150, 0);
    expect(m.model.getNode('orders')!.size.width).toBeLessThan(width - 50);
    expect(m.model.getNode('orders')!.position).toMatchObject({ x, y });
    m.dispose();
  });

  it('the middle of the card still moves it', async () => {
    const m = mount();
    const node = m.model.getNode('orders')!;
    const { width, height } = node.size;
    await drag(m.host, node.position.x + width / 2, node.position.y + height / 2, 0, 130);
    expect(m.model.getNode('orders')!.size).toMatchObject({ width, height });
    m.dispose();
  });

  it('the border says so: the resize cursor shows over an edge of a card without a host', () => {
    const m = mount();
    const node = m.model.getNode('revenue')!;
    const ev = new MouseEvent('pointermove', { bubbles: true, clientX: node.position.x + node.size.width / 2, clientY: node.position.y + node.size.height - 2 });
    m.host.dispatchEvent(ev);
    expect(m.host.style.cursor).toBe('ns-resize');
    m.host.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: node.position.x + node.size.width / 2, clientY: node.position.y + node.size.height / 2 }));
    expect(m.host.style.cursor).toBe('');
    m.dispose();
  });
});
