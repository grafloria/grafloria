/** <GrafloriaDiagram> — the generic kit host, proven with ER + UML kits. */
import { render, waitFor } from '@testing-library/react';
import { GrafloriaDiagram } from './grafloria-diagram';
import { erDiagram, umlDiagram } from '@grafloria/element';

/**
 * jsdom lays nothing out — give every element a real box so the camera is not 0x0.
 */
beforeAll(() => {
  Element.prototype.getBoundingClientRect = function () {
    return { left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
  };
});

describe('<GrafloriaDiagram>', () => {
  it('renders an ER diagram from pure data', async () => {
    let instance: any = null;
    const { container } = render(
      <GrafloriaDiagram onReady={(i) => (instance = i)} spec={erDiagram({
        entities: [
          { id: 'PRODUCTS', name: 'Products', position: { x: 40, y: 40 }, columns: [
            { name: 'id', type: 'int', pk: true }, { name: 'sku', type: 'varchar' }] },
        ],
        relationships: [],
      })} />
    );
    await waitFor(() => expect(instance).toBeTruthy());
    instance.renderNow(); // paint is rAF-scheduled — flush deterministically
    expect(container.textContent).toContain('Products');
    expect(container.textContent).toContain('sku');
  });

  const table = (name: string) => erDiagram({
    entities: [{ id: 'T', name, position: { x: 40, y: 40 }, columns: [{ name: 'id', type: 'int', pk: true }] }],
    relationships: [],
  });

  it('follows a CHANGED spec: the new diagram replaces the old one', async () => {
    const ready = jest.fn();
    const { container, rerender } = render(<GrafloriaDiagram onReady={ready} spec={table('Products')} />);
    await waitFor(() => expect(ready).toHaveBeenCalledTimes(1));
    rerender(<GrafloriaDiagram onReady={ready} spec={table('Orders')} />);
    await waitFor(() => expect(ready).toHaveBeenCalledTimes(2));
    ready.mock.calls[1][0].renderNow();
    expect(container.textContent).toContain('Orders');
    expect(container.textContent).not.toContain('Products');
  });

  it('an equal spec built again on a re-render does NOT remount (inline specs are fine)', async () => {
    const ready = jest.fn();
    const { rerender } = render(<GrafloriaDiagram onReady={ready} spec={table('Products')} />);
    await waitFor(() => expect(ready).toHaveBeenCalledTimes(1));
    rerender(<GrafloriaDiagram onReady={ready} spec={table('Products')} />);
    rerender(<GrafloriaDiagram onReady={ready} spec={table('Products')} />);
    await new Promise((r) => setTimeout(r, 30));
    expect(ready).toHaveBeenCalledTimes(1);
  });

  it('follows changed options too', async () => {
    const ready = jest.fn();
    const { rerender } = render(<GrafloriaDiagram onReady={ready} spec={table('Products')} options={{}} />);
    await waitFor(() => expect(ready).toHaveBeenCalledTimes(1));
    rerender(<GrafloriaDiagram onReady={ready} spec={table('Products')} options={{ highlightConnected: true }} />);
    await waitFor(() => expect(ready).toHaveBeenCalledTimes(2));
    expect(ready.mock.calls[1][0].getHighlightConnected()).toBeTruthy();
  });

  it('colorMode: applies at mount and follows the prop live, without remounting', async () => {
    const ready = jest.fn();
    const { rerender } = render(<GrafloriaDiagram onReady={ready} spec={table('Products')} colorMode="dark" />);
    await waitFor(() => expect(ready).toHaveBeenCalledTimes(1));
    const instance = ready.mock.calls[0][0];
    expect(instance.getColorMode()).toBe('dark');
    rerender(<GrafloriaDiagram onReady={ready} spec={table('Products')} colorMode="light" />);
    await waitFor(() => expect(instance.getColorMode()).toBe('light'));
    expect(ready).toHaveBeenCalledTimes(1);
  });

  it('renders a UML class diagram from pure data', async () => {
    let instance: any = null;
    const { container } = render(
      <GrafloriaDiagram onReady={(i) => (instance = i)} spec={umlDiagram({
        classes: [{ id: 'Animal', position: { x: 100, y: 40 }, attributes: ['# name: String'], methods: ['+ speak(): void'] }],
        relationships: [],
      })} />
    );
    await waitFor(() => expect(instance).toBeTruthy());
    instance.renderNow();
    expect(container.textContent).toContain('Animal');
    expect(container.textContent).toContain('+ speak(): void');
  });
});
