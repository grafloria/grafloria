/**
 * Selection is controlled state: a selection change announces `nodes:change`
 * (and `edges:change` for an edge), so a host's stored specs stay current.
 *
 * `toNodeSpec` projects `selected` and `setNodes` applies it, but a selection
 * change emitted only `selection:change`. A host that stores the projected specs
 * (React `useNodesState`, Vue `v-model:nodes`) therefore kept `selected: true`
 * after the user deselected the node, and its next write — a rename — selected
 * it again. React Flow's model: selection travels in `onNodesChange`.
 *
 * One gesture still makes ONE `nodes:change`: a drag that ends with a
 * `nodes:change` of its own (carrying the final selection) gets no second one.
 */
import { createDiagram, toNodeSpec, toEdgeSpec } from '../index';
import type { DiagramInstance, NodeSpec, EdgeSpec } from '../index';

const WIDTH = 800;
const HEIGHT = 600;

describe('selection changes keep controlled nodes/edges current', () => {
  let container: HTMLElement;
  let diagram: DiagramInstance;
  let log: string[];
  let hostNodes: NodeSpec[];
  let hostEdges: EdgeSpec[];

  beforeEach(() => {
    container = document.createElement('div');
    container.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: WIDTH, height: HEIGHT, right: WIDTH, bottom: HEIGHT, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    document.body.appendChild(container);
    hostNodes = [
      { id: 'a', position: { x: 100, y: 100 }, size: { width: 120, height: 60 }, label: 'A' },
      { id: 'b', position: { x: 400, y: 100 }, size: { width: 120, height: 60 }, label: 'B' },
    ];
    hostEdges = [{ id: 'e1', source: 'a', target: 'b', type: 'direct' }];
    diagram = createDiagram(container, { nodes: hostNodes, edges: hostEdges });
    diagram.renderNow();
    log = [];
    // The host side of `useNodesState` / `v-model:nodes`: store the projection.
    diagram.on('nodes:change', ({ nodes }) => {
      log.push('nodes:' + nodes.filter((n) => n.isSelected()).map((n) => n.id).join(''));
      hostNodes = nodes.map(toNodeSpec);
    });
    diagram.on('edges:change', ({ edges }) => {
      log.push('edges:' + edges.filter((l) => l.state === 'selected').map((l) => l.id).join(''));
      hostEdges = edges.map(toEdgeSpec);
    });
    diagram.on('selection:change', ({ nodes, edges }) => {
      log.push('selection:' + nodes.map((n) => n.id).join('') + '|' + edges.map((l) => l.id).join(''));
    });
  });

  afterEach(() => {
    diagram.dispose();
    container.remove();
  });

  const at = (x: number, y: number, init: MouseEventInit = {}) => ({ clientX: x, clientY: y, button: 0, bubbles: true, ...init });
  const click = (x: number, y: number) => {
    container.dispatchEvent(new MouseEvent('mousedown', at(x, y)));
    container.dispatchEvent(new MouseEvent('mouseup', at(x, y)));
    container.dispatchEvent(new MouseEvent('click', at(x, y)));
  };
  const rename = (id: string, label: string) =>
    diagram.setNodes(hostNodes.map((s) => (s.id === id ? { ...s, label } : s)));
  const selected = (id: string) => diagram.getModel().getNode(id)!.isSelected();

  it('a click that selects a node emits nodes:change once, before selection:change', () => {
    click(160, 130);
    expect(log).toEqual(['nodes:a', 'selection:a|']);
  });

  it('a click on the node that already is the selection emits nothing', () => {
    click(160, 130);
    log.length = 0;
    click(160, 130);
    expect(log).toEqual([]);
  });

  const drag = (x: number, y: number) => {
    container.dispatchEvent(new MouseEvent('mousedown', at(x, y)));
    for (let i = 1; i <= 4; i++) {
      container.dispatchEvent(new MouseEvent('mousemove', at(x + i * 50, y + i * 10, { buttons: 1 })));
    }
    container.dispatchEvent(new MouseEvent('mouseup', at(x + 200, y + 40)));
  };

  it('drag a (stored specs say selected), click empty canvas, rename a: a stays deselected', () => {
    drag(160, 130);
    expect(hostNodes.find((s) => s.id === 'a')!.selected).toBe(true);
    click(700, 550);
    expect(selected('a')).toBe(false);
    rename('a', 'Renamed');
    expect(diagram.getModel().getNode('a')!.getLabel()).toBe('Renamed');
    expect(selected('a')).toBe(false);
  });

  it('programmatic selectNode / clearSelection keep the stored specs current too', () => {
    const model = diagram.getModel();
    model.selectNode(model.getNode('a')!);
    model.clearSelection();
    expect(log).toEqual(['nodes:a', 'selection:a|', 'nodes:', 'selection:|']);
    rename('a', 'Renamed');
    expect(selected('a')).toBe(false);
  });

  it('writing the stored specs back emits no nodes:change (no controlled feedback loop)', () => {
    click(160, 130);
    log.length = 0;
    diagram.setNodes(hostNodes);
    diagram.setEdges(hostEdges);
    expect(log).toEqual([]);
    expect(selected('a')).toBe(true);
  });

  it('a drag of an unselected node: ONE nodes:change, carrying the selection', () => {
    drag(160, 130);
    expect(log.filter((e) => e.startsWith('nodes:'))).toEqual(['nodes:a']);
    expect(log.filter((e) => e.startsWith('selection:'))).toEqual(['selection:a|']);
    expect(hostNodes.find((s) => s.id === 'a')!.selected).toBe(true);
  });

  it('selecting an edge emits edges:change; selecting a node after it emits both', () => {
    diagram.renderNow();
    click(340, 130); // on the straight a→b line, between the nodes
    expect(log).toEqual(['edges:e1', 'selection:|e1']);
    expect(hostEdges[0].selected).toBe(true);
    log.length = 0;
    click(160, 130);
    expect(log).toEqual(['nodes:a', 'edges:', 'selection:a|']);
    expect(hostEdges[0].selected).toBe(false);
  });
});
