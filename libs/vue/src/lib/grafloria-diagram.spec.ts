/** <GrafloriaDiagram> (Vue) — the generic kit host, proven with ER + UML kits. */
import { createApp, defineComponent, h } from 'vue';
import { GrafloriaDiagram } from './grafloria-diagram';
import { erDiagram, umlDiagram } from '@grafloria/element';

const flush = () => new Promise((r) => setTimeout(r, 50));

/**
 * jsdom lays nothing out — give every element a real box so the camera is not 0x0.
 */
beforeAll(() => {
  Element.prototype.getBoundingClientRect = function () {
    return { left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
  };
});

describe('<GrafloriaDiagram> (Vue)', () => {
  it('renders ER and UML kits from pure data', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const instances: any[] = [];
    const app = createApp(
      defineComponent({
        setup() {
          return () =>
            h('div', [
              h(GrafloriaDiagram, { onReady: (i: any) => instances.push(i), spec: erDiagram({
                entities: [{ id: 'PRODUCTS', name: 'Products', position: { x: 40, y: 40 }, columns: [
                  { name: 'id', type: 'int', pk: true }] }],
                relationships: [],
              }) }),
              h(GrafloriaDiagram, { onReady: (i: any) => instances.push(i), spec: umlDiagram({
                classes: [{ id: 'Animal', position: { x: 100, y: 40 }, attributes: ['# name: String'], methods: ['+ speak(): void'] }],
                relationships: [],
              }) }),
            ]);
        },
      })
    );
    app.mount(host);
    await flush();
    for (const i of instances) i.renderNow(); // paint is rAF-scheduled
    expect(host.textContent).toContain('Products');
    expect(host.textContent).toContain('Animal');
    expect(host.textContent).toContain('+ speak(): void');
    app.unmount();
    host.remove();
  });
});
