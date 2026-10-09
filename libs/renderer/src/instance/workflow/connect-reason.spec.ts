import { createDiagram } from '../create-diagram';
import type { DiagramInstance } from '../create-diagram';
import type { NodeSpec } from '../model-input';
import { clearConnectionValidators, registerConnectionValidator } from '../../ext/tools';

function makeContainer(): HTMLElement {
  const el = document.createElement('div');
  el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600 }) as DOMRect;
  document.body.appendChild(el);
  return el;
}

const nodes = (outType?: string, slotType?: string): NodeSpec[] => [
  { id: 'agent', position: { x: 100, y: 100 }, size: { width: 160, height: 60 }, ports: [{ id: 'out', side: 'right', type: 'output', dataType: outType }] },
  { id: 'model', position: { x: 400, y: 100 }, size: { width: 160, height: 60 }, ports: [{ id: 'slot', side: 'left', type: 'input', dataType: slotType }] },
];
const NODES = nodes();

describe('connectionReasons: the refused target says why', () => {
  let container: HTMLElement;
  let d: DiagramInstance | undefined;
  beforeEach(() => (container = makeContainer()));
  afterEach(() => {
    d?.dispose();
    d = undefined;
    container.remove();
    clearConnectionValidators();
  });

  const dragOverSlot = (diagram: DiagramInstance) => {
    const model = diagram.getModel();
    const csm = diagram.getEngine().getConnectionStateManager();
    const out = model.getNode('agent')!.getPort('out')!;
    const slot = model.getNode('model')!.getPort('slot')!;
    csm.startConnection(out, { x: 260, y: 130 });
    csm.updateConnection({ x: 400, y: 130 }, slot);
    diagram.renderNow();
    return csm;
  };
  const label = () => container.querySelector('.grafloria-connect-reason') as HTMLElement | null;

  it('shows the validator\'s reason beside the refused port, and removes it when the drag ends', () => {
    registerConnectionValidator(({ targetNode }) => (targetNode.id === 'model' ? 'A model goes into a Model slot' : true));
    d = createDiagram(container, { nodes: NODES, connectionReasons: true });
    const csm = dragOverSlot(d);
    expect(label()?.textContent).toBe('A model goes into a Model slot');
    expect(label()?.getAttribute('role')).toBe('status');
    expect(label()?.style.left).toBe('400px'); // at the port: the slot sits on model's left edge (x 400)
    csm.cancelConnection();
    expect(label()).toBeNull();
  });

  it('is off by default: the same refusal paints nothing (unchanged behaviour)', () => {
    registerConnectionValidator(() => 'nope');
    d = createDiagram(container, { nodes: NODES });
    dragOverSlot(d);
    expect(label()).toBeNull();
  });

  it('a built-in rule speaks too: typed slots refuse a mismatched dataType in their own words', () => {
    d = createDiagram(container, { nodes: nodes('main', 'model'), connectionReasons: true });
    dragOverSlot(d);
    expect(label()?.textContent).toBe('Incompatible types: main cannot flow into model.');
  });

  it('a valid target shows nothing', () => {
    d = createDiagram(container, { nodes: NODES, connectionReasons: true });
    dragOverSlot(d);
    expect(label()).toBeNull();
  });
});
