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
