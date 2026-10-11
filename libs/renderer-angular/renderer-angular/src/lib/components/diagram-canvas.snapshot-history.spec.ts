/**
 * S10 (Angular): undo history survived a document load. `loadSnapshot` reconciles
 * COPIES into the live diagram, so nothing told the history the document was
 * replaced: Save → edit → loadSnapshot → Ctrl+Z ×2 undid into the old document.
 * A load leaves no undo step pointing into the previous document — except when
 * a history owner (a collab Replica) owns the history: that is left alone.
 */
import { TestBed } from '@angular/core/testing';
import { DiagramEngine } from '@grafloria/engine';
import type { NodeSpec } from '@grafloria/renderer';
import { DiagramCanvasComponent } from './diagram-canvas.component';

describe('DiagramCanvasComponent — loadSnapshot clears the undo history (S10)', () => {
  async function mount() {
    await TestBed.configureTestingModule({ imports: [DiagramCanvasComponent] }).compileComponents();
    const fixture = TestBed.createComponent(DiagramCanvasComponent);
    const nodes: NodeSpec[] = [{ id: 'a', position: { x: 0, y: 0 }, size: { width: 100, height: 50 }, label: 'A' }];
    fixture.componentRef.setInput('nodes', nodes);
    fixture.detectChanges();
    const canvas = fixture.componentInstance;
    return { fixture, canvas, engine: canvas.activeEngine() as DiagramEngine };
  }

  test('Save → edit → loadSnapshot: nothing left to undo; the loaded document stays', async () => {
    const { fixture, canvas, engine } = await mount();
    const saved = canvas.snapshot()!;
    engine.getDiagram()!.getNode('a')!.setSelected(true);
    await canvas.deleteSelection();
    expect(engine.commandManager.canUndo()).toBe(true);

    canvas.loadSnapshot(saved);
    expect(engine.getDiagram()!.getNode('a')).toBeDefined();
    expect(engine.commandManager.canUndo()).toBe(false);
    await canvas.undo();
    await canvas.undo();
    expect(engine.getDiagram()!.getNode('a')).toBeDefined();
    fixture.destroy();
  });

  test('a history owner (collab replica) keeps its history', async () => {
    const { fixture, canvas, engine } = await mount();
    const saved = canvas.snapshot()!;
    const owner = { canUndo: true, canRedo: false, undo: jest.fn(), redo: jest.fn() };
    engine.getDiagram()!.setHistoryOwner(owner as never);
    const clear = jest.spyOn(engine.commandManager, 'clear');
    canvas.loadSnapshot(saved);
    expect(clear).not.toHaveBeenCalled();
    expect(engine.commandManager.canUndo()).toBe(true);
    engine.getDiagram()!.setHistoryOwner(null);
    fixture.destroy();
  });
});
