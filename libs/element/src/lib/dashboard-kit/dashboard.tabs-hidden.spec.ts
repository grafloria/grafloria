/**
 * A TAB CONTAINER WITH NO STRIP — `tabs: { hidden: true }`.
 *
 * DevExpress's tab container has ShowCaption="false": no tab headers are drawn,
 * the pages fill the container, and the host switches pages from its own code.
 * The kit could not say that: `tabStripReserve` floored the strip at 18 px, so
 * `height: 0` still reserved a band and hiding the strip with CSS left an empty
 * gap above the pages. Asked for by Quantia's importer and read-only viewer.
 *
 *   1. no strip is RESERVED — the pages fill the frame, less `inset`
 *   2. no strip is ON SCREEN — no element, so no paint, tab stop or pointer target
 *   3. page switching still works from code (activateTab / getActiveTab / onTabChange)
 *   4. it round-trips (toJSON, a saved document)
 *   5. in edit mode a release over the container goes to the ACTIVE page
 *   6. unset, nothing changes — the visible strip keeps its 18 px floor
 */
import { CommandManager, DiagramModel, DiagramSerializer, EventBus, NodeModel } from '@grafloria/engine';
import { dashboard, type DashboardHandle, type DashboardSpec, type DashboardWidgetSpec } from './dashboard';
import { tabStripReserve, type TabsOptions } from './tabs';
import type { CanvasTool, ToolPointerEvent } from '@grafloria/renderer';
import { fromDocument } from '../load';

jest.mock('@grafloria/renderer', () => {
  const actual = jest.requireActual('@grafloria/renderer');
  return {
    ...actual,
    registerTool: (t: unknown) => {
      const g = globalThis as unknown as { __axdbTools?: unknown[] };
      g.__axdbTools = [...(g.__axdbTools ?? []), t];
      return actual.registerTool(t);
    },
  };
});
const toolOf = (groupId: string): CanvasTool => {
  const g = globalThis as unknown as { __axdbTools?: CanvasTool[] };
  const t = [...(g.__axdbTools ?? [])].reverse().find((x) => x.id.startsWith(`dashboard-grid:${groupId}:`));
  if (!t) throw new Error(`no binder tool registered for ${groupId}`);
  return t;
};
const tev = (type: ToolPointerEvent['type'], x: number, y: number): ToolPointerEvent => ({
  type,
  world: { x, y },
  screen: { x, y },
  modifiers: { shift: false, ctrl: false, alt: false, meta: false },
});

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

const PAGE = (id: string, title: string, kid: string): DashboardWidgetSpec => ({
  id,
  title,
  columns: 6,
  widgets: [{ id: kid, kind: 'kpi', span: 6, rows: 2, x: 0, y: 0 }],
});

const BOARD = (tabs: TabsOptions | undefined, extra: Record<string, unknown> = {}) =>
  dashboard({
    columns: 12,
    width: 1200,
    height: 600,
    gap: 10,
    rowHeight: 60,
    ...extra,
    widgets: [
      { id: 'free', kind: 'kpi', span: 2, rows: 1, x: 0, y: 0 },
      {
        id: 'panel',
        title: 'Side panel',
        span: 6,
        rows: 6,
        x: 6,
        y: 0,
        layout: 'tabs',
        ...(tabs ? { tabs } : {}),
        widgets: [PAGE('p-one', 'Filters', 'k-one'), PAGE('p-two', 'Alerts', 'k-two'), PAGE('p-three', 'Notes', 'k-three')],
      },
    ],
  } as never);

const frameOf = (model: DiagramModel, id: string) => {
  const g = model.getGroup(id)!;
  return { x: g.position.x, y: g.position.y, w: g.size!.width, h: g.size!.height };
};
const stripEl = (api: { container: HTMLElement }) => api.container.querySelector('[data-tabs-id="panel"]') as HTMLElement | null;
const PARKED = -10000;
const onCanvas = (model: DiagramModel, ids: string[]) => ids.filter((id) => (model.getNode(id)?.position.x ?? PARKED) > PARKED);
const settle = () => new Promise<void>((r) => setTimeout(r, 0));

describe('a tab container with its strip hidden', () => {
  it('tabStripReserve: hidden reserves nothing; a visible strip keeps its 18 px floor', () => {
    expect(tabStripReserve({ hidden: true }, 3)).toBe(0);
    expect(tabStripReserve({ hidden: true, height: 40 }, 3)).toBe(0);
    expect(tabStripReserve(undefined, 3)).toBe(30);
    expect(tabStripReserve({ height: 0 }, 3)).toBe(18);
    expect(tabStripReserve({ hidden: false, height: 24 }, 3)).toBe(24);
  });

  for (const [name, extra] of [
    ['an editable board, LTR', {}],
    ['an editable board, RTL', { rtl: true }],
    ['a static board, LTR', { static: true }],
    ['a static board, RTL', { static: true, rtl: true }],
  ] as const) {
    it(`no band is reserved: the page's top edge is the frame's top plus the inset (${name})`, () => {
      const { model } = up(BOARD({ hidden: true }, extra));
      const f = frameOf(model, 'panel');
      const p = frameOf(model, 'p-one');
      expect([p.x, p.y, p.w, p.h]).toEqual([f.x + 8, f.y + 8, f.w - 16, f.h - 16]); // the default inset, all four sides
    });
  }

  it('inset 0: the page IS the frame', () => {
    const { model } = up(BOARD({ hidden: true, inset: 0 }));
    expect(frameOf(model, 'p-one')).toEqual(frameOf(model, 'panel'));
  });

  it('no strip is on screen: no element at all, so nothing painted, no tab stop, nothing to press', () => {
    const { api } = up(BOARD({ hidden: true }));
    expect(stripEl(api)).toBeNull();
    expect(api.container.querySelectorAll('.axdb-tab, [role="tablist"], [role="tab"]').length).toBe(0);
  });

  it('pages still switch from code: activateTab shows the page, getActiveTab answers, onTabChange fires', () => {
    const onTabChange = jest.fn();
    const { model, handle } = up(BOARD({ hidden: true }, { onTabChange }));
    expect(handle.getActiveTab('panel')).toBe('p-one');
    expect(onCanvas(model, ['k-one', 'k-two', 'k-three'])).toEqual(['k-one']);
    expect(handle.activateTab('panel', 'p-three')).toBe(true);
    expect(handle.getActiveTab('panel')).toBe('p-three');
    expect(onCanvas(model, ['k-one', 'k-two', 'k-three'])).toEqual(['k-three']);
    expect(onTabChange).toHaveBeenCalledWith('panel', 'p-three', 'main');
    // the page that came in sits where the first one did: no band under a hidden strip either
    const f = frameOf(model, 'panel');
    expect(frameOf(model, 'p-three').y).toBe(f.y + 8);
    expect(handle.activateTab('panel', 'nope')).toBe(false);
  });

  it('round trip: toJSON keeps `hidden` and the active page; a board built from it, and a saved document, come back hidden on that page', () => {
    const first = up(BOARD({ hidden: true }));
    first.handle.activateTab('panel', 'p-two');
    const snap = first.handle.toJSON();
    const panel = snap.views[0].widgets.find((w) => w.id === 'panel')!;
    expect(panel.tabs?.hidden).toBe(true);
    expect(panel.active).toBe('p-two');

    const second = up(dashboard({ ...snap }));
    expect(second.handle.getActiveTab('panel')).toBe('p-two');
    expect(stripEl(second.api)).toBeNull();
    expect(frameOf(second.model, 'p-two').y).toBe(frameOf(second.model, 'panel').y + 8);

    const json = JSON.stringify(new DiagramSerializer().serialize(first.model));
    const loaded = fromDocument(json);
    const api = makeApi(loaded.model as DiagramModel);
    loaded.finalize(api);
    mounted.push(loaded.handle as DashboardHandle);
    expect(loaded.handle!.getActiveTab('panel')).toBe('p-two');
    expect(stripEl(api)).toBeNull();
    const lm = loaded.model as DiagramModel;
    expect(frameOf(lm, 'p-two').y).toBe(frameOf(lm, 'panel').y + 8);
  });

  it('edit mode: a widget released over the container — even where the strip would have been — goes to the ACTIVE page, and no tab is born', async () => {
    const { model, handle } = up(BOARD({ hidden: true }, { sizing: 'grow' }));
    handle.activateTab('panel', 'p-two');
    const pathOf = (id: string): string | null => {
      const walk = (ws: Array<{ id: string; widgets?: unknown[] }> | undefined, path: string[]): string[] | null => {
        for (const w of ws ?? []) {
          if (w.id === id) return [...path, w.id];
          const r = walk(w.widgets as Array<{ id: string; widgets?: unknown[] }> | undefined, [...path, w.id]);
          if (r) return r;
        }
        return null;
      };
      for (const v of handle.toJSON().views) {
        const r = walk(v.widgets as Array<{ id: string; widgets?: unknown[] }>, [v.id]);
        if (r) return r.join(' > ');
      }
      return null;
    };
    expect(pathOf('free')).toBe('main > free');
    const f = frameOf(model, 'panel');
    const free = model.getNode('free')!;
    const from = { x: free.position.x + 20, y: free.position.y + 20 };
    const to = { x: f.x + f.w / 2, y: f.y + 14 }; // inside the rows a visible strip would occupy
    const tool = toolOf('main');
    const hit = { node: free, empty: false };
    tool.onPointerDown?.(tev('down', from.x, from.y), hit);
    tool.onPointerMove?.(tev('move', from.x + 30, from.y + 10), hit);
    tool.onPointerMove?.(tev('move', to.x - 1, to.y), hit);
    tool.onPointerMove?.(tev('move', to.x, to.y), hit);
    tool.onPointerUp?.(tev('up', to.x, to.y), hit);
    await settle();
    expect(pathOf('free')).toBe('main > panel > p-two > free');
    const pages = handle.toJSON().views[0].widgets.find((w) => w.id === 'panel')!.widgets!.map((p) => p.id);
    expect(pages).toEqual(['p-one', 'p-two', 'p-three']);
  });

  it('unset, a container measures and paints as before: the strip is there and the page starts below it', () => {
    const { api, model } = up(BOARD(undefined));
    const f = frameOf(model, 'panel');
    expect(frameOf(model, 'p-one').y).toBe(f.y + 30 + 8);
    expect(stripEl(api)).not.toBeNull();
    expect(api.container.querySelectorAll('.axdb-tab').length).toBe(3);
    const floored = up(BOARD({ height: 0 }));
    expect(frameOf(floored.model, 'p-one').y).toBe(frameOf(floored.model, 'panel').y + 18 + 8);
  });
});
