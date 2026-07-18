/**
 * P2 + P4 — the in-canvas editing gestures.
 *
 * These drive the REAL handlers `bindCardEditing` installs: double-click to
 * rename (header / column / member), the add affordance, the delete control.
 * The card DOM is mounted from the node's own html tree (what the renderer
 * paints), and every assertion checks the LIVE MODEL the gesture mutated.
 */
import { DiagramModel, NodeModel, PortModel, LinkModel, CommandManager } from '@grafloria/engine';
import { erDiagram } from './er';
import { umlDiagram } from './uml';
import { bindCardEditing } from './editing';
import { bindRowInteractions } from './rows';

function renderTree(spec: any): HTMLElement {
  const el = document.createElement(spec.tag);
  if (spec.className) el.className = spec.className;
  if (spec.text != null) el.textContent = spec.text;
  for (const c of spec.children ?? []) el.appendChild(renderTree(c));
  return el;
}

function mount(spec: any) {
  const model = new DiagramModel();
  for (const n of spec.nodes) {
    const node = new NodeModel({ id: n.id, type: 'kit', position: n.position, size: n.size });
    for (const p of node.getPorts()) node.removePort(p.id);
    node.setMetadata('html', n.metadata.html);
    if (n.metadata.kitEntity) node.setMetadata('kitEntity', n.metadata.kitEntity);
    if (n.metadata.kitClass) node.setMetadata('kitClass', n.metadata.kitClass);
    node.setMetadata('kitEditable', true);
    for (const p of n.ports ?? []) node.addPort(new PortModel({ id: p.id, type: 'bi', side: p.side, visible: p.visible, layout: p.layout }));
    model.addNode(node);
  }
  for (const e of spec.edges) {
    const link = new LinkModel(e.sourceHandle, e.targetHandle, 'orthogonal');
    (link as any).id = e.id;
    model.addLink(link);
  }
  const eventBus = { emit() {} };
  const cm = new CommandManager({ diagram: model, eventBus } as any, eventBus as any);
  const engine = { commandManager: cm, undo: () => cm.undo() };
  const container = document.createElement('div');
  document.body.appendChild(container);
  // Mount each card's html into a [data-node-id] group (what the renderer does).
  for (const n of spec.nodes) {
    const group = document.createElement('div');
    group.setAttribute('data-node-id', n.id);
    group.appendChild(renderTree((model.getNode(n.id)!.getMetadata('html') as any).content));
    container.appendChild(group);
  }
  const api = { container, getModel: () => model, getEngine: () => engine, renderNow: () => {} };
  return { model, api, container };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

function erFixture() {
  return erDiagram({
    editable: true,
    entities: [
      { id: 'T', columns: [{ name: 'pk', type: 'int', pk: true }] },
      { id: 'FOO', name: 'Foo', columns: [{ name: 'a', type: 'int' }, { name: 'b', type: 'int', fk: true }] },
    ],
    relationships: [{ from: 'FOO.b', to: 'T.pk', id: 'e-b' }],
  }) as any;
}

async function commit(input: HTMLInputElement, value: string) {
  input.value = value;
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await tick();
}

describe('P2 — inline title rename', () => {
  it('double-clicking the header opens a prefilled input; Enter commits updateEntity({name})', async () => {
    const { model, api, container } = mount(erFixture());
    bindCardEditing(api as any);
    const head = container.querySelector('[data-node-id="FOO"] .axk-entity-head') as HTMLElement;
    head.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await tick();
    const input = container.querySelector('.axk-edit-input') as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.value).toBe('Foo');
    await commit(input, 'Widgets');
    expect((model.getNode('FOO')!.getMetadata('kitEntity') as any).name).toBe('Widgets');
    expect(container.querySelector('.axk-edit-input')).toBeNull(); // input removed
  });

  it('Escape cancels — the model is untouched', async () => {
    const { model, api, container } = mount(erFixture());
    bindCardEditing(api as any);
    const head = container.querySelector('[data-node-id="FOO"] .axk-entity-head') as HTMLElement;
    head.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await tick();
    const input = container.querySelector('.axk-edit-input') as HTMLInputElement;
    input.value = 'nope';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await tick();
    expect((model.getNode('FOO')!.getMetadata('kitEntity') as any).name).toBe('Foo');
    expect(container.querySelector('.axk-edit-input')).toBeNull();
  });
});

describe('P4 — column editing chrome', () => {
  it('double-clicking a column name renames it, keeping its port + edge', async () => {
    const { model, api, container } = mount(erFixture());
    bindCardEditing(api as any);
    const col = Array.from(container.querySelectorAll('[data-node-id="FOO"] .axk-col')).find((c) => c.textContent === 'b') as HTMLElement;
    col.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await tick();
    const input = container.querySelector('.axk-edit-input') as HTMLInputElement;
    expect(input.value).toBe('b');
    await commit(input, 'b2');
    const cols = (model.getNode('FOO')!.getMetadata('kitEntity') as any).columns;
    expect(cols[1].name).toBe('b2');
    expect(model.getNode('FOO')!.getPort('FOO__b__right__0')).toBeTruthy(); // stable id
    expect(model.getLink('e-b')!.sourcePortId).toBe('FOO__b__right__0');
  });

  it('clicking "add column" appends a column to the model', async () => {
    const { model, api, container } = mount(erFixture());
    bindCardEditing(api as any);
    const add = container.querySelector('[data-node-id="FOO"] .axk-entity-add') as HTMLElement;
    add.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await tick();
    const cols = (model.getNode('FOO')!.getMetadata('kitEntity') as any).columns;
    expect(cols).toHaveLength(3);
    expect(cols[2].name).toBe('new_column');
  });

  it('clicking a row × removes that column (and does NOT also select the row)', async () => {
    const { model, api, container } = mount(erFixture());
    bindRowInteractions(api as any); // both bound, like a real editable diagram
    const rowHandle = bindRowInteractions(api as any);
    bindCardEditing(api as any);
    const aRow = Array.from(container.querySelectorAll('[data-node-id="FOO"] .axk-row')).find((r) => r.textContent?.includes('a')) as HTMLElement;
    const del = aRow.querySelector('.axk-col-del') as HTMLElement;
    del.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await tick();
    const cols = (model.getNode('FOO')!.getMetadata('kitEntity') as any).columns;
    expect(cols.map((c: any) => c.name)).toEqual(['b']);
    // The delete click was claimed in capture — row selection never fired.
    expect(rowHandle.getSelected()).toBeNull();
  });
});

describe('P2/P4 — UML member editing', () => {
  it('double-click a member renames it; the add affordance appends to the right compartment', async () => {
    const spec = umlDiagram({
      editable: true,
      classes: [{ id: 'Shape', attributes: ['# x: float'], methods: ['+ area(): float'] }],
      relationships: [],
    }) as any;
    const { model, api, container } = mount(spec);
    bindCardEditing(api as any);
    const member = Array.from(container.querySelectorAll('[data-node-id="Shape"] .axk-member'))
      .find((m) => m.textContent?.includes('x: float')) as HTMLElement;
    member.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await tick();
    const input = container.querySelector('.axk-edit-input') as HTMLInputElement;
    expect(input.value).toBe('# x: float');
    await commit(input, '# x: double');
    expect((model.getNode('Shape')!.getMetadata('kitClass') as any).attributes[0]).toBe('# x: double');

    // The SECOND compartment's add affordance appends a method.
    const adds = container.querySelectorAll('[data-node-id="Shape"] .axk-uml-add');
    (adds[1] as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await tick();
    expect((model.getNode('Shape')!.getMetadata('kitClass') as any).methods).toHaveLength(2);
  });
});
