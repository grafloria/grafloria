/**
 * P3 — `updateEntity` / `updateClass` against a REAL model.
 *
 * The reconciliation only matters on live PortModels + LinkModels, so these
 * tests build an actual DiagramModel from an erDiagram()/umlDiagram() spec and
 * drive the edit through the real CommandManager — the same seam the kit uses
 * live. That also proves the edit is exactly ONE undo step.
 */
import { DiagramModel, NodeModel, PortModel, LinkModel, CommandManager } from '@grafloria/engine';
import { erDiagram } from './er';
import { umlDiagram } from './uml';
import { updateEntity, updateClass, addColumnAt, removeColumnAt, renameColumnAt } from './update';
import { erRowCenterY, ER_ROW_H } from './card';

interface AnySpec {
  nodes: Array<Record<string, unknown>>;
  edges: Array<Record<string, unknown>>;
}

/** Build a live DiagramModel + a kit `api` from a builder spec. */
function mount(spec: AnySpec, editable = true) {
  const model = new DiagramModel();
  for (const n of spec.nodes as any[]) {
    const node = new NodeModel({ id: n.id, type: 'kit', position: n.position, size: n.size });
    for (const p of node.getPorts()) node.removePort(p.id); // drop auto-defaults
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
    (link as any).id = e.id; // stable id so we can find it back
    model.addLink(link);
  }
  const eventBus = { emit() {} };
  const cm = new CommandManager({ diagram: model, eventBus } as any, eventBus as any);
  const engine = { commandManager: cm, undo: () => cm.undo(), redo: () => cm.redo() };
  const container = document.createElement('div');
  const api = { container, getModel: () => model, getEngine: () => engine, renderNow: () => {} };
  return { model, api, cm };
}

const html = (node: any) => JSON.stringify(node.getMetadata('html'));
const portY = (node: any, id: string) => node.getPort(id)?.layout?.args?.y as number | undefined;

/** FOO has two field ports (on b and d); TARGET is the referenced PK. */
function fooSpec(editable = true): AnySpec {
  return erDiagram({
    editable,
    entities: [
      { id: 'TARGET', columns: [{ name: 'pk', type: 'int', pk: true }] },
      {
        id: 'FOO',
        columns: [
          { name: 'a', type: 'int' },
          { name: 'b', type: 'int', fk: true },
          { name: 'c', type: 'int' },
          { name: 'd', type: 'int', fk: true },
        ],
      },
    ],
    relationships: [
      { from: 'FOO.b', to: 'TARGET.pk', id: 'e-b' },
      { from: 'FOO.d', to: 'TARGET.pk', id: 'e-d' },
    ],
  }) as AnySpec;
}

describe('updateEntity — add a column', () => {
  it('adds a row, grows the card, and shifts every port BELOW down by exactly one row', async () => {
    const { model, api } = mount(fooSpec());
    const foo = model.getNode('FOO')!;
    const h0 = foo.size.height;
    const cols = (foo.getMetadata('kitEntity') as any).columns;
    // b is row 1, d is row 3 before the insert.
    expect(portY(foo, 'FOO__b__right__0')).toBe(erRowCenterY(1));
    expect(portY(foo, 'FOO__d__right__0')).toBe(erRowCenterY(3));

    await updateEntity(api as any, 'FOO', { columns: addColumnAt(cols, { name: 'z', type: 'int' }, 0) });

    // html gained the row; card grew by one row height.
    expect(html(foo)).toContain('"z"');
    expect((foo.getMetadata('kitEntity') as any).columns).toHaveLength(5);
    expect(foo.size.height).toBe(h0 + ER_ROW_H);
    // MUTATION-PROOF: the ports did not stay frozen at their old rows — they
    // tracked their columns down by exactly ER_ROW_H.
    expect(portY(foo, 'FOO__b__right__0')).toBe(erRowCenterY(2));
    expect(portY(foo, 'FOO__d__right__0')).toBe(erRowCenterY(4));
    expect(portY(foo, 'FOO__b__right__0')).not.toBe(erRowCenterY(1));
    // Edges stayed glued (still present, same handles).
    expect(model.getLinks()).toHaveLength(2);
    expect(model.getLink('e-b')!.sourcePortId).toBe('FOO__b__right__0');
  });
});

describe('updateEntity — remove a column', () => {
  it('drops the removed column row, and a port BELOW it shifts up one row', async () => {
    const { model, api } = mount(fooSpec());
    const foo = model.getNode('FOO')!;
    const cols = (foo.getMetadata('kitEntity') as any).columns;
    // Remove 'a' (row 0, no port) → b:1→0, d:3→2 shift up.
    await updateEntity(api as any, 'FOO', { columns: removeColumnAt(cols, 0) });
    expect(html(foo)).not.toContain('"a"');
    expect(portY(foo, 'FOO__b__right__0')).toBe(erRowCenterY(0));
    expect(portY(foo, 'FOO__d__right__0')).toBe(erRowCenterY(2));
    expect(model.getLinks()).toHaveLength(2);
  });

  it("removing a PORTED column deletes its port and drops that column's edge", async () => {
    const { model, api } = mount(fooSpec());
    const foo = model.getNode('FOO')!;
    const cols = (foo.getMetadata('kitEntity') as any).columns;
    // Remove 'b' (row 1, ported) → its port + edge e-b go; d:3→2 shifts up.
    await updateEntity(api as any, 'FOO', { columns: removeColumnAt(cols, 1) });
    expect(foo.getPort('FOO__b__right__0')).toBeUndefined();
    expect(model.getLink('e-b')).toBeUndefined();
    // The OTHER port + edge survive and track.
    expect(foo.getPort('FOO__d__right__0')).toBeTruthy();
    expect(portY(foo, 'FOO__d__right__0')).toBe(erRowCenterY(2));
    expect(model.getLink('e-d')).toBeTruthy();
  });
});

describe('updateEntity — rename / reorder', () => {
  it('rename keeps the port id and the edge; the port stays on its (unchanged) row', async () => {
    const { model, api } = mount(fooSpec());
    const foo = model.getNode('FOO')!;
    const cols = (foo.getMetadata('kitEntity') as any).columns;
    await updateEntity(api as any, 'FOO', { columns: renameColumnAt(cols, 1, 'b_renamed') });
    expect(html(foo)).toContain('"b_renamed"');
    expect(foo.getPort('FOO__b__right__0')).toBeTruthy(); // stable id
    expect(portY(foo, 'FOO__b__right__0')).toBe(erRowCenterY(1)); // same row
    expect(model.getLink('e-b')!.sourcePortId).toBe('FOO__b__right__0'); // still glued
  });

  it('reorder tracks ports to their columns new rows', async () => {
    const { model, api } = mount(fooSpec());
    const foo = model.getNode('FOO')!;
    const cols = (foo.getMetadata('kitEntity') as any).columns as any[];
    // Move 'd' (idx3) to the front: [d, a, b, c] → d:0, b:2.
    const reordered = [cols[3], cols[0], cols[1], cols[2]];
    await updateEntity(api as any, 'FOO', { columns: reordered });
    expect(portY(foo, 'FOO__d__right__0')).toBe(erRowCenterY(0));
    expect(portY(foo, 'FOO__b__right__0')).toBe(erRowCenterY(2));
    expect(model.getLinks()).toHaveLength(2);
  });

  it('renaming the table changes only the header text', async () => {
    const { model, api } = mount(fooSpec());
    const foo = model.getNode('FOO')!;
    await updateEntity(api as any, 'FOO', { name: 'Widgets' });
    expect(html(foo)).toContain('Widgets');
    expect((foo.getMetadata('kitEntity') as any).name).toBe('Widgets');
    // columns + ports untouched.
    expect(portY(foo, 'FOO__b__right__0')).toBe(erRowCenterY(1));
  });
});

describe('updateEntity — one undoable step', () => {
  it('a whole edit is a single Ctrl+Z that restores rows, size, ports AND edges', async () => {
    const { model, api, cm } = mount(fooSpec());
    const foo = model.getNode('FOO')!;
    const h0 = foo.size.height;

    // A removal that touches html, size, one port AND one edge.
    const cols = (foo.getMetadata('kitEntity') as any).columns;
    await updateEntity(api as any, 'FOO', { columns: removeColumnAt(cols, 1) });
    expect(cm.getHistory()).toHaveLength(1); // ONE history entry for the whole edit
    expect(foo.getPort('FOO__b__right__0')).toBeUndefined();
    expect(model.getLink('e-b')).toBeUndefined();

    await cm.undo();
    // Everything comes back in one step.
    expect(foo.size.height).toBe(h0);
    expect(html(foo)).toContain('"b"');
    expect(foo.getPort('FOO__b__right__0')).toBeTruthy();
    expect(portY(foo, 'FOO__b__right__0')).toBe(erRowCenterY(1));
    expect(portY(foo, 'FOO__d__right__0')).toBe(erRowCenterY(3));
    expect(model.getLink('e-b')).toBeTruthy();
  });
});

describe('updateClass — UML edits (no port reconciliation)', () => {
  it('adds/renames members and grows the card; rename changes the name text', async () => {
    const spec = umlDiagram({
      editable: true,
      classes: [{ id: 'Shape', attributes: ['# x: float'], methods: ['+ area(): float'] }],
      relationships: [],
    }) as AnySpec;
    const { model, api } = mount(spec);
    const node = model.getNode('Shape')!;
    const h0 = node.size.height;

    await updateClass(api as any, 'Shape', { attributes: ['# x: float', '# y: float'] });
    expect(html(node)).toContain('# y: float');
    expect(node.size.height).toBeGreaterThan(h0);

    await updateClass(api as any, 'Shape', { name: 'Rectangle' });
    expect(html(node)).toContain('Rectangle');
    expect((node.getMetadata('kitClass') as any).name).toBe('Rectangle');
  });
});
