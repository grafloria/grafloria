/**
 * TAB CONTAINERS (element 0.4.27) — `layout: 'tabs'` makes every child that
 * carries `widgets` a PAGE: one visible at a time, a strip of tabs across the
 * top, the active page persisted. DevExpress ships this as its Tab Container.
 */
import { CommandManager, DiagramModel, DiagramSerializer, EventBus, NodeModel } from '@grafloria/engine';
import { dashboard, type DashboardHandle, type DashboardSpec, type DashboardWidgetSpec } from './dashboard';
import type { CanvasTool, ToolPointerEvent } from '@grafloria/renderer';

// The binder claims widget gestures through the renderer's page-global tool
// registry; there is no renderer here to route pointer events to it, so the
// registration is wrapped and the tool driven directly.
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
const splitToolOf = (groupId: string): CanvasTool => {
  const g = globalThis as unknown as { __axdbTools?: CanvasTool[] };
  const t = [...(g.__axdbTools ?? [])].reverse().find((x) => x.id.startsWith(`dashboard-split:${groupId}:`));
  if (!t) throw new Error(`no split tool registered for ${groupId}`);
  return t;
};
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

import { fromDocument } from '../load';
import { splitLeaves, type SplitNode } from './split-layout';
import { SPLIT_TREE_KEY } from './split-binder';

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

const PAGE = (id: string, title: string, kid: string): DashboardWidgetSpec => ({
  id,
  title,
  columns: 6,
  widgets: [{ id: kid, kind: 'kpi', span: 6, rows: 4, x: 0, y: 0 }],
});

const BOARD = (active?: string, onTabChange?: (c: string, p: string, v: string) => void) =>
  dashboard({
    columns: 12,
    width: 1200,
    height: 600,
    gap: 10,
    rowHeight: 60,
    ...(onTabChange ? { onTabChange } : {}),
    widgets: [
      { id: 'free', kind: 'line', span: 6, rows: 4, x: 0, y: 0 },
      {
        id: 'panel',
        title: 'Side panel',
        span: 6,
        rows: 4,
        x: 6,
        y: 0,
        layout: 'tabs',
        ...(active ? { active } : {}),
        widgets: [PAGE('p-one', 'Filters', 'k-one'), PAGE('p-two', 'Alerts', 'k-two'), PAGE('p-three', 'Notes', 'k-three')],
      },
    ],
  });

const PARKED = -10000;
const onCanvas = (model: DiagramModel, ids: string[]) => ids.filter((id) => (model.getNode(id)?.position.x ?? PARKED) > PARKED);
const strip = (api: { container: HTMLElement }) => api.container.querySelector('.axdb-tabs[data-tabs-id="panel"]') as HTMLElement | null;
const tabs = (api: { container: HTMLElement }) =>
  Array.from(strip(api)?.querySelectorAll('.axdb-tab') ?? []).map((t) => ({
    id: t.getAttribute('data-tab-id'),
    label: t.textContent,
    on: t.getAttribute('aria-selected') === 'true',
  }));

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

describe('tab containers', () => {
  it('mounts one page at a time, with a tab per page', () => {
    const { api, model, handle } = up(BOARD());
    expect(tabs(api).map((t) => t.label)).toEqual(['Filters', 'Alerts', 'Notes']);
    expect(tabs(api).filter((t) => t.on).map((t) => t.id)).toEqual(['p-one']);
    expect(handle.getActiveTab('panel')).toBe('p-one');
    // only the active page's widget is on the canvas; the rest are parked
    expect(onCanvas(model, ['k-one', 'k-two', 'k-three'])).toEqual(['k-one']);
    expect(strip(api)!.getAttribute('role')).toBe('tablist');
  });

  it('honours an authored `active`, and falls back to the first page when it is not one', () => {
    expect(up(BOARD('p-three')).handle.getActiveTab('panel')).toBe('p-three');
    expect(up(BOARD('nope')).handle.getActiveTab('panel')).toBe('p-one');
  });

  it('a click on a tab switches the page and reports it', () => {
    const onTabChange = jest.fn();
    const { api, model, handle } = up(BOARD(undefined, onTabChange));
    (strip(api)!.querySelector('.axdb-tab[data-tab-id="p-two"]') as HTMLButtonElement).click();
    expect(handle.getActiveTab('panel')).toBe('p-two');
    expect(onCanvas(model, ['k-one', 'k-two', 'k-three'])).toEqual(['k-two']);
    expect(tabs(api).filter((t) => t.on).map((t) => t.id)).toEqual(['p-two']);
    expect(onTabChange).toHaveBeenCalledWith('panel', 'p-two', 'main');
    // …and the same page again is a no-op, not a second report
    (strip(api)!.querySelector('.axdb-tab[data-tab-id="p-two"]') as HTMLButtonElement).click();
    expect(onTabChange).toHaveBeenCalledTimes(1);
  });

  it('activateTab drives it from code and refuses what is not a page', () => {
    const { model, handle } = up(BOARD());
    expect(handle.activateTab('panel', 'p-three')).toBe(true);
    expect(onCanvas(model, ['k-one', 'k-two', 'k-three'])).toEqual(['k-three']);
    expect(handle.activateTab('panel', 'k-one')).toBe(false); // a widget, not a page
    expect(handle.activateTab('panel', 'nope')).toBe(false);
    expect(handle.activateTab('free', 'p-one')).toBe(false); // not a tab container
    expect(handle.getActiveTab('panel')).toBe('p-three');
    expect(handle.getActiveTab('free')).toBeUndefined();
  });

  it('the page showing survives toJSON → dashboard() and a serialized document', () => {
    const first = up(BOARD());
    first.handle.activateTab('panel', 'p-two');
    const snap = first.handle.toJSON();
    const panel = snap.views[0].widgets.find((w) => w.id === 'panel')!;
    expect(panel.layout).toBe('tabs');
    expect(panel.active).toBe('p-two');
    expect(panel.widgets?.map((p) => p.id)).toEqual(['p-one', 'p-two', 'p-three']);

    const second = up(dashboard({ ...snap }));
    expect(second.handle.getActiveTab('panel')).toBe('p-two');
    expect(onCanvas(second.model, ['k-one', 'k-two', 'k-three'])).toEqual(['k-two']);

    const json = JSON.stringify(new DiagramSerializer().serialize(first.model));
    const loaded = fromDocument(json);
    const api = makeApi(loaded.model as DiagramModel);
    loaded.finalize(api);
    mounted.push(loaded.handle as DashboardHandle);
    expect(loaded.handle!.getActiveTab('panel')).toBe('p-two');
    expect(loaded.handle!.getLayout('panel')).toBe('tabs');
  });

  it('the strip is one tab stop: only the active tab is reachable by Tab', () => {
    const { api } = up(BOARD('p-two'));
    const stops = Array.from(strip(api)!.querySelectorAll('.axdb-tab')).map((t) => (t as HTMLButtonElement).tabIndex);
    expect(stops).toEqual([-1, 0, -1]);
  });

  it('a plain widget among the pages becomes a page of its own', () => {
    const { api, model, handle } = up(
      dashboard({
        columns: 12,
        width: 1200,
        height: 600,
        rowHeight: 60,
        widgets: [
          {
            id: 'panel',
            title: 'Mixed',
            span: 12,
            rows: 4,
            x: 0,
            y: 0,
            layout: 'tabs',
            widgets: [PAGE('p-one', 'Filters', 'k-one'), { id: 'loose', kind: 'kpi', title: 'Loose', span: 6, rows: 4 }],
          },
        ],
      })
    );
    // it gets a tab of its own, named by its title…
    expect(tabs(api).map((t) => t.label)).toEqual(['Filters', 'Loose']);
    // …and it is laid out like any page instead of being stranded at the
    // board origin at its placeholder size, which is what used to happen
    expect(handle.activateTab('panel', 'loose__page')).toBe(true);
    const w = model.getNode('loose')!;
    expect(w.position.x).toBeGreaterThan(PARKED);
    expect(w.size!.width).toBeGreaterThan(200);
  });

  it('a wrapped plain child keeps the authored order among real pages', () => {
    const { api } = up(
      dashboard({
        columns: 12,
        width: 1200,
        height: 600,
        rowHeight: 60,
        widgets: [
          {
            id: 'panel',
            title: 'Mixed',
            span: 12,
            rows: 4,
            x: 0,
            y: 0,
            layout: 'tabs',
            // the PLAIN child is declared FIRST, and is wrapped as `loose__page`
            widgets: [{ id: 'loose', kind: 'kpi', title: 'Loose', span: 6, rows: 4 }, PAGE('p-one', 'Filters', 'k-one')],
          },
        ],
      })
    );
    expect(tabs(api).map((t) => t.label)).toEqual(['Loose', 'Filters']);
  });

  it('a tab container whose children are ALL plain widgets still works', () => {
    const { api, model } = up(
      dashboard({
        columns: 12,
        width: 1200,
        height: 600,
        rowHeight: 60,
        widgets: [
          { id: 'panel', title: 'All plain', span: 12, rows: 4, x: 0, y: 0, layout: 'tabs', widgets: [
            { id: 'w1', kind: 'kpi', title: 'One', span: 12, rows: 4 },
            { id: 'w2', kind: 'kpi', title: 'Two', span: 12, rows: 4 },
          ] },
        ],
      })
    );
    expect(tabs(api).map((t) => t.label)).toEqual(['One', 'Two']);
    expect(model.getNode('w1')!.size!.width).toBeGreaterThan(200);
  });

  it('the tabs come from LIVE membership, so a page that leaves takes its tab with it', () => {
    const { api, model, handle } = up(BOARD());
    expect(tabs(api).map((t) => t.label)).toEqual(['Filters', 'Alerts', 'Notes']);
    // tear p-two out of the container the way a drop on the parent board does
    model.getGroup('panel')!.removeMember('p-two');
    expect(tabs(api).map((t) => t.label)).toEqual(['Filters', 'Notes']);
    expect(handle.getActiveTab('panel')).toBe('p-one');
  });

  it('a DRAG on a tab is not a click: the page does not switch', () => {
    const { api, handle } = up(BOARD());
    const tab = strip(api)!.querySelector('.axdb-tab[data-tab-id="p-three"]') as HTMLElement;
    const at = (el: HTMLElement, type: string, x: number) =>
      el.dispatchEvent(
        Object.assign(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: 10 }), { pointerId: 1 })
      );
    at(tab, 'pointerdown', 100);
    at(tab, 'pointermove', 140); // well past the threshold
    at(tab, 'pointerup', 140);
    (tab as HTMLButtonElement).click();
    expect(handle.getActiveTab('panel')).toBe('p-one');
    // …while a press that does NOT travel is still a plain click
    const near = strip(api)!.querySelector('.axdb-tab[data-tab-id="p-two"]') as HTMLElement;
    at(near, 'pointerdown', 60);
    at(near, 'pointerup', 61);
    (near as HTMLButtonElement).click();
    expect(handle.getActiveTab('panel')).toBe('p-two');
  });

  it('a drag the board REFUSES (a STATIC split board) leaves the press a plain click', () => {
    // A refused drag must not swallow the click, or a tab container on a
    // static pane would stop switching pages altogether. (A split board that
    // is not static places the page as a pane since 0.4.37 — see the split
    // describe at the end.)
    const { api, handle, model } = up(
      dashboard({
        columns: 12,
        width: 1200,
        height: 600,
        rowHeight: 60,
        layout: 'split',
        static: true,
        widgets: [
          { id: 'other', kind: 'kpi', span: 6, rows: 4, x: 0, y: 0 },
          {
            id: 'panel',
            title: 'Side panel',
            span: 6,
            rows: 4,
            x: 6,
            y: 0,
            layout: 'tabs',
            widgets: [PAGE('p-one', 'Filters', 'k-one'), PAGE('p-two', 'Alerts', 'k-two')],
          },
        ],
      })
    );
    const tab = strip(api)!.querySelector('.axdb-tab[data-tab-id="p-two"]') as HTMLElement;
    const at = (type: string, x: number, y = 10) =>
      tab.dispatchEvent(
        Object.assign(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y }), { pointerId: 1 })
      );
    at('pointerdown', 700);
    at('pointermove', 660);
    window.dispatchEvent(Object.assign(new MouseEvent('pointermove', { bubbles: true, clientX: 30, clientY: 300 }), { pointerId: 1 }));
    window.dispatchEvent(Object.assign(new MouseEvent('pointerup', { bubbles: true, clientX: 30, clientY: 300 }), { pointerId: 1 }));
    (tab as HTMLButtonElement).click();
    expect(handle.getActiveTab('panel')).toBe('p-two');
    expect(model.getGroup('p-two__group')).toBeUndefined();
    expect(api.container.querySelector('.axdb-tab-chip')).toBeNull();
  });

  // -- tearing a tab out: VS Code's "drag a tab out and it becomes a group of its own" --
  // The board commits through the command manager, which settles a task later.
  const settle = () => new Promise<void>((r) => setTimeout(r, 0));
  const dragTab = async (api: { container: HTMLElement }, containerId: string, pageId: string, to: { x: number; y: number }) => {
    const tab = api.container.querySelector(`.axdb-tabs[data-tabs-id="${containerId}"] .axdb-tab[data-tab-id="${pageId}"]`) as HTMLElement;
    const ev = (el: EventTarget, type: string, x: number, y: number) =>
      el.dispatchEvent(Object.assign(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y }), { pointerId: 1 }));
    ev(tab, 'pointerdown', 700, 10);
    ev(tab, 'pointermove', 700 - 40, 10); // past the threshold: the strip hands the press to the board
    ev(window, 'pointermove', to.x, to.y);
    ev(window, 'pointerup', to.x, to.y);
    tab.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await settle();
  };
  const stripOf = (api: { container: HTMLElement }, id: string) =>
    Array.from(api.container.querySelectorAll(`.axdb-tabs[data-tabs-id="${id}"] .axdb-tab`)).map((t) => t.textContent);
  const cm = (api: ReturnType<typeof makeApi>) => api.getEngine().commandManager;

  it('a tab dragged onto the board becomes a ONE-TAB GROUP of its own, and undo puts it back', async () => {
    const { api, model, handle } = up(BOARD());
    await dragTab(api, 'panel', 'p-three', { x: 150, y: 400 });
    // the page left its container and arrived inside a new tab container
    expect(stripOf(api, 'panel')).toEqual(['Filters', 'Alerts']);
    expect(handle.getLayout('p-three__group')).toBe('tabs');
    expect(stripOf(api, 'p-three__group')).toEqual(['Notes']);
    expect(handle.getActiveTab('p-three__group')).toBe('p-three');
    expect(model.getGroup('p-three__group')!.members!.has('p-three')).toBe(true);
    expect(model.getGroup('panel')!.members!.has('p-three')).toBe(false);
    // its widget is on the canvas, under the new group's strip
    const w = model.getNode('k-three')!;
    const g = model.getGroup('p-three__group')!;
    expect(w.position.x).toBeGreaterThan(PARKED);
    expect(w.position.y).toBeGreaterThanOrEqual(g.position.y + 18);
    // it serialises as a tab container holding the page, beside the one it left
    const snap = handle.toJSON().views[0].widgets;
    const born = snap.find((x) => x.id === 'p-three__group')!;
    expect(born.layout).toBe('tabs');
    expect(born.widgets?.map((p) => p.id)).toEqual(['p-three']);
    expect(snap.find((x) => x.id === 'panel')!.widgets?.map((p) => p.id)).toEqual(['p-one', 'p-two']);
    // ONE undo: the group is gone, the tab is back, the page is parked again
    await cm(api).undo();
    await settle();
    expect(model.getGroup('p-three__group')).toBeUndefined();
    expect(stripOf(api, 'panel')).toEqual(['Filters', 'Alerts', 'Notes']);
    expect(api.container.querySelector('.axdb-tabs[data-tabs-id="p-three__group"]')).toBeNull();
    expect(handle.toJSON().views[0].widgets.some((x) => x.id === 'p-three__group')).toBe(false);
    expect(model.getGroup('panel')!.members!.has('p-three')).toBe(true);
    // …and redo brings it back exactly
    await cm(api).redo();
    await settle();
    expect(stripOf(api, 'p-three__group')).toEqual(['Notes']);
    expect(stripOf(api, 'panel')).toEqual(['Filters', 'Alerts']);
  });

  it('a tab torn out of the one-tab group it was BORN into lands again: a fresh group id, the emptied one closes, undo x2 restores', async () => {
    // The plan named the arriving group `${pageId}__group` — the id of the
    // group the page was leaving when that group had been born from the same
    // page. AddGroup threw "already exists" mid-batch, the split preview
    // stayed applied and the chip stayed on screen (the user's live report:
    // "once I release the tab widget disappears").
    const { api, model, handle } = up(BOARD());
    await dragTab(api, 'panel', 'p-three', { x: 150, y: 400 });
    expect(stripOf(api, 'p-three__group')).toEqual(['Notes']);
    const bornBefore = cellOf(handle, 'p-three__group')!;
    await dragTabFrom(api, 'p-three__group', 'p-three', { x: 160, y: 410 }, { x: 900, y: 500 });
    const groups = Array.from(api.container.querySelectorAll('.axdb-tabs')).map((s) => s.getAttribute('data-tabs-id')!);
    const born = groups.filter((g) => g !== 'panel');
    expect(born.length).toBe(1); // one group holds the page — the emptied one is gone
    expect(stripOf(api, born[0])).toEqual(['Notes']);
    expect(handle.getLayout(born[0])).toBe('tabs');
    expect(model.getGroup(born[0])!.members!.has('p-three')).toBe(true);
    const bornAfter = cellOf(handle, born[0])!;
    expect(bornAfter.x !== bornBefore.x || bornAfter.y !== bornBefore.y).toBe(true); // it moved
    expect(onCanvas(model, ['k-one', 'k-two', 'k-three'])).toEqual(['k-one', 'k-three']);
    await cm(api).undo();
    await settle();
    expect(stripOf(api, 'p-three__group')).toEqual(['Notes']);
    expect(cellOf(handle, 'p-three__group')).toEqual(bornBefore);
    await cm(api).undo();
    await settle();
    expect(stripOf(api, 'panel')).toEqual(['Filters', 'Alerts', 'Notes']);
    expect(api.container.querySelectorAll('.axdb-tabs').length).toBe(1);
  });

  it('SPLIT ABOVE from its own one-tab group: the target keeps the bottom half, the page takes the top in a fresh group, the empty one closes', async () => {
    // Two 4-column groups and four free columns, so the first landing is a
    // free cell — not a split of the left group, which would leave it too
    // small to halve (a 3-row target joins by design).
    const { api, model, handle } = up(
      dashboard({
        columns: 12,
        width: 1200,
        height: 600,
        gap: 10,
        rowHeight: 60,
        widgets: [
          { id: 'left', title: 'Left group', span: 4, rows: 6, x: 0, y: 0, layout: 'tabs', widgets: [PAGE('l1', 'Sales', 'k-l1'), PAGE('l2', 'Margin', 'k-l2')] },
          { id: 'right', title: 'Right group', span: 4, rows: 6, x: 4, y: 0, layout: 'tabs', widgets: [PAGE('r1', 'Filters', 'k-r1'), PAGE('r2', 'Notes', 'k-r2')] },
        ],
      })
    );
    // Notes out of the right group into the free columns
    await dragTabFrom(api, 'right', 'r2', { x: 600, y: 10 }, { x: 1000, y: 200 });
    expect(stripOf(api, 'r2__group')).toEqual(['Notes']);
    const g0 = cellOf(handle, 'r2__group')!;
    expect(g0.x).toBeGreaterThanOrEqual(8);
    expect(cellOf(handle, 'left')).toEqual({ x: 0, y: 0, w: 4, h: 6 });
    const f = frameOf(model, 'left');
    // then its only tab onto the TOP third of the left group's body
    await dragTabFrom(api, 'r2__group', 'r2', { x: 1000, y: 10 }, { x: f.x + f.w * 0.5, y: f.y + 30 + (f.h - 30) * 0.08 });
    const groups = Array.from(api.container.querySelectorAll('.axdb-tabs')).map((s) => s.getAttribute('data-tabs-id')!);
    const born = groups.filter((g) => g !== 'left' && g !== 'right');
    expect(born.length).toBe(1);
    expect(stripOf(api, born[0])).toEqual(['Notes']);
    expect(cellOf(handle, born[0])).toEqual({ x: 0, y: 0, w: 4, h: 3 });
    expect(cellOf(handle, 'left')).toEqual({ x: 0, y: 3, w: 4, h: 3 });
    expect(stripOf(api, 'left')).toEqual(['Sales', 'Margin']);
    expect(stripOf(api, 'right')).toEqual(['Filters']);
    expect(api.container.querySelector('.axdb-tab-chip')).toBeNull();
    await cm(api).undo();
    await settle();
    expect(cellOf(handle, 'left')).toEqual({ x: 0, y: 0, w: 4, h: 6 });
    expect(stripOf(api, 'r2__group')).toEqual(['Notes']);
    expect(cellOf(handle, 'r2__group')).toEqual(g0);
    await cm(api).undo();
    await settle();
    expect(stripOf(api, 'right')).toEqual(['Filters', 'Notes']);
    expect(api.container.querySelectorAll('.axdb-tabs').length).toBe(2);
  });

  it('undo of a tear-out shows the page that was SHOWING before the drag — not the one the container switched to when it left', async () => {
    // Filters is showing; tearing it out makes the container show Alerts. Undo
    // put Filters back as a page but left Alerts showing (seen on the live
    // walk: every undo ended on a different page than the rest frame).
    const { api, handle } = up(BOARD('p-one'));
    expect(handle.getActiveTab('panel')).toBe('p-one');
    await dragTab(api, 'panel', 'p-one', { x: 150, y: 400 });
    expect(stripOf(api, 'p-one__group')).toEqual(['Filters']);
    expect(handle.getActiveTab('panel')).toBe('p-two');
    await cm(api).undo();
    await settle();
    expect(stripOf(api, 'panel')).toEqual(['Filters', 'Alerts', 'Notes']);
    expect(handle.getActiveTab('panel')).toBe('p-one');
    expect(onCanvas(api.getModel() as DiagramModel, ['k-one', 'k-two', 'k-three'])).toEqual(['k-one']);
  });

  it('undo of a JOIN shows the page that was showing in the source before the drag', async () => {
    const { api, model, handle } = up(
      dashboard({
        columns: 12,
        width: 1200,
        height: 600,
        gap: 10,
        rowHeight: 60,
        widgets: [
          { id: 'left', title: 'Left group', span: 4, rows: 6, x: 0, y: 0, layout: 'tabs', widgets: [PAGE('l1', 'Sales', 'k-l1'), PAGE('l2', 'Margin', 'k-l2')] },
          { id: 'right', title: 'Right group', span: 4, rows: 6, x: 4, y: 0, layout: 'tabs', widgets: [PAGE('r1', 'Filters', 'k-r1'), PAGE('r2', 'Notes', 'k-r2')] },
        ],
      })
    );
    handle.activateTab('right', 'r2');
    expect(handle.getActiveTab('right')).toBe('r2');
    const lf = frameOf(model, 'left');
    await dragTabFrom(api, 'right', 'r2', { x: 600, y: 10 }, { x: lf.x + lf.w * 0.5, y: lf.y + 30 + (lf.h - 30) * 0.5 });
    expect(stripOf(api, 'left')).toEqual(['Sales', 'Margin', 'Notes']);
    expect(handle.getActiveTab('right')).toBe('r1');
    await cm(api).undo();
    await settle();
    expect(stripOf(api, 'right')).toEqual(['Filters', 'Notes']);
    expect(handle.getActiveTab('right')).toBe('r2');
    expect(handle.getActiveTab('left')).toBe('l1');
  });

  it('the torn-out group survives toJSON → dashboard() and a saved document', async () => {
    const first = up(BOARD());
    await dragTab(first.api, 'panel', 'p-two', { x: 150, y: 400 });
    const second = up(dashboard({ ...first.handle.toJSON() }));
    expect(second.handle.getLayout('p-two__group')).toBe('tabs');
    expect(stripOf(second.api, 'p-two__group')).toEqual(['Alerts']);
    expect(stripOf(second.api, 'panel')).toEqual(['Filters', 'Notes']);
    const json = JSON.stringify(new DiagramSerializer().serialize(first.model));
    const loaded = fromDocument(json);
    const api = makeApi(loaded.model as DiagramModel);
    loaded.finalize(api);
    mounted.push(loaded.handle as DashboardHandle);
    expect(loaded.handle!.getLayout('p-two__group')).toBe('tabs');
    expect(stripOf(api, 'p-two__group')).toEqual(['Alerts']);
  });

  it('tearing the LAST tab out closes the empty container, and undo reopens it', async () => {
    const { api, model, handle } = up(
      dashboard({
        columns: 12,
        width: 1200,
        height: 600,
        rowHeight: 60,
        widgets: [
          { id: 'free', kind: 'line', span: 6, rows: 4, x: 0, y: 0 },
          { id: 'solo', title: 'Solo', span: 6, rows: 4, x: 6, y: 0, layout: 'tabs', widgets: [PAGE('p-only', 'Only', 'k-only')] },
        ],
      })
    );
    await dragTab(api, 'solo', 'p-only', { x: 150, y: 400 });
    expect(model.getGroup('solo')).toBeUndefined();
    expect(api.container.querySelector('.axdb-tabs[data-tabs-id="solo"]')).toBeNull();
    expect(stripOf(api, 'p-only__group')).toEqual(['Only']);
    expect(handle.toJSON().views[0].widgets.map((x) => x.id).sort()).toEqual(['free', 'p-only__group']);
    await cm(api).undo();
    await settle();
    expect(model.getGroup('solo')!.members!.has('p-only')).toBe(true);
    expect(stripOf(api, 'solo')).toEqual(['Only']);
    expect(model.getGroup('p-only__group')).toBeUndefined();
    expect(handle.toJSON().views[0].widgets.map((x) => x.id).sort()).toEqual(['free', 'solo']);
  });

  // -- dropping a tab ONTO another group: VS Code's editor moved from the right group to the left --
  const TWO = () =>
    dashboard({
      columns: 12,
      width: 1200,
      height: 600,
      gap: 10,
      rowHeight: 60,
      widgets: [
        { id: 'left', title: 'Left group', span: 6, rows: 6, x: 0, y: 0, layout: 'tabs', widgets: [PAGE('l1', 'Sales', 'k-l1'), PAGE('l2', 'Margin', 'k-l2')] },
        { id: 'right', title: 'Right group', span: 6, rows: 6, x: 6, y: 0, layout: 'tabs', widgets: [PAGE('r1', 'Filters', 'k-r1'), PAGE('r2', 'Notes', 'k-r2')] },
      ],
    });
  const dragTabFrom = async (api: { container: HTMLElement }, containerId: string, pageId: string, from: { x: number; y: number }, to: { x: number; y: number }, via: Array<{ x: number; y: number }> = []) => {
    const tab = api.container.querySelector(`.axdb-tabs[data-tabs-id="${containerId}"] .axdb-tab[data-tab-id="${pageId}"]`) as HTMLElement;
    const ev = (el: EventTarget, type: string, x: number, y: number) =>
      el.dispatchEvent(Object.assign(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y }), { pointerId: 1 }));
    ev(tab, 'pointerdown', from.x, from.y);
    ev(tab, 'pointermove', from.x - 40, from.y);
    for (const v of via) ev(window, 'pointermove', v.x, v.y);
    ev(window, 'pointermove', to.x, to.y);
    ev(window, 'pointerup', to.x, to.y);
    tab.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await settle();
  };

  it('a tab dropped onto ANOTHER group joins it as a tab, on the end and active, in one undoable step', async () => {
    const { api, model, handle } = up(TWO());
    expect(stripOf(api, 'left')).toEqual(['Sales', 'Margin']);
    expect(handle.getActiveTab('left')).toBe('l1');
    // the right group's Notes tab, released over the CENTRE of the left group's body (its outer thirds split)
    const lf = (() => { const g = model.getGroup('left')!; return { x: g.position.x, y: g.position.y, w: g.size!.width, h: g.size!.height }; })();
    await dragTabFrom(api, 'right', 'r2', { x: 900, y: 10 }, { x: lf.x + lf.w / 2, y: lf.y + 30 + (lf.h - 30) / 2 });
    expect(stripOf(api, 'left')).toEqual(['Sales', 'Margin', 'Notes']);
    expect(stripOf(api, 'right')).toEqual(['Filters']);
    expect(handle.getActiveTab('left')).toBe('r2');
    expect(model.getGroup('left')!.members!.has('r2')).toBe(true);
    expect(model.getGroup('right')!.members!.has('r2')).toBe(false);
    expect(model.getGroup('r2__group')).toBeUndefined(); // it JOINED, it did not become a group of its own
    // its widget shows inside the left group; the page it displaced is parked
    const kr2 = model.getNode('k-r2')!;
    const left = model.getGroup('left')!;
    expect(kr2.position.x).toBeGreaterThan(PARKED);
    expect(kr2.position.x).toBeLessThan(left.position.x + left.size!.width);
    expect(onCanvas(model, ['k-l1', 'k-l2', 'k-r2'])).toEqual(['k-r2']);
    // serialised as the left group's third page
    const snap = handle.toJSON().views[0].widgets;
    expect(snap.find((w) => w.id === 'left')!.widgets?.map((p) => p.id)).toEqual(['l1', 'l2', 'r2']);
    expect(snap.find((w) => w.id === 'left')!.active).toBe('r2');
    expect(snap.find((w) => w.id === 'right')!.widgets?.map((p) => p.id)).toEqual(['r1']);
    // one undo puts it back — including which tab the left group was showing
    await cm(api).undo();
    await settle();
    expect(stripOf(api, 'left')).toEqual(['Sales', 'Margin']);
    expect(stripOf(api, 'right')).toEqual(['Filters', 'Notes']);
    expect(handle.getActiveTab('left')).toBe('l1');
    expect(model.getGroup('right')!.members!.has('r2')).toBe(true);
  });

  it('moving a group\'s LAST tab into another group closes the empty group', async () => {
    const { api, model, handle } = up(TWO());
    const centre = () => { const g = model.getGroup('left')!; return { x: g.position.x + g.size!.width / 2, y: g.position.y + 30 + (g.size!.height - 30) / 2 }; };
    await dragTabFrom(api, 'right', 'r2', { x: 900, y: 10 }, centre());
    await dragTabFrom(api, 'right', 'r1', { x: 700, y: 10 }, centre());
    expect(stripOf(api, 'left')).toEqual(['Sales', 'Margin', 'Notes', 'Filters']);
    expect(model.getGroup('right')).toBeUndefined();
    expect(api.container.querySelector('.axdb-tabs[data-tabs-id="right"]')).toBeNull();
    expect(handle.toJSON().views[0].widgets.map((w) => w.id)).toEqual(['left']);
    await cm(api).undo();
    await settle();
    expect(stripOf(api, 'right')).toEqual(['Filters']);
    expect(stripOf(api, 'left')).toEqual(['Sales', 'Margin', 'Notes']);
  });

  // -- the four gaps: an empty page closes · a widget dropped on a strip becomes a tab · reorder · a section moves --
  it('GAP 1: when a page\'s last widget leaves, the page closes — and an emptied group with it', async () => {
    const { api, model, handle } = up(
      dashboard({
        columns: 12,
        width: 1200,
        height: 600,
        rowHeight: 60,
        widgets: [
          { id: 'free', kind: 'line', span: 6, rows: 4, x: 0, y: 0 },
          { id: 'solo', title: 'Solo', span: 6, rows: 4, x: 6, y: 0, layout: 'tabs', widgets: [PAGE('p-only', 'Only', 'k-only'), PAGE('p-two', 'Two', 'k-two')] },
        ],
      })
    );
    handle.widget('k-only')!.remove();
    await settle();
    expect(model.getNode('k-only')).toBeUndefined();
    expect(model.getGroup('p-only')).toBeUndefined();
    expect(stripOf(api, 'solo')).toEqual(['Two']);
    expect(handle.getActiveTab('solo')).toBe('p-two');
    handle.widget('k-two')!.remove();
    await settle();
    expect(model.getGroup('solo')).toBeUndefined();
    expect(api.container.querySelector('.axdb-tabs[data-tabs-id="solo"]')).toBeNull();
    expect(handle.toJSON().views[0].widgets.map((w) => w.id)).toEqual(['free']);
    await cm(api).undo();
    await settle();
    expect(stripOf(api, 'solo')).toEqual(['Two']);
    expect(model.getNode('k-two')).toBeDefined();
    await cm(api).undo();
    await settle();
    expect(stripOf(api, 'solo')).toEqual(['Only', 'Two']);
    expect(model.getGroup('p-only')!.members!.has('k-only')).toBe(true);
  });

  it('GAP 2: a widget moved onto a strip becomes a new tab there, active, and undo puts it back', async () => {
    const { api, model, handle } = up(BOARD());
    expect(await handle.moveToTab('free', 'panel', 1)).toBe(true);
    await settle();
    expect(stripOf(api, 'panel')).toEqual(['Filters', 'free', 'Alerts', 'Notes']);
    expect(handle.getActiveTab('panel')).toBe('free__page');
    expect(model.getGroup('free__page')!.members!.has('free')).toBe(true);
    expect(model.getGroup('main')!.members!.has('free')).toBe(false);
    expect(handle.getLayout('free__page')).toBe('grid');
    // the widget lays out inside its new page, on the canvas
    const w = model.getNode('free')!;
    expect(w.position.x).toBeGreaterThan(PARKED);
    expect(w.size!.width).toBeGreaterThan(200);
    const snap = handle.toJSON().views[0].widgets;
    expect(snap.map((x) => x.id)).toEqual(['panel']);
    expect(snap[0].widgets?.map((p) => p.id)).toEqual(['p-one', 'free__page', 'p-two', 'p-three']);
    expect(snap[0].widgets?.[1].widgets?.map((x) => x.id)).toEqual(['free']);
    await cm(api).undo();
    await settle();
    expect(stripOf(api, 'panel')).toEqual(['Filters', 'Alerts', 'Notes']);
    expect(model.getGroup('free__page')).toBeUndefined();
    expect(model.getGroup('main')!.members!.has('free')).toBe(true);
    expect(handle.getActiveTab('panel')).toBe('p-one');
  });

  it('GAP 3: a tab reordered along its own strip keeps the order through toJSON, a saved document and undo', async () => {
    const first = up(BOARD());
    expect(first.handle.moveTab('panel', 'p-three', 0)).toBe(true);
    await settle();
    expect(stripOf(first.api, 'panel')).toEqual(['Notes', 'Filters', 'Alerts']);
    expect(first.handle.toJSON().views[0].widgets[1].widgets?.map((p) => p.id)).toEqual(['p-three', 'p-one', 'p-two']);
    const second = up(dashboard({ ...first.handle.toJSON() }));
    expect(stripOf(second.api, 'panel')).toEqual(['Notes', 'Filters', 'Alerts']);
    const json = JSON.stringify(new DiagramSerializer().serialize(first.model));
    const loaded = fromDocument(json);
    const api = makeApi(loaded.model as DiagramModel);
    loaded.finalize(api);
    mounted.push(loaded.handle as DashboardHandle);
    expect(stripOf(api, 'panel')).toEqual(['Notes', 'Filters', 'Alerts']);
    await cm(first.api).undo();
    await settle();
    expect(stripOf(first.api, 'panel')).toEqual(['Filters', 'Alerts', 'Notes']);
    expect(first.handle.moveTab('panel', 'nope', 0)).toBe(false);
  });

  it('GAP 4: a section moves as one tile, children with it, undoable', async () => {
    const { api, model, handle } = up(
      dashboard({
        columns: 12,
        width: 1200,
        height: 600,
        rowHeight: 60,
        widgets: [
          { id: 'sec', title: 'Section', span: 6, rows: 2, x: 0, y: 0, columns: 6, caption: true, widgets: [{ id: 's1', kind: 'kpi', span: 6, rows: 2, x: 0, y: 0 }] },
          { id: 'tabs', title: 'Tabs', span: 6, rows: 4, x: 6, y: 0, layout: 'tabs', widgets: [PAGE('t1', 'One', 'k1')] },
          { id: 'lone', kind: 'kpi', span: 6, rows: 2, x: 0, y: 2 },
        ],
      })
    );
    const before = { sec: { ...model.getGroup('sec')!.position }, s1: { ...model.getNode('s1')!.position } };
    expect(await handle.widget('sec')!.moveTo(0, 2)).toBe(true);
    expect(handle.widget('sec')!.cell).toEqual({ x: 0, y: 2, w: 6, h: 2 });
    // the child rode along, and the tile that was there moved out of the way
    expect(model.getNode('s1')!.position.y).toBeGreaterThan(before.s1.y);
    expect(model.getGroup('sec')!.position.y).toBeGreaterThan(before.sec.y);
    expect(handle.widget('lone')!.cell!.y).not.toBe(2);
    await cm(api).undo();
    await settle();
    expect(handle.widget('sec')!.cell).toEqual({ x: 0, y: 0, w: 6, h: 2 });
    expect(model.getNode('s1')!.position.y).toBe(before.s1.y);
    // a TAB GROUP is a section too
    expect(await handle.widget('tabs')!.moveTo(6, 4)).toBe(true);
    expect(handle.widget('tabs')!.cell).toEqual({ x: 6, y: 4, w: 6, h: 4 });
  });

  // -- the drop model the docking libraries share: edge splits, root docking, deepest target wins --
  const frameOf = (model: DiagramModel, id: string) => { const g = model.getGroup(id)!; return { x: g.position.x, y: g.position.y, w: g.size!.width, h: g.size!.height }; };
  const cellOf = (handle: DashboardHandle, id: string) => handle.widget(id)?.cell ?? null;

  it('SPLIT: a tab dropped on another group\'s RIGHT third splits it — the target keeps the left half, the page takes the right, undoable', async () => {
    const { api, model, handle } = up(TWO());
    const before = cellOf(handle, 'left')!;
    expect(before).toEqual({ x: 0, y: 0, w: 6, h: 6 });
    const f = frameOf(model, 'left');
    // the right third of the body, mid-height
    await dragTabFrom(api, 'right', 'r2', { x: 900, y: 10 }, { x: f.x + f.w * 0.9, y: f.y + 30 + (f.h - 30) * 0.5 });
    expect(stripOf(api, 'right')).toEqual(['Filters']);
    expect(stripOf(api, 'left')).toEqual(['Sales', 'Margin']); // it did NOT join
    expect(cellOf(handle, 'left')).toEqual({ x: 0, y: 0, w: 3, h: 6 });
    expect(cellOf(handle, 'r2__group')).toEqual({ x: 3, y: 0, w: 3, h: 6 });
    expect(stripOf(api, 'r2__group')).toEqual(['Notes']);
    expect(handle.getLayout('r2__group')).toBe('tabs');
    await cm(api).undo();
    await settle();
    expect(cellOf(handle, 'left')).toEqual(before);
    expect(model.getGroup('r2__group')).toBeUndefined();
    expect(stripOf(api, 'right')).toEqual(['Filters', 'Notes']);
  });

  it('SPLIT: the BOTTOM third stacks the page under the target; the top third puts it above', async () => {
    const { api, model, handle } = up(TWO());
    let f = frameOf(model, 'left');
    await dragTabFrom(api, 'right', 'r2', { x: 900, y: 10 }, { x: f.x + f.w * 0.5, y: f.y + 30 + (f.h - 30) * 0.92 });
    expect(cellOf(handle, 'left')).toEqual({ x: 0, y: 0, w: 6, h: 3 });
    expect(cellOf(handle, 'r2__group')).toEqual({ x: 0, y: 3, w: 6, h: 3 });
    await cm(api).undo();
    await settle();
    f = frameOf(model, 'left');
    await dragTabFrom(api, 'right', 'r2', { x: 900, y: 10 }, { x: f.x + f.w * 0.5, y: f.y + 30 + (f.h - 30) * 0.08 });
    expect(cellOf(handle, 'r2__group')).toEqual({ x: 0, y: 0, w: 6, h: 3 });
    expect(cellOf(handle, 'left')).toEqual({ x: 0, y: 3, w: 6, h: 3 });
  });

  it('SPLIT: the centre third still JOINS, and a group too small to halve joins instead of splitting', async () => {
    const { api, model, handle } = up(
      dashboard({
        columns: 12,
        width: 1200,
        height: 600,
        gap: 10,
        rowHeight: 60,
        widgets: [
          { id: 'thin', title: 'Thin', span: 1, rows: 6, x: 0, y: 0, layout: 'tabs', widgets: [PAGE('t1', 'One', 'k-t1')] },
          { id: 'right', title: 'Right group', span: 6, rows: 6, x: 6, y: 0, layout: 'tabs', widgets: [PAGE('r1', 'Filters', 'k-r1'), PAGE('r2', 'Notes', 'k-r2')] },
        ],
      })
    );
    const f = frameOf(model, 'thin');
    // aim at its right third: one column cannot be halved, so it joins
    await dragTabFrom(api, 'right', 'r2', { x: 900, y: 10 }, { x: f.x + f.w * 0.9, y: f.y + 30 + (f.h - 30) * 0.5 });
    expect(stripOf(api, 'thin')).toEqual(['One', 'Notes']);
    expect(cellOf(handle, 'thin')).toEqual({ x: 0, y: 0, w: 1, h: 6 });
    expect(model.getGroup('r2__group')).toBeUndefined();
  });

  it('ROOT DOCK: a tab dropped on the board\'s TOP edge docks a full-width group there, pushing the rest down', async () => {
    const { api, model, handle } = up(TWO());
    // the board group is at (0,0); the top band is the first 20 px of the visible canvas
    await dragTabFrom(api, 'right', 'r2', { x: 900, y: 10 }, { x: 300, y: 4 });
    const born = cellOf(handle, 'r2__group')!;
    expect(born.x).toBe(0);
    expect(born.y).toBe(0);
    expect(born.w).toBe(12);
    expect(born.h).toBeGreaterThanOrEqual(2);
    expect(cellOf(handle, 'left')!.y).toBe(born.h);
    expect(cellOf(handle, 'right')!.y).toBe(born.h);
    expect(stripOf(api, 'right')).toEqual(['Filters']);
    // the accent overlay is gone with the drop — it stayed painted over the
    // board through every later gesture (identification round, D8/D9)
    expect(api.container.querySelector('.axdb-join')).toBeNull();
    await cm(api).undo();
    await settle();
    expect(model.getGroup('r2__group')).toBeUndefined();
    expect(cellOf(handle, 'left')!.y).toBe(0);
    expect(api.container.querySelector('.axdb-join')).toBeNull();
  });

  it('ROOT DOCK: the LEFT edge docks a full-height group at column 0', async () => {
    const { api, handle } = up(TWO());
    await dragTabFrom(api, 'right', 'r2', { x: 900, y: 10 }, { x: 8, y: 200 });
    const born = cellOf(handle, 'r2__group')!;
    expect(born.x).toBe(0);
    expect(born.y).toBe(0);
    expect(born.h).toBe(6); // as tall as the board's rows
    expect(born.w).toBeGreaterThanOrEqual(2);
    expect(cellOf(handle, 'left')!.y).toBeGreaterThan(0); // pushed out of the way
  });

  it('ROOT DOCK: a ghost that sat mid-board still docks FULL width — the cell is taken in an order that fits', async () => {
    const { api, handle } = up(TWO());
    // Held below the board first: the ghost enters at the pointer's column,
    // well right of 0. Growing it to 12 columns THERE is clamped by the
    // board's edge, so the dock must move it to column 0 before it grows.
    await dragTabFrom(api, 'right', 'r2', { x: 900, y: 10 }, { x: 300, y: 4 }, [{ x: 800, y: 700 }]);
    const born = cellOf(handle, 'r2__group')!;
    expect(born).toBeTruthy();
    expect(born.x).toBe(0);
    expect(born.y).toBe(0);
    expect(born.w).toBe(12);
    expect(cellOf(handle, 'left')!.y).toBe(born.h);
    expect(cellOf(handle, 'right')!.y).toBe(born.h);
  });

  it('ROOT DOCK: the docked group takes at most HALF the board\'s rows — a split, not the page\'s full height', async () => {
    const { api, handle } = up(TWO());
    // The page is 4 rows tall plus its strip; the board is 6 rows. Docked at
    // the top it takes 3, the way VS Code's edge drop splits the area in two.
    await dragTabFrom(api, 'right', 'r2', { x: 900, y: 10 }, { x: 300, y: 4 });
    const born = cellOf(handle, 'r2__group')!;
    expect(born).toBeTruthy();
    expect(born.w).toBe(12);
    expect(born.h).toBeGreaterThanOrEqual(2);
    expect(born.h).toBeLessThanOrEqual(3);
    expect(cellOf(handle, 'left')!.y).toBe(born.h);
  });

  it('ROOT DOCK: a top dock INSERTS rows — every tile keeps its column and moves down by exactly the band\'s height', async () => {
    // The fluid-board demo's layout. The engine's push cascade resolved these
    // collisions one tile at a time and tore the KPI row apart (two of its
    // tiles ended under the chart); an edge dock shoves the whole area down
    // intact, the way VS Code's does.
    const K = (id: string, span: number, rows: number, x: number, y: number): DashboardWidgetSpec => ({ id, kind: 'kpi', span, rows, x, y });
    const { api, model, handle } = up(
      dashboard({
        columns: 12,
        width: 1200,
        height: 600,
        gap: 10,
        rowHeight: 60,
        sizing: 'grow', // the demo's board: full, and it grows
        widgets: [
          K('rev', 2, 1, 0, 0), K('cust', 2, 1, 2, 0), K('win', 2, 1, 4, 0), K('nps', 2, 1, 6, 0),
          K('trend', 6, 3, 0, 1), K('mix', 3, 3, 6, 1),
          K('reps', 5, 3, 0, 4), K('funnel', 4, 3, 5, 4),
          { id: 'ops', title: 'Operations', span: 9, rows: 1, x: 0, y: 7, columns: 9, widgets: [K('orders', 4, 1, 0, 0)] },
          { id: 'side', title: 'Side', span: 3, rows: 8, x: 9, y: 0, layout: 'tabs', widgets: [PAGE('p1', 'Filters', 'k1'), PAGE('p2', 'Alerts', 'k2')] },
        ],
      })
    );
    const rest: Record<string, { x: number; y: number; w: number; h: number }> = {};
    for (const id of ['rev', 'cust', 'win', 'nps', 'trend', 'mix', 'reps', 'funnel', 'ops', 'side']) rest[id] = cellOf(handle, id)!;
    expect(rest['trend']).toEqual({ x: 0, y: 1, w: 6, h: 3 });
    const tab = api.container.querySelector('.axdb-tabs[data-tabs-id="side"] .axdb-tab[data-tab-id="p2"]') as HTMLElement;
    expect(tab).toBeTruthy();
    await dragTabFrom(api, 'side', 'p2', { x: 1000, y: 10 }, { x: 400, y: 4 });
    const born = cellOf(handle, 'p2__group')!;
    expect(born).toBeTruthy();
    expect(born).toEqual(expect.objectContaining({ x: 0, y: 0, w: 12 }));
    for (const [id, c] of Object.entries(rest)) expect({ id, cell: cellOf(handle, id) }).toEqual({ id, cell: { ...c, y: c.y + born.h } });
    await cm(api).undo();
    await settle();
    expect(model.getGroup('p2__group')).toBeUndefined();
    for (const [id, c] of Object.entries(rest)) expect({ id, cell: cellOf(handle, id) }).toEqual({ id, cell: c });
  });

  it('an OUTSIDE widget dragged into a FULL page\'s body is taken — the page squeezes its rows and the widget under the pointer moves down', async () => {
    // The fluid demo: a 2×1 KPI dragged onto Region in the Filters page, whose
    // two 4-row KPIs fill all 8 rows. The bound page refused the adoption and
    // showed NOTHING; a fit board squeezes for a tile that arrives by hand.
    const { api, model, handle } = up(
      dashboard({
        columns: 12,
        width: 1200,
        height: 600,
        gap: 10,
        rowHeight: 60,
        sizing: 'grow',
        widgets: [
          { id: 'nps', kind: 'kpi', span: 2, rows: 1, x: 0, y: 0 },
          { id: 'side', title: 'Side', span: 3, rows: 8, x: 9, y: 0, layout: 'tabs', widgets: [
            { id: 'p1', title: 'Filters', columns: 3, widgets: [{ id: 'k1', kind: 'kpi', span: 3, rows: 4, x: 0, y: 0 }, { id: 'k2', kind: 'kpi', span: 3, rows: 4, x: 0, y: 4 }] },
            { id: 'p2', title: 'Alerts', columns: 3, widgets: [{ id: 'k3', kind: 'kpi', span: 3, rows: 8, x: 0, y: 0 }] },
          ] },
        ],
      })
    );
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
    expect(pathOf('nps')).toBe('main > nps');
    const page = frameOf(model, 'p1');
    const k1 = model.getNode('k1')!;
    const overK1 = { x: k1.position.x + k1.size.width / 2, y: k1.position.y + k1.size.height / 2 };
    expect(overK1.x).toBeGreaterThan(page.x);
    expect(overK1.y).toBeGreaterThan(page.y);
    const tool = toolOf('main');
    const nps = model.getNode('nps')!;
    const from = { x: nps.position.x + 20, y: nps.position.y + 20 };
    const hit = { node: nps, empty: false };
    tool.onPointerDown?.(tev('down', from.x, from.y), hit);
    tool.onPointerMove?.(tev('move', from.x + 30, from.y + 30), hit);
    tool.onPointerMove?.(tev('move', overK1.x, overK1.y), hit);
    tool.onPointerMove?.(tev('move', overK1.x + 1, overK1.y + 1), hit);
    tool.onPointerUp?.(tev('up', overK1.x + 1, overK1.y + 1), hit);
    await settle();
    expect(pathOf('nps')).toBe('main > side > p1 > nps');
    // the page took it above Region (Region moved down), and holds more rows than its 8-row design
    const k1After = cellOf(handle, 'k1')!;
    const npsAfter = cellOf(handle, 'nps')!;
    expect(k1After.y).toBeGreaterThan(0);
    expect(npsAfter.y).toBeLessThan(k1After.y);
    expect(cellOf(handle, 'k2')!.y).toBe(k1After.y + k1After.h);
    await cm(api).undo();
    await settle();
    expect(pathOf('nps')).toBe('main > nps');
    expect(cellOf(handle, 'k1')).toEqual({ x: 0, y: 0, w: 3, h: 4 });
    expect(cellOf(handle, 'k2')).toEqual({ x: 0, y: 4, w: 3, h: 4 });
  });

  it('the board\'s tool CLAIMS a press on its container\'s tab strip and does nothing with it — the renderer must neither select nor pan under a tab drag', async () => {
    // ownsPress declined strip presses ("a tab strip is content"), so NO tool
    // claimed them and the renderer's ladder armed its empty-canvas pan: the
    // camera slid 10–20 px under every tab drag (the identification round's
    // drift family — a reorder mark lost after a detour, a release outside the
    // canvas that committed, the strip end reading as the right band).
    const { api, model, handle } = up(TWO());
    const tool = toolOf('main');
    const tab = api.container.querySelector('.axdb-tabs[data-tabs-id="left"] .axdb-tab[data-tab-id="l2"]') as HTMLElement;
    const strip = api.container.querySelector('.axdb-tabs[data-tabs-id="left"]') as HTMLElement;
    const f = frameOf(model, 'left');
    const on = (type: ToolPointerEvent['type'], target: Element, x: number, y: number): ToolPointerEvent => ({ ...tev(type, x, y), source: { target } as unknown as PointerEvent });
    const hit = { empty: true };
    expect(tool.hitTest(on('down', tab, f.x + 60, f.y + 12), hit)).toBe(true);
    expect(tool.hitTest(on('down', strip, f.x + f.w - 20, f.y + 12), hit)).toBe(true);
    tool.onPointerDown?.(on('down', tab, f.x + 60, f.y + 12), hit);
    tool.onPointerMove?.(on('move', tab, f.x + 120, f.y + 40), hit);
    tool.onPointerUp?.(on('up', tab, f.x + 120, f.y + 40), hit);
    await settle();
    expect(api.container.querySelector('.axdb-ph')).toBeNull();
    expect(handle.getSelectedWidget()).toBeUndefined();
    expect(cellOf(handle, 'left')).toEqual({ x: 0, y: 0, w: 6, h: 6 });
    expect(stripOf(api, 'left')).toEqual(['Sales', 'Margin']);
  });

  it('a tab released OUTSIDE the canvas cancels even when the camera has shifted — the off-board test is on the screen', async () => {
    const { api, model, handle } = up(TWO());
    const rect = { left: 0, top: 0, right: 1200, bottom: 600, width: 1200, height: 600, x: 0, y: 0, toJSON: () => ({}) };
    Object.defineProperty(api.container, 'getBoundingClientRect', { value: () => rect, configurable: true });
    // camera 300 px down the board: a client point 100 px ABOVE the canvas still maps to world y 200, inside the board
    (api as unknown as { viewport: { clientToWorld: (x: number, y: number) => { x: number; y: number } } }).viewport.clientToWorld = (x, y) => ({ x, y: y + 300 });
    await dragTabFrom(api, 'right', 'r2', { x: 900, y: 10 }, { x: 300, y: -100 }, [{ x: 400, y: 300 }]);
    expect(model.getGroup('r2__group')).toBeUndefined();
    expect(stripOf(api, 'right')).toEqual(['Filters', 'Notes']);
    expect(cellOf(handle, 'left')).toEqual({ x: 0, y: 0, w: 6, h: 6 });
  });

  it('ROOT DOCK: a side dock is as tall as the board WAS, and leaves no overlay behind — the ghost\'s own displacement inflates neither', async () => {
    // The identification round: after the ghost had pushed tiles about, the
    // side and bottom docks read the DISPLACED layout — overlays 1950 → 2930
    // px tall, a bottom dock landing at row 29, a panel pushed 96 rows down —
    // and the re-applied zone at release left its overlay painted.
    const { api, model, handle } = up(TWO());
    // parked mid-board first (the ghost enters and pushes), then the left band
    await dragTabFrom(api, 'right', 'r2', { x: 900, y: 10 }, { x: 8, y: 300 }, [{ x: 300, y: 300 }]);
    const born = cellOf(handle, 'r2__group')!;
    expect(born).toBeTruthy();
    expect(born.x).toBe(0);
    expect(born.y).toBe(0);
    expect(born.h).toBe(6); // the board's rows at the press, not after the ghost's pushing
    expect(api.container.querySelector('.axdb-join')).toBeNull();
    await cm(api).undo();
    await settle();
    expect(model.getGroup('r2__group')).toBeUndefined();
    expect(api.container.querySelector('.axdb-join')).toBeNull();
    expect(cellOf(handle, 'left')).toEqual({ x: 0, y: 0, w: 6, h: 6 });
  });

  it('a torn-out page travels at most HALF the board tall — an 8-row ghost crossing the KPI row tore the whole dashboard apart', async () => {
    const { api } = up(TWO());
    // press Notes, travel past the threshold, hold below both groups on free board space
    const tab = api.container.querySelector('.axdb-tabs[data-tabs-id="right"] .axdb-tab[data-tab-id="r2"]') as HTMLElement;
    const ev = (el: EventTarget, type: string, x: number, y: number) =>
      el.dispatchEvent(Object.assign(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y }), { pointerId: 1 }));
    ev(tab, 'pointerdown', 900, 10);
    ev(tab, 'pointermove', 860, 10);
    ev(window, 'pointermove', 300, 640);
    await settle();
    const ph = api.container.querySelector('.axdb-ph') as HTMLElement | null;
    expect(ph).toBeTruthy();
    // 6-row board, 60 px rows, 10 px gap: half = 3 rows = 200 px; the page's natural height is 4 rows + its strip
    expect(parseFloat(ph!.style.height)).toBeLessThanOrEqual(3 * 70 - 10 + 1);
    ev(window, 'pointercancel', 300, 640);
    await settle();
  });

  it('a landing cell that would sit OFF-SCREEN dims the chip and the release cancels — nothing lands a screen away', async () => {
    // Two full groups over a full-width locked section: the pointer over the
    // section has no cell there, and the fallback used to grow the ghost back
    // to its natural height BELOW the section — out of view, the drop landing
    // where the user could not see it (identification round, D1 hold3).
    const { api, model, handle } = up(
      dashboard({
        columns: 12,
        width: 1200,
        height: 500,
        gap: 10,
        rowHeight: 60,
        sizing: 'grow',
        widgets: [
          { id: 'left', title: 'Left group', span: 6, rows: 4, x: 0, y: 0, layout: 'tabs', widgets: [PAGE('l1', 'Sales', 'k-l1')] },
          { id: 'right', title: 'Right group', span: 6, rows: 4, x: 6, y: 0, layout: 'tabs', widgets: [PAGE('r1', 'Filters', 'k-r1'), PAGE('r2', 'Notes', 'k-r2')] },
          { id: 'wall', title: 'Wall', span: 12, rows: 2, x: 0, y: 4, columns: 12, widgets: [{ id: 'w1', kind: 'kpi', span: 12, rows: 2, x: 0, y: 0 }] },
        ],
      })
    );
    // the canvas ends at 420 px: the only cell left, row 6 (from 430 px), has no visible pixel
    const rect = { left: 0, top: 0, right: 1200, bottom: 420, width: 1200, height: 420, x: 0, y: 0, toJSON: () => ({}) };
    Object.defineProperty(api.container, 'getBoundingClientRect', { value: () => rect, configurable: true });
    const tab = api.container.querySelector('.axdb-tabs[data-tabs-id="right"] .axdb-tab[data-tab-id="r2"]') as HTMLElement;
    const ev = (el: EventTarget, type: string, x: number, y: number) =>
      el.dispatchEvent(Object.assign(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y }), { pointerId: 1 }));
    ev(tab, 'pointerdown', 900, 10);
    ev(tab, 'pointermove', 860, 10);
    ev(window, 'pointermove', 300, 330); // over the wall: rows 4-5, no room above it, the only room is BELOW the visible canvas
    await settle();
    const chip = document.querySelector('.axdb-tab-chip') as HTMLElement | null;
    expect(chip).toBeTruthy();
    expect(chip!.classList.contains('axdb-out')).toBe(true);
    ev(window, 'pointerup', 300, 330);
    await settle();
    expect(model.getGroup('r2__group')).toBeUndefined();
    expect(stripOf(api, 'right')).toEqual(['Filters', 'Notes']);
    expect(cellOf(handle, 'wall')).toEqual({ x: 0, y: 4, w: 12, h: 2 });
  });

  it('a SECTION moved by its caption band slides to the nearest legal column like a widget, and a refused cell is shown', async () => {
    // The fluid demo's Operations section (9 columns) grabbed 60 px from its
    // left edge and carried over the chart: the cell under the pointer put
    // its right edge into the locked side panel, E4b refused every cell and
    // the section did not move at all — with nothing on screen to say why.
    const K = (id: string, span: number, rows: number, x: number, y: number): DashboardWidgetSpec => ({ id, kind: 'kpi', span, rows, x, y });
    const { api, model, handle } = up(
      dashboard({
        columns: 12,
        width: 1200,
        height: 600,
        gap: 10,
        rowHeight: 60,
        sizing: 'grow',
        widgets: [
          K('trend', 6, 3, 0, 1), K('mix', 3, 3, 6, 1),
          { id: 'ops', title: 'Operations', caption: true, span: 9, rows: 1, x: 0, y: 5, columns: 9, widgets: [K('orders', 4, 1, 0, 0)] },
          { id: 'side', title: 'Side', span: 3, rows: 8, x: 9, y: 0, layout: 'tabs', widgets: [PAGE('p1', 'Filters', 'k1')] },
        ],
      })
    );
    const band = api.container.querySelector('.axdb-slab[data-slab-id="ops"] > .axdb-slab-h') as HTMLElement;
    expect(band).toBeTruthy();
    const ops = model.getGroup('ops')!;
    const tool = toolOf('main');
    const on = (type: ToolPointerEvent['type'], x: number, y: number): ToolPointerEvent => ({ ...tev(type, x, y), source: { target: band } as unknown as PointerEvent });
    const hit = { empty: true };
    // grabbed 60 px in from the section's left edge, carried up over the chart at x ≈ 380 → its left edge wants column 3, its right edge column 12: the side panel's
    const press = { x: ops.position.x + 60, y: ops.position.y + 20 };
    tool.onPointerDown?.(on('down', press.x, press.y), hit);
    tool.onPointerMove?.(on('move', press.x + 30, press.y - 30), hit);
    tool.onPointerMove?.(on('move', 380, 130), hit);
    tool.onPointerMove?.(on('move', 381, 131), hit);
    tool.onPointerUp?.(on('up', 381, 131), hit);
    await settle();
    const after = cellOf(handle, 'ops')!;
    expect(after.x).toBe(0); // slid left off the locked panel
    expect(after.y).toBeLessThan(5); // and moved up as asked
    expect(after.w).toBe(9);
    expect(cellOf(handle, 'side')).toEqual({ x: 9, y: 0, w: 3, h: 8 });
    await cm(api).undo();
    await settle();
    expect(cellOf(handle, 'ops')).toEqual({ x: 0, y: 5, w: 9, h: 1 });
  });

  it('a widget dragged OUT of an inner tab page survives the re-layout its own crossing causes — the gesture lives on and the drop lands in the section', async () => {
    // The deep lab board: IA (inside Inner A, tabs inside the Nested page)
    // dragged over the sibling Inner section. Adopting it re-laid the Nested
    // page, the inner tabs container moved, its pages were re-placed, the
    // inner page's binder REBUILT and cancelled its own gesture mid-drag: the
    // ghost class dropped, the leg's placeholder leaked through release and
    // undo, and the widget went nowhere (identification round, L5).
    const K = (id: string, span: number, rows: number, x: number, y: number): DashboardWidgetSpec => ({ id, kind: 'kpi', span, rows, x, y });
    const { api, model, handle } = up(
      dashboard({
        columns: 12,
        width: 1200,
        height: 600,
        gap: 10,
        rowHeight: 50,
        sizing: 'grow',
        widgets: [
          K('w1', 3, 2, 0, 0),
          { id: 'dp', title: 'Deep tabs', span: 6, rows: 6, x: 6, y: 0, columns: 6, layout: 'tabs', widgets: [
            { id: 'dp-nested', title: 'Nested page', columns: 6, widgets: [
              { id: 'dp-inner', title: 'Inner section', caption: true, span: 6, rows: 3, x: 0, y: 0, columns: 6, widgets: [K('dp-i1', 3, 2, 0, 0)] },
              { id: 'dp-intabs', title: 'Inner tabs', span: 6, rows: 3, x: 0, y: 3, columns: 6, layout: 'tabs', widgets: [
                { id: 'dp-ip1', title: 'Inner A', columns: 6, widgets: [K('dp-ia', 3, 2, 0, 0)] }, // 3 wide: it fits beside I1 in the section
                { id: 'dp-ip2', title: 'Inner B', columns: 6, widgets: [K('dp-ib', 6, 2, 0, 0)] },
              ] },
            ] },
          ] },
        ],
      })
    );
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
    expect(pathOf('dp-ia')).toBe('main > dp > dp-nested > dp-intabs > dp-ip1 > dp-ia');
    const ia = model.getNode('dp-ia')!;
    const i1 = model.getNode('dp-i1')!;
    const sec = frameOf(model, 'dp-inner');
    // the inner section's free right half, beside I1
    const target = { x: sec.x + sec.w * 0.75, y: i1.position.y + i1.size.height / 2 };
    const tool = toolOf('dp-ip1');
    const hit = { node: ia, empty: false };
    const from = { x: ia.position.x + 30, y: ia.position.y + 20 };
    tool.onPointerDown?.(tev('down', from.x, from.y), hit);
    tool.onPointerMove?.(tev('move', from.x + 20, from.y - 20), hit);
    for (let i = 1; i <= 6; i++) tool.onPointerMove?.(tev('move', from.x + (target.x - from.x) * i / 6, from.y + (target.y - from.y) * i / 6), hit);
    await settle();
    // mid-drag: the widget is OFF its page (adopted elsewhere), the gesture alive
    expect(cellOf(handle, 'dp-ia')).toBeNull();
    tool.onPointerMove?.(tev('move', target.x + 1, target.y), hit);
    tool.onPointerUp?.(tev('up', target.x + 1, target.y), hit);
    await settle();
    expect(pathOf('dp-ia')).toBe('main > dp > dp-nested > dp-inner > dp-ia');
    expect(api.container.querySelectorAll('.axdb-ph').length).toBe(0);
    await cm(api).undo();
    await settle();
    expect(pathOf('dp-ia')).toBe('main > dp > dp-nested > dp-intabs > dp-ip1 > dp-ia');
    expect(api.container.querySelectorAll('.axdb-ph').length).toBe(0);
  });

  it('an INNER tab torn out lands on whichever board is under the pointer — the main board, not only the one owning its container', async () => {
    // Inner A (tabs inside the Nested page of the Deep tabs container)
    // dragged onto the main board beside W1: the tear-out only knew the
    // board owning its container (the Nested page), so over the main board
    // the chip dimmed and the release did nothing (identification round, L2).
    const K = (id: string, span: number, rows: number, x: number, y: number): DashboardWidgetSpec => ({ id, kind: 'kpi', span, rows, x, y });
    const { api, model, handle } = up(
      dashboard({
        columns: 12,
        width: 1200,
        height: 600,
        gap: 10,
        rowHeight: 50,
        sizing: 'grow',
        widgets: [
          K('w1', 3, 2, 0, 0),
          { id: 'dp', title: 'Deep tabs', span: 6, rows: 6, x: 6, y: 0, columns: 6, layout: 'tabs', widgets: [
            { id: 'dp-nested', title: 'Nested page', columns: 6, widgets: [
              { id: 'dp-inner', title: 'Inner section', caption: true, span: 6, rows: 3, x: 0, y: 0, columns: 6, widgets: [K('dp-i1', 3, 2, 0, 0)] },
              { id: 'dp-intabs', title: 'Inner tabs', span: 6, rows: 3, x: 0, y: 3, columns: 6, layout: 'tabs', widgets: [
                { id: 'dp-ip1', title: 'Inner A', columns: 6, widgets: [K('dp-ia', 3, 2, 0, 0)] },
                { id: 'dp-ip2', title: 'Inner B', columns: 6, widgets: [K('dp-ib', 6, 2, 0, 0)] },
              ] },
            ] },
          ] },
        ],
      })
    );
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
    const tab = api.container.querySelector('.axdb-tabs[data-tabs-id="dp-intabs"] .axdb-tab[data-tab-id="dp-ip1"]') as HTMLElement;
    expect(tab).toBeTruthy();
    const tr = model.getGroup('dp-intabs')!.position;
    // onto the MAIN board, the free space right of W1
    await dragTabFrom(api, 'dp-intabs', 'dp-ip1', { x: tr.x + 40, y: tr.y + 12 }, { x: 400, y: 20 });
    expect(pathOf('dp-ip1__group')).toBe('main > dp-ip1__group');
    expect(pathOf('dp-ia')).toBe('main > dp-ip1__group > dp-ip1 > dp-ia');
    expect(stripOf(api, 'dp-intabs')).toEqual(['Inner B']);
    const born = cellOf(handle, 'dp-ip1__group')!;
    expect(born).toBeTruthy();
    expect(born.y).toBe(0);
    expect(born.w).toBe(6); // the page's natural width: its container's 600 px on a 1200 px board
    expect(cellOf(handle, 'w1')!.y).toBe(born.h); // W1 pushed under it
    await cm(api).undo();
    await settle();
    expect(model.getGroup('dp-ip1__group')).toBeUndefined();
    expect(stripOf(api, 'dp-intabs')).toEqual(['Inner A', 'Inner B']);
  });

  it('a section pulled up by its TOP edge grows by the rows the pointer travelled — not eighteen for two', async () => {
    // The fluid demo's Operations section: its caption's top 4 px pulled up
    // 300 px (2.3 rows of 130) grew it 1 → 3 → 8 → 18 rows (identification
    // round, F16) — a resize that outran the pointer.
    const K = (id: string, span: number, rows: number, x: number, y: number): DashboardWidgetSpec => ({ id, kind: 'kpi', span, rows, x, y });
    const { api, model, handle } = up(
      dashboard({
        columns: 12,
        width: 1200,
        height: 600,
        gap: 10,
        rowHeight: 60,
        sizing: 'grow',
        widgets: [
          K('a', 6, 2, 0, 0), K('b', 6, 2, 6, 0),
          { id: 'ops', title: 'Operations', caption: true, span: 12, rows: 1, x: 0, y: 4, columns: 12, widgets: [K('orders', 4, 1, 0, 0)] },
        ],
      })
    );
    const band = api.container.querySelector('.axdb-slab[data-slab-id="ops"] > .axdb-slab-h') as HTMLElement;
    expect(band).toBeTruthy();
    const ops = model.getGroup('ops')!;
    const tool = toolOf('main');
    const on = (type: ToolPointerEvent['type'], x: number, y: number): ToolPointerEvent => ({ ...tev(type, x, y), source: { target: band } as unknown as PointerEvent });
    const hit = { empty: true };
    const x = ops.position.x + 300;
    const y0 = ops.position.y + 3; // the top edge
    tool.onPointerDown?.(on('down', x, y0), hit);
    tool.onPointerMove?.(on('move', x, y0 - 10), hit);
    // pulled up 140 px = two rows of 60 + gaps; the section should be 3 rows tall, its top two rows higher
    for (let i = 1; i <= 7; i++) tool.onPointerMove?.(on('move', x, y0 - 20 * i), hit);
    tool.onPointerUp?.(on('up', x, y0 - 140), hit);
    await settle();
    const after = cellOf(handle, 'ops')!;
    expect(after).toBeTruthy();
    expect(after.h).toBe(3);
    expect(after.y).toBe(2);
    expect(after.w).toBe(12);
    expect(cellOf(handle, 'a')).toEqual({ x: 0, y: 0, w: 6, h: 2 });
  });

  it('ROOT DOCK: a side dock measures the board as it stood BEFORE the ghost pushed anything — parked on a tile first', async () => {
    const K = (id: string, span: number, rows: number, x: number, y: number): DashboardWidgetSpec => ({ id, kind: 'kpi', span, rows, x, y });
    const { api, handle } = up(
      dashboard({
        columns: 12,
        width: 1200,
        height: 600,
        gap: 10,
        rowHeight: 60,
        sizing: 'grow',
        widgets: [
          K('rev', 2, 1, 0, 0), K('cust', 2, 1, 2, 0), K('trend', 6, 3, 0, 1), K('mix', 3, 3, 6, 1),
          { id: 'side', title: 'Side', span: 3, rows: 4, x: 9, y: 0, layout: 'tabs', widgets: [PAGE('p1', 'Filters', 'k1'), PAGE('p2', 'Alerts', 'k2')] },
        ],
      })
    );
    // parked over the chart (the ghost enters and pushes the chart down), then the LEFT band
    await dragTabFrom(api, 'side', 'p2', { x: 1000, y: 10 }, { x: 8, y: 200 }, [{ x: 300, y: 150 }, { x: 301, y: 151 }]);
    const born = cellOf(handle, 'p2__group')!;
    expect(born).toBeTruthy();
    expect(born.x).toBe(0);
    expect(born.y).toBe(0);
    expect(born.h).toBe(4); // the board's four rows at the press, not the six the parked ghost made
    expect(api.container.querySelector('.axdb-join')).toBeNull();
  });

  it('ROOT DOCK: the bands are measured on the SCREEN — a board scrolled 30 px still docks at its visible top edge', async () => {
    const { api, handle } = up(TWO());
    // The camera sits 30 px down the board: the world point under a client
    // point is 30 px lower than it reads. Measured against the frame in world
    // space the top band would be scrolled out of reach; it is the visible
    // canvas's top 20 px, wherever the camera is.
    const rect = { left: 0, top: 0, right: 1200, bottom: 600, width: 1200, height: 600, x: 0, y: 0, toJSON: () => ({}) };
    Object.defineProperty(api.container, 'getBoundingClientRect', { value: () => rect, configurable: true });
    (api as unknown as { viewport: { clientToWorld: (x: number, y: number) => { x: number; y: number } } }).viewport.clientToWorld = (x, y) => ({ x, y: y + 30 });
    await dragTabFrom(api, 'right', 'r2', { x: 900, y: 10 }, { x: 300, y: 4 });
    const born = cellOf(handle, 'r2__group')!;
    expect(born).toBeTruthy();
    expect(born.x).toBe(0);
    expect(born.y).toBe(0);
    expect(born.w).toBe(12);
    expect(cellOf(handle, 'left')!.y).toBe(born.h);
  });

  it('ROOT DOCK: the top band beats the body of a group that sits against the board\'s edge (Dockview\'s container edges)', async () => {
    const { api, model, handle } = up(TWO());
    const f = frameOf(model, 'left');
    // 4 px inside the left group's frame, 14 px from the board's top: the band, not a split
    await dragTabFrom(api, 'right', 'r2', { x: 900, y: 10 }, { x: f.x + f.w * 0.5, y: f.y + 4 });
    const born = cellOf(handle, 'r2__group')!;
    expect(born).toBeTruthy();
    expect(born.w).toBe(12);
    expect(born.y).toBe(0);
    expect(cellOf(handle, 'left')).toEqual({ x: 0, y: born.h, w: 6, h: 6 });
  });

  it('ROOT DOCK: a strip inside the top band still wins — the tab joins that group', async () => {
    const { api, model, handle } = up(TWO());
    const f = frameOf(model, 'left');
    const strip = api.container.querySelector('.axdb-tabs[data-tabs-id="left"]') as HTMLElement;
    const r = { left: f.x, top: f.y, right: f.x + f.w, bottom: f.y + 30, width: f.w, height: 30, x: f.x, y: f.y, toJSON: () => ({}) };
    Object.defineProperty(strip, 'getBoundingClientRect', { value: () => r, configurable: true });
    await dragTabFrom(api, 'right', 'r2', { x: 900, y: 10 }, { x: f.x + f.w * 0.5, y: f.y + 4 });
    expect(model.getGroup('r2__group')).toBeUndefined();
    expect(stripOf(api, 'left')).toEqual(['Sales', 'Margin', 'Notes']);
    expect(cellOf(handle, 'left')).toEqual({ x: 0, y: 0, w: 6, h: 6 });
  });

  it('DEEPEST WINS: a tab dropped on an inner group\'s strip INSIDE its own container joins the inner group', async () => {
    const { api, model, handle } = up(
      dashboard({
        columns: 12,
        width: 1200,
        height: 600,
        gap: 10,
        rowHeight: 60,
        widgets: [
          {
            id: 'outer', title: 'Outer', span: 12, rows: 8, x: 0, y: 0, layout: 'tabs',
            widgets: [
              { id: 'p-host', title: 'Host', columns: 12, widgets: [
                { id: 'inner', title: 'Inner', span: 12, rows: 6, x: 0, y: 0, layout: 'tabs', widgets: [PAGE('i1', 'Inner A', 'k-i1'), PAGE('i2', 'Inner B', 'k-i2')] },
              ] },
              PAGE('p-loose', 'Loose', 'k-loose'),
            ],
          },
        ],
      })
    );
    expect(stripOf(api, 'outer')).toEqual(['Host', 'Loose']);
    expect(stripOf(api, 'inner')).toEqual(['Inner A', 'Inner B']);
    const f = frameOf(model, 'inner');
    // release over the inner group's BODY (its strip has no client rect in jsdom): it must join it, not read as "home"
    await dragTabFrom(api, 'outer', 'p-loose', { x: 700, y: 10 }, { x: f.x + f.w * 0.5, y: f.y + 30 + (f.h - 30) * 0.5 });
    expect(stripOf(api, 'inner')).toEqual(['Inner A', 'Inner B', 'Loose']);
    expect(stripOf(api, 'outer')).toEqual(['Host']);
    expect(handle.getActiveTab('inner')).toBe('p-loose');
    await cm(api).undo();
    await settle();
    expect(stripOf(api, 'outer')).toEqual(['Host', 'Loose']);
    expect(stripOf(api, 'inner')).toEqual(['Inner A', 'Inner B']);
  });

  it('a board with no tab container carries no strip at all', () => {
    const { api } = up(
      dashboard({ columns: 12, width: 1200, height: 600, widgets: [{ id: 'a', kind: 'kpi', span: 6, rows: 2, x: 0, y: 0 }] })
    );
    expect(api.container.querySelector('.axdb-tabs')).toBeNull();
  });
});

/**
 * THE GLIDE AND A PAGE SWITCH (0.4.36). `.axdb-glide` on the html layer eases
 * every left/top write for the length of a gesture and 400 ms past its drop.
 * A plain CLICK on a widget armed it at the press (a task ahead of any
 * displacement, deliberately) and never disarmed it — so it stayed armed for
 * good, and the next tab switch, which brings a page back from 20,000 px off
 * canvas, SLID the page's content in from the left over 280 ms. Two fixes: a
 * press that never travels disarms like a drop does, and parking is a
 * TELEPORT — the class comes off for the writes, whoever holds it.
 */
describe('the reflow glide and a page switch', () => {
  const layerOf = (api: { container: HTMLElement }) => api.container.querySelector('.grafloria-html-layer') as HTMLElement;
  const later = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

  it('a plain CLICK on a widget leaves the glide DISARMED — it stayed armed for good, and the next tab switch flew its page in', async () => {
    const { api, model } = up(BOARD());
    const layer = layerOf(api);
    const tool = toolOf('main');
    const free = model.getNode('free')!;
    const at = { x: free.position.x + 20, y: free.position.y + 20 };
    const hit = { node: free, empty: false };
    tool.onPointerDown?.(tev('down', at.x, at.y), hit);
    expect(layer.classList.contains('axdb-glide')).toBe(true); // armed at the press, as designed
    tool.onPointerUp?.(tev('up', at.x, at.y), hit);
    await later(450);
    expect(layer.classList.contains('axdb-glide')).toBe(false);
  });

  it('a press CANCELLED before it travels disarms the glide too', async () => {
    const { api, model } = up(BOARD());
    const layer = layerOf(api);
    const tool = toolOf('main');
    const free = model.getNode('free')!;
    const at = { x: free.position.x + 20, y: free.position.y + 20 };
    tool.onPointerDown?.(tev('down', at.x, at.y), { node: free, empty: false });
    expect(layer.classList.contains('axdb-glide')).toBe(true);
    tool.onCancel?.();
    await later(450);
    expect(layer.classList.contains('axdb-glide')).toBe(false);
  });

  it('a TAB switch is a teleport: the page is painted with the glide OFF even while a gesture holds it armed, and the gesture keeps it', () => {
    const { api, model, handle } = up(BOARD());
    const layer = layerOf(api);
    layer.classList.add('axdb-glide'); // as the 400 ms after a drop leave it
    const painted: string[] = [];
    (api as { renderNow: () => void }).renderNow = () => {
      painted.push(layer.className);
    };
    expect(handle.activateTab('panel', 'p-two')).toBe(true);
    expect(tabs(api).find((t) => t.on)?.id).toBe('p-two');
    expect(onCanvas(model, ['k-one', 'k-two', 'k-three'])).toEqual(['k-two']);
    expect(painted.length).toBeGreaterThan(0);
    expect(painted.filter((c) => c.includes('axdb-glide'))).toEqual([]);
    expect(layer.classList.contains('axdb-glide')).toBe(true);
  });

  it('a VIEW switch is a teleport too — views park the same way', () => {
    const { api, model, handle } = up(
      dashboard({
        columns: 12,
        width: 1200,
        height: 600,
        views: [
          { id: 'v1', name: 'One', widgets: [{ id: 'w1', kind: 'kpi', span: 6, rows: 2, x: 0, y: 0 }] },
          { id: 'v2', name: 'Two', widgets: [{ id: 'w2', kind: 'kpi', span: 6, rows: 2, x: 0, y: 0 }] },
        ],
      })
    );
    const layer = layerOf(api);
    layer.classList.add('axdb-glide');
    const painted: string[] = [];
    (api as { renderNow: () => void }).renderNow = () => {
      painted.push(layer.className);
    };
    handle.showView('v2');
    expect(onCanvas(model, ['w1', 'w2'])).toEqual(['w2']);
    expect(painted.length).toBeGreaterThan(0);
    expect(painted.filter((c) => c.includes('axdb-glide'))).toEqual([]);
    expect(layer.classList.contains('axdb-glide')).toBe(true);
  });
});

/**
 * TAB DRAGS ON A SPLIT BOARD (0.4.37). The split binder REFUSED every tear-out
 * ("a split board has no cells to drop a page into"), so on the fluid demo's
 * Split mode a tab press was a dead click — no chip, no reorder, no join. The
 * split board has a drop model of its own (a widget dropped on a pane's edge
 * inserts there); a torn-out page uses it: the page becomes a one-tab group
 * that is a PANE, joins another container over its body's centre, and
 * reorders or joins over a strip like on a grid board.
 */
/**
 * setSizing IS THE VIEW'S (0.4.38). The fluid demo's Fit / Grow buttons call
 * `handle.setSizing`, and it switched EVERY binder — pages and sections too.
 * A page's height is its container's business (it is bound fit, design
 * height 0); switched to grow it painted its rows at the base height, so an
 * 8-row page torn out into a 3-row group or a split pane spilled 700 px past
 * it, across the widgets below. Nested boards keep their own sizing.
 */
describe('setSizing leaves nested boards alone', () => {
  const settle = () => new Promise<void>((r) => setTimeout(r, 0));
  it('a page stays bounded by its container after the view switches to grow', async () => {
    const { model, handle } = up(
      dashboard({
        columns: 12,
        width: 1200,
        height: 600,
        rowHeight: 60,
        widgets: [
          { id: 'free', kind: 'kpi', span: 6, rows: 4, x: 0, y: 0 },
          {
            id: 'panel',
            title: 'Side panel',
            span: 6,
            rows: 4,
            x: 6,
            y: 0,
            layout: 'tabs',
            widgets: [{ id: 'p-one', title: 'Filters', columns: 6, widgets: [{ id: 'tall', kind: 'kpi', span: 6, rows: 12, x: 0, y: 0 }] }],
          },
        ],
      })
    );
    const inside = () => {
      const pg = model.getGroup('p-one')!;
      const t = model.getNode('tall')!;
      return t.position.y + t.size.height <= pg.position.y + pg.size!.height + 1;
    };
    expect(inside()).toBe(true);
    handle.setSizing('grow');
    await settle();
    expect(handle.getSizing()).toBe('grow');
    expect(inside()).toBe(true);
    handle.setSizing('fit');
    await settle();
    expect(inside()).toBe(true);
  });
});

describe('tab drags on a SPLIT board', () => {
  const settle = () => new Promise<void>((r) => setTimeout(r, 0));
  const stripOf = (api: { container: HTMLElement }, id: string) =>
    Array.from(api.container.querySelectorAll(`.axdb-tabs[data-tabs-id="${id}"] .axdb-tab`)).map((t) => t.textContent);
  const cm = (api: ReturnType<typeof makeApi>) => api.getEngine().commandManager;
  const dragTabFrom = async (api: { container: HTMLElement }, containerId: string, pageId: string, from: { x: number; y: number }, to: { x: number; y: number }) => {
    const tab = api.container.querySelector(`.axdb-tabs[data-tabs-id="${containerId}"] .axdb-tab[data-tab-id="${pageId}"]`) as HTMLElement;
    const ev = (el: EventTarget, type: string, x: number, y: number) =>
      el.dispatchEvent(Object.assign(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y }), { pointerId: 1 }));
    ev(tab, 'pointerdown', from.x, from.y);
    ev(tab, 'pointermove', from.x - 40, from.y);
    ev(window, 'pointermove', to.x, to.y);
    ev(window, 'pointerup', to.x, to.y);
    tab.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await settle();
  };
  const leaves = (model: DiagramModel) => splitLeaves((model.getGroup('main')!.getMetadata(SPLIT_TREE_KEY) ?? null) as SplitNode | null);
  const ONE = () =>
    dashboard({
      columns: 12,
      width: 1200,
      height: 600,
      rowHeight: 60,
      layout: 'split',
      widgets: [
        { id: 'other', kind: 'kpi', span: 6, rows: 4, x: 0, y: 0 },
        {
          id: 'panel',
          title: 'Side panel',
          span: 6,
          rows: 4,
          x: 6,
          y: 0,
          layout: 'tabs',
          widgets: [PAGE('p-one', 'Filters', 'k-one'), PAGE('p-two', 'Alerts', 'k-two'), PAGE('p-three', 'Notes', 'k-three')],
        },
      ],
    });
  const TWO = () =>
    dashboard({
      columns: 12,
      width: 1200,
      height: 600,
      rowHeight: 60,
      layout: 'split',
      widgets: [
        { id: 'left', title: 'Left group', span: 6, rows: 6, x: 0, y: 0, layout: 'tabs', widgets: [PAGE('l1', 'Sales', 'k-l1'), PAGE('l2', 'Margin', 'k-l2')] },
        { id: 'right', title: 'Right group', span: 6, rows: 6, x: 6, y: 0, layout: 'tabs', widgets: [PAGE('r1', 'Filters', 'k-r1'), PAGE('r2', 'Notes', 'k-r2')] },
      ],
    });

  it('a tab dragged onto a pane\'s edge becomes a one-tab group that is a PANE there — inserted where the split board inserts a dropped widget; undo puts it back', async () => {
    const { api, model, handle } = up(ONE());
    expect(leaves(model)).toEqual(['other', 'panel']);
    // released 48 px inside the LEFT edge of the "other" pane — past the board's 18 px outer band
    await dragTabFrom(api, 'panel', 'p-two', { x: 900, y: 10 }, { x: 60, y: 300 });
    expect(stripOf(api, 'panel')).toEqual(['Filters', 'Notes']);
    const born = model.getGroup('p-two__group');
    expect(born).toBeDefined();
    expect(born!.members!.has('p-two')).toBe(true);
    expect(model.getGroup('panel')!.members!.has('p-two')).toBe(false);
    expect(handle.getLayout('p-two__group')).toBe('tabs');
    expect(stripOf(api, 'p-two__group')).toEqual(['Alerts']);
    // it is a LEAF of the split tree, left of the pane it was dropped on
    expect(leaves(model)).toEqual(['p-two__group', 'other', 'panel']);
    const other = model.getNode('other')!;
    expect(born!.position.x).toBeLessThan(other.position.x);
    expect(born!.size!.width).toBeGreaterThan(50);
    // its widget shows inside the new pane
    const k = model.getNode('k-two')!;
    expect(k.position.x).toBeGreaterThan(PARKED);
    expect(k.position.x).toBeGreaterThanOrEqual(born!.position.x);
    expect(k.position.x + k.size.width).toBeLessThanOrEqual(born!.position.x + born!.size!.width + 1);
    // serialised as a third widget of the split board
    const snap = handle.toJSON().views[0].widgets;
    expect(snap.find((w) => w.id === 'p-two__group')!.layout).toBe('tabs');
    expect(snap.find((w) => w.id === 'panel')!.widgets?.map((p) => p.id)).toEqual(['p-one', 'p-three']);
    // ONE undo: the pane is gone, the tab is back
    await cm(api).undo();
    await settle();
    expect(stripOf(api, 'panel')).toEqual(['Filters', 'Alerts', 'Notes']);
    expect(model.getGroup('p-two__group')).toBeUndefined();
    expect(leaves(model)).toEqual(['other', 'panel']);
    expect(onCanvas(model, ['k-one', 'k-two', 'k-three'])).toEqual(['k-one']);
  });

  it('the pane is PAINTED from the inserted tree, not from the reconciled one — the largest leaf elsewhere is untouched, and the page fits the pane', async () => {
    // A batch adds the group before the tree swap; the split board's
    // member:added reconciles by halving the LARGEST leaf. The rects on the
    // canvas must follow the tree that was set, not that interim one.
    const { api, model } = up(
      dashboard({
        columns: 12,
        width: 1200,
        height: 600,
        rowHeight: 60,
        layout: 'split',
        sizing: 'grow',
        widgets: [
          { id: 'other', kind: 'kpi', span: 3, rows: 4, x: 0, y: 0 },
          { id: 'big', kind: 'line', span: 6, rows: 4, x: 3, y: 0 },
          {
            id: 'panel',
            title: 'Side panel',
            span: 3,
            rows: 4,
            x: 9,
            y: 0,
            layout: 'tabs',
            widgets: [PAGE('p-one', 'Filters', 'k-one'), { id: 'p-two', title: 'Alerts', columns: 3, widgets: [{ id: 'k-two', kind: 'kpi', span: 3, rows: 20, x: 0, y: 0 }] }],
          },
        ],
      })
    );
    const bigBefore = { ...model.getNode('big')!.size };
    // 48 px inside "other"'s left edge: past the board's 18 px outer band, nearest to the leaf's left side
    await dragTabFrom(api, 'panel', 'p-two', { x: 1100, y: 10 }, { x: 60, y: 300 });
    expect(leaves(model)).toEqual(['p-two__group', 'other', 'big', 'panel']);
    const born = model.getGroup('p-two__group')!;
    const other = model.getNode('other')!;
    const big = model.getNode('big')!;
    // the pane took HALF of "other"'s slot — "big" kept its width
    expect(born.position.x).toBeLessThan(other.position.x);
    expect(Math.abs(born.size!.width - other.size.width)).toBeLessThan(2);
    expect(Math.abs(big.size.width - bigBefore.width)).toBeLessThan(8); // one more gap in the row
    // a 20-row page inside a 600 px board: the pane is bounded, the page fits it
    expect(born.size!.height).toBeLessThanOrEqual(600);
    const k = model.getNode('k-two')!;
    expect(k.position.y + k.size.height).toBeLessThanOrEqual(born.position.y + born.size!.height + 1);
  });

  it('a tab dropped over the CENTRE of another container\'s body JOINS it on a split board — no new pane', async () => {
    const { api, model, handle } = up(TWO());
    const lf = (() => { const g = model.getGroup('left')!; return { x: g.position.x, y: g.position.y, w: g.size!.width, h: g.size!.height }; })();
    await dragTabFrom(api, 'right', 'r2', { x: 900, y: 10 }, { x: lf.x + lf.w / 2, y: lf.y + 30 + (lf.h - 30) / 2 });
    expect(stripOf(api, 'left')).toEqual(['Sales', 'Margin', 'Notes']);
    expect(stripOf(api, 'right')).toEqual(['Filters']);
    expect(handle.getActiveTab('left')).toBe('r2');
    expect(model.getGroup('r2__group')).toBeUndefined();
    expect(leaves(model)).toEqual(['left', 'right']);
    await cm(api).undo();
    await settle();
    expect(stripOf(api, 'left')).toEqual(['Sales', 'Margin']);
    expect(stripOf(api, 'right')).toEqual(['Filters', 'Notes']);
    expect(leaves(model)).toEqual(['left', 'right']);
  });

  it('a tab GROUP moves by its strip\'s empty space on a split board — dropped on the other pane\'s edge the two swap sides; undo puts it back', async () => {
    // The split peer answered dragMember with false ("no cells to move a
    // section across"), so a press on the strip's empty space only selected —
    // a tab group could not be moved at all on a split board, let alone
    // swapped with its neighbour (the user's report). The board's own drop
    // model moves it: the insertion line marks the pane edge, release
    // re-inserts the group there.
    const { api, model } = up(TWO());
    expect(leaves(model)).toEqual(['left', 'right']);
    const strip = api.container.querySelector('.axdb-tabs[data-tabs-id="right"]') as HTMLElement;
    const ev = (el: EventTarget, type: string, x: number, y: number) =>
      el.dispatchEvent(Object.assign(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y }), { pointerId: 1 }));
    const lf = model.getGroup('left')!;
    const to = { x: lf.position.x + 40, y: lf.position.y + lf.size!.height / 2 }; // the left pane's left edge, past the board's outer band
    ev(strip, 'pointerdown', 1100, 10); // the strip itself, not a tab
    ev(window, 'pointermove', 1060, 10);
    ev(window, 'pointermove', to.x, to.y);
    expect(api.container.querySelector('.axdb-ins')).not.toBeNull(); // the insertion line while held
    ev(window, 'pointerup', to.x, to.y);
    await settle();
    expect(leaves(model)).toEqual(['right', 'left']);
    expect(model.getGroup('right')!.position.x).toBeLessThan(model.getGroup('left')!.position.x);
    expect(stripOf(api, 'left')).toEqual(['Sales', 'Margin']);
    expect(stripOf(api, 'right')).toEqual(['Filters', 'Notes']);
    expect(api.container.querySelector('.axdb-ins')).toBeNull();
    await cm(api).undo();
    await settle();
    expect(leaves(model)).toEqual(['left', 'right']);
    expect(model.getGroup('left')!.position.x).toBeLessThan(model.getGroup('right')!.position.x);
  });

  it('a tab group released over NOTHING on a split board stays put, and a static split board refuses the drag', async () => {
    const { api, model } = up(TWO());
    const strip = api.container.querySelector('.axdb-tabs[data-tabs-id="right"]') as HTMLElement;
    const ev = (el: EventTarget, type: string, x: number, y: number) =>
      el.dispatchEvent(Object.assign(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y }), { pointerId: 1 }));
    ev(strip, 'pointerdown', 1100, 10);
    ev(window, 'pointermove', 1060, 10);
    ev(window, 'pointermove', 5000, 5000);
    ev(window, 'pointerup', 5000, 5000);
    await settle();
    expect(leaves(model)).toEqual(['left', 'right']);
    expect(api.container.querySelector('.axdb-ins')).toBeNull();
  });

  it('a captioned SECTION on a split board paints its band, its children start below it, and the band drags the section to another pane\'s edge', async () => {
    // "captioned sections on a SPLIT board · no chrome to paint them, so no
    // reserve" was the 0.4.22 limitation: switching the fluid demo to Split
    // made the Operations band vanish and its two KPIs sit bare in the pane
    // (the user's report). The split board paints slabs and bands now, the
    // child board reserves the band, and the band is the section's handle.
    const { api, model } = up(
      dashboard({
        columns: 12,
        width: 1200,
        height: 600,
        gap: 10,
        rowHeight: 60,
        layout: 'split',
        widgets: [
          { id: 'sec', title: 'Operations', span: 6, rows: 4, x: 0, y: 0, columns: 6, caption: { subtitle: 'live since 08:00' }, widgets: [{ id: 'c1', kind: 'kpi', span: 6, rows: 4, x: 0, y: 0 }] },
          { id: 'w', kind: 'kpi', span: 6, rows: 4, x: 6, y: 0 },
        ],
      })
    );
    const band = api.container.querySelector('.axdb-slab[data-slab-id="sec"] > .axdb-slab-h') as HTMLElement | null;
    expect(band).not.toBeNull();
    expect(band!.textContent).toContain('Operations');
    expect(band!.textContent).toContain('live since 08:00');
    const sec = model.getGroup('sec')!;
    const c1 = model.getNode('c1')!;
    expect(parseFloat(band!.style.height)).toBe(44); // the subtitle tier
    expect(c1.position.y).toBeGreaterThanOrEqual(sec.position.y + 44 - 1); // the child starts under the band
    expect(c1.position.y + c1.size.height).toBeLessThanOrEqual(sec.position.y + sec.size!.height + 1);
    expect(leaves(model)).toEqual(['sec', 'w']);
    // the band is the section's handle: pressed through the board's tool it selects, travelled it drags
    const tool = splitToolOf('main');
    const wr = model.getNode('w')!;
    const src = { target: band, clientX: 100, clientY: 20, pointerId: 1 } as unknown as PointerEvent;
    tool.onPointerDown?.({ ...tev('down', 100, 20), source: src } as ToolPointerEvent, { empty: true } as never);
    expect(api.container.querySelector('.axdb-slab[data-slab-id="sec"]')!.classList.contains('axdb-slab--selected')).toBe(true);
    const ev = (el: EventTarget, type: string, x: number, y: number) =>
      el.dispatchEvent(Object.assign(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y }), { pointerId: 1 }));
    const to = { x: wr.position.x + wr.size.width - 40, y: wr.position.y + wr.size.height / 2 }; // w's right edge, past the outer band
    ev(window, 'pointermove', 140, 20);
    ev(window, 'pointermove', to.x, to.y);
    expect(api.container.querySelector('.axdb-ins')).not.toBeNull();
    ev(window, 'pointerup', to.x, to.y);
    await settle();
    expect(leaves(model)).toEqual(['w', 'sec']);
    expect(model.getGroup('sec')!.position.x).toBeGreaterThan(model.getNode('w')!.position.x);
    // the band followed the section to its new pane, and the child still sits under it
    const band2 = api.container.querySelector('.axdb-slab[data-slab-id="sec"] > .axdb-slab-h') as HTMLElement;
    expect(band2.textContent).toContain('Operations');
    const sec2 = model.getGroup('sec')!;
    expect(model.getNode('c1')!.position.y).toBeGreaterThanOrEqual(sec2.position.y + 44 - 1);
    await cm(api).undo();
    await settle();
    expect(leaves(model)).toEqual(['sec', 'w']);
  });

  it('a tab released OUTSIDE the split board cancels: nothing moves, the container keeps its page', async () => {
    const { api, model, handle } = up(ONE());
    await dragTabFrom(api, 'panel', 'p-two', { x: 900, y: 10 }, { x: 5000, y: 5000 });
    expect(stripOf(api, 'panel')).toEqual(['Filters', 'Alerts', 'Notes']);
    expect(model.getGroup('p-two__group')).toBeUndefined();
    expect(leaves(model)).toEqual(['other', 'panel']);
    expect(handle.getActiveTab('panel')).toBe('p-one');
    expect(api.container.querySelector('.axdb-tab-chip')).toBeNull();
    expect(api.container.querySelector('.axdb-ins')).toBeNull();
  });
});
