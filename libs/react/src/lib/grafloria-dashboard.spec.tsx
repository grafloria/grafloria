/**
 * TDD — <GrafloriaDashboard>, written BEFORE the implementation.
 *
 * The dashboard kit, the React way: `views` declare the board, the kit's
 * built-in painters draw kpi/line/bar/donut/funnel/table, and `widgetTypes`
 * maps a widget `kind` to a REAL React component (portal-mounted, so hooks
 * and context work) — the exact `nodeTypes` idiom, applied to boards.
 */
import { act, render, screen, waitFor } from '@testing-library/react';
import { StrictMode, memo, useEffect, useState } from 'react';
import { listTools } from '@grafloria/renderer';
import { GrafloriaDashboard } from './grafloria-dashboard';
import type { GrafloriaDashboardProps, WidgetProps } from './grafloria-dashboard';
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

/**
 * After mount, data reaches a board through the handle: `widget(id).update()`
 * and `repaint()`. The kit paints again into the SAME host, handing back the
 * same spec object, so the wrapper must re-render that one portal on every
 * paint. The card is re-rendered, not remounted (its state survives), the board
 * is not rebuilt, and a card the paint did not touch does not render at all.
 * Each paint hands the card a new `data` object, so a `React.memo` card follows
 * too — including a `repaint()` after its data was changed in place.
 */
describe('<GrafloriaDashboard> widget components follow update() and repaint()', () => {
  type CardData = { title: string; count?: number };
  const renders: Record<string, number> = {};
  function Card({ widget, data }: WidgetProps<CardData>) {
    renders[widget.id] = (renders[widget.id] ?? 0) + 1;
    const [clicks, setClicks] = useState(0);
    return (
      <div data-testid={`card-${widget.id}`} onClick={() => setClicks((n) => n + 1)}>
        {widget.title ? `${widget.title}: ` : ''}
        {data.title}
        {data.count !== undefined ? ` · ${data.count}` : ''} ({clicks})
      </div>
    );
  }
  const MemoCard = memo(Card);
  const text = (id: string) => screen.getByTestId(`card-${id}`).textContent;

  // Fresh specs per mount: update() writes into the spec it was given.
  const mount = async (component: typeof Card | typeof MemoCard, options: GrafloriaDashboardProps['options'] = {}) => {
    let handle: DashboardHandle | undefined;
    const onReady = jest.fn((h: DashboardHandle) => (handle = h));
    const r = render(
      <GrafloriaDashboard
        widgets={[
          { id: 'a', kind: 'card', span: 6, data: { title: 'Draft' } },
          { id: 'b', kind: 'card', span: 6, data: { title: 'Backlog' } },
        ]}
        widgetTypes={{ card: component as never }}
        options={{ width: 1200, height: 600, ...options }}
        onReady={onReady}
      />
    );
    await waitFor(() => expect(screen.getByTestId('card-a')).toBeTruthy());
    return { ...r, handle: handle!, onReady };
  };

  it('update({ data }) reaches the card, which keeps its state, on the same board', async () => {
    const { container, handle, onReady } = await mount(Card);
    const host = container.querySelector('[data-node-id="a"]') as HTMLElement;
    act(() => screen.getByTestId('card-a').click());
    expect(text('a')).toBe('Draft (1)');

    act(() => handle.widget('a')!.update({ data: { title: 'Approved' } }));
    await waitFor(() => expect(text('a')).toBe('Approved (1)'));
    act(() => handle.widget('a')!.update({ data: { title: 'Approved', count: 3 } }));
    await waitFor(() => expect(text('a')).toBe('Approved · 3 (1)'));

    // Not remounted: one onReady, the same host, the card still inside it.
    expect(onReady).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[data-node-id="a"]')).toBe(host);
    expect(host.contains(screen.getByTestId('card-a'))).toBe(true);
    expect(text('b')).toBe('Backlog (0)');
  });

  it('a React.memo card follows update({ title }) and repaint() after an in-place change', async () => {
    const { handle } = await mount(MemoCard);
    act(() => handle.widget('a')!.update({ title: 'Sprint 4' }));
    await waitFor(() => expect(text('a')).toBe('Sprint 4: Draft (0)'));

    (handle.widget('a')!.spec.data as CardData).count = 7;
    act(() => handle.widget('a')!.repaint());
    await waitFor(() => expect(text('a')).toBe('Sprint 4: Draft · 7 (0)'));
  });

  it('updating one card renders no other card', async () => {
    const { handle } = await mount(MemoCard);
    const before = renders['b'];
    act(() => handle.widget('a')!.update({ data: { title: 'Approved' } }));
    await waitFor(() => expect(text('a')).toBe('Approved (0)'));
    expect(renders['b']).toBe(before);
  });

  // A removed widget's host leaves the board, and its card must go with it:
  // unmounted, its effects cleaned up — not left running in a detached element
  // until the whole board goes. No other card remounts.
  it('removing a card unmounts its component; the other cards stay mounted', async () => {
    const life: string[] = [];
    function Tracked(props: WidgetProps<CardData>) {
      const { id } = props.widget;
      useEffect(() => {
        life.push(`mount ${id}`);
        return () => void life.push(`unmount ${id}`);
      }, [id]);
      return <Card {...props} />;
    }
    const { container, handle } = await mount(Tracked);
    act(() => screen.getByTestId('card-b').click());
    expect([...life].sort()).toEqual(['mount a', 'mount b']);
    const host = container.querySelector('[data-node-id="a"]') as HTMLElement;
    const card = screen.getByTestId('card-a');
    expect(host.contains(card)).toBe(true);

    act(() => handle.widget('a')!.remove());
    await waitFor(() => expect(life).toContain('unmount a'));
    expect(host.isConnected).toBe(false);
    expect(host.contains(card)).toBe(false); // React took it out of the host
    expect([...life].sort()).toEqual(['mount a', 'mount b', 'unmount a']);
    expect(text('b')).toBe('Backlog (1)'); // b never remounted: its state survives
  });

  it("a caller's own options.unmountWidget still hears a removed card's host", async () => {
    const heard: Array<[string, HTMLElement]> = [];
    const { container, handle } = await mount(Card, { unmountWidget: (id, host) => void heard.push([id, host]) });
    const host = container.querySelector('[data-node-id="a"]') as HTMLElement;
    act(() => handle.widget('a')!.remove());
    await waitFor(() => expect(screen.queryByTestId('card-a')).toBeNull());
    expect(heard).toEqual([['a', host]]);
  });

  it('a card removed and brought back by Ctrl+Z is painted into its new host', async () => {
    const { container, handle } = await mount(Card);
    act(() => handle.widget('a')!.remove());
    await waitFor(() => expect(container.querySelector('[data-node-id="a"]')).toBeNull());
    const other = container.querySelector('[data-node-id="b"]') as HTMLElement;
    act(() => {
      other.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', code: 'KeyZ', ctrlKey: true, bubbles: true, cancelable: true }));
    });
    await waitFor(() => expect(handle.widget('a')).toBeDefined());
    const host = await waitFor(() => container.querySelector('[data-node-id="a"]') as HTMLElement);
    await waitFor(() => expect(host.textContent).toBe('Draft (0)'));
  });

  // `update({ kind })` can hand a widget from its component to a built-in
  // painter and back. The painter empties the host, so it paints once React
  // has taken the card out; and the card replaces the painter's markup.
  it('update({ kind }) hands a card to a built-in painter and back, and the board keeps working', async () => {
    const { container, handle, unmount } = await mount(Card);
    const host = () => container.querySelector('[data-node-id="a"]') as HTMLElement;
    act(() => handle.widget('a')!.update({ kind: 'kpi', data: { label: 'Revenue', value: '$6.8M' } }));
    await waitFor(() => expect(host().textContent).toBe('Revenue$6.8M'));
    expect(screen.queryByTestId('card-a')).toBeNull();
    // The next paint of another card renders the board again.
    act(() => handle.widget('b')!.update({ data: { title: 'Doing' } }));
    await waitFor(() => expect(text('b')).toBe('Doing (0)'));
    act(() => handle.widget('a')!.update({ kind: 'card', data: { title: 'Back' } }));
    await waitFor(() => expect(host().textContent).toBe('Back (0)'));
    unmount();
  });

  it('kinds switched twice in one go end on the last one', async () => {
    const { container, handle } = await mount(Card);
    const host = () => container.querySelector('[data-node-id="a"]') as HTMLElement;
    const settle = () => act(() => new Promise((r) => setTimeout(r, 30)));
    act(() => screen.getByTestId('card-a').click());
    act(() => {
      handle.widget('a')!.update({ kind: 'kpi', data: { label: 'Revenue', value: '$1' } });
      handle.widget('a')!.update({ kind: 'card', data: { title: 'Kept' } });
    });
    await settle();
    expect(host().textContent).toBe('Kept (1)'); // never taken out: its state survives
    act(() => {
      handle.widget('a')!.update({ kind: 'kpi', data: { label: 'Revenue', value: '$2' } });
      handle.widget('a')!.update({ kind: 'kpi', data: { label: 'Profit', value: '$3' } });
    });
    await settle();
    expect(host().textContent).toBe('Profit$3');
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

/**
 * StrictMode (the Vite react-ts template default) mounts, cleans up and mounts
 * again. The cleanup disposed the instance but not the board: the first board's
 * canvas tools stayed registered and kept claiming presses in the same element,
 * so a drag landed in a dead history (Ctrl+Z threw "Cannot undo command: Move
 * widget"), a split divider did nothing, and a Kanban caption drag painted both
 * caption sets. Driven here with real mouse events through the renderer.
 */
describe('<GrafloriaDashboard> under React StrictMode', () => {
  const mouse = (type: string, x: number, y: number, target: EventTarget) =>
    act(() => {
      target.dispatchEvent(new MouseEvent(type, { bubbles: true, button: 0, clientX: x, clientY: y }));
    });
  const flush = () => new Promise((r) => setTimeout(r, 20));
  // Hand speed: five steps, a frame apart. The press lands on the element;
  // the moves land on the board element, as the browser delivers them once the
  // pressed element is re-painted away (a divider is redrawn on every move).
  const dragBy = async (target: HTMLElement, x: number, y: number, dx: number, dy: number) => {
    const board = target.closest('.grafloria-diagram-root')?.parentElement ?? target;
    mouse('mousedown', x, y, target);
    for (let i = 1; i <= 5; i++) {
      mouse('mousemove', x + (dx * i) / 5, y + (dy * i) / 5, board);
      await act(flush);
    }
    mouse('mouseup', x + dx, y + dy, board);
  };
  const dashTools = () => listTools().filter((id) => id.startsWith('dashboard-'));
  const mount = async (props: GrafloriaDashboardProps) => {
    let handle: DashboardHandle | undefined;
    const r = render(<StrictMode><GrafloriaDashboard {...props} onReady={(h) => (handle = h)} /></StrictMode>);
    await waitFor(() => expect(handle).toBeTruthy());
    return { ...r, handle: handle! };
  };
  const W = [
    { id: 'a', kind: 'kpi', span: 6, rows: 1 },
    { id: 'b', kind: 'kpi', span: 6, rows: 1 },
    { id: 'c', kind: 'kpi', span: 12, rows: 1 },
  ];

  it('one board, one set of tools — and none left after unmount', async () => {
    const before = dashTools().length;
    const { unmount } = await mount({ widgets: W, options: { width: 1200, height: 600 } });
    expect(dashTools().length - before).toBe(1);
    unmount();
    expect(dashTools().length).toBe(before);
  });

  it('Ctrl+Z after a widget drag puts the widget back', async () => {
    const { container, handle, unmount } = await mount({ widgets: W, options: { width: 1200, height: 600 } });
    const rect = handle.widget('b')!.rect!;
    const host = container.querySelector('[data-node-id="b"]') as HTMLElement;
    await dragBy(host, rect.x + rect.width / 2, rect.y + 14, 0, 450);
    await flush();
    expect(handle.widget('b')!.cell!.y).toBeGreaterThan(0);
    const rejections: unknown[] = [];
    const onRejection = (e: unknown) => rejections.push(e);
    process.on('unhandledRejection', onRejection);
    act(() => {
      host.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', code: 'KeyZ', ctrlKey: true, bubbles: true, cancelable: true }));
    });
    await flush();
    process.off('unhandledRejection', onRejection);
    expect(rejections).toEqual([]);
    expect(handle.widget('b')!.cell).toEqual({ x: 6, y: 0, w: 6, h: 1 });
    unmount();
  });

  it('a split divider drag resizes the panes', async () => {
    const { container, handle, unmount } = await mount({ widgets: W, layout: 'split', options: { width: 1200, height: 600 } });
    const widthOf = (id: string) => Math.round(handle.widget(id)!.rect!.width);
    const [a0, b0] = [widthOf('a'), widthOf('b')];
    const div = container.querySelector('.axdb-div--row') as HTMLElement;
    expect(div).toBeTruthy();
    const x = parseFloat(div.style.left) + parseFloat(div.style.width || '0') / 2;
    const y = parseFloat(div.style.top) + parseFloat(div.style.height || '0') / 2;
    await dragBy(div, x, y, 200, 0);
    await flush();
    expect(widthOf('a')).toBeGreaterThan(a0 + 100);
    expect(widthOf('b')).toBeLessThan(b0 - 100);
    unmount();
  });

  it('a Kanban caption drag swaps the lists and paints one caption set', async () => {
    const list = (id: string, title: string) => ({
      id, title, span: 1, rows: 20, columns: 1, pinned: true, movable: 'row' as const, resizable: false, stack: true,
      caption: { text: title, height: 40 }, widgets: [],
    });
    const { container, unmount } = await mount({
      widgets: [list('a', 'Alpha'), list('b', 'Beta')],
      options: { columns: 2, sizing: 'grow', rowHeight: 8, width: 1200, height: 300 },
    });
    const captions = () =>
      Array.from(container.querySelectorAll('.axdb-slab-h')).map((e) => {
        const slab = e.parentElement as HTMLElement;
        return `${e.textContent?.trim()}@${Math.round(parseFloat(slab.style.left))}`;
      });
    expect(captions().map((c) => c.split('@')[0])).toEqual(['Alpha', 'Beta']);
    const beta = Array.from(container.querySelectorAll('.axdb-slab-h')).find((e) => e.textContent?.includes('Beta')) as HTMLElement;
    const alphaLeft = parseFloat((container.querySelector('[data-slab-id="a"]') as HTMLElement).style.left);
    const betaSlab = beta.parentElement as HTMLElement;
    const bx = parseFloat(betaSlab.style.left) + 30;
    const by = parseFloat(betaSlab.style.top) + 20;
    await dragBy(beta, bx, by, alphaLeft + 30 - bx, 0);
    await flush();
    const after = captions();
    expect(after).toHaveLength(2);
    const x = (t: string) => Number(after.find((c) => c.startsWith(t))!.split('@')[1]);
    expect(x('Beta')).toBeLessThan(x('Alpha'));
    unmount();
  });
});
