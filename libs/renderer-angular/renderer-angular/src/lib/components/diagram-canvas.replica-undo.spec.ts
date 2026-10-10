/**
 * C8 on the Angular canvas: under a sync session the REPLICA owns undo, so a press
 * (down, moves, up) must be ONE step on its stack — the same rule the JS canvas
 * follows. Before, every mousemove of a drag was its own replica step, so
 * `replica.undo()` after a drag took back the last few pixels and looked like a no-op.
 */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DiagramEngine, DiagramModel, MemoryHub, NodeModel, createSyncSession } from '@grafloria/engine';
import { DiagramCanvasComponent } from './diagram-canvas.component';

describe('DiagramCanvasComponent under a sync session (C8)', () => {
  let fixture: ComponentFixture<DiagramCanvasComponent>;
  let component: DiagramCanvasComponent;
  let engine: DiagramEngine;
  let diagram: DiagramModel;
  let session: ReturnType<typeof createSyncSession>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [DiagramCanvasComponent] }).compileComponents();
    fixture = TestBed.createComponent(DiagramCanvasComponent);
    component = fixture.componentInstance;
    engine = new DiagramEngine();
    diagram = engine.createDiagram('t')!;
    fixture.componentRef.setInput('engine', engine);
    session = createSyncSession(diagram, new MemoryHub().connect('ana'), { actor: 'ana', batch: { intervalMs: 1_000_000 } });
    session.join();
    fixture.detectChanges();
  });
  afterEach(() => {
    session.dispose();
    session.replica.dispose();
    fixture.destroy();
    engine.destroy();
  });

  const settle = () => new Promise<void>((r) => setTimeout(r, 0));

  it('a drag in four moves is ONE replica step; replica.undo() puts the node back', async () => {
    const node = new NodeModel({ type: 'basic', position: { x: 100, y: 100 }, size: { width: 100, height: 60 } });
    diagram.addNode(node);
    // jsdom's rect is all zeros: client coords ARE world coords at zoom 1.
    component.onMouseDown(new MouseEvent('mousedown', { clientX: 150, clientY: 130, button: 0 }));
    for (const dx of [40, 80, 120, 160]) {
      component.onMouseMove(new MouseEvent('mousemove', { clientX: 150 + dx, clientY: 130, buttons: 1 }));
    }
    component.onMouseUp(new MouseEvent('mouseup', { clientX: 310, clientY: 130, button: 0 }));
    await settle();
    expect(node.position.x).toBe(260);

    session.replica.undo();
    expect(node.position.x).toBe(100);
    // What is left on the stack is the step BEFORE the drag — adding the node.
    session.replica.undo();
    expect(diagram.getNode(node.id)).toBeUndefined();
    expect(session.replica.canUndo).toBe(false);
  });

  it('engine.undo() (what the canvas Ctrl+Z calls) reaches the replica stack', async () => {
    const node = new NodeModel({ type: 'basic', position: { x: 100, y: 100 }, size: { width: 100, height: 60 } });
    diagram.addNode(node);
    component.onMouseDown(new MouseEvent('mousedown', { clientX: 150, clientY: 130, button: 0 }));
    component.onMouseMove(new MouseEvent('mousemove', { clientX: 230, clientY: 130, buttons: 1 }));
    component.onMouseMove(new MouseEvent('mousemove', { clientX: 310, clientY: 130, buttons: 1 }));
    component.onMouseUp(new MouseEvent('mouseup', { clientX: 310, clientY: 130, button: 0 }));
    await settle();
    await engine.undo();
    expect(node.position.x).toBe(100);
    expect(session.replica.canRedo).toBe(true);
  });
});
