/**
 * `<grafloria-diagram-canvas (ready)="…">` hands the host the canvas's instance, the
 * way `<grafloria-diagram>` and every other binding do — so a canvas user can call
 * `instance.on(...)`, `instance.export(...)`, `instance.undo()` without reaching into
 * the component.
 */
import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import type { NodeSpec, EdgeSpec } from '@grafloria/renderer';
import { DiagramCanvasComponent } from './diagram-canvas.component';
import type { GrafloriaCanvasInstance } from './diagram-canvas.instance';

@Component({
  imports: [DiagramCanvasComponent],
  template: `<grafloria-diagram-canvas style="display:block;width:800px;height:600px"
    [(nodes)]="nodes" [(edges)]="edges" (ready)="onReady($event)" />`,
})
class Host {
  nodes = signal<NodeSpec[]>([
    { id: 'a', position: { x: 0, y: 0 }, size: { width: 100, height: 50 }, label: 'A' },
    { id: 'b', position: { x: 200, y: 0 }, size: { width: 100, height: 50 }, label: 'B' },
  ]);
  edges = signal<EdgeSpec[]>([{ id: 'e', source: 'a', target: 'b' }]);
  readyCalls: GrafloriaCanvasInstance[] = [];
  onReady(instance: GrafloriaCanvasInstance): void {
    this.readyCalls.push(instance);
  }
}

describe('DiagramCanvasComponent (ready)', () => {
  let fixture: ComponentFixture<Host>;
  let host: Host;
  let canvas: DiagramCanvasComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
    fixture = TestBed.createComponent(Host);
    host = fixture.componentInstance;
    fixture.detectChanges();
    canvas = fixture.debugElement.query(By.directive(DiagramCanvasComponent)).componentInstance;
  });
  afterEach(() => fixture.destroy());

  it('emits once, after the first paint, with the live model and engine', () => {
    expect(host.readyCalls).toHaveLength(1);
    const instance = host.readyCalls[0]!;
    expect(instance).toBe(canvas.instance());
    expect(instance.getEngine()).toBe(canvas.activeEngine());
    expect(instance.getModel()).toBe(canvas.activeEngine()!.getDiagram());
    expect(instance.getModel().getNodes().map((n) => n.id)).toEqual(['a', 'b']);
  });

  it('exports through the instance', async () => {
    const instance = host.readyCalls[0]!;
    expect(instance.exportSvgString().svg).toContain('<svg');
    await expect(instance.export('svg')).resolves.toContain('<svg');
    expect(instance.exportText({ lossless: false })).toMatch(/a.*-->.*b/s);
  });

  it('on(): hears selection, node and edge changes; the unsubscribe works', async () => {
    const instance = host.readyCalls[0]!;
    const selections: string[][] = [];
    const nodeChanges: number[] = [];
    const edgeChanges: number[] = [];
    const off = instance.on('selection:change', ({ nodes }) => selections.push(nodes.map((n) => n.id)));
    instance.on('nodes:change', ({ nodes }) => nodeChanges.push(nodes.length));
    instance.on('edges:change', ({ edges }) => edgeChanges.push(edges.length));

    instance.getModel().getNode('a')!.setSelected(true);
    await Promise.resolve();
    await Promise.resolve();
    expect(selections).toEqual([['a']]);

    instance.setNodes([...host.nodes(), { id: 'c', position: { x: 400, y: 0 }, size: { width: 100, height: 50 } }]);
    await Promise.resolve();
    await Promise.resolve();
    expect(nodeChanges.at(-1)).toBe(3);

    instance.setEdges([]);
    await Promise.resolve();
    await Promise.resolve();
    expect(edgeChanges.at(-1)).toBe(0);

    off();
    instance.getModel().getNode('a')!.setSelected(false);
    await Promise.resolve();
    await Promise.resolve();
    expect(selections).toEqual([['a']]);
  });

  it('undo()/redo() go through the canvas history', async () => {
    const instance = host.readyCalls[0]!;
    await canvas.deleteSelection(); // nothing selected — no history entry
    instance.getModel().getNode('a')!.setSelected(true);
    await canvas.deleteSelection();
    expect(instance.getModel().getNode('a')).toBeUndefined();
    await instance.undo();
    expect(instance.getModel().getNode('a')).toBeDefined();
    await instance.redo();
    expect(instance.getModel().getNode('a')).toBeUndefined();
  });
});
