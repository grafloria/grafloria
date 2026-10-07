/**
 * An ER or UML card fills its node: the html wrapper around the card has no
 * padding, so the card's border is the node's bounds. Ports, the edge markers
 * that touch the node edge (the crow's foot) and the selection all sit on the
 * border the reader sees, not 4 px outside it.
 *
 * Every path that writes a card is covered: the builders, an edit (which
 * regenerates the card) and a card dropped from the stencil palette.
 */
import { createDiagram, type DiagramInstance } from '@grafloria/renderer';
import { render } from '../grafloria';
import { erDiagram, umlDiagram, erTable, umlClass } from './index';
import { getStencilBuilder } from '../stencil-kit';
import { entityAutoHeight, classAutoHeight, ER_HEAD_H, ER_ROW_H } from './card';

function sizedHost(): HTMLElement {
  const el = document.createElement('div');
  Object.defineProperty(el, 'clientWidth', { value: 1200 });
  Object.defineProperty(el, 'clientHeight', { value: 800 });
  el.getBoundingClientRect = () =>
    ({ x: 0, y: 0, top: 0, left: 0, right: 1200, bottom: 800, width: 1200, height: 800 }) as DOMRect;
  document.body.appendChild(el);
  return el;
}

/** The wrapper div the renderer puts inside a node's foreignObject. */
function wrapper(host: HTMLElement, id: string): HTMLElement {
  const fo = host.querySelector(`[data-node-id="${id}"] foreignObject`);
  expect(fo).not.toBeNull();
  return fo!.firstElementChild as HTMLElement;
}

const htmlPadding = (api: DiagramInstance, id: string) =>
  (api.getModel().getNode(id)!.getMetadata('html') as { padding?: number }).padding;

const ER = () =>
  erDiagram({
    entities: [
      { id: 'CUSTOMERS', name: 'Customers', position: { x: 80, y: 80 }, columns: [{ name: 'id', type: 'int', pk: true }] },
      {
        id: 'ORDERS',
        name: 'Orders',
        position: { x: 480, y: 80 },
        columns: [
          { name: 'id', type: 'int', pk: true },
          { name: 'customer_id', type: 'int', fk: true },
        ],
      },
    ],
    relationships: [{ from: 'ORDERS.customer_id', to: 'CUSTOMERS.id', cardinality: 'one-to-many' }],
  });

const UML = () =>
  umlDiagram({
    classes: [
      { id: 'Shape', abstract: true, position: { x: 60, y: 40 }, attributes: ['# x: float'], methods: ['+ area(): float'] },
      { id: 'Circle', position: { x: 60, y: 300 }, attributes: ['- r: float'] },
    ],
    relationships: [{ from: 'Circle', to: 'Shape', kind: 'inheritance' }],
  });

describe('an ER/UML card fills its node', () => {
  it('ER cards are drawn with no wrapper padding', () => {
    const host = sizedHost();
    const api = render(ER(), host);
    api.renderNow();
    for (const id of ['CUSTOMERS', 'ORDERS']) {
      expect(htmlPadding(api, id)).toBe(0);
      expect(wrapper(host, id).style.padding).toBe('0px');
    }
    api.dispose();
  });

  it('UML cards are drawn with no wrapper padding', () => {
    const host = sizedHost();
    const api = render(UML(), host);
    api.renderNow();
    for (const id of ['Shape', 'Circle']) {
      expect(htmlPadding(api, id)).toBe(0);
      expect(wrapper(host, id).style.padding).toBe('0px');
    }
    api.dispose();
  });

  it('an edited card keeps no wrapper padding', async () => {
    const host = sizedHost();
    const api = render(ER(), host);
    await erTable(api, 'ORDERS')!.rename('Sales Orders');
    api.renderNow();
    expect(htmlPadding(api, 'ORDERS')).toBe(0);
    expect(wrapper(host, 'ORDERS').style.padding).toBe('0px');

    const uml = render(UML(), sizedHost());
    await umlClass(uml, 'Circle')!.rename('Ring');
    expect(htmlPadding(uml, 'Circle')).toBe(0);
    api.dispose();
    uml.dispose();
  });

  it('a card dropped from the palette has no wrapper padding', () => {
    const host = sizedHost();
    const api = createDiagram(host, {});
    for (const master of ['erd-entity', 'uml-class']) {
      const build = getStencilBuilder(master)!;
      const node = build({ api, master: { id: master, meta: { name: 'Card' } }, at: { x: 100, y: 100 } } as never) as { id: string };
      expect(htmlPadding(api, node.id)).toBe(0);
    }
    api.dispose();
  });

  it('the auto height no longer reserves room for a wrapper padding', () => {
    // The card's rows, plus its 1 px borders (the head draws 1 px under ER_HEAD_H).
    expect(entityAutoHeight({ id: 'T', columns: [{ name: 'a' }, { name: 'b' }] } as never)).toBe(ER_HEAD_H + 2 * ER_ROW_H + 1);
    // UML: the same 8 px less than before the wrapper padding was removed.
    expect(classAutoHeight({ id: 'C', attributes: ['a'], methods: [] } as never)).toBe(30 + 19 + 8 * 2 + 4);
  });
});
