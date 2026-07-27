/**
 * Join guidance — the pure scoring (ported from the production Query Studio)
 * and the DOM binding that paints tier classes onto kit rows during a
 * connection drag.
 */
import {
  singularize,
  scoreMatch,
  matchTier,
  assignTiers,
  bindJoinGuidance,
  ensureJoinGuidanceStyles,
  JOIN_GUIDANCE_STYLE_ID,
  type JoinEnd,
} from './join-guidance';

const end = (table: string, name: string, flags: { pk?: boolean; fk?: boolean } = {}): JoinEnd => ({
  table,
  column: { name, ...flags },
});

afterEach(() => {
  document.getElementById(JOIN_GUIDANCE_STYLE_ID)?.remove();
  document.getElementById('grafloria-join-guidance-ports')?.remove();
  document.body.innerHTML = '';
});

describe('singularize', () => {
  it('handles the schema-name shapes', () => {
    expect(singularize('orders')).toBe('order');
    expect(singularize('customers')).toBe('customer');
    expect(singularize('order_items')).toBe('order_item');
    expect(singularize('categories')).toBe('category');
    expect(singularize('statuses')).toBe('status');
    expect(singularize('address')).toBe('address'); // -ss is not a plural
  });
});

describe('scoreMatch', () => {
  it('scores 3 for the PK↔FK naming convention, in both directions', () => {
    expect(scoreMatch(end('orders', 'customer_id', { fk: true }), end('customers', 'id', { pk: true }))).toBe(3);
    expect(scoreMatch(end('customers', 'id', { pk: true }), end('orders', 'customer_id', { fk: true }))).toBe(3);
    // the convention is NAME-driven — it holds even without the flags
    expect(scoreMatch(end('orders', 'customer_id'), end('customers', 'id'))).toBe(3);
  });

  it('scores 3 for exact FK name equality across tables', () => {
    expect(
      scoreMatch(end('orders', 'customer_id', { fk: true }), end('addresses', 'customer_id', { fk: true }))
    ).toBe(3);
  });

  it('scores 2 for a PK flag on one end and an FK flag on the other', () => {
    expect(scoreMatch(end('orders', 'id', { pk: true }), end('order_items', 'product_id', { fk: true }))).toBe(2);
    expect(scoreMatch(end('order_items', 'order_id', { fk: true }), end('orders', 'id', { pk: true }))).toBe(3); // convention outranks
    expect(scoreMatch(end('order_items', 'product_id', { fk: true }), end('customers', 'id', { pk: true }))).toBe(2);
  });

  it('scores 1 for a same-name or both-end-in-id pair', () => {
    expect(scoreMatch(end('customers', 'name'), end('products', 'name'))).toBe(1);
    expect(scoreMatch(end('orders', 'customer_id'), end('order_items', 'product_id'))).toBe(1);
  });

  it('scores 0 for the same table and for unrelated columns', () => {
    expect(scoreMatch(end('orders', 'id', { pk: true }), end('orders', 'customer_id', { fk: true }))).toBe(0);
    expect(scoreMatch(end('orders', 'customer_id'), end('products', 'sku'))).toBe(0);
  });
});

describe('matchTier / assignTiers', () => {
  it('maps scores to tiers', () => {
    expect(matchTier(3)).toBe('good');
    expect(matchTier(2)).toBe('good');
    expect(matchTier(1)).toBe('ok');
    expect(matchTier(0)).toBe('none');
  });

  it('promotes exactly ONE best candidate (score >= 2) to top', () => {
    expect(assignTiers([3, 2, 1, 0])).toEqual(['top', 'good', 'ok', 'none']);
    expect(assignTiers([2, 2])).toEqual(['top', 'good']); // first max wins
    expect(assignTiers([1, 1, 0])).toEqual(['ok', 'ok', 'none']); // no top below 2
    expect(assignTiers([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// bindJoinGuidance — DOM + event lifecycle against a stub instance
// ---------------------------------------------------------------------------

type Handler = (data: unknown) => void;

function stubApi() {
  const container = document.createElement('div');
  document.body.appendChild(container);

  const mkCard = (nodeId: string, columns: Array<{ name: string; pk?: boolean; fk?: boolean }>) => {
    const group = document.createElement('div');
    group.setAttribute('data-node-id', nodeId);
    for (const c of columns) {
      const row = document.createElement('div');
      row.className = 'axk-row';
      const col = document.createElement('span');
      col.className = 'axk-col';
      col.textContent = c.name;
      row.appendChild(col);
      group.appendChild(row);
    }
    container.appendChild(group);
    return {
      id: nodeId,
      getMetadata: (key: string) => (key === 'kitEntity' ? { id: nodeId, columns } : undefined),
      getPorts: () => columns.flatMap((c) => [{ id: `${nodeId}.${c.name}-in` }, { id: `${nodeId}.${c.name}-out` }]),
      getPort: (id: string) =>
        columns.some((c) => id === `${nodeId}.${c.name}-in` || id === `${nodeId}.${c.name}-out`)
          ? { id }
          : undefined,
    };
  };

  const customers = mkCard('customers', [
    { name: 'id', pk: true },
    { name: 'name' },
    { name: 'email' },
  ]);
  const orders = mkCard('orders', [
    { name: 'id', pk: true },
    { name: 'customer_id', fk: true },
    { name: 'total' },
  ]);

  const handlers = new Map<string, Handler[]>();
  const bus = {
    on: (event: string, handler: Handler) => {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
      return () => handlers.set(event, (handlers.get(event) ?? []).filter((h) => h !== handler));
    },
    emit: (event: string, data?: unknown) => {
      for (const h of handlers.get(event) ?? []) h(data);
    },
  };

  const nodes = [customers, orders];
  const api = {
    container,
    getModel: () => ({
      getNode: (id: string) => nodes.find((n) => n.id === id),
      getNodes: () => nodes,
    }),
    getEngine: () => ({ eventBus: bus }),
  };
  return { api, bus, container };
}

describe('bindJoinGuidance', () => {
  it('injects the tint stylesheet once', () => {
    ensureJoinGuidanceStyles();
    ensureJoinGuidanceStyles();
    expect(document.querySelectorAll(`#${JOIN_GUIDANCE_STYLE_ID}`)).toHaveLength(1);
  });

  it('tints the other tables by tier on connection:start — and never the source', () => {
    const { api, bus, container } = stubApi();
    const handle = bindJoinGuidance(api);

    bus.emit('connection:start', { sourcePort: { id: 'orders.customer_id-out', nodeId: 'orders' } });

    const customerRows = Array.from(
      container.querySelectorAll('[data-node-id="customers"] .axk-row')
    ) as HTMLElement[];
    expect(customerRows[0]!.classList.contains('axk-match-top')).toBe(true); // customers.id — convention
    expect(customerRows[0]!.querySelector('.axk-match-chip')?.textContent).toBe('★ BEST');
    expect(customerRows[1]!.classList.contains('axk-match-none')).toBe(true); // name
    expect(customerRows[2]!.classList.contains('axk-match-none')).toBe(true); // email

    // the source table's own rows carry NO tint at all
    const orderRows = Array.from(container.querySelectorAll('[data-node-id="orders"] .axk-row'));
    for (const row of orderRows) {
      expect(row.className).toBe('axk-row');
    }

    // port glow stylesheet targets the top column's ports
    const portStyle = document.getElementById('grafloria-join-guidance-ports');
    expect(portStyle?.textContent).toContain('customers.id-in');
    expect(portStyle?.textContent).toContain('#f59e0b');

    expect(handle.activeTiers().get('customers')?.get(0)).toBe('top');
    handle.dispose();
  });

  it('clears every tint when the drag ends — complete or cancel', () => {
    const { api, bus, container } = stubApi();
    const handle = bindJoinGuidance(api);

    for (const endEvent of ['connection:complete', 'connection:cancel']) {
      bus.emit('connection:start', { sourcePort: { id: 'orders.customer_id-out', nodeId: 'orders' } });
      expect(container.querySelectorAll('[class*="axk-match-"]').length).toBeGreaterThan(0);
      bus.emit(endEvent);
      expect(container.querySelectorAll('[class*="axk-match-"]')).toHaveLength(0);
      expect(container.querySelectorAll('.axk-match-chip')).toHaveLength(0);
      expect(document.getElementById('grafloria-join-guidance-ports')).toBeNull();
      expect(handle.activeTiers().size).toBe(0);
    }
    handle.dispose();
  });

  it('dispose unsubscribes and clears', () => {
    const { api, bus, container } = stubApi();
    const handle = bindJoinGuidance(api);
    bus.emit('connection:start', { sourcePort: { id: 'orders.customer_id-out', nodeId: 'orders' } });
    handle.dispose();
    expect(container.querySelectorAll('[class*="axk-match-"]')).toHaveLength(0);
    bus.emit('connection:start', { sourcePort: { id: 'orders.customer_id-out', nodeId: 'orders' } });
    expect(container.querySelectorAll('[class*="axk-match-"]')).toHaveLength(0); // unbound
  });
});
