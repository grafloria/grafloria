/**
 * Option B — the typed façade handle layer (user decision, 2026-07-19).
 *
 * `CardHandle → ErTable / UmlClass` + `ErField`: the clean OO usage over the
 * data-first kit. The DESIGN INVARIANT under test everywhere here: handles are
 * STATELESS — (api, id) closures. They can never go stale, and every mutation
 * funnels through updateEntity/updateClass, so one-step undo and field-port
 * reconciliation come free. Tests run against a REAL DiagramModel + the REAL
 * CommandManager, exactly like update.spec.ts.
 */
import { DiagramModel, NodeModel, PortModel, LinkModel, CommandManager } from '@grafloria/engine';
import { erDiagram } from './er';
import { umlDiagram } from './uml';
import { updateEntity } from './update';
import { erTable, umlClass, erTables, ErTable, ErField, UmlClass } from './handles';
import { erRowCenterY, ER_ROW_H } from './card';

interface AnySpec {
  nodes: Array<Record<string, unknown>>;
  edges: Array<Record<string, unknown>>;
}

function mount(spec: AnySpec, editable = true) {
  const model = new DiagramModel();
  for (const n of spec.nodes as any[]) {
    const node = new NodeModel({ id: n.id, type: 'kit', position: n.position, size: n.size });
    for (const p of node.getPorts()) node.removePort(p.id);
    const meta = n.metadata ?? {};
    node.setMetadata('html', meta.html);
    if (meta.kitEntity) node.setMetadata('kitEntity', meta.kitEntity);
    if (meta.kitClass) node.setMetadata('kitClass', meta.kitClass);
    node.setMetadata('kitEditable', editable);
    for (const p of (n.ports ?? []) as any[]) {
      node.addPort(new PortModel({ id: p.id, type: 'bi', side: p.side, visible: p.visible, layout: p.layout }));
    }
    model.addNode(node);
  }
  for (const e of spec.edges as any[]) {
    const link = new LinkModel(e.sourceHandle, e.targetHandle, 'orthogonal');
    (link as any).id = e.id;
    model.addLink(link);
  }
  const eventBus = { emit() {} };
  const cm = new CommandManager({ diagram: model, eventBus } as any, eventBus as any);
  const engine = { commandManager: cm, undo: () => cm.undo(), redo: () => cm.redo() };
  const container = document.createElement('div');
  document.body.appendChild(container);
  const api = { container, getModel: () => model, getEngine: () => engine, renderNow: () => {} };
  return { model, api, cm, container };
}

const SCHEMA = (): AnySpec =>
  erDiagram({
    editable: true,
    entities: [
      { id: 'TARGET', columns: [{ name: 'pk', type: 'int', pk: true }] },
      {
        id: 'FOO',
        name: 'Foo',
        columns: [
          { name: 'a', type: 'int', pk: true },
          { name: 'b', type: 'int', fk: true },
          { name: 'c', type: 'varchar' },
        ],
      },
    ],
    relationships: [{ from: 'FOO.b', to: 'TARGET.pk' }],
  });

const UML = (): AnySpec =>
  umlDiagram({
    editable: true,
    classes: [
      { id: 'Shape', name: 'Shape', attributes: ['# x: float'], methods: ['+ area(): float'] },
    ],
    relationships: [],
  } as never);

describe('erTable factory', () => {
  it('resolves a kit table; refuses unknown ids and non-kit nodes', () => {
    const { api, model } = mount(SCHEMA());
    const t = erTable(api as never, 'FOO');
    expect(t).toBeInstanceOf(ErTable);
    expect(t.exists).toBe(true);
    expect(() => erTable(api as never, 'NOPE')).toThrow(/no node/i);
    const plain = new NodeModel({ id: 'plain', type: 'basic', position: { x: 0, y: 0 }, size: { width: 10, height: 10 } });
    model.addNode(plain);
    expect(() => erTable(api as never, 'plain')).toThrow(/not an ER table/i);
    expect(erTables(api as never).map((x) => x.id).sort()).toEqual(['FOO', 'TARGET']);
  });
});

describe('CardHandle basics (name, size, undo sugar)', () => {
  it('reads the stored spec and renames as ONE undoable step', async () => {
    const { api, model, cm } = mount(SCHEMA());
    const t = erTable(api as never, 'FOO');
    expect(t.name).toBe('Foo');
    await t.rename('Sales Foo');
    expect(t.name).toBe('Sales Foo');
    expect(JSON.stringify(model.getNode('FOO')!.getMetadata('html'))).toContain('Sales Foo');
    expect((cm as any).getHistory().length).toBe(1);
    await t.undo();
    expect(t.name).toBe('Foo'); // the STATELESS read reflects the restored model
  });

  it('resizes through the same undoable path', async () => {
    const { api, model } = mount(SCHEMA());
    const t = erTable(api as never, 'FOO');
    await t.resize({ width: 260 });
    expect(model.getNode('FOO')!.size.width).toBe(260);
  });
});

describe('ErTable.columns + ErField', () => {
  it('lists, iterates and indexes typed fields', () => {
    const t = erTable(mount(SCHEMA()).api as never, 'FOO');
    expect(t.columns.length).toBe(3);
    expect(t.columns.names()).toEqual(['a', 'b', 'c']);
    const fields = [...t.columns];
    expect(fields.every((f) => f instanceof ErField)).toBe(true);
    expect(t.columns.get('b')!.fk).toBe(true);
    expect(t.columns.at(0)!.pk).toBe(true);
    expect(t.columns.get('zzz')).toBeUndefined();
  });

  it('add-at-index shifts the FK field port down by one row (port glue via the handle path)', async () => {
    const { api, model } = mount(SCHEMA());
    const t = erTable(api as never, 'FOO');
    const foo = model.getNode('FOO')!;
    const fkPort = foo.getPorts().find((p: any) => String(p.id).includes('__b__')) as any;
    expect(fkPort.layout.args.y).toBe(erRowCenterY(1));
    await t.columns.add({ name: 'inserted', type: 'int' }, { at: 0 });
    expect(t.columns.names()).toEqual(['inserted', 'a', 'b', 'c']);
    expect((foo.getPorts().find((p: any) => String(p.id).includes('__b__')) as any).layout.args.y).toBe(
      erRowCenterY(2)
    );
    await t.undo();
    expect(t.columns.names()).toEqual(['a', 'b', 'c']);
  });

  it('field rename/retype/remove flow through updateEntity', async () => {
    const { api, model } = mount(SCHEMA());
    const t = erTable(api as never, 'FOO');
    await t.columns.get('c')!.rename('c2');
    expect(t.columns.names()).toEqual(['a', 'b', 'c2']);
    await t.columns.get('c2')!.setType('text');
    expect(t.columns.get('c2')!.type).toBe('text');
    await t.columns.get('c2')!.remove();
    expect(t.columns.names()).toEqual(['a', 'b']);
    expect(JSON.stringify(model.getNode('FOO')!.getMetadata('html'))).not.toContain('c2');
  });

  it('handles are stateless: an EXTERNAL updateEntity is visible through an old handle', async () => {
    const { api } = mount(SCHEMA());
    const t = erTable(api as never, 'FOO');
    const before = t.columns.length;
    await updateEntity(api as never, 'FOO', {
      columns: [...(t.spec.columns), { name: 'ext', type: 'int' }],
    });
    expect(t.columns.length).toBe(before + 1); // same handle object, fresh truth
  });

  it('spec getter returns a COPY — mutating it never touches the model', () => {
    const { api, model } = mount(SCHEMA());
    const t = erTable(api as never, 'FOO');
    t.spec.columns.push({ name: 'evil' } as never);
    expect((model.getNode('FOO')!.getMetadata('kitEntity') as any).columns.length).toBe(3);
  });
});

describe('UmlClass handle', () => {
  it('attributes/methods collections + abstract flag, all undoable', async () => {
    const { api, model, cm } = mount(UML());
    const c = umlClass(api as never, 'Shape');
    expect(c).toBeInstanceOf(UmlClass);
    expect(c.attributes.list()).toEqual(['# x: float']);
    await c.methods.add('+ perimeter(): float');
    expect(c.methods.list()).toEqual(['+ area(): float', '+ perimeter(): float']);
    await c.setAbstract(true);
    expect(c.abstract).toBe(true);
    expect(JSON.stringify(model.getNode('Shape')!.getMetadata('html'))).toContain('perimeter');
    await c.undo(); // abstract off
    await c.undo(); // method gone
    expect(c.methods.list()).toEqual(['+ area(): float']);
    expect(c.abstract).toBe(false);
    await c.redo(); // method back — the handle's redo sugar round-trips
    expect(c.methods.list()).toEqual(['+ area(): float', '+ perimeter(): float']);
    expect((cm as any).getHistory().length).toBe(2); // executed commands stay on the stack
  });

  it('renameAt / removeAt on members', async () => {
    const c = umlClass(mount(UML()).api as never, 'Shape');
    await c.attributes.renameAt(0, '# x: double');
    expect(c.attributes.list()).toEqual(['# x: double']);
    await c.attributes.removeAt(0);
    expect(c.attributes.list()).toEqual([]);
  });
});

describe('onRowSelect', () => {
  it('fires only for THIS card, with a typed field when resolvable, and unbinds', () => {
    const { api, container } = mount(SCHEMA());
    const t = erTable(api as never, 'FOO');
    const seen: any[] = [];
    const off = t.onRowSelect((sel) => seen.push(sel));
    const fire = (nodeId: string | null, rowIndex = 1, name = 'b') =>
      container.dispatchEvent(
        new CustomEvent('axk:row-select', {
          detail: { selected: nodeId ? { nodeId, rowIndex, name, kind: 'er' } : null },
        })
      );
    fire('TARGET'); // other card — ignored
    expect(seen).toHaveLength(0);
    fire('FOO');
    expect(seen).toHaveLength(1);
    expect(seen[0].field).toBeInstanceOf(ErField);
    expect(seen[0].field.name).toBe('b');
    fire(null); // deselect → null
    expect(seen[1]).toEqual({ field: null, selected: null });
    off();
    fire('FOO');
    expect(seen).toHaveLength(2);
  });
});
