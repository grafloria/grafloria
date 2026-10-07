/**
 * The extension registries (`registerConnectionValidator`, `registerTool`)
 * through the Angular canvas, driven by real pointer events.
 *
 * The JS canvas consults both registries from the moment it mounts
 * (`create-diagram.ts` → `interaction.syncWithEngineConfig(engine)`;
 * `DomEventBinder.onMouseDown` → `resolveTool`). These specs hold the Angular
 * canvas to the same contract.
 *
 * jsdom: `getBoundingClientRect()` is all zeros, so the canvas falls back to
 * its declared viewport (800×600) and, at zoom 1, client coords ARE world coords.
 */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DiagramEngine, DiagramModel } from '@grafloria/engine';
import {
  buildNode,
  registerConnectionValidator,
  registerTool,
  type CanvasTool,
  type ToolHitContext,
  type ToolPointerEvent,
} from '@grafloria/renderer';
import { DiagramCanvasComponent } from './diagram-canvas.component';

/** jsdom has no PointerEvent; the component reads MouseEvent fields + pointerType. */
class FakePointerEvent extends MouseEvent {
  readonly pointerId: number;
  readonly pointerType: string;
  constructor(type: string, init: MouseEventInit & { pointerId?: number; pointerType?: string }) {
    super(type, { bubbles: true, cancelable: true, ...init });
    this.pointerId = init.pointerId ?? 1;
    this.pointerType = init.pointerType ?? 'mouse';
  }
}

describe('DiagramCanvasComponent — extension registries', () => {
  let fixture: ComponentFixture<DiagramCanvasComponent>;
  let component: DiagramCanvasComponent;
  let engine: DiagramEngine;
  let diagram: DiagramModel;
  let host: HTMLElement;
  const disposers: Array<() => void> = [];

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [DiagramCanvasComponent] }).compileComponents();
    engine = new DiagramEngine();
    diagram = engine.createDiagram('extensions');
  });

  afterEach(() => {
    while (disposers.length) disposers.pop()!();
    fixture?.destroy();
    engine.destroy();
  });

  function mount(): void {
    fixture = TestBed.createComponent(DiagramCanvasComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('engine', engine);
    fixture.componentRef.setInput('viewport', { x: 0, y: 0, width: 800, height: 600 });
    fixture.componentRef.setInput('zoom', 1);
    fixture.detectChanges();
    host = fixture.nativeElement as HTMLElement;
  }

  function mouse(type: 'mousedown' | 'mousemove' | 'mouseup', x: number, y: number): void {
    host.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, button: 0, buttons: type === 'mouseup' ? 0 : 1, bubbles: true }));
  }

  /** Drive the component's pointer pipeline (what a real browser calls). */
  function pointer(
    type: 'pointerdown' | 'pointermove' | 'pointerup',
    x: number,
    y: number,
    pointerType: 'mouse' | 'pen' | 'touch'
  ): void {
    const event = new FakePointerEvent(type, {
      clientX: x,
      clientY: y,
      button: 0,
      buttons: type === 'pointerup' ? 0 : 1,
      pointerType,
    }) as unknown as PointerEvent;
    if (type === 'pointerdown') component.onPointerDown(event);
    else if (type === 'pointermove') component.onPointerMove(event);
    else component.onPointerUp(event);
  }

  // ==========================================================================
  // registerConnectionValidator
  // ==========================================================================

  describe('registerConnectionValidator', () => {
    /** producer (0,0) → consumer (200,0); each has an input (left) and output (right). */
    function addPipeline(): void {
      const mk = (id: string, i: number) =>
        buildNode(
          {
            id,
            position: { x: i * 200, y: 0 },
            size: { width: 120, height: 60 },
            ports: [
              { id: `${id}-input`, side: 'left', type: 'input' },
              { id: `${id}-output`, side: 'right', type: 'output' },
            ],
          } as never,
          i
        );
      diagram.addNode(mk('producer', 0));
      diagram.addNode(mk('consumer', 1));
    }

    /** The docs' policy: a consumer may never feed its producer (it would close a cycle). */
    function forbidCycle(): void {
      disposers.push(
        registerConnectionValidator(({ sourceNode, targetNode }) =>
          sourceNode.id === 'consumer' && targetNode.id === 'producer' ? 'would close a cycle' : true
        )
      );
    }

    /** Drag a wire from one port centre to another, hovering first like a hand does. */
    async function dragWire(from: { x: number; y: number }, to: { x: number; y: number }): Promise<void> {
      mouse('mousemove', from.x, from.y); // hover → the port is known
      mouse('mousedown', from.x, from.y);
      const steps = 6;
      for (let i = 1; i <= steps; i++) {
        mouse('mousemove', from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps);
      }
      mouse('mouseup', to.x, to.y);
      // The engine creates the link through its (async) command manager.
      for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
    }

    const consumerOutput = { x: 320, y: 30 };
    const producerInput = { x: 0, y: 30 };
    const producerOutput = { x: 120, y: 30 };
    const consumerInput = { x: 200, y: 30 };

    test('control: an allowed wire (producer → consumer) is created by the drag', async () => {
      addPipeline();
      forbidCycle();
      mount();

      await dragWire(producerOutput, consumerInput);

      expect(diagram.getLinks()).toHaveLength(1);
    });

    test('a validator registered BEFORE mount vetoes a dragged wire from the start', async () => {
      addPipeline();
      forbidCycle();
      mount();

      await dragWire(consumerOutput, producerInput);

      expect(diagram.getLinks()).toHaveLength(0);
    });

    test('a validator registered AFTER mount is consulted too', async () => {
      addPipeline();
      mount();
      forbidCycle();

      await dragWire(consumerOutput, producerInput);

      expect(diagram.getLinks()).toHaveLength(0);
    });

    test('the veto still holds after setInteractionConfig, and is not doubled up', async () => {
      addPipeline();
      forbidCycle();
      mount();
      const manager = engine.getConnectionStateManager() as unknown as { validators: unknown[] };
      const bridged = manager.validators.length;

      engine.setInteractionConfig({ portVisibility: 'always' } as never);
      engine.setInteractionConfig({ portVisibility: 'hover' } as never);
      await dragWire(consumerOutput, producerInput);

      expect(diagram.getLinks()).toHaveLength(0);
      expect(manager.validators.length).toBe(bridged);
    });

    test('an engine swapped in later is bridged as well', async () => {
      mount();
      const second = new DiagramEngine();
      diagram = second.createDiagram('second');
      addPipeline();
      forbidCycle();
      fixture.componentRef.setInput('engine', second);
      fixture.detectChanges();

      await dragWire(consumerOutput, producerInput);

      expect(diagram.getLinks()).toHaveLength(0);
      fixture.destroy();
      second.destroy();
    });
  });

  // ==========================================================================
  // registerTool
  // ==========================================================================

  describe('registerTool', () => {
    interface Recorded {
      type: string;
      world: { x: number; y: number };
      pointerType?: string;
      hit?: ToolHitContext;
    }

    /** A pen-like tool: claims every press on empty canvas, records what it sees. */
    function recordingTool(claim: (hit: ToolHitContext) => boolean = (hit) => hit.empty): {
      tool: CanvasTool;
      seen: Recorded[];
    } {
      const seen: Recorded[] = [];
      const rec = (event: ToolPointerEvent, hit?: ToolHitContext): void => {
        seen.push({
          type: event.type,
          world: { ...event.world },
          pointerType: (event.source as PointerEvent | undefined)?.pointerType,
          hit,
        });
      };
      const tool: CanvasTool = {
        id: 'test-pen',
        priority: 1,
        hitTest: (_event, hit) => claim(hit),
        onPointerDown: (event, hit) => rec(event, hit),
        onPointerMove: (event) => rec(event),
        onPointerUp: (event) => rec(event),
        onCancel: () => seen.push({ type: 'cancel', world: { x: NaN, y: NaN } }),
      };
      return { tool, seen };
    }

    function stroke(pointerType: 'mouse' | 'pen' | 'touch'): void {
      pointer('pointerdown', 400, 300, pointerType);
      pointer('pointermove', 450, 330, pointerType);
      pointer('pointermove', 500, 360, pointerType);
      pointer('pointerup', 500, 360, pointerType);
    }

    for (const pointerType of ['mouse', 'pen'] as const) {
      test(`a ${pointerType} drag reaches the registered tool (down → move → up)`, () => {
        const { tool, seen } = recordingTool();
        disposers.push(registerTool(tool));
        mount();

        stroke(pointerType);

        expect(seen.map((e) => e.type)).toEqual(['down', 'move', 'move', 'up']);
        expect(seen[0]!.world).toEqual({ x: 400, y: 300 });
        expect(seen[3]!.world).toEqual({ x: 500, y: 360 });
        expect(seen[0]!.pointerType).toBe(pointerType);
        // The tool OWNED the gesture: the built-in marquee never armed.
        expect(component.marquee()).toBeNull();
      });
    }

    test('control: a touch drag reaches the registered tool too', () => {
      const { tool, seen } = recordingTool();
      disposers.push(registerTool(tool));
      mount();

      stroke('touch');

      expect(seen.map((e) => e.type)).toEqual(['down', 'move', 'move', 'up']);
    });

    test('legacy mouse events (no PointerEvent support) reach the tool as well', () => {
      const { tool, seen } = recordingTool();
      disposers.push(registerTool(tool));
      mount();

      mouse('mousedown', 400, 300);
      mouse('mousemove', 480, 340);
      mouse('mouseup', 480, 340);

      expect(seen.map((e) => e.type)).toEqual(['down', 'move', 'up']);
    });

    test('a tool that declines leaves the built-in ladder untouched (node drag moves the node)', () => {
      const { tool, seen } = recordingTool(() => false);
      disposers.push(registerTool(tool));
      const node = buildNode({ id: 'n', position: { x: 100, y: 100 }, size: { width: 160, height: 80 } } as never, 0);
      diagram.addNode(node);
      mount();

      pointer('pointerdown', 180, 140, 'mouse');
      pointer('pointermove', 230, 160, 'mouse');
      pointer('pointermove', 280, 180, 'mouse');
      pointer('pointerup', 280, 180, 'mouse');

      expect(seen).toEqual([]);
      expect({ x: node.position.x, y: node.position.y }).toEqual({ x: 200, y: 140 });
    });

    test('the hit context names the node under the press', () => {
      const { tool, seen } = recordingTool(() => true);
      disposers.push(registerTool(tool));
      const node = buildNode({ id: 'n', position: { x: 100, y: 100 }, size: { width: 160, height: 80 } } as never, 0);
      diagram.addNode(node);
      mount();

      pointer('pointerdown', 180, 140, 'mouse');
      pointer('pointerup', 180, 140, 'mouse');

      expect(seen[0]!.hit?.node?.id).toBe('n');
      expect(seen[0]!.hit?.empty).toBe(false);
      // The tool owned the press: the node was not selected by the ladder.
      expect(node.isSelected()).toBe(false);
    });

    test('world coordinates follow the camera at zoom ≠ 1', () => {
      const { tool, seen } = recordingTool();
      disposers.push(registerTool(tool));
      mount();
      fixture.componentRef.setInput('zoom', 2);
      fixture.componentRef.setInput('viewport', { x: 100, y: 50, width: 800, height: 600 });
      fixture.detectChanges();

      pointer('pointerdown', 400, 300, 'pen');
      pointer('pointerup', 400, 300, 'pen');

      // Centre-anchored viewBox: world = centre + (screen − canvasCentre) / zoom
      expect(seen[0]!.world).toEqual({ x: 100 + 400 + (400 - 400) / 2, y: 50 + 300 + (300 - 300) / 2 });
    });

    test('Escape mid-gesture cancels the tool, and the release is not delivered', () => {
      const { tool, seen } = recordingTool();
      disposers.push(registerTool(tool));
      mount();

      pointer('pointerdown', 400, 300, 'mouse');
      pointer('pointermove', 450, 320, 'mouse');
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      pointer('pointermove', 470, 330, 'mouse');
      pointer('pointerup', 470, 330, 'mouse');

      expect(seen.map((e) => e.type)).toEqual(['down', 'move', 'cancel']);
    });

    test('a pointercancel cancels the tool', () => {
      const { tool, seen } = recordingTool();
      disposers.push(registerTool(tool));
      mount();

      pointer('pointerdown', 400, 300, 'pen');
      component.onPointerCancel(
        new FakePointerEvent('pointercancel', { clientX: 400, clientY: 300, pointerType: 'pen' }) as unknown as PointerEvent
      );

      expect(seen.map((e) => e.type)).toEqual(['down', 'cancel']);
    });

    test('a read-only diagram does not hand gestures to tools', () => {
      const { tool, seen } = recordingTool();
      disposers.push(registerTool(tool));
      diagram.setReadonly(true);
      mount();

      stroke('mouse');

      expect(seen).toEqual([]);
    });
  });
});
