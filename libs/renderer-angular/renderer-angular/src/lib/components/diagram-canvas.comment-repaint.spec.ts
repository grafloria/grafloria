// Comment pins repaint when the comments change.
//
// The overlay drops its cached frame on every store change, but dropping the cache
// paints nothing: a new thread showed no pin (and a resolved one kept its pin) until
// an unrelated hover repainted the canvas. The JS canvas schedules a frame on every
// store change; the Angular canvas must too.
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DiagramCanvasComponent } from './diagram-canvas.component';
import { CommentStore, DiagramEngine, DiagramModel, NodeModel } from '@grafloria/engine';

describe('DiagramCanvasComponent — comment pins repaint on store changes', () => {
  let component: DiagramCanvasComponent;
  let fixture: ComponentFixture<DiagramCanvasComponent>;
  let engine: DiagramEngine;
  let diagram: DiagramModel;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [DiagramCanvasComponent] }).compileComponents();
    fixture = TestBed.createComponent(DiagramCanvasComponent);
    component = fixture.componentInstance;
    engine = new DiagramEngine();
    diagram = engine.createDiagram('comment-repaint');
    diagram.addNode(new NodeModel({ id: 'a', type: 'basic', position: { x: 100, y: 100 }, size: { width: 120, height: 60 } }));
    fixture.componentRef.setInput('engine', engine);
    fixture.componentRef.setInput('viewport', { x: 0, y: 0, width: 800, height: 600 });
    fixture.componentRef.setInput('zoom', 1);
    fixture.componentRef.setInput('comments', true);
    fixture.detectChanges();
  });

  afterEach(() => {
    engine.destroy();
  });

  const store = () => component.getCommentStore() as CommentStore;

  test('creating, re-anchoring and resolving a thread each schedule a frame', () => {
    expect(store()).toBeTruthy();
    const schedule = jest.spyOn(component, 'scheduleRender');

    const id = store().createThread({ kind: 'node', id: 'a' }, 'Check this');
    expect(schedule).toHaveBeenCalled();

    schedule.mockClear();
    store().reanchor(id, { kind: 'region', x: 400, y: 300 });
    expect(schedule).toHaveBeenCalled();

    schedule.mockClear();
    store().resolve(id);
    expect(schedule).toHaveBeenCalled();
  });

  test('a shared store stops scheduling frames once the canvas is destroyed', () => {
    const shared = store();
    const schedule = jest.spyOn(component, 'scheduleRender');
    fixture.destroy();
    schedule.mockClear();

    shared.createThread({ kind: 'node', id: 'a' }, 'After destroy');
    expect(schedule).not.toHaveBeenCalled();
  });
});
