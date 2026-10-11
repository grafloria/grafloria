/**
 * N5 (docs review v4): the link toolbar stayed on screen after its own Delete
 * action. The pointer is ON the toolbar when Delete is clicked, and the
 * "keep it while hovered" rule kept a toolbar for a link that no longer exists.
 */
import { TestBed } from '@angular/core/testing';
import { DiagramEngine, DiagramModel, LinkModel } from '@grafloria/engine';
import { buildNode } from '@grafloria/renderer';
import { DiagramCanvasComponent } from './diagram-canvas.component';

describe('DiagramCanvasComponent — the link toolbar after its own Delete (N5)', () => {
  test('deleting the link the toolbar hangs off removes the toolbar, pointer still on it', async () => {
    await TestBed.configureTestingModule({ imports: [DiagramCanvasComponent] }).compileComponents();
    const engine = new DiagramEngine();
    const diagram: DiagramModel = engine.createDiagram('n5');
    diagram.addNode(buildNode({ id: 'a', position: { x: 50, y: 100 }, size: { width: 100, height: 50 } } as never, 0));
    diagram.addNode(buildNode({ id: 'b', position: { x: 450, y: 100 }, size: { width: 100, height: 50 } } as never, 1));
    const link = new LinkModel(diagram.getNode('a')!.getPortBySide('right')!.id, diagram.getNode('b')!.getPortBySide('left')!.id);
    diagram.addLink(link);
    const fixture = TestBed.createComponent(DiagramCanvasComponent);
    const canvas = fixture.componentInstance;
    fixture.componentRef.setInput('engine', engine);
    fixture.detectChanges();
    const paint = () => {
      (canvas as unknown as { renderNow(): void }).renderNow();
      fixture.detectChanges();
    };

    link.setState('selected');
    paint();
    expect(canvas.linkToolbarTarget()).toBe(link);
    expect(fixture.nativeElement.querySelector('grafloria-link-toolbar')).toBeTruthy();

    // The pointer travels onto the toolbar and clicks its Delete button.
    canvas.onLinkToolbarPointerOver(true);
    const remove = canvas.effectiveLinkToolbarActions.find((a) => a.id === 'delete-link')!;
    remove.onClick({ link, engine } as never);
    await new Promise((r) => setTimeout(r, 0));
    paint();

    expect(diagram.getLink(link.id)).toBeUndefined();
    expect(canvas.linkToolbarTarget()).toBeNull();
    expect(fixture.nativeElement.querySelector('grafloria-link-toolbar')).toBeNull();
    fixture.destroy();
    engine.destroy();
  });
});
