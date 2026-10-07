/**
 * `(selectionChange)` — the Angular twin of React's `onSelectionChange`, Vue's
 * `selectionChange` and Qwik's `onSelectionChange$`: same name, same payload
 * (`{ nodes, edges }`, the selection AFTER the change), emitted once per real
 * change — never twice for one click, never for a click that changes nothing.
 *
 * jsdom: the canvas falls back to its 800×600 viewport, so at zoom 1 client
 * coords ARE world coords.
 */
import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { DiagramEngine, DiagramModel, LinkModel } from '@grafloria/engine';
import { buildNode } from '@grafloria/renderer';
import { DiagramCanvasComponent, type SelectionChange } from './diagram-canvas.component';

@Component({
  imports: [DiagramCanvasComponent],
  template: `<grafloria-diagram-canvas
    style="display:block;width:800px;height:600px"
    [engine]="engine"
    (selectionChange)="changes.push($event)" />`,
})
class Host {
  engine!: DiagramEngine;
  changes: SelectionChange[] = [];
}

describe('DiagramCanvasComponent — (selectionChange)', () => {
  let fixture: ComponentFixture<Host>;
  let host: Host;
  let engine: DiagramEngine;
  let diagram: DiagramModel;
  let canvasEl: HTMLElement;
  let link: LinkModel;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
    engine = new DiagramEngine();
    diagram = engine.createDiagram('selection');
    diagram.addNode(buildNode({ id: 'a', position: { x: 100, y: 100 }, size: { width: 160, height: 80 } } as never, 0));
    diagram.addNode(buildNode({ id: 'b', position: { x: 500, y: 100 }, size: { width: 160, height: 80 } } as never, 1));
    link = new LinkModel(diagram.getNode('a')!.getPortBySide('right')!.id, diagram.getNode('b')!.getPortBySide('left')!.id);
    diagram.addLink(link);
    fixture = TestBed.createComponent(Host);
    host = fixture.componentInstance;
    host.engine = engine;
    fixture.detectChanges();
    canvasEl = fixture.debugElement.query(By.directive(DiagramCanvasComponent)).nativeElement;
  });

  afterEach(() => {
    fixture.destroy();
    engine.destroy();
  });

  /** Let coalesced work (microtasks) settle. */
  const settle = () => new Promise((r) => setTimeout(r, 0));
  const ids = (change: SelectionChange) => ({
    nodes: change.nodes.map((n) => n.id).sort(),
    edges: change.edges.map((e) => e.id).sort(),
  });

  function click(x: number, y: number, init: MouseEventInit = {}): void {
    for (const type of ['mousedown', 'mouseup'] as const) {
      canvasEl.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, button: 0, bubbles: true, ...init }));
    }
  }

  test('mounting emits nothing', async () => {
    await settle();
    expect(host.changes).toEqual([]);
  });

  test('clicking a node emits ONCE with that node selected', async () => {
    click(180, 140);
    await settle();

    expect(host.changes.map(ids)).toEqual([{ nodes: ['a'], edges: [] }]);
  });

  test('a plain node click replaces the selection: a selected edge is deselected', async () => {
    link.setState('selected');
    await settle();
    host.changes.length = 0;

    click(180, 140);
    await settle();

    expect(link.state).not.toBe('selected');
    expect(host.changes.map(ids)).toEqual([{ nodes: ['a'], edges: [] }]);
  });

  test('a Ctrl+click on a node adds to the selection and keeps the edge', async () => {
    link.setState('selected');
    await settle();

    click(180, 140, { ctrlKey: true });
    await settle();

    expect(link.state).toBe('selected');
    expect(diagram.getNode('a')!.isSelected()).toBe(true);
  });

  test('clicking the already-selected node again emits nothing', async () => {
    click(180, 140);
    await settle();
    click(180, 140);
    await settle();

    expect(host.changes).toHaveLength(1);
  });

  test('clicking another node emits once with ONLY the new node (no stale intermediate)', async () => {
    click(180, 140);
    await settle();
    click(580, 140);
    await settle();

    expect(host.changes.map(ids)).toEqual([
      { nodes: ['a'], edges: [] },
      { nodes: ['b'], edges: [] },
    ]);
  });

  test('ctrl-click adds to the selection; clicking empty canvas clears it', async () => {
    click(180, 140);
    await settle();
    click(580, 140, { ctrlKey: true });
    await settle();
    click(400, 450);
    await settle();

    expect(host.changes.map(ids)).toEqual([
      { nodes: ['a'], edges: [] },
      { nodes: ['a', 'b'], edges: [] },
      { nodes: [], edges: [] },
    ]);
  });

  test('selecting an edge reports it in `edges`', async () => {
    link.setState('selected');
    await settle();

    expect(host.changes.map(ids)).toEqual([{ nodes: [], edges: [link.id] }]);
  });

  test('programmatic selection through the model is reported too', async () => {
    diagram.selectAll();
    await settle();

    expect(host.changes.map(ids)).toEqual([{ nodes: ['a', 'b'], edges: [] }]);
  });

  test('deleting a selected node reports the shrunken selection', async () => {
    diagram.selectNode(diagram.getNode('a')!);
    await settle();
    diagram.removeNode('a');
    await settle();

    expect(host.changes.map(ids)).toEqual([
      { nodes: ['a'], edges: [] },
      { nodes: [], edges: [] },
    ]);
  });

  test('dragging a selected node emits no selection change', async () => {
    click(180, 140);
    await settle();
    canvasEl.dispatchEvent(new MouseEvent('mousedown', { clientX: 180, clientY: 140, button: 0, bubbles: true }));
    for (let i = 1; i <= 5; i++) {
      canvasEl.dispatchEvent(new MouseEvent('mousemove', { clientX: 180 + i * 20, clientY: 140, button: 0, buttons: 1, bubbles: true }));
    }
    canvasEl.dispatchEvent(new MouseEvent('mouseup', { clientX: 280, clientY: 140, button: 0, bubbles: true }));
    await settle();

    expect(diagram.getNode('a')!.position.x).not.toBe(100); // it really moved
    expect(host.changes).toHaveLength(1);
  });
});
