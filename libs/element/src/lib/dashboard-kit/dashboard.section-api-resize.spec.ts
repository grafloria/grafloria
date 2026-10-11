/**
 * `widget(id).resize()` past a section's `maxRows` grows the section — the same
 * ratchet a hand pull and content height (`fitRows`) use — pushing whatever lies
 * below it, sections included, as ONE undoable step. It used to clamp silently at
 * the section's rows while the hand grew it.
 *
 * The board is the nest-dashboard-containers page's own.
 */
import { render } from '../grafloria';
import { dashboard, type DashboardWidgetSpec } from './dashboard';

function sizedHost(): HTMLElement {
  const el = document.createElement('div');
  Object.defineProperty(el, 'clientWidth', { value: 1000 });
  Object.defineProperty(el, 'clientHeight', { value: 620 });
  el.getBoundingClientRect = () =>
    ({ x: 0, y: 0, top: 0, left: 0, right: 1000, bottom: 620, width: 1000, height: 620 }) as DOMRect;
  document.body.appendChild(el);
  return el;
}

const KPIS: DashboardWidgetSpec = {
  id: 'kpis', title: 'Sales KPIs', span: 6, rows: 2, columns: 4, maxRows: 2,
  widgets: [
    { id: 'revenue', kind: 'kpi', title: 'Revenue', span: 1, data: { label: 'Revenue', value: '$6.8M' } },
    { id: 'customers', kind: 'kpi', title: 'Customers', span: 1, data: { label: 'Customers', value: '1,284' } },
  ],
};
const DETAILS: DashboardWidgetSpec = {
  id: 'details', title: 'Details', span: 4, rows: 2, layout: 'tabs', active: 'pipeline',
  widgets: [
    { id: 'pipeline', title: 'Pipeline', columns: 2, widgets: [{ id: 'deals', kind: 'kpi', span: 2, data: { label: 'Open deals', value: '47' } }] },
    { id: 'service', title: 'Service', columns: 2, widgets: [{ id: 'nps', kind: 'kpi', span: 2, data: { label: 'NPS', value: '61' } }] },
  ],
};
const MIX: DashboardWidgetSpec = { id: 'mix', kind: 'kpi', title: 'By region', span: 2, rows: 2, data: { label: 'mix', value: '3' } };

const mount = (widgets: DashboardWidgetSpec[]) => {
  const spec = dashboard({ columns: 6, width: 1000, height: 620, dragHandle: true, views: [{ id: 'main', widgets }] });
  const instance = render(spec, sizedHost());
  instance.renderNow();
  return { handle: spec.handle, instance };
};
const settle = () => new Promise<void>((r) => setTimeout(r, 0));

describe('widget.resize() past a section\'s rows grows the section', () => {
  it('with only widgets below it', async () => {
    const { handle } = mount([KPIS, MIX]);
    expect(await handle.widget('revenue')!.resize(1, 3)).toBe(true);
    await settle();
    expect(handle.widget('revenue')!.cell!.h).toBe(3);
    expect(handle.widget('kpis')!.cell!.h).toBe(3);
  });

  it('pushing a section below it, as one undoable step', async () => {
    const { handle, instance } = mount([KPIS, DETAILS, MIX]);
    const details0 = { ...handle.widget('details')!.cell! };
    expect(await handle.widget('revenue')!.resize(1, 3)).toBe(true);
    await settle();
    expect(handle.widget('revenue')!.cell!.h).toBe(3);
    expect(handle.widget('kpis')!.cell!.h).toBe(3);
    expect(handle.widget('details')!.cell!.y).toBe(details0.y + 1);
    // …and it is the saved layout too, not only the live one
    const saved = handle.toJSON().views[0].widgets;
    expect(saved.find((w) => w.id === 'kpis')!.rows).toBe(3);
    expect(saved.find((w) => w.id === 'kpis')!.widgets!.find((w) => w.id === 'revenue')!.rows).toBe(3);

    await instance.getEngine().undo();
    await settle();
    expect(handle.widget('revenue')!.cell!.h).toBe(1);
    expect(handle.widget('kpis')!.cell!.h).toBe(2);
    expect(handle.widget('details')!.cell).toEqual(details0);

    await instance.getEngine().redo();
    await settle();
    expect(handle.widget('revenue')!.cell!.h).toBe(3);
    expect(handle.widget('kpis')!.cell!.h).toBe(3);
    expect(handle.widget('details')!.cell!.y).toBe(details0.y + 1);
  });

  it("a section with sizing 'fit' holds its frame: the child stops at its rows", async () => {
    const { handle } = mount([{ ...KPIS, sizing: 'fit' }, DETAILS, MIX]);
    await handle.widget('revenue')!.resize(1, 3);
    await settle();
    expect(handle.widget('revenue')!.cell!.h).toBe(2);
    expect(handle.widget('kpis')!.cell!.h).toBe(2);
  });
});
