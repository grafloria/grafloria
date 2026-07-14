/**
 * wave10/gallery — `registerConnectionValidator` MUST veto a mouse drag.
 *
 * The registry's own doc promises "Validators registered here are consulted
 * wherever the renderer offers a connection". It was consulted in exactly one
 * place — `canConnectPorts()` (proximity + keyboard connect) — and NOT on the
 * connection drag, which is where every connection a user ever makes is made.
 *
 * These tests drive the same seam the DomEventBinder drives on a real
 * pointerdown/up: `InteractionController.startConnection()` →
 * `completeConnection()`. If the bridge regresses, the second test goes red.
 */
import { DiagramEngine, NodeModel, PortModel } from '@grafloria/engine';
import { InteractionController } from './interaction-controller';
import { clearConnectionValidators, registerConnectionValidator } from '../ext/tools';

function scene() {
  const engine = new DiagramEngine();
  const model = engine.createDiagram('t');

  const mk = (id: string, x: number) => {
    const node = new NodeModel({ id, type: 'rect', position: { x, y: 0 }, size: { width: 100, height: 50 } });
    node.ports.clear();
    node.addPort(new PortModel({ id: `${id}__right`, type: 'bi', side: 'right' }));
    node.addPort(new PortModel({ id: `${id}__left`, type: 'bi', side: 'left' }));
    model.addNode(node);
    return node;
  };

  const a = mk('a', 0);
  const b = mk('b', 300);
  const controller = new InteractionController();
  controller.syncWithEngineConfig(engine);

  return { engine, model, a, b, controller };
}

/** The exact call pair the DomEventBinder makes on pointerdown → pointerup. */
function dragConnect(
  ctx: ReturnType<typeof scene>,
  from: PortModel,
  to: PortModel
): boolean {
  ctx.controller.startConnection(from, 100, 25, ctx.engine);
  // The binder hovers the target port before releasing; completeConnection()
  // reads the hovered port out of interaction state.
  ctx.controller.handleMouseMove(300, 25, ctx.engine);
  (ctx.controller as unknown as { hoveredPort: PortModel | null }).hoveredPort = to;
  return ctx.controller.completeConnection(ctx.engine);
}

afterEach(() => clearConnectionValidators());

describe('wave10 — the host connection-validator registry vetoes a DRAG', () => {
  it('allows a connection when no validator is registered (unchanged behaviour)', () => {
    const ctx = scene();
    const ok = dragConnect(ctx, ctx.a.getPort('a__right')!, ctx.b.getPort('b__left')!);
    expect(ok).toBe(true);
  });

  it('REFUSES the drag when a registered validator vetoes it', () => {
    const ctx = scene();
    registerConnectionValidator(({ sourceNode, targetNode }) =>
      sourceNode.id === 'a' && targetNode.id === 'b' ? 'a may not reach b' : true
    );

    const ok = dragConnect(ctx, ctx.a.getPort('a__right')!, ctx.b.getPort('b__left')!);

    expect(ok).toBe(false);
    expect(ctx.model.getLinks()).toHaveLength(0);
  });

  it('still allows connections the validator permits', () => {
    const ctx = scene();
    registerConnectionValidator(({ targetNode }) => targetNode.id !== 'nope');

    const ok = dragConnect(ctx, ctx.a.getPort('a__right')!, ctx.b.getPort('b__left')!);
    expect(ok).toBe(true);
  });

  it('disposing the validator restores the connection', () => {
    const ctx = scene();
    const off = registerConnectionValidator(() => false);
    expect(dragConnect(ctx, ctx.a.getPort('a__right')!, ctx.b.getPort('b__left')!)).toBe(false);

    off();
    expect(dragConnect(ctx, ctx.a.getPort('a__right')!, ctx.b.getPort('b__left')!)).toBe(true);
  });

  it('bridges once per engine, however often syncWithEngineConfig is called', () => {
    const ctx = scene();
    let calls = 0;
    registerConnectionValidator(() => {
      calls++;
      return true;
    });

    // Three syncs. A naive install would push three forwarding validators and
    // every candidate would then be judged three times.
    ctx.controller.syncWithEngineConfig(ctx.engine);
    ctx.controller.syncWithEngineConfig(ctx.engine);

    const source = ctx.a.getPort('a__right')!;
    const target = ctx.b.getPort('b__left')!;
    ctx.controller.startConnection(source, 100, 25, ctx.engine);
    (ctx.controller as unknown as { hoveredPort: PortModel | null }).hoveredPort = target;

    calls = 0; // count ONLY the completion's own evaluation
    expect(ctx.controller.completeConnection(ctx.engine)).toBe(true);
    expect(calls).toBe(1);
  });
});
