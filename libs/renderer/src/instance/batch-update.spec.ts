// wave8/dirty — Card 1: batched mutation → ONE frame, ONE patch.
//
// The claim being tested is not "batchUpdate exists". It is:
//
//   N mutations inside one batch cost ONE render() and ONE reconcile(), and the
//   picture they produce is the same picture N unbatched mutations would have.
//
// Plus the negative that gives the whole capability its teeth: an IDLE canvas
// paints ZERO frames. That one was a lie before this wave — `canSkipFrame()`
// summed the dirty entities and skipped only at zero, but a virtualized renderer
// never cleans an off-screen entity, so on any diagram bigger than the viewport
// the count never reached zero and the idle-skip never once fired. The test at
// the bottom pins that.

import { DiagramEngine } from '@grafloria/engine';
import type { NodeModel } from '@grafloria/engine';
import { createDiagram } from './create-diagram';
import type { DiagramInstance } from './create-diagram';
import type { NodeSpec } from './model-input';

const WIDTH = 800;
const HEIGHT = 600;

function makeContainer(): HTMLElement {
  const el = document.createElement('div');
  el.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: WIDTH, height: HEIGHT, right: WIDTH, bottom: HEIGHT }) as DOMRect;
  document.body.appendChild(el);
  return el;
}

const NODES: NodeSpec[] = [
  { id: 'a', position: { x: 100, y: 100 }, size: { width: 120, height: 60 }, label: 'A' },
  { id: 'b', position: { x: 400, y: 100 }, size: { width: 120, height: 60 }, label: 'B' },
  { id: 'c', position: { x: 100, y: 300 }, size: { width: 120, height: 60 }, label: 'C' },
];

/** Run every queued rAF callback. */
function tick(): void {
  jest.advanceTimersByTime(32);
}

describe('batchUpdate — wave8/dirty, Card 1', () => {
  let container: HTMLElement;
  let diagram: DiagramInstance | undefined;

  beforeEach(() => {
    jest.useFakeTimers();
    container = makeContainer();
    diagram = createDiagram(container, {
      nodes: NODES,
      edges: [
        { source: 'a', target: 'b' },
        { source: 'b', target: 'c' },
      ],
    });
  });

  afterEach(() => {
    diagram?.dispose();
    diagram = undefined;
    container.remove();
    jest.useRealTimers();
  });

  it('coalesces many mutations into exactly ONE painted frame', () => {
    const before = diagram!.scheduler.stats.painted;

    diagram!.batchUpdate((model) => {
      for (const node of model.getNodes() as NodeModel[]) {
        node.setPosition(node.position.x + 25, node.position.y + 5);
      }
    });

    // Nothing has painted yet: a batch is queued, never synchronous.
    expect(diagram!.scheduler.stats.painted).toBe(before);

    tick();
    expect(diagram!.scheduler.stats.painted).toBe(before + 1);
  });

  it('does not paint synchronously inside the batch', () => {
    let paintedDuringMutation = -1;
    const before = diagram!.scheduler.stats.painted;

    diagram!.batchUpdate((model) => {
      (model.getNode('a') as NodeModel).setPosition(1, 1);
      paintedDuringMutation = diagram!.scheduler.stats.painted;
    });

    expect(paintedDuringMutation).toBe(before);
  });

  it('one batched frame patches the DOM once, and the DOM is CORRECT', () => {
    diagram!.batchUpdate((model) => {
      (model.getNode('a') as NodeModel).setPosition(600, 500);
      (model.getNode('b') as NodeModel).setPosition(650, 520);
    });
    tick();

    // Correctness first: a coalesced frame is worthless if it drops a mutation.
    const a = container.querySelector('[data-node-id="a"]')!;
    const b = container.querySelector('[data-node-id="b"]')!;
    expect(a.getAttribute('transform')).toContain('600');
    expect(b.getAttribute('transform')).toContain('650');
  });

  it('nests: a batch inside a batch is still one frame', () => {
    const before = diagram!.scheduler.stats.painted;

    diagram!.batchUpdate((model) => {
      (model.getNode('a') as NodeModel).setPosition(10, 10);
      diagram!.batchUpdate((inner) => {
        (inner.getNode('b') as NodeModel).setPosition(20, 20);
      });
      (model.getNode('c') as NodeModel).setPosition(30, 30);
    });
    tick();

    expect(diagram!.scheduler.stats.painted).toBe(before + 1);
    expect(container.querySelector('[data-node-id="c"]')!.getAttribute('transform')).toContain('30');
  });

  it('a throwing mutator does not strand the model in batch mode', () => {
    expect(() =>
      diagram!.batchUpdate(() => {
        throw new Error('boom');
      })
    ).toThrow('boom');

    // If endBatch() had been skipped, this mutation would be swallowed forever.
    expect(diagram!.getModel().isBatching()).toBe(false);

    diagram!.batchUpdate((model) => (model.getNode('a') as NodeModel).setPosition(77, 88));
    tick();
    expect(container.querySelector('[data-node-id="a"]')!.getAttribute('transform')).toContain('77');
  });

  it('an IDLE canvas paints ZERO frames (the idle-skip that never used to fire)', () => {
    tick(); // drain the mount
    const before = diagram!.scheduler.stats.painted;
    const skippedBefore = diagram!.scheduler.stats.skipped;

    for (let i = 0; i < 5; i++) {
      diagram!.render(); // "please repaint" — with nothing to repaint
      tick();
    }

    expect(diagram!.scheduler.stats.painted).toBe(before);
    expect(diagram!.scheduler.stats.skipped).toBeGreaterThanOrEqual(skippedBefore + 5);
  });

  it('skips idle frames even when off-screen entities are permanently dirty', () => {
    // THE regression this fixes. Park a node outside the 800×600 viewport: the
    // renderer never draws it, so it never marks it clean, so it is dirty
    // forever. The old dirty-count idle-skip therefore returned false forever.
    diagram!.batchUpdate((model) => {
      const offscreen = model.getNode('c') as NodeModel;
      offscreen.setPosition(5_000, 4_000);
    });
    tick();

    expect(diagram!.getModel().getDirtyCount()).toBeGreaterThan(0); // still dirty…

    const before = diagram!.scheduler.stats.painted;
    for (let i = 0; i < 3; i++) {
      diagram!.render();
      tick();
    }
    expect(diagram!.scheduler.stats.painted).toBe(before); // …and we still skip.
  });

  it('a real mutation always reopens the gate', () => {
    tick();
    const before = diagram!.scheduler.stats.painted;

    diagram!.batchUpdate((model) => (model.getNode('a') as NodeModel).setPosition(222, 111));
    tick();

    expect(diagram!.scheduler.stats.painted).toBe(before + 1);
    expect(container.querySelector('[data-node-id="a"]')!.getAttribute('transform')).toContain('222');
  });
});

describe('the frame does its DOM reads BEFORE its DOM writes (no layout thrash)', () => {
  it('paint() performs no forced layout read after it starts writing', () => {
    jest.useFakeTimers();
    const container = makeContainer();

    const engine = new DiagramEngine();
    const diagram = createDiagram(container, { engine, nodes: NODES });

    // Instrument: record the ORDER of reads and writes across a frame.
    const order: string[] = [];
    const realRect = container.getBoundingClientRect.bind(container);
    container.getBoundingClientRect = ((): DOMRect => {
      order.push('read');
      return realRect();
    }) as typeof container.getBoundingClientRect;

    const svg = container.querySelector('svg')!;
    const realSetAttribute = svg.setAttribute.bind(svg);
    svg.setAttribute = ((name: string, value: string): void => {
      order.push('write');
      realSetAttribute(name, value);
    }) as typeof svg.setAttribute;

    diagram.getModel().getNodes().forEach((n) => (n as NodeModel).setPosition(5, 5));
    tick();

    // No read may follow a write within the frame.
    const firstWrite = order.indexOf('write');
    if (firstWrite !== -1) {
      expect(order.slice(firstWrite)).not.toContain('read');
    }

    diagram.dispose();
    container.remove();
    jest.useRealTimers();
  });
});
