import { createDiagram } from '../create-diagram';
import type { DiagramInstance } from '../create-diagram';
import type { NodeSpec, EdgeWarning } from '../model-input';

function makeContainer(): HTMLElement {
  const el = document.createElement('div');
  el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600 }) as DOMRect;
  document.body.appendChild(el);
  return el;
}
// A trigger card: an output only. A step: an input and an output.
const NODES: NodeSpec[] = [
  { id: 'trig', position: { x: 0, y: 0 }, size: { width: 100, height: 60 }, ports: [{ id: 'trig:out', side: 'right', type: 'output' }] },
  { id: 'step', position: { x: 300, y: 0 }, size: { width: 100, height: 60 }, ports: [{ id: 'step:in', side: 'left', type: 'input' }, { id: 'step:out', side: 'right', type: 'output' }] },
];

describe('an edge that does not land as written is REPORTED (renderer:warning), never dropped without a word', () => {
  let container: HTMLElement;
  let d: DiagramInstance | undefined;
  beforeEach(() => (container = makeContainer()));
  afterEach(() => {
    d?.dispose();
    d = undefined;
    container.remove();
  });

  it('a saved wire INTO a card with no input is dropped — and the initial spec\'s warning still reaches a listener added after createDiagram', async () => {
    d = createDiagram(container, { nodes: NODES, edges: [{ id: 'bad', source: 'step', sourceHandle: 'step:out', target: 'trig', targetHandle: 'trig:in' }] });
    const got: EdgeWarning[] = [];
    d.on('renderer:warning', (w) => got.push(w));
    await Promise.resolve();
    expect(d.getModel().getLink('bad')).toBeUndefined();
    expect(got).toEqual([{ kind: 'edge-dropped', edgeId: 'bad', end: 'target', nodeId: 'trig', handle: 'trig:in', reason: 'node "trig" has no port "trig:in", and none on its left side' }]);
  });

  it('setEdges: an end naming a node that does not exist', () => {
    d = createDiagram(container, { nodes: NODES });
    const got: EdgeWarning[] = [];
    d.on('renderer:warning', (w) => got.push(w));
    d.setEdges([{ id: 'e', source: 'gone', target: 'step', targetHandle: 'step:in' }]);
    expect(got.map((w) => [w.kind, w.end, w.reason])).toEqual([['edge-dropped', 'source', 'there is no node "gone"']]);
  });

  it('an end naming a missing port, on a node that HAS a port on the fallback side: attached there, and said so', () => {
    d = createDiagram(container, { nodes: NODES });
    const got: EdgeWarning[] = [];
    d.on('renderer:warning', (w) => got.push(w));
    d.setEdges([{ id: 'e', source: 'trig', sourceHandle: 'trig:out', target: 'step', targetHandle: 'step:old-in' }]);
    expect(d.getModel().getLink('e')!.targetPortId).toBe('step:in');
    expect(got.map((w) => [w.kind, w.portId])).toEqual([['edge-port-fallback', 'step:in']]);
  });

  it('valid edges, and a side name that resolves, warn about nothing', () => {
    d = createDiagram(container, { nodes: NODES });
    const got: EdgeWarning[] = [];
    d.on('renderer:warning', (w) => got.push(w));
    d.setEdges([
      { id: 'a', source: 'trig', sourceHandle: 'trig:out', target: 'step', targetHandle: 'step:in' },
      { id: 'b', source: 'trig', target: 'step', targetHandle: 'left' },
    ]);
    expect(got).toEqual([]);
    expect(d.getModel().getLinks()).toHaveLength(2);
  });
});
