/**
 * Test harness for `<grafloria-diagram-canvas>` gesture specs: mount on an engine,
 * give the container a real size (jsdom lays nothing out), and drive the
 * component's pointer handlers at hand speed (≤ 50 px per move, a frame painted
 * between moves) — the way the docs review drove the real browser.
 */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DiagramEngine, DiagramModel, NodeModel } from '@grafloria/engine';
import { buildNode, type NodeSpec } from '@grafloria/renderer';
import { DiagramCanvasComponent } from '../lib/components/diagram-canvas.component';

class FakePointerEvent extends MouseEvent {
  readonly pointerId = 1;
  readonly pointerType = 'mouse';
  constructor(type: string, init: MouseEventInit) {
    super(type, { bubbles: true, cancelable: true, ...init });
  }
}

export interface Pt {
  x: number;
  y: number;
}

export class CanvasHarness {
  readonly engine = new DiagramEngine();
  readonly diagram: DiagramModel;
  fixture!: ComponentFixture<DiagramCanvasComponent>;
  canvas!: DiagramCanvasComponent;
  private index = 0;

  constructor(readonly size = { width: 1200, height: 600 }) {
    this.diagram = this.engine.createDiagram('harness');
  }

  static async configure(): Promise<void> {
    await TestBed.configureTestingModule({ imports: [DiagramCanvasComponent] }).compileComponents();
  }

  addNode(spec: Partial<NodeSpec> & { id: string }): NodeModel {
    const node = buildNode({ position: { x: 0, y: 0 }, size: { width: 180, height: 80 }, ...spec } as never, this.index++);
    this.diagram.addNode(node);
    return node;
  }

  mount(inputs: Record<string, unknown> = {}): this {
    this.fixture = TestBed.createComponent(DiagramCanvasComponent);
    this.canvas = this.fixture.componentInstance;
    this.fixture.componentRef.setInput('engine', this.engine);
    for (const [k, v] of Object.entries(inputs)) this.fixture.componentRef.setInput(k, v);
    const { width, height } = this.size;
    const container = this.canvas.containerRef.nativeElement;
    container.getBoundingClientRect = () =>
      ({ x: 0, y: 0, left: 0, top: 0, right: width, bottom: height, width, height, toJSON: () => ({}) }) as DOMRect;
    this.fixture.detectChanges();
    this.paint();
    return this;
  }

  destroy(): void {
    this.fixture?.destroy();
    this.engine.destroy();
  }

  paint(): void {
    (this.canvas as unknown as { renderNow(): void }).renderNow();
  }

  /** Client point of a world point (the container sits at the page origin). */
  client(worldX: number, worldY: number): Pt {
    const { screenX, screenY } = this.canvas.worldToScreen(worldX, worldY);
    return { x: screenX, y: screenY };
  }

  pointer(type: 'pointerdown' | 'pointermove' | 'pointerup', at: Pt, init: MouseEventInit = {}): void {
    const event = new FakePointerEvent(type, {
      clientX: at.x,
      clientY: at.y,
      button: 0,
      buttons: type === 'pointerup' ? 0 : 1,
      ...init,
    }) as unknown as PointerEvent;
    // Dispatched for real (it bubbles to the component's host listeners and on to
    // window, where the renderer's pointer-button tracker listens too).
    this.canvas.containerRef.nativeElement.dispatchEvent(event);
  }

  /** Hover (no button) at a client point, the way a mouse arrives before it presses. */
  hover(at: Pt): void {
    this.pointer('pointermove', at, { buttons: 0 });
    this.paint();
  }

  click(at: Pt): void {
    this.hover(at);
    this.pointer('pointerdown', at);
    this.pointer('pointerup', at);
    this.paint();
  }

  /** Press at `from`, move to `to` in ≤ `step` px moves, release. */
  drag(from: Pt, to: Pt, step = 50, init: MouseEventInit = {}): void {
    this.hover(from);
    this.pointer('pointerdown', from, init);
    this.paint();
    const n = Math.max(3, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / step));
    for (let i = 1; i <= n; i++) {
      this.pointer('pointermove', { x: from.x + ((to.x - from.x) * i) / n, y: from.y + ((to.y - from.y) * i) / n }, init);
      this.paint();
    }
    this.pointer('pointerup', to, init);
    this.paint();
  }
}

/** Let queued microtasks and the async command pipeline settle. */
export async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
  await new Promise((r) => setTimeout(r, 0));
}
