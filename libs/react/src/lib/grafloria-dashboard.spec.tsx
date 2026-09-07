/**
 * TDD — <GrafloriaDashboard>, written BEFORE the implementation.
 *
 * The dashboard kit, the React way: `views` declare the board, the kit's
 * built-in painters draw kpi/line/bar/donut/funnel/table, and `widgetTypes`
 * maps a widget `kind` to a REAL React component (portal-mounted, so hooks
 * and context work) — the exact `nodeTypes` idiom, applied to boards.
 */
import { render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { GrafloriaDashboard } from './grafloria-dashboard';
import type { WidgetProps } from './grafloria-dashboard';
import type { DashboardHandle, DashboardViewSpec } from '@grafloria/element';

const VIEWS: DashboardViewSpec[] = [
  {
    id: 'sales',
    widgets: [
      { id: 'rev', kind: 'kpi', span: 3, data: { label: 'Revenue', value: '$6.8M' } },
      { id: 'note', kind: 'custom', span: 4, data: { title: 'Hello widget' } },
    ],
  },
  { id: 'ops', widgets: [{ id: 'cpu', kind: 'kpi', span: 3, data: { label: 'CPU', value: '42%' } }] },
];

function CustomWidget({ widget, data }: WidgetProps<{ title: string }>) {
  const [clicks, setClicks] = useState(0);
  return (
    <div data-testid={`w-${widget.id}`} onClick={() => setClicks(clicks + 1)}>
      {data.title} ({clicks})
    </div>
  );
}

describe('<GrafloriaDashboard>', () => {
  it('mounts the board and paints built-in widgets from data', async () => {
    const onReady = jest.fn();
    const { container } = render(
      <GrafloriaDashboard views={VIEWS} onReady={onReady} />
    );
    await waitFor(() => expect(onReady).toHaveBeenCalled());
    expect(container.textContent).toContain('Revenue');
    expect(container.textContent).toContain('$6.8M');
  });

  it('widgetTypes renders a kind through a real React component — with state', async () => {
    render(
      <GrafloriaDashboard views={VIEWS} widgetTypes={{ custom: CustomWidget as never }} />
    );
    await waitFor(() => expect(screen.getByTestId('w-note')).toBeTruthy());
    expect(screen.getByTestId('w-note').textContent).toContain('Hello widget (0)');
    screen.getByTestId('w-note').click();
    await waitFor(() => expect(screen.getByTestId('w-note').textContent).toContain('(1)'));
  });

  it('onReady hands out the typed handle; activeView prop switches views', async () => {
    let handle: DashboardHandle | undefined;
    const { rerender } = render(
      <GrafloriaDashboard views={VIEWS} onReady={(h) => (handle = h)} activeView="sales" />
    );
    await waitFor(() => expect(handle).toBeTruthy());
    expect(handle!.views).toEqual(['sales', 'ops']);
    expect(handle!.activeView).toBe('sales');

    rerender(<GrafloriaDashboard views={VIEWS} onReady={() => undefined} activeView="ops" />);
    await waitFor(() => expect(handle!.activeView).toBe('ops'));
  });

  it('toJSON round-trips as dashboard() input', async () => {
    let handle: DashboardHandle | undefined;
    render(<GrafloriaDashboard views={VIEWS} onReady={(h) => (handle = h)} />);
    await waitFor(() => expect(handle).toBeTruthy());
    const snap = handle!.toJSON();
    expect(snap.views.map((v: { id?: string }) => v.id)).toEqual(['sales', 'ops']);
  });

  it('unmount cleans the board DOM', async () => {
    const { unmount } = render(
      <GrafloriaDashboard views={VIEWS} widgetTypes={{ custom: CustomWidget as never }} />
    );
    await waitFor(() => expect(screen.getByTestId('w-note')).toBeTruthy());
    unmount();
    expect(document.querySelector('[data-testid="w-note"]')).toBeNull();
  });
});

describe('<GrafloriaDashboard> live switches (layout / sizing / static as props)', () => {
  const W: DashboardViewSpec[] = [
    { id: 'main', widgets: [{ id: 'a', kind: 'kpi', span: 6 }, { id: 'b', kind: 'kpi', span: 6 }, { id: 'c', kind: 'line', span: 12, rows: 2 }] },
  ];
  it('boots in the layout and sizing the props name, over options', async () => {
    let handle: DashboardHandle | undefined;
    render(<GrafloriaDashboard views={W} options={{ width: 1200, height: 600, layout: 'grid' }} layout="split" static onReady={(h) => (handle = h)} />);
    await waitFor(() => expect(handle).toBeTruthy());
    expect(handle!.getLayout()).toBe('split');
    expect(handle!.getSizing()).toBe('fit');
    expect(handle!.getStatic()).toBe(true);
  });
  it('a changed prop is one handle call, not a remount: the same handle switches', async () => {
    let handle: DashboardHandle | undefined;
    const onReady = jest.fn((h: DashboardHandle) => (handle = h));
    const { rerender } = render(<GrafloriaDashboard views={W} options={{ width: 1200, height: 600 }} layout="grid" sizing="fit" onReady={onReady} />);
    await waitFor(() => expect(handle).toBeTruthy());
    const first = handle;
    rerender(<GrafloriaDashboard views={W} options={{ width: 1200, height: 600 }} layout="split" sizing="fit" onReady={onReady} />);
    await waitFor(() => expect(first!.getLayout()).toBe('split'));
    rerender(<GrafloriaDashboard views={W} options={{ width: 1200, height: 600 }} layout="grid" sizing="grow" onReady={onReady} />);
    await waitFor(() => expect(first!.getLayout()).toBe('grid'));
    expect(first!.getSizing()).toBe('grow');
    expect(onReady).toHaveBeenCalledTimes(1); // mounted once
    expect(handle).toBe(first);
  });
  it('the layout prop names the whole board: a parked view switches too', async () => {
    let handle: DashboardHandle | undefined;
    const { rerender } = render(<GrafloriaDashboard views={VIEWS} options={{ width: 1200, height: 600 }} layout="grid" onReady={(h) => (handle = h)} />);
    await waitFor(() => expect(handle).toBeTruthy());
    rerender(<GrafloriaDashboard views={VIEWS} options={{ width: 1200, height: 600 }} layout="split" onReady={() => undefined} />);
    await waitFor(() => expect(handle!.getLayout('sales')).toBe('split'));
    expect(handle!.getLayout('ops')).toBe('split');
  });
});
