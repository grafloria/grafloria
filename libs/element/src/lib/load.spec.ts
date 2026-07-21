/**
 * `fromDocument()` — the LOAD front door.
 *
 * Saving already worked: `DiagramSerializer.serialize()` produces a document
 * that round-trips byte-identically. Loading did not. `deserialize()` hands back
 * a `DiagramModel` and there was no way to get one onto a screen — every option
 * on `CreateDiagramOptions` wants `nodes`/`edges` specs, so a developer had to
 * hand-convert model nodes back into `NodeInput[]` and then re-discover, on
 * their own, that the kits' post-render wiring never ran.
 *
 * ---------------------------------------------------------------------------
 * WHY EVERY PAINT TOOTH HERE COMPARES AGAINST THE ORIGINAL
 * ---------------------------------------------------------------------------
 * "The loaded model has 3 nodes" proves nothing about painting — an empty
 * `<g>` per node satisfies it. "The container has text" is worse: one working
 * node makes it green while the other two are blank.
 *
 * So the unit of comparison is {@link paintedText}: a map from NODE ID to the
 * text that node actually painted, asserted `toEqual` against the SAME map from
 * the original render. A blank node, a missing node, a node painting somebody
 * else's content and a wholesale failure to paint are all separately visible —
 * and none of them can be papered over by a sibling.
 *
 * Every such assertion is paired with a guard on the ORIGINAL's key set, because
 * `expect({}).toEqual({})` is the vacuous pass this whole file exists to avoid.
 *
 * ---------------------------------------------------------------------------
 * WHY THE HOST IS FAKED TO A SIZE
 * ---------------------------------------------------------------------------
 * jsdom computes no layout, so an unsized container reports a 0x0 viewport and
 * the renderer CULLS every node — the links layer paints and `nodes-layer` comes
 * out empty. Measured, not assumed: without the stubs in {@link sizedHost} the
 * ORIGINAL render paints nothing either, and every tooth below would pass on a
 * pair of blank screens.
 */
import { DiagramSerializer } from '@grafloria/engine';
import type { DiagramInstance } from '@grafloria/renderer';
import { render } from './grafloria';
import { registerNodeType, unregisterNodeType } from './node-type-registry';
import { erDiagram, umlDiagram } from './diagram-kit';
import { dashboard } from './dashboard-kit';
import { fromDocument } from './load';

/** A container the renderer will treat as a real 1200x800 viewport. */
function sizedHost(): HTMLElement {
  const el = document.createElement('div');
  Object.defineProperty(el, 'clientWidth', { value: 1200 });
  Object.defineProperty(el, 'clientHeight', { value: 800 });
  el.getBoundingClientRect = () =>
    ({ x: 0, y: 0, top: 0, left: 0, right: 1200, bottom: 800, width: 1200, height: 800 }) as DOMRect;
  document.body.appendChild(el);
  return el;
}

/** The saved document, as a host would persist it: JSON on the wire. */
function save(api: DiagramInstance): string {
  return JSON.stringify(new DiagramSerializer().serialize(api.getModel()));
}

/**
 * What each node PAINTED, keyed by node id.
 *
 * Both node surfaces carry `data-node-id`: the SVG `<g>` (ER/UML cards paint
 * into its `<foreignObject>`) and the html-layer host div (dashboard widgets).
 * A dashboard node has BOTH, and only one of them holds the content — so the
 * longer text wins rather than document order, which would silently prefer the
 * empty `<g>`.
 */
function paintedText(host: HTMLElement): Record<string, string> {
  const out: Record<string, string> = {};
  for (const el of Array.from(host.querySelectorAll('[data-node-id]'))) {
    const id = el.getAttribute('data-node-id');
    if (!id) continue;
    const text = (el.textContent ?? '').trim();
    if (text.length > (out[id] ?? '').length) out[id] = text;
  }
  return out;
}

function mount<T>(spec: T): { api: DiagramInstance; host: HTMLElement; spec: T } {
  const host = sizedHost();
  const api = render(spec as never, host);
  api.renderNow();
  return { api, host, spec };
}

const ER_SPEC = () =>
  erDiagram({
    editable: true,
    entities: [
      {
        id: 'CUSTOMERS',
        name: 'Customers',
        position: { x: 80, y: 360 },
        columns: [
          { name: 'id', type: 'int', pk: true },
          { name: 'email', type: 'varchar' },
        ],
      },
      {
        id: 'ORDERS',
        name: 'Orders',
        position: { x: 500, y: 150 },
        columns: [
          { name: 'id', type: 'int', pk: true },
          { name: 'customer_id', type: 'int', fk: true },
        ],
      },
    ],
    relationships: [
      { from: 'ORDERS.customer_id', to: 'CUSTOMERS.id', id: 'fk_customer', fromSide: 'left', toSide: 'right' },
    ],
  });

const UML_SPEC = () =>
  umlDiagram({
    classes: [
      { id: 'Shape', abstract: true, position: { x: 60, y: 40 }, attributes: ['# x: float'], methods: ['+ area(): float'] },
      { id: 'Circle', position: { x: 60, y: 300 }, attributes: ['- r: float'], methods: ['+ area(): float'] },
    ],
    relationships: [{ from: 'Circle', to: 'Shape', kind: 'inheritance' }],
  });

const DASH_SPEC = () =>
  dashboard({
    columns: 12,
    views: [
      {
        id: 'main',
        widgets: [
          { id: 'k1', kind: 'kpi', span: 3, rows: 1, title: 'Total revenue', data: { label: 'rev', value: '$6.81M' } },
          { id: 't1', kind: 'table', span: 9, rows: 2, title: 'Top reps', data: { columns: ['Rep'], rows: [['A. Farouk']] } },
        ],
      },
    ],
  });

// ---------------------------------------------------------------------------
// ER
// ---------------------------------------------------------------------------

describe('fromDocument — ER', () => {
  it('paints a loaded ER document exactly as the original painted it', () => {
    const original = mount(ER_SPEC());
    const before = paintedText(original.host);
    // The guard that stops this whole tooth from passing on two blank screens.
    expect(Object.keys(before).sort()).toEqual(['CUSTOMERS', 'ORDERS']);
    expect(before['CUSTOMERS']).toContain('email');

    const loaded = mount(fromDocument(save(original.api)));
    expect(paintedText(loaded.host)).toEqual(before);
  });

  it('keeps the field-level FK port and the edge pinned to it', () => {
    const original = mount(ER_SPEC());
    const link = original.api.getModel().getLink('fk_customer');
    expect(link).toBeDefined();
    // A FIELD port, not a side port: this is what "the edge is glued to the row"
    // means, and a loader that rebuilt nodes from scratch would give it a
    // default side port and quietly reroute the edge.
    expect(link!.sourcePortId).toContain('customer_id');

    const loaded = mount(fromDocument(save(original.api)));
    const reloaded = loaded.api.getModel().getLink('fk_customer');
    expect(reloaded).toBeDefined();
    expect(reloaded!.sourcePortId).toBe(link!.sourcePortId);
    expect(reloaded!.targetPortId).toBe(link!.targetPortId);
    // …and the port it names still exists on the node that owns it.
    expect(loaded.api.getModel().getNode('ORDERS')!.getPort(link!.sourcePortId)).toBeDefined();
  });

  it('restores row selection on a loaded ERD', () => {
    const original = mount(ER_SPEC());
    const loaded = mount(fromDocument(save(original.api)));

    const events: Array<{ selected?: { name?: string } }> = [];
    loaded.host.addEventListener('axk:row-select', (e) => events.push((e as CustomEvent).detail));

    const rows = Array.from(loaded.host.querySelectorAll('[data-node-id="CUSTOMERS"] .axk-row'));
    const emailRow = rows.find((r) => (r.textContent ?? '').includes('email'));
    expect(emailRow).toBeDefined();

    emailRow!.querySelector('.axk-col')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(emailRow!.classList.contains('axk-row-selected')).toBe(true);
    expect(events.at(-1)?.selected?.name).toBe('email');
  });

  it('restores in-canvas editing on a loaded ERD', () => {
    const original = mount(ER_SPEC());
    const loaded = mount(fromDocument(save(original.api)));

    loaded.host
      .querySelector('[data-node-id="CUSTOMERS"] .axk-entity-head')!
      .dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));

    const input = loaded.host.querySelector('.axk-edit-input') as HTMLInputElement | null;
    expect(input).toBeTruthy();
    // Prefilled from the LOADED model's kitEntity — an editor over stale or
    // absent data would open blank.
    expect(input!.value).toBe('Customers');
  });

  it('does NOT re-bind row selection when the document opted out of it', () => {
    // The opt-out is a KIT OPTION, not model state, so it only survives if the
    // builder stamps it. Without the stamp a read-only schema silently becomes
    // clickable on reload — a behaviour change that no pixel would show.
    const original = mount(
      erDiagram({
        rowSelection: false,
        entities: [{ id: 'T', columns: [{ name: 'id', type: 'int' }] }],
      })
    );
    const loaded = mount(fromDocument(save(original.api)));

    const row = loaded.host.querySelector('[data-node-id="T"] .axk-row')!;
    row.querySelector('.axk-col')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(row.classList.contains('axk-row-selected')).toBe(false);

    // …and the control: the SAME diagram with the default does select, so this
    // tooth cannot pass merely because clicking never selects anything.
    const on = mount(
      fromDocument(
        save(mount(erDiagram({ entities: [{ id: 'T', columns: [{ name: 'id', type: 'int' }] }] })).api)
      )
    );
    const onRow = on.host.querySelector('[data-node-id="T"] .axk-row')!;
    onRow.querySelector('.axk-col')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onRow.classList.contains('axk-row-selected')).toBe(true);
  });

  it('leaves a document inert when loaded with interactive:false', () => {
    const original = mount(ER_SPEC());
    const loaded = mount(fromDocument(save(original.api), { interactive: false }));

    // It still PAINTS — a read-only viewer is a viewer, not a blank page.
    expect(Object.keys(paintedText(loaded.host)).sort()).toEqual(['CUSTOMERS', 'ORDERS']);

    const row = loaded.host.querySelector('[data-node-id="CUSTOMERS"] .axk-row')!;
    row.querySelector('.axk-col')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(row.classList.contains('axk-row-selected')).toBe(false);
  });

  it('suppresses node resize handles on loaded ER cards, as the builder does', () => {
    const original = mount(ER_SPEC());
    expect(original.api.getModel().getNode('CUSTOMERS')!.behavior.resizable).toBe(false);

    const loaded = mount(fromDocument(save(original.api)));
    expect(loaded.api.getModel().getNode('CUSTOMERS')!.behavior.resizable).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// UML
// ---------------------------------------------------------------------------

describe('fromDocument — UML', () => {
  it('paints a loaded UML document exactly as the original painted it', () => {
    const original = mount(UML_SPEC());
    const before = paintedText(original.host);
    expect(Object.keys(before).sort()).toEqual(['Circle', 'Shape']);
    expect(before['Shape']).toContain('area(): float');

    const loaded = mount(fromDocument(save(original.api)));
    expect(paintedText(loaded.host)).toEqual(before);
  });

  it('honours the row-selection opt-out on a loaded class diagram too', () => {
    const original = mount(
      umlDiagram({ rowSelection: false, classes: [{ id: 'Shape', methods: ['+ area(): float'] }] })
    );
    const loaded = mount(fromDocument(save(original.api)));
    const member = loaded.host.querySelector('[data-node-id="Shape"] .axk-member')!;
    member.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(member.classList.contains('axk-row-selected')).toBe(false);
  });

  it('restores member selection on a loaded class diagram', () => {
    const original = mount(UML_SPEC());
    const loaded = mount(fromDocument(save(original.api)));

    const member = Array.from(loaded.host.querySelectorAll('[data-node-id="Shape"] .axk-member')).find((m) =>
      (m.textContent ?? '').includes('area')
    );
    expect(member).toBeDefined();
    member!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(member!.classList.contains('axk-row-selected')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

describe('fromDocument — dashboard', () => {
  it('paints every widget of a loaded board exactly as the original did', () => {
    const original = mount(DASH_SPEC());
    const before = paintedText(original.host);
    expect(Object.keys(before).sort()).toEqual(['k1', 't1']);
    // Titles come from the widget spec, values from its data — both must survive.
    expect(before['k1']).toContain('Total revenue');
    expect(before['k1']).toContain('$6.81M');

    const loaded = mount(fromDocument(save(original.api)));
    expect(paintedText(loaded.host)).toEqual(before);
  });

  it('restores the board group with its members and frame chrome', () => {
    const original = mount(DASH_SPEC());
    const shape = (m: { getGroups(): Array<{ id: string; getMetadata(k: string): unknown; members: Set<string> }> }) =>
      m.getGroups().map((g) => ({ id: g.id, chrome: g.getMetadata('frameChrome'), members: Array.from(g.members).sort() }));

    const before = shape(original.api.getModel() as never);
    expect(before).toEqual([{ id: 'main', chrome: 'none', members: ['k1', 't1'] }]);

    const loaded = mount(fromDocument(save(original.api)));
    expect(shape(loaded.api.getModel() as never)).toEqual(before);
  });

  it('re-attaches the grid binder, so a loaded board is still a live board', () => {
    const original = mount(DASH_SPEC());
    const originalBinder = original.spec.handle.binderOf('main');
    const originalCells = ['k1', 't1'].map((id) => [id, originalBinder?.cellOf(id)]);
    expect(originalCells[0]![1]).toEqual({ x: 0, y: 0, w: 3, h: 1 });

    const spec = fromDocument(save(original.api));
    const loaded = mount(spec);
    // Without a re-attached binder this map is EMPTY — the board would be a
    // picture of a dashboard, not a dashboard.
    expect(Array.from(spec.boards.keys())).toEqual(['main']);
    const binder = spec.boards.get('main')!;
    expect(['k1', 't1'].map((id) => [id, binder.cellOf(id)])).toEqual(originalCells);
    expect(loaded.api.getModel().getGroup('main')).toBeDefined();
  });

  it('carries the title of a widget added at RUNTIME, not just a declared one', () => {
    // `addWidget()` builds its node through buildWidgetNode(), a SECOND path to
    // the same metadata. The declarative literal and this one drifted before
    // (that is what the comment on buildWidgetNode warns about), and a tooth on
    // only one of them is exactly how the drift survived.
    const original = mount(DASH_SPEC());
    original.spec.handle.addWidget({ id: 'added', kind: 'kpi', title: 'Added later', data: { value: '42' } });
    original.api.renderNow();

    const loaded = mount(fromDocument(save(original.api)));
    expect(paintedText(loaded.host)['added']).toContain('Added later');
  });

  it('falls through to the node-type registry for a node the kit did not stamp', () => {
    // The kit claims nodes by ITS OWN metadata, never by the type name. A plain
    // `type: 'widget'` node from an unrelated diagram must reach the registry —
    // otherwise `fromDocument` would paint dashboard chrome over somebody
    // else's node purely because the strings matched.
    const foreign = mount({
      nodes: [{ id: 'foreign', type: 'widget', custom: true, position: { x: 40, y: 40 }, size: { width: 120, height: 60 } }],
    });

    registerNodeType('widget', (node, host) => {
      host.textContent = `registry:${node.id}`;
    });
    try {
      const loaded = mount(fromDocument(save(foreign.api)));
      expect(paintedText(loaded.host)['foreign']).toBe('registry:foreign');

      // …and the control: a node the kit DID stamp is painted by the kit, not
      // handed to the registry, even though its type is the same string.
      const board = mount(DASH_SPEC());
      const reloaded = mount(fromDocument(save(board.api)));
      expect(paintedText(reloaded.host)['k1']).toContain('Total revenue');
      expect(paintedText(reloaded.host)['k1']).not.toContain('registry:');
    } finally {
      unregisterNodeType('widget');
    }
  });

  it('honours a caller-supplied widget painter over the kit default', () => {
    const original = mount(DASH_SPEC());
    const seen: Array<{ id: string; kind?: string; title?: string }> = [];
    mount(
      fromDocument(save(original.api), {
        renderWidget: (w, host) => {
          seen.push({ id: w.id, kind: w.kind, title: w.title });
          host.textContent = `custom:${w.id}`;
        },
      })
    );
    // The kit rebuilt the FULL widget spec from the document, not just its id.
    expect(seen.sort((a, b) => a.id.localeCompare(b.id))).toEqual([
      { id: 'k1', kind: 'kpi', title: 'Total revenue' },
      { id: 't1', kind: 'table', title: 'Top reps' },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Dashboard — the reloaded HANDLE (parity with dashboard())
//
// A document-level load used to return only the low-level `boards` grid binders.
// A reloaded dashboard must also get the SAME `DashboardHandle` dashboard()
// returns — addWidget/showView/setSizing/toJSON and the rest — built by the one
// shared builder, so it cannot drift from the authoring handle.
//
// WEAK-TEETH GUARDS: "a handle exists" proves nothing, so every op is DRIVEN and
// the board is asserted to have actually changed. addWidget uses a UNIQUE id and
// title and asserts THAT text painted on the reloaded host (not merely that some
// widget is present). toJSON is round-tripped back through dashboard() and the
// rebuilt board's cells/sizing are compared, and against a fresh dashboard()
// doing the same ops.
// ---------------------------------------------------------------------------

describe('fromDocument — dashboard handle', () => {
  it('reads the live cells of the reloaded board through widget()', () => {
    const original = mount(DASH_SPEC());
    const spec = fromDocument(save(original.api));
    mount(spec);

    expect(spec.handle.views).toEqual(['main']);
    expect(spec.handle.activeView).toBe('main');
    // The exact cells the ORIGINAL authored — read off the re-attached binder,
    // not the authored literal (which the reload never sees).
    expect(spec.handle.widget('k1')!.cell).toEqual({ x: 0, y: 0, w: 3, h: 1 });
    expect(spec.handle.widget('t1')!.cell).toEqual({ x: 3, y: 0, w: 9, h: 2 });
    expect(spec.handle.widget('nope')).toBeUndefined();
  });

  it('addWidget() on the reloaded handle mounts AND paints a brand-new widget', () => {
    const original = mount(DASH_SPEC());
    const spec = fromDocument(save(original.api));
    const loaded = mount(spec);

    // A UNIQUE id+title: "a widget appeared" cannot be satisfied by k1/t1 that
    // were already there — only by the one this call created.
    const w = spec.handle.addWidget({
      id: 'reloaded-add',
      kind: 'kpi',
      title: 'Reloaded Add',
      span: 3,
      rows: 1,
      data: { value: '77' },
    });
    expect(w).toBeDefined();
    loaded.api.renderNow();

    const model = loaded.api.getModel();
    expect(model.getNode('reloaded-add')).toBeDefined();
    expect([...(model.getGroup('main')!.members ?? [])]).toContain('reloaded-add');
    // The load-bearing assertion: it actually PAINTED its own content on the
    // reloaded board, so the widget is live, not a detached node.
    const painted = paintedText(loaded.host)['reloaded-add'] ?? '';
    expect(painted).toContain('Reloaded Add');
    expect(painted).toContain('77');
  });

  it('setSizing changes the reloaded board and toJSON round-trips it back into dashboard()', () => {
    const original = mount(DASH_SPEC());
    const spec = fromDocument(save(original.api));
    mount(spec);

    expect(spec.handle.getSizing()).toBe('fit');
    spec.handle.setSizing('grow');
    expect(spec.handle.getSizing()).toBe('grow');

    const saved = spec.handle.toJSON();
    expect(saved.sizing).toBe('grow');
    expect(saved.views.map((v) => v.id)).toEqual(['main']);
    expect(saved.views[0].widgets.map((x) => x.id).sort()).toEqual(['k1', 't1']);
    // Cells survive the reload → edit → save round-trip.
    expect(saved.views[0].widgets.find((x) => x.id === 't1')).toMatchObject({
      x: 3,
      y: 0,
      span: 9,
      rows: 2,
    });

    // TRUE PARITY: the reloaded handle's toJSON IS dashboard() input, and the
    // board it rebuilds matches a fresh dashboard() authored the same way.
    const rebuilt = mount(dashboard(saved));
    expect(rebuilt.spec.handle.getSizing()).toBe('grow');
    expect(rebuilt.spec.handle.widget('t1')!.cell).toEqual({ x: 3, y: 0, w: 9, h: 2 });
    expect(rebuilt.spec.handle.widget('k1')!.cell).toEqual({ x: 0, y: 0, w: 3, h: 1 });
  });

  it('showView parks the inactive board on a reloaded TABBED dashboard', () => {
    const original = mount(
      dashboard({
        columns: 12,
        views: [
          { id: 'a', name: 'A', widgets: [{ id: 'wa', kind: 'kpi', span: 3, title: 'Alpha' }] },
          { id: 'b', name: 'B', widgets: [{ id: 'wb', kind: 'kpi', span: 3, title: 'Beta' }] },
        ],
      })
    );
    const spec = fromDocument(save(original.api));
    const loaded = mount(spec);

    expect(spec.handle.views).toEqual(['a', 'b']);
    expect(spec.handle.activeView).toBe('a');

    spec.handle.showView('b');
    expect(spec.handle.activeView).toBe('b');
    expect(loaded.api.getModel().getGroup('b')!.position.x).toBe(0);
    expect(loaded.api.getModel().getGroup('a')!.position.x).toBeLessThan(-1000);
  });

  it('returns an INERT handle for a non-dashboard document', () => {
    // An ER doc has no board; the honest answer is an empty handle, not a
    // half-wired one that pretends CUSTOMERS is a widget.
    const original = mount(ER_SPEC());
    const spec = fromDocument(save(original.api));
    mount(spec);
    expect(spec.handle.views).toEqual([]);
    expect(spec.handle.widget('CUSTOMERS')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// The front door itself
// ---------------------------------------------------------------------------

describe('fromDocument — the front door', () => {
  it('accepts the parsed object as well as the JSON string', () => {
    const original = mount(ER_SPEC());
    const doc = new DiagramSerializer().serialize(original.api.getModel());

    const fromObject = mount(fromDocument(doc));
    const fromString = mount(fromDocument(JSON.stringify(doc)));
    expect(paintedText(fromObject.host)).toEqual(paintedText(fromString.host));
    expect(Object.keys(paintedText(fromObject.host)).sort()).toEqual(['CUSTOMERS', 'ORDERS']);
  });

  it('accepts the portable envelope form', () => {
    const original = mount(ER_SPEC());
    const envelope = new DiagramSerializer().serializeEnvelope(original.api.getModel());
    const loaded = mount(fromDocument(envelope));
    expect(paintedText(loaded.host)).toEqual(paintedText(original.host));
  });

  it('exposes the loaded model without requiring a render', () => {
    const original = mount(ER_SPEC());
    const spec = fromDocument(save(original.api));
    expect(spec.model.getNodes().map((n) => n.id).sort()).toEqual(['CUSTOMERS', 'ORDERS']);
  });
});
