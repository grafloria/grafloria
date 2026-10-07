/**
 * A custom React card whose content comes from the node's data re-renders when
 * that data changes through the model — `node.setData()` — in uncontrolled
 * mode, where no prop changes and the instance emits no `nodes:change`.
 *
 * The card receives a new `data` object for each change, so a card wrapped in
 * `React.memo` refreshes too. A drag, which changes only the position, does not
 * re-render the card on every frame.
 */
import { act, render, screen, waitFor } from '@testing-library/react';
import { memo } from 'react';
import type { DiagramInstance } from '@grafloria/renderer';
import { GrafloriaFlow } from './grafloria-flow';
import type { NodeProps } from './grafloria-flow';

beforeAll(() => {
  Element.prototype.getBoundingClientRect = function () {
    return { left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
  };
});

let renders = 0;
function Card({ id, data }: NodeProps<{ title: string; count?: number }>) {
  renders++;
  return (
    <div data-testid={`card-${id}`}>
      {data.title}
      {data.count !== undefined ? ` · ${data.count}` : ''}
    </div>
  );
}
const MemoCard = memo(Card);

const NODES = [
  { id: 'n1', type: 'card', position: { x: 10, y: 20 }, custom: true, data: { title: 'Draft' } },
];

async function mount(component: typeof Card | typeof MemoCard) {
  let instance: DiagramInstance | undefined;
  render(<GrafloriaFlow defaultNodes={NODES} nodeTypes={{ card: component as never }} onInit={(i) => (instance = i)} />);
  await waitFor(() => expect(screen.getByTestId('card-n1')).toBeTruthy());
  return instance!;
}

describe('custom cards follow node.setData() in uncontrolled mode', () => {
  it('a card shows the new data after setData', async () => {
    const instance = await mount(Card);
    expect(screen.getByTestId('card-n1').textContent).toBe('Draft');

    act(() => instance.getModel().getNode('n1')!.setData('title', 'Approved'));
    await waitFor(() => expect(screen.getByTestId('card-n1').textContent).toBe('Approved'));

    act(() => instance.getModel().getNode('n1')!.setData('count', 3));
    await waitFor(() => expect(screen.getByTestId('card-n1').textContent).toBe('Approved · 3'));
  });

  it('a React.memo card refreshes too', async () => {
    const instance = await mount(MemoCard);
    act(() => instance.getModel().getNode('n1')!.setData('title', 'Shipped'));
    await waitFor(() => expect(screen.getByTestId('card-n1').textContent).toBe('Shipped'));
  });

  it('moving the node does not re-render the card per position change', async () => {
    const instance = await mount(MemoCard);
    const node = instance.getModel().getNode('n1')!;
    const before = renders;
    act(() => {
      for (let i = 1; i <= 20; i++) node.setPosition(10 + i * 5, 20);
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(renders - before).toBe(0);
  });
});
