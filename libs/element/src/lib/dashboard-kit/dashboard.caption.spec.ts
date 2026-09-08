/**
 * SECTION CAPTIONS (element 0.4.22) — the kit paints a section's header on the
 * slab overlay it already owns, reserves its pixels inside the frame, routes
 * its presses (band selects, action fires, pass-through reaches the content)
 * and persists it beside `layout` and `sizing`. Plan:
 * documentation/api-architecture/section-caption-plan.html.
 */
import { CommandManager, DiagramModel, DiagramSerializer, EventBus, NodeModel } from '@grafloria/engine';
import { resolveTool, type ToolHitContext, type ToolPointerEvent } from '@grafloria/renderer';
import { dashboard, type DashboardHandle, type DashboardOptions, type DashboardSpec, type DashboardWidgetSpec } from './dashboard';
import { fromDocument } from '../load';

function makeApi(model: DiagramModel) {
  const bus = new EventBus();
  const manager = new CommandManager({ diagram: model, eventBus: bus });
  const container = document.createElement('div');
  document.body.appendChild(container);
  const layer = document.createElement('div');
  layer.className = 'grafloria-html-layer';
  container.appendChild(layer);
  return {
    getModel: () => model,
    getEngine: () => ({ commandManager: manager, eventBus: bus }),
    container,
    render: () => undefined,
    renderNow: () => undefined,
    viewport: { fitToBounds: () => undefined, clientToWorld: (x: number, y: number) => ({ x, y }) },
  };
}

function mount(spec: DashboardSpec) {
  const model = new DiagramModel('dash');
  for (const n of spec.nodes) {
    const raw = n as { id: string; position: { x: number; y: number }; size: { width: number; height: number }; metadata: Record<string, unknown> };
    const node = new NodeModel({ id: raw.id, type: 'widget', position: { ...raw.position }, size: { ...raw.size, depth: 0 } });
    for (const [k, v] of Object.entries(raw.metadata)) node.setMetadata(k, v);
    model.addNode(node);
  }
  const api = makeApi(model);
  spec.finalize(api);
  return { model, api, handle: spec.handle as DashboardHandle };
}

type Caption = DashboardWidgetSpec['caption'];
const BOARD = (caption: Caption, extra: Partial<DashboardOptions> = {}, box: Partial<DashboardWidgetSpec> = {}) =>
  dashboard({
    columns: 12,
    width: 1200,
    height: 600,
    gap: 10,
    rowHeight: 34,
    ...extra,
    widgets: [
      {
        id: 'box',
        title: 'Report controls',
        span: 4,
        rows: 8,
        x: 0,
        y: 0,
        columns: 4,
        ...(caption !== undefined ? { caption } : {}),
        ...box,
        widgets: [
          { id: 'c1', kind: 'kpi', span: 4, rows: 1, x: 0, y: 0 },
          { id: 'c2', kind: 'kpi', span: 4, rows: 7, x: 0, y: 1 },
        ],
      },
      { id: 'free', kind: 'line', span: 8, rows: 8, x: 4, y: 0 },
    ],
  });

const slabOf = (api: { container: HTMLElement }) => api.container.querySelector('.axdb-slab[data-slab-id="box"]') as HTMLElement | null;
const bandOf = (api: { container: HTMLElement }) => slabOf(api)?.querySelector(':scope > .axdb-slab-h') as HTMLElement | null;
/** How far below the section's frame top its first child starts, px. */
const dropOf = (model: DiagramModel) => model.getNode('c1')!.position.y - model.getGroup('box')!.position.y;

/** A real press through the renderer's tool registry, exactly as the canvas dispatches one. */
function press(target: Element, world: { x: number; y: number }) {
  const ev = { type: 'down', world, screen: world, modifiers: {}, source: { target, clientX: world.x, clientY: world.y } } as unknown as ToolPointerEvent;
  const hit = { empty: true } as ToolHitContext;
  const tool = resolveTool(ev, hit);
  tool?.onPointerDown?.(ev, hit);
  return tool;
}
const inBand = (api: { container: HTMLElement }, model: DiagramModel) => {
  const g = model.getGroup('box')!;
  return { x: g.position.x + 40, y: g.position.y + 12 };
};

const mounted: DashboardHandle[] = [];
const up = (spec: DashboardSpec) => {
  const m = mount(spec);
  mounted.push(m.handle);
  return m;
};
afterEach(() => {
  for (const h of mounted.splice(0)) h.dispose();
  document.body.innerHTML = '';
});

describe('section captions — painting and reserving', () => {
  it('no caption: the slab paints no band and the children start at the frame top', () => {
    const { api, model } = up(BOARD(undefined));
    expect(slabOf(api)).toBeTruthy();
    expect(bandOf(api)).toBeNull();
    expect(dropOf(model)).toBeLessThan(1);
  });

  it('caption: true paints the title in a 28 px band and the children start below it', () => {
    const { api, model } = up(BOARD(true));
    const band = bandOf(api)!;
    expect(band).toBeTruthy();
    expect(band.querySelector('.axdb-slab-h-text')!.textContent).toBe('Report controls');
    expect(band.style.height).toBe('28px');
    expect(dropOf(model)).toBeGreaterThanOrEqual(28);
    expect(dropOf(model)).toBeLessThan(29);
    // the band is the section's accessible name
    expect(slabOf(api)!.getAttribute('aria-label')).toBe('Report controls');
  });

  it('a string caption is the text; an object carries subtitle, description and icon', () => {
    const { api } = up(BOARD('Q3 controls'));
    expect(bandOf(api)!.querySelector('.axdb-slab-h-text')!.textContent).toBe('Q3 controls');
    expect(bandOf(api)!.querySelector('.axdb-slab-h-text')!.getAttribute('title')).toBe('Q3 controls');
    const rich = up(BOARD({ text: 'Sales', subtitle: 'by region', description: 'Filters apply to every chart', icon: '📊' }));
    const band = bandOf(rich.api)!;
    expect(band.querySelector('.axdb-slab-h-icon')!.textContent).toBe('📊');
    expect(band.querySelector('.axdb-slab-h-sub')!.textContent).toBe('by region');
    expect(band.querySelector('.axdb-slab-h-info')!.getAttribute('title')).toBe('Filters apply to every chart');
    expect(band.style.height).toBe('44px');
    expect(dropOf(rich.model)).toBeGreaterThanOrEqual(44);
  });

  it("position 'tab' paints the band above the frame and reserves nothing inside it", () => {
    const { api, model } = up(BOARD({ position: 'tab' }));
    const band = bandOf(api)!;
    expect(band.classList.contains('axdb-slab-h--tab')).toBe(true);
    expect(band.style.top).toBe('-28px');
    expect(band.style.right).not.toBe('0px'); // sized to its text, not the frame (jsdom reads 'auto' back as '')
    expect(dropOf(model)).toBeLessThan(1);
  });

  it('align, valign, font, padding, margin, background and border land on the band', () => {
    const { api, model } = up(
      BOARD({
        align: 'center',
        valign: 'bottom',
        font: { size: 15, weight: 700, family: 'Georgia', color: '#123', transform: 'uppercase' },
        padding: [4, 12],
        margin: [6, 8],
        background: '#eee',
        border: '1px solid red',
      })
    );
    const band = bandOf(api)!;
    expect(band.classList.contains('axdb-slab-h--center')).toBe(true);
    expect(band.classList.contains('axdb-slab-h--vbottom')).toBe(true);
    const v = (n: string) => band.style.getPropertyValue(n);
    expect(v('--axdb-caption-font-size')).toBe('15px');
    expect(v('--axdb-caption-font-weight')).toBe('700');
    expect(v('--axdb-caption-font-family')).toBe('Georgia');
    expect(v('--axdb-caption-fg')).toBe('#123');
    expect(v('--axdb-caption-transform')).toBe('uppercase');
    expect(v('--axdb-caption-pad')).toBe('4px 12px');
    expect(v('--axdb-caption-bg')).toBe('#eee');
    expect(v('--axdb-caption-border')).toBe('1px solid red');
    // margin: the band sits 6 px down and 8 px in; the reserve grows by 2 × 6
    expect(band.style.top).toBe('6px');
    expect(band.style.left).toBe('8px');
    expect(band.style.right).toBe('8px');
    expect(dropOf(model)).toBeGreaterThanOrEqual(40);
  });

  it('a single-number padding or margin applies on every side', () => {
    const { api } = up(BOARD({ padding: 6, margin: 3 }));
    const band = bandOf(api)!;
    expect(band.style.getPropertyValue('--axdb-caption-pad')).toBe('6px 6px');
    expect(band.style.top).toBe('3px');
    expect(band.style.left).toBe('3px');
  });

  it("show: 'design' is neither painted nor reserved under static; 'hover' overlays without reserving", () => {
    const { api, model, handle } = up(BOARD({ show: 'design' }));
    expect(bandOf(api)).toBeTruthy();
    expect(dropOf(model)).toBeGreaterThanOrEqual(28);
    handle.setStatic(true);
    expect(bandOf(api)).toBeNull();
    expect(dropOf(model)).toBeLessThan(1);
    handle.setStatic(false);
    expect(bandOf(api)).toBeTruthy();
    expect(dropOf(model)).toBeGreaterThanOrEqual(28);
    const hover = up(BOARD({ show: 'hover' }));
    expect(bandOf(hover.api)!.classList.contains('axdb-slab-h--hover')).toBe(true);
    expect(dropOf(hover.model)).toBeLessThan(1);
  });

  it('a section under 90 px steps the band down to 22 px and reserves that', () => {
    // Grow: 2 rows × 34 px + gap = 78 px of section
    const { api, model } = up(BOARD(true, { sizing: 'grow' }, { rows: 2 }));
    const band = bandOf(api)!;
    expect(band.classList.contains('axdb-slab-h--tight')).toBe(true);
    expect(band.style.height).toBe('22px');
    expect(dropOf(model)).toBeGreaterThanOrEqual(22);
    expect(dropOf(model)).toBeLessThan(23);
  });

  it('the band mirrors on RTL and stays painted, inert, under static', () => {
    const { api, handle } = up(BOARD(true, { rtl: true }));
    expect(bandOf(api)!.getAttribute('dir')).toBe('rtl');
    handle.setStatic(true);
    expect(bandOf(api)).toBeTruthy();
    expect(slabOf(api)!.classList.contains('axdb-slab--static')).toBe(true);
  });

  it('a long text gets an ellipsis class and its full text in the tooltip', () => {
    const long = 'A caption far longer than any twenty-eight pixel band could ever hold on a narrow section';
    const { api } = up(BOARD(long));
    const t = bandOf(api)!.querySelector('.axdb-slab-h-text')!;
    expect(t.textContent).toBe(long);
    expect(t.getAttribute('title')).toBe(long);
  });
});

describe('section captions — actions, presses and pass-through', () => {
  it('actions paint buttons at the end; a press fires onCaptionAction and never selects', () => {
    const onCaptionAction = jest.fn();
    const { api, model, handle } = up(
      BOARD(
        { actions: [{ id: 'max', label: 'Maximize', icon: '⤢' }, { id: 'menu', label: 'More', disabled: true }] },
        { onCaptionAction }
      )
    );
    const band = bandOf(api)!;
    const btns = band.querySelectorAll('.axdb-slab-h-actions > .axdb-slab-h-action');
    expect(btns.length).toBe(2);
    expect(btns[0].getAttribute('data-action')).toBe('max');
    expect(btns[0].getAttribute('aria-label')).toBe('Maximize');
    expect(btns[0].getAttribute('title')).toBe('Maximize');
    expect(btns[0].textContent).toBe('⤢');
    expect((btns[1] as HTMLButtonElement).disabled).toBe(true);
    press(btns[0], inBand(api, model));
    expect(onCaptionAction).toHaveBeenCalledWith('box', 'max', 'main');
    expect(handle.getSelectedWidget()).toBeUndefined();
    press(btns[1], inBand(api, model));
    expect(onCaptionAction).toHaveBeenCalledTimes(1);
  });

  it('a press on the band selects the section (and onSelect hears it)', () => {
    const onSelect = jest.fn();
    const { api, model, handle } = up(BOARD(true, { onSelect }));
    press(bandOf(api)!.querySelector('.axdb-slab-h-text')!, inBand(api, model));
    expect(handle.getSelectedWidget()).toBe('box');
    expect(onSelect).toHaveBeenLastCalledWith('box', 'main');
    expect(slabOf(api)!.classList.contains('axdb-slab--selected')).toBe(true);
  });

  it("a press on a 'tab' band above the frame still selects the section", () => {
    const { api, model, handle } = up(BOARD({ position: 'tab' }));
    const g = model.getGroup('box')!;
    press(bandOf(api)!, { x: g.position.x + 40, y: g.position.y - 14 });
    expect(handle.getSelectedWidget()).toBe('box');
  });

  it('a press on a pass-through element reaches the content: no tool claims it, nothing selects', () => {
    const { api, model, handle } = up(
      BOARD(true, {
        renderCaption: (_w, host) => {
          const i = document.createElement('input');
          i.className = 'mine';
          host.appendChild(i);
          const s = document.createElement('span');
          s.className = 'plain';
          s.textContent = 'x';
          host.appendChild(s);
        },
      })
    );
    const band = bandOf(api)!;
    expect(press(band.querySelector('input.mine')!, inBand(api, model))).toBeUndefined();
    expect(handle.getSelectedWidget()).toBeUndefined();
    // a plain element inside the band is the band
    press(band.querySelector('span.plain')!, inBand(api, model));
    expect(handle.getSelectedWidget()).toBe('box');
  });

  it('passThrough narrows or widens the rule', () => {
    const { api, model, handle } = up(
      BOARD(
        { passThrough: '.mine' },
        {
          renderCaption: (_w, host) => {
            const b = document.createElement('button');
            b.textContent = 'not mine';
            host.appendChild(b);
            const s = document.createElement('span');
            s.className = 'mine';
            host.appendChild(s);
          },
        }
      )
    );
    const band = bandOf(api)!;
    expect(press(band.querySelector('span.mine')!, inBand(api, model))).toBeUndefined();
    expect(handle.getSelectedWidget()).toBeUndefined();
    press(band.querySelector('button')!, inBand(api, model));
    expect(handle.getSelectedWidget()).toBe('box');
  });

  it('renderCaption paints into the band with the widget spec; className lands on the band', () => {
    const renderCaption = jest.fn((w: DashboardWidgetSpec, host: HTMLElement) => {
      host.textContent = `custom:${w.id}`;
    });
    const { api } = up(BOARD({ className: 'brand' }, { renderCaption }));
    const band = bandOf(api)!;
    expect(band.classList.contains('brand')).toBe(true);
    expect(renderCaption).toHaveBeenCalledTimes(1);
    expect(renderCaption.mock.calls[0][0].id).toBe('box');
    expect(band.textContent).toBe('custom:box');
  });
});

describe('section captions — API and persistence', () => {
  const settle = () => new Promise<void>((r) => setTimeout(r, 0));

  it('setCaption changes the band live, reports through getCaption and toJSON, and undoes', async () => {
    const { api, model, handle } = up(BOARD(undefined));
    const cm = api.getEngine().commandManager;
    expect(handle.getCaption('box')).toBeUndefined();
    expect(handle.setCaption('box', 'Renamed')).toBe(true);
    await settle();
    expect(bandOf(api)!.querySelector('.axdb-slab-h-text')!.textContent).toBe('Renamed');
    expect(dropOf(model)).toBeGreaterThanOrEqual(28);
    expect(handle.getCaption('box')).toBe('Renamed');
    expect(handle.toJSON().views[0].widgets.find((w) => w.id === 'box')!.caption).toBe('Renamed');
    expect(handle.setCaption('box', { text: 'Rich', subtitle: 'sub' })).toBe(true);
    expect(bandOf(api)!.style.height).toBe('44px');
    await settle();
    await cm.undo();
    await settle();
    expect(bandOf(api)!.querySelector('.axdb-slab-h-text')!.textContent).toBe('Renamed');
    await cm.undo();
    await settle();
    expect(bandOf(api)).toBeNull();
    expect(dropOf(model)).toBeLessThan(1);
    expect(handle.getCaption('box')).toBeUndefined();
    await cm.redo();
    await settle();
    expect(bandOf(api)!.querySelector('.axdb-slab-h-text')!.textContent).toBe('Renamed');
    // not a section: refused
    expect(handle.setCaption('free', 'x')).toBe(false);
    expect(handle.setCaption('nope', 'x')).toBe(false);
  });

  it('setCaption(false) removes the band and gives the rows back', () => {
    const { api, model, handle } = up(BOARD(true));
    expect(handle.setCaption('box', false)).toBe(true);
    expect(bandOf(api)).toBeNull();
    expect(dropOf(model)).toBeLessThan(1);
    expect(handle.getCaption('box')).toBe(false);
  });

  it('the caption survives toJSON → dashboard() and a serialized document (fromDocument)', () => {
    const cap = { text: 'Sales', subtitle: 'by region', actions: [{ id: 'max', label: 'Maximize' }], align: 'center' as const };
    const first = up(BOARD(cap));
    const snap = first.handle.toJSON();
    expect(snap.views[0].widgets.find((w) => w.id === 'box')!.caption).toEqual(cap);
    const second = up(dashboard({ ...snap }));
    expect(bandOf(second.api)!.querySelector('.axdb-slab-h-sub')!.textContent).toBe('by region');
    expect(bandOf(second.api)!.classList.contains('axdb-slab-h--center')).toBe(true);
    const json = JSON.stringify(new DiagramSerializer().serialize(first.model));
    const loaded = fromDocument(json);
    const api = makeApi(loaded.model as DiagramModel);
    loaded.finalize(api);
    mounted.push(loaded.handle as DashboardHandle);
    expect(loaded.handle!.getCaption('box')).toEqual(cap);
    expect(bandOf(api)!.querySelector('.axdb-slab-h-text')!.textContent).toBe('Sales');
    expect(bandOf(api)!.querySelector('.axdb-slab-h-actions > .axdb-slab-h-action')).toBeTruthy();
    expect(dropOf(loaded.model as DiagramModel)).toBeGreaterThanOrEqual(44);
  });

  it('the band survives a layout switch of the section (grid → split → grid)', () => {
    const { api, model, handle } = up(BOARD(true));
    handle.setLayout('split', 'box');
    expect(bandOf(api)!.querySelector('.axdb-slab-h-text')!.textContent).toBe('Report controls');
    expect(dropOf(model)).toBeGreaterThanOrEqual(28);
    handle.setLayout('grid', 'box');
    expect(bandOf(api)).toBeTruthy();
    expect(dropOf(model)).toBeGreaterThanOrEqual(28);
  });

  it('a nested section two levels down paints its own band inside its parent section', () => {
    const { api } = up(
      dashboard({
        columns: 12,
        width: 1200,
        height: 600,
        rowHeight: 34,
        widgets: [
          {
            id: 'outer',
            title: 'Outer',
            caption: true,
            span: 12,
            rows: 10,
            x: 0,
            y: 0,
            widgets: [
              { id: 'inner', title: 'Inner', caption: { text: 'Inner section' }, span: 6, rows: 6, x: 0, y: 0, widgets: [{ id: 'k', kind: 'kpi', span: 6, rows: 2, x: 0, y: 0 }] },
              { id: 'p', kind: 'kpi', span: 6, rows: 6, x: 6, y: 0 },
            ],
          },
        ],
      })
    );
    const outer = api.container.querySelector('.axdb-slab[data-slab-id="outer"] > .axdb-slab-h .axdb-slab-h-text')!;
    const inner = api.container.querySelector('.axdb-slab[data-slab-id="inner"] > .axdb-slab-h .axdb-slab-h-text')!;
    expect(outer.textContent).toBe('Outer');
    expect(inner.textContent).toBe('Inner section');
  });
});
