/**
 * The cards of the Qwik `<GrafloriaDashboard>`, driven against a real board.
 *
 * The component itself mounts in a visible task, which jest cannot fire (see
 * grafloria-flow.spec.tsx for why), so this drives `widgetMounts` — the card
 * mounting the component hands the kit — through element's real `dashboard()`
 * and `render()`, with real Qwik components mounted by Qwik's `render()`.
 */
import * as qwik from '@builder.io/qwik';
import { component$, useTask$ } from '@builder.io/qwik';
import { dashboard, render, type DashboardWidgetSpec } from '@grafloria/element';
import type { DiagramInstance } from '@grafloria/renderer';
import { widgetMounts, type WidgetProps, type WidgetTypes } from './dashboard-widgets';

const life: string[] = [];
const Tracked = component$<WidgetProps>((props) => {
  const id = props.widget.id;
  useTask$(({ cleanup }) => {
    life.push(`mount ${id}`);
    cleanup(() => life.push(`unmount ${id}`));
  });
  return <div class="tracked" data-card={id}>{id}</div>;
});
const TYPES: WidgetTypes = { card: Tracked as never };

// A card whose task waits for its data while `gate` is set: each paint is
// numbered, and a paint still waiting keeps Qwik's render() running.
let gate: Promise<void> | null = null;
const Waiting = component$<WidgetProps>((props) => {
  const id = props.widget.id;
  useTask$(async ({ cleanup }) => {
    const n = life.filter((e) => e.startsWith(`mount ${id}`)).length + 1;
    life.push(`mount ${id}#${n}`);
    cleanup(() => life.push(`unmount ${id}#${n}`));
    if (gate) await gate;
  });
  return <div class="tracked" data-card={id}>{id}</div>;
});

const until = async (ok: () => boolean) => {
  for (let i = 0; i < 40 && !ok(); i++) await new Promise((r) => setTimeout(r, 25));
};

describe('Qwik dashboard cards: removing a card', () => {
  let host: HTMLElement;
  let instance: DiagramInstance | null = null;
  beforeEach(() => {
    life.length = 0;
    host = document.createElement('div');
    document.body.appendChild(host);
  });
  afterEach(() => {
    instance?.dispose();
    instance = null;
    host.remove();
  });

  const mount = (heard: Array<[string, HTMLElement]> = [], types: WidgetTypes = TYPES) => {
    const cards = widgetMounts(types, (id, el) => void heard.push([id, el]));
    const widgets: DashboardWidgetSpec[] = [
      { id: 'a', kind: 'card', span: 6 },
      { id: 'b', kind: 'card', span: 6 },
    ];
    const spec = dashboard({ widgets, ...cards });
    instance = render(spec, host) as DiagramInstance;
    return spec.handle;
  };
  const card = (id: string) => host.querySelector(`.tracked[data-card="${id}"]`) as HTMLElement | null;

  it("unmounts the removed card's component; the other cards stay mounted", async () => {
    const heard: Array<[string, HTMLElement]> = [];
    const handle = mount(heard);
    await until(() => !!card('a') && !!card('b'));
    expect([...life].sort()).toEqual(['mount a', 'mount b']);
    const a = host.querySelector('.grafloria-node-host[data-node-id="a"]') as HTMLElement;
    const cardA = card('a')!;
    const cardB = card('b')!;
    expect(a.contains(cardA)).toBe(true);

    handle.widget('a')!.remove();
    await until(() => life.includes('unmount a'));
    expect([...life].sort()).toEqual(['mount a', 'mount b', 'unmount a']);
    expect(a.isConnected).toBe(false);
    expect(a.contains(cardA)).toBe(false); // Qwik took its card out of the host
    expect(card('b')).toBe(cardB); // b was never remounted
    expect(heard).toEqual([['a', a]]);
  });

  // update() and repaint() render into the same host again.
  it('a repaint whose render fails leaves the card there, and removing it unmounts that card', async () => {
    const handle = mount();
    await until(() => !!card('a') && !!card('b'));
    // Qwik's render() refuses this one. The refusal is handed back as a
    // promise; what the cards do with its error is caught here, so the test
    // can see it is passed on, not swallowed.
    const refused = new Error('render refused');
    const passedOn: unknown[] = [];
    const refusal = {
      then: (_done: unknown, failed: (error: unknown) => unknown) =>
        Promise.resolve()
          .then(() => failed(refused))
          .catch((error: unknown) => void passedOn.push(error)),
    };
    const render = jest.spyOn(qwik, 'render').mockReturnValueOnce(refusal as never);
    try {
      handle.widget('a')!.repaint();
      await until(() => passedOn.length > 0);
    } finally {
      render.mockRestore();
    }
    expect(passedOn).toEqual([refused]);
    expect(card('a')).not.toBeNull();

    handle.widget('a')!.remove();
    await until(() => life.includes('unmount a'));
    expect([...life].sort()).toEqual(['mount a', 'mount b', 'unmount a']);
  });

  it('a card removed while its repaint is still rendering is unmounted when that render finishes', async () => {
    const handle = mount([], { card: Waiting as never });
    await until(() => !!card('a') && !!card('b'));
    let open = () => undefined as void;
    gate = new Promise<void>((r) => (open = r));
    try {
      handle.widget('a')!.repaint();
      await until(() => life.includes('mount a#2'));
      handle.widget('a')!.remove();
      open();
      await until(() => life.includes('unmount a#1') && life.includes('unmount a#2'));
      expect([...life].sort()).toEqual(['mount a#1', 'mount a#2', 'mount b#1', 'unmount a#1', 'unmount a#2']);
    } finally {
      gate = null;
      open();
    }
  });

  it('a host released while its card is still mounting is unmounted when the mount finishes', async () => {
    mount();
    // Qwik's render() is async: disposing at once releases both hosts before
    // either card has finished mounting.
    instance!.dispose();
    instance = null;
    await until(() => life.filter((e) => e.startsWith('unmount')).length === 2);
    expect([...life].sort()).toEqual(['mount a', 'mount b', 'unmount a', 'unmount b']);
  });
});
