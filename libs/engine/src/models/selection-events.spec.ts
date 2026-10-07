/**
 * `DiagramModel` selection events: one `selection:changed` per real change,
 * carrying the final selection — never an empty "in-between" selection.
 *
 * `selectNode(b)` while `a` was selected used to call `clearSelection()`, which
 * emitted `{ selected: [], deselected: [a] }` on its own, and then a second
 * event for `b`: a listener saw the selection go a → ∅ → b. And `selectNode(a)`
 * while `a` alone was selected emitted twice although nothing had changed.
 */
import { DiagramModel } from './DiagramModel';
import { NodeModel } from './NodeModel';

const mkNode = (id: string, x = 0) =>
  new NodeModel({ id, type: 'default', position: { x, y: 0 }, size: { width: 100, height: 50 } });

function setup() {
  const diagram = new DiagramModel();
  const a = mkNode('a');
  const b = mkNode('b', 200);
  const c = mkNode('c', 400);
  diagram.addNode(a);
  diagram.addNode(b);
  diagram.addNode(c);
  const seen: Array<{ selected: string[]; deselected: string[]; now: string[] }> = [];
  diagram.on('selection:changed', (e: { selected: NodeModel[]; deselected: NodeModel[] }) => {
    seen.push({
      selected: e.selected.map((n) => n.id),
      deselected: e.deselected.map((n) => n.id),
      now: diagram.getSelectedNodes().map((n) => n.id),
    });
  });
  return { diagram, a, b, c, seen };
}

describe('DiagramModel selection events', () => {
  it('selectNode(b) while a is selected emits ONCE, with b selected and a deselected', () => {
    const { diagram, a, b, seen } = setup();
    diagram.selectNode(a);
    seen.length = 0;
    diagram.selectNode(b);
    expect(seen).toEqual([{ selected: ['b'], deselected: ['a'], now: ['b'] }]);
  });

  it('selectNode(c) while a and b are selected deselects both in the same event', () => {
    const { diagram, a, b, c, seen } = setup();
    diagram.selectNode(a);
    diagram.addToSelection(b);
    seen.length = 0;
    diagram.selectNode(c);
    expect(seen).toEqual([{ selected: ['c'], deselected: ['a', 'b'], now: ['c'] }]);
  });

  it('selectNode(a) while a alone is selected changes nothing and emits nothing', () => {
    const { diagram, a, seen } = setup();
    diagram.selectNode(a);
    seen.length = 0;
    diagram.selectNode(a);
    expect(seen).toEqual([]);
    expect(a.isSelected()).toBe(true);
  });

  it('selectNode(a) while a and b are selected keeps a and reports only b as deselected', () => {
    const { diagram, a, b, seen } = setup();
    diagram.selectNode(a);
    diagram.addToSelection(b);
    seen.length = 0;
    diagram.selectNode(a);
    expect(seen).toEqual([{ selected: [], deselected: ['b'], now: ['a'] }]);
  });

  it('selectNode from nothing selected emits once', () => {
    const { diagram, a, seen } = setup();
    diagram.selectNode(a);
    expect(seen).toEqual([{ selected: ['a'], deselected: [], now: ['a'] }]);
  });

  it('clearSelection still emits once, and not at all when nothing was selected', () => {
    const { diagram, a, seen } = setup();
    diagram.clearSelection();
    expect(seen).toEqual([]);
    diagram.selectNode(a);
    seen.length = 0;
    diagram.clearSelection();
    expect(seen).toEqual([{ selected: [], deselected: ['a'], now: [] }]);
  });
});
