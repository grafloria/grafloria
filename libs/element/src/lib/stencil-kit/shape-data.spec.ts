/**
 * The properties panel, mounted for real (jsdom): select something, mutate the
 * inputs, and assert the COMMANDS dispatched, the MODEL mutated and the undo
 * stack restoring it. One suite per selection kind — plain node, kit card,
 * edge, multi — plus the garbage/clamp/kit edge cases the audit called out.
 */
import {
  CommandManager,
  DiagramModel,
  LinkModel,
  NodeModel,
  PortModel,
} from '@grafloria/engine';
import { bindShapeDataPanel } from './shape-data';

const flush = () => new Promise((r) => setTimeout(r, 0));

function harness(opts: { masters?: Record<string, any> } = {}) {
  const model = new DiagramModel('d');
  const eventBus = { emit: jest.fn() };
  const cm = new CommandManager({ diagram: model, eventBus } as any, eventBus as any);
  const engine = {
    commandManager: cm,
    templateRegistry: { get: (id: string) => opts.masters?.[id] },
  };
  const handlers: Record<string, (p: any) => void> = {};
  const api = {
    getEngine: () => engine,
    getModel: () => model,
    // The kit handles (erTable) listen for row selection on the instance's container.
    container: document.createElement('div'),
    on: (ev: string, h: (p: any) => void) => {
      handlers[ev] = h;
      return () => delete handlers[ev];
    },
  };
  const host = document.createElement('div');
  document.body.appendChild(host);
  const panel = bindShapeDataPanel(api as any, host);
  const fire = () => handlers['selection:change']?.({});
  return { model, cm, engine, api, host, panel, fire };
}

function addNode(model: DiagramModel, id: string, extra: Partial<Record<string, any>> = {}) {
  const node = new NodeModel({
    id,
    type: 'rect',
    position: { x: 40, y: 50 },
    size: { width: 120, height: 60, depth: 0 },
    ...extra,
  });
  model.addNode(node);
  return node;
}

function addLinkBetween(model: DiagramModel) {
  const a = addNode(model, 'la');
  a.addPort(new PortModel({ id: 'a-out', type: 'output', side: 'right' } as any));
  const b = addNode(model, 'lb');
  b.addPort(new PortModel({ id: 'b-in', type: 'input', side: 'left' } as any));
  const link = new LinkModel('a-out', 'b-in', 'smooth');
  model.addLink(link);
  return link;
}

const q = (host: HTMLElement, sel: string) => host.querySelector(sel) as HTMLElement | null;
const rows = (host: HTMLElement) => Array.from(host.querySelectorAll('.gf-sd-row')) as HTMLElement[];
const rowByLabel = (host: HTMLElement, label: string) =>
  rows(host).find((r) => q(r, '.gf-sd-label')?.textContent === label) ?? null;
const ctlOf = (row: HTMLElement | null) =>
  row?.querySelector('input, select') as HTMLInputElement | null;
const sections = (host: HTMLElement) =>
  Array.from(host.querySelectorAll('.gf-sd-section')).map((s) => s.textContent);
const setValue = (input: HTMLInputElement, value: string) => {
  input.value = value;
  input.dispatchEvent(new Event('change', { bubbles: true }));
};

afterEach(() => {
  document.body.innerHTML = '';
  document.getElementById('grafloria-shapedata-panel-styles')?.remove();
});

describe('shape-data panel — empty and legacy contracts', () => {
  it('nothing selected: the empty message, zero rows (the shape-data demo contract)', () => {
    const { host } = harness();
    expect(q(host, '.gf-sd-empty')).toBeTruthy();
    expect(rows(host).length).toBe(0);
  });

  it('dataSchema fields render below the new sections, and the FIRST .gf-sd-input is a dataSchema field', () => {
    const { model, host, fire } = harness({
      masters: {
        m1: { dataSchema: { properties: { label: { type: 'string', default: '' } } } },
      },
    });
    const node = addNode(model, 'n1');
    node.setMetadata('templateId', 'm1');
    node.setData('label', 'Approve?');
    model.selectNode(node);
    fire();

    expect(sections(host)).toEqual(['Shape', 'Size & Position', 'Format']);
    // The legacy selector contract: the first .gf-sd-input is the schema field.
    const first = q(host, '.gf-sd-input') as HTMLInputElement;
    expect(first?.value).toBe('Approve?');
    // The new controls use gf-sd-ctl, so they never shadow it.
    const shapeName = ctlOf(rowByLabel(host, 'Name'));
    expect(shapeName?.classList.contains('gf-sd-ctl')).toBe(true);
  });
});

describe('shape-data panel — one plain node', () => {
  it('shows Shape, Size & Position and Format for a node with NO dataSchema', () => {
    const { model, host, fire } = harness();
    const node = addNode(model, 'n1');
    model.selectNode(node);
    fire();

    expect(sections(host)).toEqual(['Shape', 'Size & Position', 'Format']);
    expect(host.textContent).not.toContain('This shape has no data fields');
    for (const label of ['Name', 'X', 'Y', 'W', 'H', 'Fill', 'Line', 'Line width', 'Dashed']) {
      expect(rowByLabel(host, label)).toBeTruthy();
    }
  });

  it('Name commits through SetNodeLabelCommand: model changes, one undo restores', async () => {
    const { model, cm, host, fire } = harness();
    const node = addNode(model, 'n1');
    node.setLabel('Before');
    model.selectNode(node);
    fire();

    setValue(ctlOf(rowByLabel(host, 'Name'))!, 'After');
    await flush();
    expect(node.getLabel()).toBe('After');

    await cm.undo();
    expect(node.getLabel()).toBe('Before');
  });

  it('X/Y commit through MoveNodeCommand — one undo entry per edit', async () => {
    const { model, cm, host, fire } = harness();
    const node = addNode(model, 'n1');
    model.selectNode(node);
    fire();

    setValue(ctlOf(rowByLabel(host, 'X'))!, '200');
    await flush();
    expect(node.position.x).toBe(200);
    expect(node.position.y).toBe(50);

    setValue(ctlOf(rowByLabel(host, 'Y'))!, '90');
    await flush();
    expect(node.position.y).toBe(90);

    await cm.undo(); // one Ctrl+Z, one edit
    expect(node.position).toMatchObject({ x: 200, y: 50 });
    await cm.undo();
    expect(node.position).toMatchObject({ x: 40, y: 50 });
  });

  it('W/H commit through ResizeNodeCommand and are undoable', async () => {
    const { model, cm, host, fire } = harness();
    const node = addNode(model, 'n1');
    model.selectNode(node);
    fire();

    setValue(ctlOf(rowByLabel(host, 'W'))!, '300');
    await flush();
    expect(node.size.width).toBe(300);
    await cm.undo();
    expect(node.size.width).toBe(120);
  });

  it('garbage in a numeric input reverts to the current value — no NaN write', async () => {
    const { model, host, fire } = harness();
    const node = addNode(model, 'n1');
    model.selectNode(node);
    fire();

    const x = ctlOf(rowByLabel(host, 'X'))!;
    setValue(x, 'not-a-number');
    await flush();
    expect(node.position.x).toBe(40); // untouched
    expect(x.value).toBe('40'); // and the input shows the truth again
  });

  it('W below the engine minimum is CLAMPED, not exploded', async () => {
    const { model, host, fire } = harness();
    const node = addNode(model, 'n1');
    node.setMetadata('sizing', { minWidth: 60, minHeight: 40 });
    model.selectNode(node);
    fire();

    setValue(ctlOf(rowByLabel(host, 'W'))!, '3');
    await flush();
    expect(node.size.width).toBe(60); // the node's own minimum wins

    setValue(ctlOf(rowByLabel(host, 'H'))!, '-20');
    await flush();
    expect(node.size.height).toBe(40);
  });

  it('W with no per-node minimum clamps to the gesture floor (16)', async () => {
    const { model, host, fire } = harness();
    const node = addNode(model, 'n1');
    model.selectNode(node);
    fire();
    setValue(ctlOf(rowByLabel(host, 'W'))!, '1');
    await flush();
    expect(node.size.width).toBe(16);
  });

  it('Fill commits through SetNodeStyleCommand and undo restores the previous colour', async () => {
    const { model, cm, host, fire } = harness();
    const node = addNode(model, 'n1');
    node.setStyle({ fill: '#112233' });
    model.selectNode(node);
    fire();

    const fill = ctlOf(rowByLabel(host, 'Fill'))!;
    expect(fill.value).toBe('#112233'); // seeded from the model
    setValue(fill, '#ff0000');
    await flush();
    expect(node.style.fill).toBe('#ff0000');

    await cm.undo();
    expect(node.style.fill).toBe('#112233');
  });

  it('Dashed toggles strokeDasharray on and off undoably', async () => {
    const { model, cm, host, fire } = harness();
    const node = addNode(model, 'n1');
    model.selectNode(node);
    fire();

    const box = ctlOf(rowByLabel(host, 'Dashed'))!;
    box.checked = true;
    box.dispatchEvent(new Event('change', { bubbles: true }));
    await flush();
    expect(node.style.strokeDasharray).toBe('6 4');

    await cm.undo();
    expect(node.style.strokeDasharray).toBeUndefined();
  });

  it('Corner radius shows for a rect silhouette and writes style.borderRadius', async () => {
    const { model, host, fire } = harness();
    const node = addNode(model, 'n1'); // no metadata.shape = rect by default
    model.selectNode(node);
    fire();

    setValue(ctlOf(rowByLabel(host, 'Corner radius'))!, '12');
    await flush();
    expect(node.style.borderRadius).toBe(12);
  });

  it('Corner radius is HIDDEN for a non-rect silhouette', () => {
    const { model, host, fire } = harness();
    const node = addNode(model, 'n1');
    node.setMetadata('shape', { type: 'diamond' });
    model.selectNode(node);
    fire();
    expect(rowByLabel(host, 'Corner radius')).toBeNull();
  });

  it('on a shape-config master (BPMN task) the radius edits metadata.shape — the key that paints', async () => {
    const { model, cm, host, fire } = harness();
    const node = addNode(model, 'n1');
    node.setMetadata('shape', { type: 'rect', fill: '#EEF2FF', cornerRadius: 8 });
    model.selectNode(node);
    fire();

    const radius = ctlOf(rowByLabel(host, 'Corner radius'))!;
    expect(radius.value).toBe('8');
    setValue(radius, '20');
    await flush();
    expect(node.getMetadata('shape').cornerRadius).toBe(20);
    expect(node.style.borderRadius).toBeUndefined(); // not the deferred-over key

    await cm.undo();
    expect(node.getMetadata('shape').cornerRadius).toBe(8);
  });
});

describe('shape-data panel — kit cards', () => {
  it('a kit card gets Size & Position but NO Format (its look belongs to the kit), and the Table section stays', () => {
    const { model, host, fire } = harness();
    const node = addNode(model, 't1');
    node.setMetadata('kitEntity', { name: 'Orders', columns: [{ name: 'id', type: 'int', pk: true }] });
    model.selectNode(node);
    fire();

    const secs = sections(host);
    expect(secs).toContain('Size & Position');
    expect(secs).not.toContain('Format');
    expect(secs).not.toContain('Shape'); // the kit's own Name row is the name editor
    expect(secs).toContain('Table');

    // The kit Name row is untouched: label "Name", input.gf-sd-input, seeded with the table name.
    const name = rowByLabel(host, 'Name');
    const input = name?.querySelector('input.gf-sd-input') as HTMLInputElement;
    expect(input?.value).toBe('Orders');
  });

  it('kit card sizes still commit through ResizeNodeCommand', async () => {
    const { model, host, fire } = harness();
    const node = addNode(model, 't1');
    node.setMetadata('kitEntity', { name: 'Orders', columns: [] });
    model.selectNode(node);
    fire();

    setValue(ctlOf(rowByLabel(host, 'W'))!, '260');
    await flush();
    expect(node.size.width).toBe(260);
  });
});

describe('shape-data panel — one selected edge', () => {
  it('shows Label, Line, Arrows and Route sections', () => {
    const { model, host, fire } = harness();
    const link = addLinkBetween(model);
    link.setState('selected');
    fire();
    expect(sections(host)).toEqual(['Label', 'Line', 'Arrows', 'Route']);
  });

  it('Label commits through SetLinkDisplayLabelCommand and is undoable', async () => {
    const { model, cm, host, fire } = harness();
    const link = addLinkBetween(model);
    link.setLabel('ships');
    link.setState('selected');
    fire();

    const text = ctlOf(rowByLabel(host, 'Text'))!;
    expect(text.value).toBe('ships');
    setValue(text, 'delivers');
    await flush();
    expect(link.getLabel()).toBe('delivers');
    await cm.undo();
    expect(link.getLabel()).toBe('ships');
  });

  it('Line colour / width / dash commit through UpdateLinkStyleCommand', async () => {
    const { model, cm, host, fire } = harness();
    const link = addLinkBetween(model);
    link.setState('selected');
    fire();

    setValue(ctlOf(rowByLabel(host, 'Colour'))!, '#00aa00');
    await flush();
    expect(link.style.stroke).toBe('#00aa00');

    setValue(ctlOf(rowByLabel(host, 'Width'))!, '5');
    await flush();
    expect(link.style.strokeWidth).toBe(5);

    const box = ctlOf(rowByLabel(host, 'Dashed'))!;
    box.checked = true;
    box.dispatchEvent(new Event('change', { bubbles: true }));
    await flush();
    expect(link.style.strokeDasharray).toBe('6 4');

    await cm.undo();
    await cm.undo();
    await cm.undo();
    expect(link.style.stroke).toBeUndefined();
    expect(link.style.strokeWidth).toBeUndefined();
    expect(link.style.strokeDasharray).toBeUndefined();
  });

  it('Arrows seed from what the user SEES (implicit end arrow) and write the marker vocabulary', async () => {
    const { model, cm, host, fire } = harness();
    const link = addLinkBetween(model);
    link.setState('selected');
    fire();

    const end = ctlOf(rowByLabel(host, 'End')) as unknown as HTMLSelectElement;
    expect(end.value).toBe('arrow'); // the renderer's implicit default
    const start = ctlOf(rowByLabel(host, 'Start')) as unknown as HTMLSelectElement;
    expect(start.value).toBe('none');

    setValue(end as any, 'crow-foot');
    await flush();
    expect(link.style.arrowHead).toMatchObject({ type: 'crow-foot', size: 10, filled: true });

    await cm.undo();
    expect(link.style.arrowHead).toBeUndefined();
  });

  it('Route commits through SetLinkPathTypeCommand and is undoable', async () => {
    const { model, cm, host, fire } = harness();
    const link = addLinkBetween(model);
    link.setState('selected');
    fire();

    setValue(ctlOf(rowByLabel(host, 'Path')) as any, 'orthogonal');
    await flush();
    expect(link.pathType).toBe('orthogonal');
    await cm.undo();
    expect(link.pathType).toBe('smooth');
  });
});

describe('shape-data panel — multi-selection', () => {
  it('shows "N shapes" and a Format section', () => {
    const { model, host, fire } = harness();
    const a = addNode(model, 'a');
    const b = addNode(model, 'b');
    model.addToSelection(a);
    model.addToSelection(b);
    fire();
    expect(host.textContent).toContain('2 shapes');
    expect(sections(host)).toEqual(['Format']);
  });

  it('a Format edit restyles ALL selected as ONE undoable batch', async () => {
    const { model, cm, host, fire } = harness();
    const a = addNode(model, 'a');
    const b = addNode(model, 'b');
    b.setStyle({ fill: '#b-was' as any });
    model.addToSelection(a);
    model.addToSelection(b);
    fire();

    setValue(ctlOf(rowByLabel(host, 'Fill'))!, '#00cc00');
    await flush();
    expect(a.style.fill).toBe('#00cc00');
    expect(b.style.fill).toBe('#00cc00');

    await cm.undo(); // ONE undo — the whole gesture
    expect(a.style.fill).toBeUndefined();
    expect(b.style.fill).toBe('#b-was');
  });

  it('a node + an edge restyle line colour together as one batch', async () => {
    const { model, cm, host, fire } = harness();
    const link = addLinkBetween(model);
    link.setState('selected');
    const n = addNode(model, 'n1');
    model.addToSelection(n);
    fire();

    expect(host.textContent).toContain('2 shapes');
    setValue(ctlOf(rowByLabel(host, 'Line'))!, '#123456');
    await flush();
    expect(n.style.stroke).toBe('#123456');
    expect(link.style.stroke).toBe('#123456');

    await cm.undo();
    expect(n.style.stroke).toBeUndefined();
    expect(link.style.stroke).toBeUndefined();
  });

  it('kit cards are EXCLUDED from a multi restyle — their shells stay transparent', async () => {
    const { model, host, fire } = harness();
    const plain = addNode(model, 'p');
    const kit = addNode(model, 'k');
    kit.setMetadata('kitEntity', { name: 'T', columns: [] });
    model.addToSelection(plain);
    model.addToSelection(kit);
    fire();

    setValue(ctlOf(rowByLabel(host, 'Fill'))!, '#ff00ff');
    await flush();
    expect(plain.style.fill).toBe('#ff00ff');
    expect(kit.style.fill).toBeUndefined();
  });
});
