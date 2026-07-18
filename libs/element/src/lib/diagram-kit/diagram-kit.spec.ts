/**
 * Diagram kit — reusable ER / UML builders (the packaged form of what the
 * diagrams/* demos hand-composed).
 *
 * The demos proved the CAPABILITY (HTML table/class cards, crow's-foot and UML
 * markers, field-level ports, clean routing, card-ring selection) but every
 * page re-implemented it. This kit is the reusable feature: typed builders
 * that emit a ready render() spec + one injected stylesheet, so an embedder
 * writes data, not plumbing.
 */
import { erDiagram, ER_ROW_H, ER_HEAD_H } from './er';
import { umlDiagram } from './uml';
import { DIAGRAM_KIT_STYLE_ID, ensureDiagramKitStyles } from './styles';

const CUSTOMER = {
  id: 'CUSTOMER',
  name: 'Customer',
  columns: [
    { name: 'id', type: 'int', pk: true },
    { name: 'name', type: 'varchar' },
    { name: 'email', type: 'varchar' },
  ],
};
const ORDER = {
  id: 'ORDER',
  name: 'Order',
  columns: [
    { name: 'id', type: 'int', pk: true },
    { name: 'customer_id', type: 'int', fk: true },
  ],
};

const findNode = (spec: { nodes: Array<{ id?: string }> }, id: string) =>
  spec.nodes.find((n) => n.id === id)! as Record<string, unknown> & {
    size: { width: number; height: number };
    metadata: { html: { content: unknown } };
    ports?: Array<Record<string, unknown>>;
  };
const treeText = (tree: unknown): string => JSON.stringify(tree);

afterEach(() => {
  document.getElementById(DIAGRAM_KIT_STYLE_ID)?.remove();
});

describe('erDiagram — entities', () => {
  it('builds an HTML table card per entity: header + one row per column + PK/FK badges', () => {
    const spec = erDiagram({ entities: [CUSTOMER, ORDER] });
    expect(spec.nodes).toHaveLength(2);
    const text = treeText(findNode(spec, 'CUSTOMER').metadata.html.content);
    expect(text).toContain('Customer');
    expect(text).toContain('email');
    expect(text).toContain('varchar');
    expect(text).toContain('PK');
    expect(treeText(findNode(spec, 'ORDER').metadata.html.content)).toContain('FK');
    // Kit-scoped class names, never the demo's.
    expect(text).toContain('axk-entity');
  });

  it('sizes the card from its column count (slack covers wrapper padding + borders)', () => {
    const spec = erDiagram({ entities: [CUSTOMER] });
    expect(findNode(spec, 'CUSTOMER').size.height).toBe(ER_HEAD_H + 3 * ER_ROW_H + 9);
  });

  it("hides the node's own rectangle so the card's border is the only border", () => {
    const node = findNode(erDiagram({ entities: [CUSTOMER] }), 'CUSTOMER');
    expect((node['shape'] as { fill?: string }).fill).toBe('none');
    expect((node['style'] as { stroke?: string }).stroke).toBe('transparent');
  });

  it('lays entities on a default grid when positions are omitted, and respects explicit ones', () => {
    const spec = erDiagram({ entities: [CUSTOMER, { ...ORDER, position: { x: 900, y: 40 } }] });
    const a = findNode(spec, 'CUSTOMER')['position'] as { x: number; y: number };
    const b = findNode(spec, 'ORDER')['position'] as { x: number; y: number };
    expect(typeof a.x).toBe('number');
    expect(b).toEqual({ x: 900, y: 40 });
    expect(a.x).not.toBe(b.x);
  });
});

describe('scrollable cards (many fields + user resize)', () => {
  it('wraps the entity rows in a body region; scroll is OPT-IN via explicit height', () => {
    const auto = erDiagram({ entities: [CUSTOMER] });
    const autoText = treeText(findNode(auto, 'CUSTOMER').metadata.html.content);
    expect(autoText).toContain('axk-entity-body');
    // An auto-sized card fits by construction — it must never trap the wheel.
    expect(autoText).not.toContain('axk-scroll');
    const fixed = erDiagram({ entities: [{ ...CUSTOMER, height: 160 }] });
    expect(treeText(findNode(fixed, 'CUSTOMER').metadata.html.content)).toContain('axk-scroll');
  });

  it('an explicit entity height wins over the computed one (fixed height → the body scrolls)', () => {
    const spec = erDiagram({ entities: [{ ...CUSTOMER, height: 160 }] });
    expect(findNode(spec, 'CUSTOMER').size.height).toBe(160);
  });

  it('wraps the uml compartments in a body region, honours explicit height, and gates scroll on it', () => {
    const fixed = umlDiagram({
      classes: [{ id: 'Big', attributes: ['+ a: int'], methods: ['+ m(): void'], height: 140 }],
      relationships: [],
    });
    const fixedText = treeText(findNode(fixed, 'Big').metadata.html.content);
    expect(fixedText).toContain('axk-uml-body');
    expect(fixedText).toContain('axk-scroll');
    expect(findNode(fixed, 'Big').size.height).toBe(140);
    const auto = umlDiagram({ classes: [{ id: 'Small', attributes: ['+ a: int'] }], relationships: [] });
    expect(treeText(findNode(auto, 'Small').metadata.html.content)).not.toContain('axk-scroll');
  });

  it('the kit stylesheet scrolls ONLY the opted-in body regions', () => {
    ensureDiagramKitStyles();
    const css = document.getElementById(DIAGRAM_KIT_STYLE_ID)!.textContent || '';
    expect(css).toMatch(/\.axk-entity-body\.axk-scroll[^}]*overflow-y:\s*auto/);
    expect(css).toMatch(/\.axk-uml-body\.axk-scroll[^}]*overflow-y:\s*auto/);
    // The un-opted body clips: auto-height cards never show a scrollbar.
    expect(css).toMatch(/\.axk-entity-body\s*\{[^}]*overflow-y:\s*hidden/);
    expect(css).toMatch(/\.axk-uml-body\s*\{[^}]*overflow-y:\s*hidden/);
  });
});

describe('erDiagram — relationships', () => {
  it('defaults to one-to-many: a "one" tail and a crow-foot head, orthogonal, side handles', () => {
    const spec = erDiagram({
      entities: [CUSTOMER, ORDER],
      relationships: [{ from: 'CUSTOMER', to: 'ORDER', label: 'places' }],
    });
    expect(spec.edges).toHaveLength(1);
    const e = spec.edges[0] as any;
    expect(e.type).toBe('orthogonal');
    expect(e.label).toBe('places');
    expect(e.sourceHandle).toBe('right');
    expect(e.targetHandle).toBe('left');
    expect(e.style.arrowTail.type).toBe('one');
    expect(e.style.arrowHead.type).toBe('crow-foot');
  });

  it.each([
    ['one-to-one', 'one', 'one'],
    ['many-to-many', 'crow-foot', 'crow-foot'],
    ['one-to-zero-or-many', 'one', 'zero-or-many'],
    ['one-to-one-or-many', 'one', 'one-or-many'],
  ] as const)('cardinality %s → tail %s / head %s', (cardinality, tail, head) => {
    const spec = erDiagram({
      entities: [CUSTOMER, ORDER],
      relationships: [{ from: 'CUSTOMER', to: 'ORDER', cardinality }],
    });
    const e = spec.edges[0] as any;
    expect(e.style.arrowTail.type).toBe(tail);
    expect(e.style.arrowHead.type).toBe(head);
  });

  it('FIELD-LEVEL: "TABLE.column" pins an absolute-layout port on that row and wires the handle to it', () => {
    const spec = erDiagram({
      entities: [CUSTOMER, ORDER],
      relationships: [{ from: 'ORDER.customer_id', to: 'CUSTOMER.id' }],
    });
    const e = spec.edges[0] as any;
    const order = findNode(spec, 'ORDER');
    const customer = findNode(spec, 'CUSTOMER');
    const orderPort = (order.ports ?? []).find((p) => p['id'] === e.sourceHandle) as any;
    const customerPort = (customer.ports ?? []).find((p) => p['id'] === e.targetHandle) as any;
    expect(orderPort).toBeTruthy();
    expect(customerPort).toBeTruthy();
    expect(orderPort.layout.strategy).toBe('absolute');
    // customer_id is row index 1; id is row index 0 — pinned at each row's centre.
    expect(orderPort.layout.args.y).toBe(ER_HEAD_H + 1 * ER_ROW_H + ER_ROW_H / 2 + 1);
    expect(customerPort.layout.args.y).toBe(ER_HEAD_H + 0 * ER_ROW_H + ER_ROW_H / 2 + 1);
    // exit directions follow the default sides
    expect(orderPort.side).toBe('right');
    expect(customerPort.side).toBe('left');
  });

  it('two relationships landing on the SAME column get spread apart, not stacked', () => {
    const WAREHOUSE = { id: 'WAREHOUSE', columns: [{ name: 'id', type: 'int', pk: true }] };
    const SHIPMENT = {
      id: 'SHIPMENT',
      columns: [
        { name: 'from_warehouse_id', type: 'int', fk: true },
        { name: 'to_warehouse_id', type: 'int', fk: true },
      ],
    };
    const spec = erDiagram({
      entities: [WAREHOUSE, SHIPMENT],
      relationships: [
        { from: 'SHIPMENT.from_warehouse_id', to: 'WAREHOUSE.id' },
        { from: 'SHIPMENT.to_warehouse_id', to: 'WAREHOUSE.id' },
      ],
    });
    const wh = findNode(spec, 'WAREHOUSE');
    const pkPorts = (wh.ports ?? []).filter(
      (p) => (p as any).layout?.strategy === 'absolute'
    ) as any[];
    expect(pkPorts).toHaveLength(2);
    const dys = pkPorts.map((p) => p.layout.args.dy ?? 0);
    expect(dys[0]).not.toBe(dys[1]);
  });

  it('throws on an unknown column so a typo cannot silently fall back to table-level', () => {
    expect(() =>
      erDiagram({
        entities: [CUSTOMER, ORDER],
        relationships: [{ from: 'ORDER.nope', to: 'CUSTOMER.id' }],
      })
    ).toThrow(/nope/);
  });
});

describe('umlDiagram', () => {
  const SHAPE = { id: 'Shape', abstract: true, attributes: ['# x: float'], methods: ['+ area(): float'] };
  const CIRCLE = { id: 'Circle', attributes: ['+ r: float'], methods: [] };

  it('builds three-compartment class cards, with stereotype and abstract styling', () => {
    const spec = umlDiagram({
      classes: [{ ...SHAPE, stereotype: 'abstract' }, CIRCLE],
      relationships: [],
    });
    const text = treeText(findNode(spec, 'Shape').metadata.html.content);
    expect(text).toContain('axk-uml');
    expect(text).toContain('«abstract»');
    expect(text).toContain('# x: float');
    expect(text).toContain('+ area(): float');
  });

  it.each([
    // kind, dashed?, head type, tail type, filled diamond?
    ['inheritance', false, 'generalization', 'none', false],
    ['realization', true, 'generalization', 'none', false],
    ['association', false, 'none', 'none', false],
    ['directed-association', false, 'open-arrow', 'none', false],
    ['aggregation', false, 'none', 'hollow-diamond', false],
    ['composition', false, 'none', 'filled-diamond', true],
    ['dependency', true, 'open-arrow', 'none', false],
  ] as const)('%s → dashed=%s head=%s tail=%s', (kind, dashed, head, tail, filled) => {
    const spec = umlDiagram({
      classes: [SHAPE, CIRCLE],
      relationships: [{ from: 'Circle', to: 'Shape', kind }],
    });
    const e = spec.edges[0] as any;
    expect(!!e.style.strokeDasharray).toBe(dashed);
    expect((e.style.arrowHead?.type ?? 'none')).toBe(head);
    expect((e.style.arrowTail?.type ?? 'none')).toBe(tail);
    if (tail === 'filled-diamond') expect(e.style.arrowTail.filled).toBe(filled);
    // The stray-default-arrowhead regression: a plain association must
    // EXPLICITLY carry arrowHead none, or the renderer paints a default arrow.
    if (kind === 'association') expect(e.style.arrowHead?.type).toBe('none');
  });

  it('multiplicity rides finalize(api): chips are added as positioned labels after render', () => {
    const spec = umlDiagram({
      classes: [SHAPE, CIRCLE],
      relationships: [{ from: 'Circle', to: 'Shape', kind: 'association', multiplicity: ['0..*', '1'] }],
    });
    const added: Array<Record<string, unknown>> = [];
    const fakeApi = {
      getModel: () => ({
        getLink: (id: string) =>
          id === (spec.edges[0] as any).id
            ? { addLabel: (l: Record<string, unknown>) => added.push(l) }
            : null,
      }),
      renderNow: () => undefined,
    };
    spec.finalize(fakeApi as never);
    expect(added).toHaveLength(2);
    expect(treeText(added)).toContain('0..*');
    expect(treeText(added)).toContain('1');
  });
});

describe('kit stylesheet', () => {
  it('is injected once, idempotently, with kit-scoped classes and the card-ring selection rules', () => {
    ensureDiagramKitStyles();
    ensureDiagramKitStyles();
    const styles = document.querySelectorAll(`#${DIAGRAM_KIT_STYLE_ID}`);
    expect(styles).toHaveLength(1);
    const css = styles[0].textContent || '';
    expect(css).toContain('.axk-entity');
    expect(css).toContain('.axk-uml');
    // Selection highlights the CARD, not a detached rectangle — scoped with
    // :has() so it never affects non-kit nodes.
    expect(css).toContain(':has(.axk-entity)');
    expect(css).toContain('selection-highlight');
    expect(css).toContain('data-selected');
  });

  it('building a diagram injects the stylesheet automatically', () => {
    erDiagram({ entities: [CUSTOMER] });
    expect(document.getElementById(DIAGRAM_KIT_STYLE_ID)).toBeTruthy();
  });
});
