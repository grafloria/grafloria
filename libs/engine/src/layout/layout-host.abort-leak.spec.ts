// A completed layout must leave the caller's AbortSignal as it found it.
//
// `run()` registered an anonymous `abort` listener and never removed it, so every
// COMPLETED layout left one behind. An AbortSignal is normally one long-lived
// controller reused across many runs, so they piled up — 25 layouts, 25
// listeners, none removed. Each closure captures the host, so the signal then
// held the host, the engine, the model and the detached container: eight
// mount/layout/dispose cycles kept all eight engines alive through forced GC.
//
// The test counts listeners rather than measuring memory, because a listener
// count is deterministic and a heap size is not.

import { LayoutHost } from './layout-host';
import { serializeGraph } from './layout-graph';
import { NodeModel } from '../models/NodeModel';
import { LinkModel } from '../models/LinkModel';
import { PortModel } from '../models/PortModel';

describe('LayoutHost — abort listeners', () => {
  /** An AbortSignal that reports how many listeners are currently attached. */
  function countingController(): { controller: AbortController; live: () => number } {
    const controller = new AbortController();
    const signal = controller.signal;
    let live = 0;

    const add = signal.addEventListener.bind(signal);
    const remove = signal.removeEventListener.bind(signal);
    signal.addEventListener = ((type: string, fn: EventListener, opts?: unknown) => {
      if (type === 'abort') live++;
      return add(type as 'abort', fn, opts as AddEventListenerOptions);
    }) as typeof signal.addEventListener;
    signal.removeEventListener = ((type: string, fn: EventListener, opts?: unknown) => {
      if (type === 'abort') live--;
      return remove(type as 'abort', fn, opts as EventListenerOptions);
    }) as typeof signal.removeEventListener;

    return { controller, live: () => live };
  }

  /** The same shape the layout-host suite uses — a serialized wire graph. */
  function graphOf(count: number) {
    const nodes: NodeModel[] = [];
    for (let i = 0; i < count; i++) {
      const id = `n${i}`;
      const node = new NodeModel({ type: 'basic', position: { x: i * 160, y: 0 }, size: { width: 100, height: 50 } });
      (node as unknown as { id: string }).id = id;
      node.addPort(new PortModel({ id: `${id}-out`, type: 'output', side: 'right' }));
      node.addPort(new PortModel({ id: `${id}-in`, type: 'input', side: 'left' }));
      nodes.push(node);
    }
    const links: LinkModel[] = [];
    for (let i = 1; i < count; i++) {
      const link = new LinkModel(`n${i - 1}-out`, `n${i}-in`);
      (link as unknown as { id: string }).id = `e${i}`;
      link.sourceNodeId = `n${i - 1}`;
      link.targetNodeId = `n${i}`;
      links.push(link);
    }
    return serializeGraph(nodes, links);
  }

  const graph = graphOf(3);

  it('removes its listener when a run completes — 20 layouts leave none behind', async () => {
    const host = new LayoutHost();
    const { controller, live } = countingController();

    for (let i = 0; i < 20; i++) {
      await host.run('force', graph, {}, { signal: controller.signal });
    }

    expect(live()).toBe(0);
  });

  it('does not disturb listeners the caller registered itself', async () => {
    const host = new LayoutHost();
    const { controller, live } = countingController();

    const mine = (): void => undefined;
    controller.signal.addEventListener('abort', mine);

    await host.run('force', graph, {}, { signal: controller.signal });

    // Ours went; theirs stayed.
    expect(live()).toBe(1);
  });

  it('runs fine with no signal at all', async () => {
    const host = new LayoutHost();
    const result = await host.run('force', graph, {}, {});
    expect(result.nodePositions.size).toBe(3);
  });
});
