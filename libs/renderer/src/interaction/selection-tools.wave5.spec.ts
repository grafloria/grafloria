// Card 6 (gap-closure) — per-node min/max/aspect during resize, auto-sized-node
// resize behaviour, and the per-node toolbar config seam. The base resize/rotate/
// halo layer already shipped in wave 4 (selection-tools.spec.ts); this covers ONLY
// the wave-5 residual.

import { SelectionToolsController, resizeBox, type ToolHandle } from './selection-tools';
import { DiagramEngine, NodeModel } from '@grafloria/engine';

function engineWithNode(sizing?: any, extra?: (n: NodeModel) => void): { engine: DiagramEngine; node: NodeModel } {
  const engine = new DiagramEngine();
  engine.createDiagram();
  const node = new NodeModel({ type: 'default', position: { x: 0, y: 0 }, size: { width: 100, height: 50 } });
  node.setBehavior({ resizable: true, rotatable: true });
  if (sizing) node.setMetadata('sizing', sizing);
  extra?.(node);
  engine.getDiagram()!.addNode(node);
  node.setSelected(true);
  return { engine, node };
}

const resizeHandle = (tools: SelectionToolsController, engine: DiagramEngine, id: string): ToolHandle =>
  tools.computeLayer(engine).handles.find((h) => h.handleId === id)!;

describe('Card 6 — resizeBox honors maxWidth/maxHeight during the gesture', () => {
  const start = { x: 0, y: 0, width: 100, height: 50 };

  it('clamps growth to maxWidth (dragged edge stops, anchor held)', () => {
    const box = resizeBox(start, 'e', 500, 0, { maxWidth: 140 });
    expect(box.width).toBe(140);
    expect(box.x).toBe(0); // left anchor held
  });

  it('clamps the moving-origin handle so width never exceeds max', () => {
    const box = resizeBox(start, 'w', -500, 0, { maxWidth: 140 });
    expect(box.width).toBe(140);
    expect(box.x + box.width).toBe(100); // right anchor held
  });

  it('an explicit aspect ratio locks a corner without Shift', () => {
    const box = resizeBox(start, 'se', 200, 0, { aspect: 2 });
    expect(box.width / box.height).toBeCloseTo(2, 6);
  });
});

describe('Card 6 — updateResize applies per-node min/max mid-drag', () => {
  it('clamps live to the node maxWidth', () => {
    const { engine, node } = engineWithNode({ maxWidth: 130 });
    const tools = new SelectionToolsController();
    const se = resizeHandle(tools, engine, 'se');
    tools.beginResize(se, engine, se.world.x, se.world.y);
    tools.updateResize(engine, se.world.x + 500, se.world.y + 500);
    expect(node.size.width).toBe(130);
  });

  it('enforces the node minWidth over a runaway shrink', () => {
    const { engine, node } = engineWithNode({ minWidth: 60, minHeight: 40 });
    const tools = new SelectionToolsController();
    const nw = resizeHandle(tools, engine, 'nw');
    tools.beginResize(nw, engine, nw.world.x, nw.world.y);
    tools.updateResize(engine, nw.world.x + 500, nw.world.y + 500);
    expect(node.size.width).toBe(60);
    expect(node.size.height).toBe(40);
  });

  it('honors a persistent per-node aspect lock (no Shift held)', () => {
    const { engine, node } = engineWithNode({ aspectLock: 2 });
    const tools = new SelectionToolsController();
    const se = resizeHandle(tools, engine, 'se');
    tools.beginResize(se, engine, se.world.x, se.world.y);
    tools.updateResize(engine, se.world.x + 120, se.world.y + 0);
    expect(node.size.width / node.size.height).toBeCloseTo(2, 1);
  });
});

describe('Card 6 — resizing an auto-sized node pins it (auto yields to the drag)', () => {
  it('turns auto off at beginResize and the manual size sticks', () => {
    const { engine, node } = engineWithNode({ auto: true, maxWidth: 400 });
    node.setMetadata('label', 'x');
    const tools = new SelectionToolsController();
    const se = resizeHandle(tools, engine, 'se');
    tools.beginResize(se, engine, se.world.x, se.world.y);
    expect((node.getMetadata('sizing') as any).auto).toBe(false);
    tools.updateResize(engine, se.world.x + 60, se.world.y + 30);
    expect(node.size.width).toBeGreaterThan(100);
    tools.endGesture(engine);
    // still pinned after commit
    expect((node.getMetadata('sizing') as any).auto).toBe(false);
  });

  it('cancelGesture restores the auto flag', () => {
    const { engine, node } = engineWithNode({ auto: true });
    const tools = new SelectionToolsController();
    const se = resizeHandle(tools, engine, 'se');
    tools.beginResize(se, engine, se.world.x, se.world.y);
    expect((node.getMetadata('sizing') as any).auto).toBe(false);
    tools.cancelGesture(engine);
    expect((node.getMetadata('sizing') as any).auto).toBe(true);
  });
});

describe('Card 6 — per-node toolbar config seam', () => {
  it('hides resize handles when the node disables resize', () => {
    const { engine } = engineWithNode(undefined, (n) => n.setMetadata('toolbar', { resize: false }));
    const tools = new SelectionToolsController();
    const handles = tools.computeLayer(engine).handles;
    expect(handles.some((h) => h.kind === 'resize')).toBe(false);
    // rotate + halo still there (not disabled)
    expect(handles.some((h) => h.kind === 'rotate')).toBe(true);
  });

  it('limits the halo to an explicit action allow-list', () => {
    const { engine } = engineWithNode(undefined, (n) =>
      n.setMetadata('toolbar', { halo: ['connect', 'delete'] })
    );
    const tools = new SelectionToolsController();
    const halo = tools.computeLayer(engine).handles.filter((h) => h.kind === 'halo');
    const actions = halo.map((h) => h.action).sort();
    expect(actions).toEqual(['connect', 'delete']);
  });

  it('a host resolver (per-type policy) layers over node metadata', () => {
    const { engine, node } = engineWithNode();
    node.type = 'locked-system';
    const tools = new SelectionToolsController({
      resolveNodeToolbar: (n) => (n.type === 'locked-system' ? { resize: false, rotate: false } : {}),
    });
    const handles = tools.computeLayer(engine).handles;
    expect(handles.some((h) => h.kind === 'resize')).toBe(false);
    expect(handles.some((h) => h.kind === 'rotate')).toBe(false);
  });

  it('halo:false removes the whole context toolbar for that node', () => {
    const { engine } = engineWithNode(undefined, (n) => n.setMetadata('toolbar', { halo: false }));
    const tools = new SelectionToolsController();
    expect(tools.computeLayer(engine).handles.some((h) => h.kind === 'halo')).toBe(false);
  });
});
