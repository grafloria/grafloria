/**
 * A host's stored specs never re-select what the user deselected.
 *
 * `toNodeSpec` used to project `selected`, and `setNodes` applies it. But a
 * selection change does not fire `nodes:change` — that event means "the document
 * changed" (a node added, removed, dropped), and gallery pages and hosts act on
 * it as such — so the projection a host stored (React `useNodesState`, Vue
 * `v-model:nodes`, Qwik, Angular `[(nodes)]`) kept `selected: true` after the
 * user deselected the node, and its next write — a rename — selected it again.
 *
 * The projection carries no `selected` now. Writing it back never touches the
 * selection; a host that wants to drive the selection sets `selected` itself.
 */
import { createDiagram, toNodeSpec, toEdgeSpec } from '../index';
import type { DiagramInstance, NodeSpec, EdgeSpec } from '../index';

const WIDTH = 800;
const HEIGHT = 600;

describe('stored projections never re-select (selection stays the user\'s)', () => {
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
      log.push('nodes');
      hostNodes = nodes.map(toNodeSpec);
    });
    diagram.on('edges:change', ({ edges }) => {
      log.push('edges');
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
  const drag = (x: number, y: number) => {
    container.dispatchEvent(new MouseEvent('mousedown', at(x, y)));
    for (let i = 1; i <= 4; i++) {
      container.dispatchEvent(new MouseEvent('mousemove', at(x + i * 50, y + i * 10, { buttons: 1 })));
    }
    container.dispatchEvent(new MouseEvent('mouseup', at(x + 200, y + 40)));
  };
  const rename = (id: string, label: string) =>
    diagram.setNodes(hostNodes.map((s) => (s.id === id ? { ...s, label } : s)));
  const selected = (id: string) => diagram.getModel().getNode(id)!.isSelected();

  it('the projections carry no selected, even for a selected node or edge', () => {
    const model = diagram.getModel();
    model.selectNode(model.getNode('a')!);
    model.getLink('e1')!.setState('selected');
    expect('selected' in toNodeSpec(model.getNode('a')!)).toBe(false);
    expect('selected' in toEdgeSpec(model.getLink('e1')!)).toBe(false);
  });

  it('drag a (stored while selected), click empty canvas, rename a: a stays deselected', () => {
    drag(160, 130);
    expect(log).toContain('nodes'); // the drop stored the projection while a was selected
    click(700, 550);
    expect(selected('a')).toBe(false);
    rename('a', 'Renamed');
    expect(diagram.getModel().getNode('a')!.getLabel()).toBe('Renamed');
    expect(selected('a')).toBe(false);
  });

  it('the reported case: specs projected while selected, deselected in code, renamed: not re-selected', () => {
    const model = diagram.getModel();
    model.selectNode(model.getNode('a')!);
    const specs = model.getNodes().map(toNodeSpec);
    model.clearSelection();
    diagram.setNodes(specs.map((s) => (s.id === 'a' ? { ...s, label: 'Renamed' } : s)));
    expect(selected('a')).toBe(false);
  });

  it('writing the projection back keeps a live selection as it is', () => {
    click(160, 130);
    diagram.setNodes(diagram.getModel().getNodes().map(toNodeSpec));
    expect(selected('a')).toBe(true);
  });

  it('a click is a selection change, not a document change: no nodes:change / edges:change', () => {
    click(160, 130);
    click(340, 130); // the a→b line
    click(700, 550);
    expect(log).toEqual(['selection:a|', 'selection:|e1', 'selection:|']);
  });

  it('a host can still drive the selection by setting selected itself', () => {
    diagram.setNodes(hostNodes.map((s) => (s.id === 'b' ? { ...s, selected: true } : s)));
    expect(selected('b')).toBe(true);
    diagram.setNodes(hostNodes.map((s) => (s.id === 'b' ? { ...s, selected: false } : s)));
    expect(selected('b')).toBe(false);
  });
});
