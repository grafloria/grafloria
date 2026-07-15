// A plain node drag mutated the model directly (moveNodeDrag -> node.setPosition) and the
// drag-end handler never committed a command. So Ctrl+Z could not undo a drag — the move was
// invisible to the command history. (Keyboard-nudge and the resize gesture DO commit
// MoveNodeCommand; only the pointer DRAG path skipped it.) MoveNodeCommand already accepts an
// explicit oldPosition, so an idempotent FROM->TO commit at drag-end is all that was missing.
import { DiagramEngine } from '@grafloria/engine';
import { DomEventBinder } from './dom-event-binder';
import type { DomEventBinderHost, DomEventBinderOptions } from './dom-event-binder';
import { InteractionController } from '../interaction/interaction-controller';
import { ViewportController } from '../viewport/viewport-controller';
import { applyNodes } from './model-input';

const WIDTH = 1200, HEIGHT = 800;

function harness(options: DomEventBinderOptions = {}) {
  const container = document.createElement('div');
  container.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: WIDTH, height: HEIGHT, right: WIDTH, bottom: HEIGHT }) as DOMRect;
  document.body.appendChild(container);
  const engine = new DiagramEngine();
  const model = engine.createDiagram('t')!;
  const viewport = new ViewportController({ viewport: { x: 0, y: 0, width: WIDTH, height: HEIGHT } });
  const interaction = new InteractionController();
  const host: DomEventBinderHost = {
    getEngine: () => engine, viewport, interaction,
    getRect: () => container.getBoundingClientRect(),
    requestRender: () => {}, emit: () => {},
  };
  const binder = new DomEventBinder(container, host, options);
  binder.attach();
  return { container, binder, engine, model, destroy() { binder.detach(); engine.destroy(); container.remove(); } };
}

const mouse = (type: string, init: MouseEventInit = {}) =>
  new MouseEvent(type, { bubbles: true, button: 0, ...init });
const flush = () => new Promise<void>((r) => setTimeout(r, 0));

describe('a pointer node-drag is command-undoable', () => {
  let h: ReturnType<typeof harness>;
  afterEach(() => h?.destroy());

  it('Ctrl+Z after a drag restores the node to where the drag began', async () => {
    h = harness();
    applyNodes(h.model, [{ id: 'n1', position: { x: 300, y: 200 }, size: { width: 100, height: 50 } }]);

    // Press on the node (its centre ~ 350,225), drag +160/+120, release.
    h.container.dispatchEvent(mouse('mousedown', { clientX: 350, clientY: 225 }));
    h.container.dispatchEvent(mouse('mousemove', { clientX: 430, clientY: 285 }));
    h.container.dispatchEvent(mouse('mousemove', { clientX: 510, clientY: 345 }));
    h.container.dispatchEvent(mouse('mouseup',   { clientX: 510, clientY: 345 }));
    await flush();

    const moved = h.model.getNode('n1')!.position;
    expect(moved.x).toBeCloseTo(460, 0); // 300 + 160
    expect(moved.y).toBeCloseTo(320, 0); // 200 + 120

    // THE ASSERTION THAT WAS RED: undo must put it back to the START, not leave it moved.
    await h.engine.undo();
    const after = h.model.getNode('n1')!.position;
    expect(after.x).toBeCloseTo(300, 0);
    expect(after.y).toBeCloseTo(200, 0);

    // …and redo re-applies it (one gesture = one clean history step).
    await h.engine.redo();
    expect(h.model.getNode('n1')!.position.x).toBeCloseTo(460, 0);
  });
});
