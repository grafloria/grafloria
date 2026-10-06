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
import { buildNode, registerConnectionValidator } from '@grafloria/renderer';
import { DiagramCanvasComponent } from './diagram-canvas.component';

describe('DiagramCanvasComponent — extension registries', () => {
  let fixture: ComponentFixture<DiagramCanvasComponent>;
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
    fixture.componentRef.setInput('engine', engine);
    fixture.componentRef.setInput('viewport', { x: 0, y: 0, width: 800, height: 600 });
    fixture.componentRef.setInput('zoom', 1);
    fixture.detectChanges();
    host = fixture.nativeElement as HTMLElement;
  }

  function mouse(type: 'mousedown' | 'mousemove' | 'mouseup', x: number, y: number): void {
    host.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, button: 0, buttons: type === 'mouseup' ? 0 : 1, bubbles: true }));
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
});
