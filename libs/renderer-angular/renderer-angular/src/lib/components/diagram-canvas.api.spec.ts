/**
 * Phase 2 (Angular-native DX) — the declarative [layout] input and the public
 * component API: applyLayout() / exportSvg() / snapshot() / loadSnapshot().
 *
 * The engine capabilities themselves are unit-tested in @grafloria/engine and
 * @grafloria/renderer; THIS file proves the Angular seams: the binding runs a
 * real registry layout, the export contains the real scene, and a snapshot
 * round-trips through loadSnapshot.
 */
import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { DiagramCanvasComponent, type GrafloriaLayoutRequest } from './diagram-canvas.component';
import type { NodeSpec, EdgeSpec } from '@grafloria/renderer';

@Component({
  imports: [DiagramCanvasComponent],
  template: `
    <grafloria-diagram-canvas
      style="display:block;width:800px;height:600px"
      [viewport]="{ x: 0, y: 0, width: 800, height: 600 }"
      [zoom]="1"
      [layout]="layout()"
      [(nodes)]="nodes"
      [(edges)]="edges"
      (layoutDone)="layoutsCompleted = layoutsCompleted + 1">
    </grafloria-diagram-canvas>
  `,
})
class ApiHost {
  layout = signal<string | GrafloriaLayoutRequest | undefined>(undefined);
  layoutsCompleted = 0;
  // All nodes deliberately stacked at the same position — any real layout
  // must separate them.
  nodes = signal<NodeSpec[]>([
    { id: 'a', position: { x: 0, y: 0 }, size: { width: 100, height: 50 }, label: 'A' },
    { id: 'b', position: { x: 0, y: 0 }, size: { width: 100, height: 50 }, label: 'B' },
    { id: 'c', position: { x: 0, y: 0 }, size: { width: 100, height: 50 }, label: 'C' },
  ]);
  edges = signal<EdgeSpec[]>([
    { source: 'a', target: 'b' },
    { source: 'b', target: 'c' },
  ]);
}

describe('diagram-canvas Angular-native API', () => {
  let fixture: ComponentFixture<ApiHost>;
  let host: ApiHost;
  let canvas: DiagramCanvasComponent;

  const positions = () => {
    const diagram = (canvas as any).eng.getDiagram();
    return diagram.getNodes().map((n: any) => ({ id: n.id, ...n.position }));
  };
  const distinctPositions = () => new Set(positions().map((p: any) => `${p.x},${p.y}`)).size;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ApiHost] }).compileComponents();
    fixture = TestBed.createComponent(ApiHost);
    host = fixture.componentInstance;
    fixture.detectChanges();
    canvas = fixture.debugElement.query(By.directive(DiagramCanvasComponent)).componentInstance;
    (canvas as unknown as { renderNow(): void }).renderNow();
    fixture.detectChanges();
  });

  afterEach(() => fixture.destroy());

  it('stacked nodes stay stacked until a layout is requested', () => {
    expect(distinctPositions()).toBe(1);
  });

  it('[layout]="\'grid\'" runs a registry layout and separates the nodes', async () => {
    host.layout.set('grid');
    fixture.detectChanges(); // flush effects — the layout kicks off async
    // whenStable() would wait on the layout's rAF animation chain forever in
    // jsdom; poll the model instead.
    for (let i = 0; i < 100 && distinctPositions() !== 3; i++) {
      await new Promise((r) => setTimeout(r, 20));
    }
    expect(distinctPositions()).toBe(3);
    expect(host.layoutsCompleted).toBeGreaterThanOrEqual(1);
  });

  it('applyLayout() re-runs imperatively and resolves with the result', async () => {
    const result = await canvas.applyLayout({ name: 'tree' });
    expect(result).toBeDefined();
    expect(distinctPositions()).toBe(3);
  });

  it('exportSvg() returns the real scene', () => {
    const out = canvas.exportSvg();
    const svg = typeof out === 'string' ? out : out.svg;
    expect(svg).toContain('<svg');
    expect(svg).toContain('A'); // node label made it into the export
  });

  it('snapshot() → loadSnapshot() round-trips the diagram', async () => {
    await canvas.applyLayout({ name: 'grid' });
    const saved = canvas.snapshot()!;
    expect(saved).toBeTruthy();
    const savedPositions = JSON.stringify(positions());

    // wreck the live diagram, then restore
    await canvas.applyLayout({ name: 'tree' });
    expect(JSON.stringify(positions())).not.toBe(savedPositions);

    canvas.loadSnapshot(saved);
    expect(JSON.stringify(positions())).toBe(savedPositions);
  });
});

describe('diagram-canvas text round-trip', () => {
  it('exportText() → loadText() restores the diagram through the live model', async () => {
    await TestBed.configureTestingModule({ imports: [ApiHost] }).compileComponents();
    const fixture = TestBed.createComponent(ApiHost);
    fixture.detectChanges();
    const canvas = fixture.debugElement.query(By.directive(DiagramCanvasComponent)).componentInstance;
    (canvas as unknown as { renderNow(): void }).renderNow();
    fixture.detectChanges();

    const text = canvas.exportText();
    expect(text).toContain('A');

    const diagram = (canvas as any).eng.getDiagram();
    diagram.removeNode('b');
    diagram.removeNode('c');
    expect(diagram.getNodes()).toHaveLength(1);

    canvas.loadText(text);
    expect((canvas as any).eng.getDiagram()).toBe(diagram); // same model
    expect(diagram.getNodes().map((n: any) => n.id).sort()).toEqual(['a', 'b', 'c']);
    fixture.destroy();
  });
});

describe('[collab] — two canvases over a MemoryHub', () => {
  it('an edit in canvas A converges into canvas B through the CRDT', async () => {
    const { MemoryHub } = require('@grafloria/engine');
    const hub = new MemoryHub();

    @Component({
      imports: [DiagramCanvasComponent],
      template: `
        <grafloria-diagram-canvas #a style="display:block;width:400px;height:300px"
          [(nodes)]="nodes" [collab]="collabA" (collabReady)="sessions = sessions + 1" />
        <grafloria-diagram-canvas #b style="display:block;width:400px;height:300px"
          [(nodes)]="nodesB" [collab]="collabB" (collabReady)="sessions = sessions + 1" />
      `,
    })
    class CollabHost {
      sessions = 0;
      nodes = signal<NodeSpec[]>([{ id: 'n1', position: { x: 0, y: 0 }, size: { width: 100, height: 50 }, label: 'N1' }]);
      nodesB = signal<NodeSpec[]>([{ id: 'n1', position: { x: 0, y: 0 }, size: { width: 100, height: 50 }, label: 'N1' }]);
      collabA = { transport: hub.connect('actor-a'), actor: 'actor-a', batch: false };
      collabB = { transport: hub.connect('actor-b'), actor: 'actor-b', batch: false };
    }

    await TestBed.configureTestingModule({ imports: [CollabHost] }).compileComponents();
    const fixture = TestBed.createComponent(CollabHost);
    fixture.detectChanges();
    expect(fixture.componentInstance.sessions).toBe(2);

    const canvases = fixture.debugElement.queryAll(By.directive(DiagramCanvasComponent));
    const modelA = (canvases[0].componentInstance as any).eng.getDiagram();
    const modelB = (canvases[1].componentInstance as any).eng.getDiagram();

    modelA.getNodes()[0].setPosition(555, 66);
    for (let i = 0; i < 40; i++) {
      const n = modelB.getNode('n1');
      if (n && n.position.x === 555) break;
      await new Promise((r) => setTimeout(r, 25));
    }
    const nb = modelB.getNode('n1');
    expect({ x: nb.position.x, y: nb.position.y }).toEqual({ x: 555, y: 66 });
    fixture.destroy();
  });
});

describe('[collab] presence + [comments] on the Angular canvas', () => {
  it("presence: A's pointer becomes a live cursor in canvas B", async () => {
    const { MemoryHub } = require('@grafloria/engine');
    const hub = new MemoryHub();

    @Component({
      imports: [DiagramCanvasComponent],
      template: `
        <div id="pane-a"><grafloria-diagram-canvas style="display:block;width:400px;height:300px"
          [(nodes)]="nodes" [collab]="collabA" /></div>
        <div id="pane-b"><grafloria-diagram-canvas style="display:block;width:400px;height:300px"
          [(nodes)]="nodesB" [collab]="collabB" /></div>
      `,
    })
    class PresenceHost {
      nodes = signal<NodeSpec[]>([{ id: 'n1', position: { x: 0, y: 0 }, size: { width: 100, height: 50 } }]);
      nodesB = signal<NodeSpec[]>([{ id: 'n1', position: { x: 0, y: 0 }, size: { width: 100, height: 50 } }]);
      collabA = { transport: hub.connect('ana'), actor: 'ana', batch: false,
                  awarenessThrottleMs: 0, presence: { name: 'Ana', smoothing: 0 } };
      collabB = { transport: hub.connect('ben'), actor: 'ben', batch: false,
                  awarenessThrottleMs: 0, presence: { name: 'Ben', smoothing: 0 } };
    }

    await TestBed.configureTestingModule({ imports: [PresenceHost] }).compileComponents();
    const fixture = TestBed.createComponent(PresenceHost);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('.grafloria-presence-layer').length).toBe(2);

    // bindPresence listens on the INNER container div — dispatch there.
    const containerA = el.querySelector('#pane-a .diagram-canvas-container') as HTMLElement;
    containerA.dispatchEvent(new MouseEvent('pointermove', { clientX: 120, clientY: 80, bubbles: true }));
    for (let i = 0; i < 40 && !el.querySelector('#pane-b .grafloria-presence-cursor'); i++) {
      await new Promise((r) => setTimeout(r, 25));
    }
    expect(el.querySelector('#pane-b .grafloria-presence-cursor')).toBeTruthy();
    fixture.destroy();
  });

  it('[comments]="true" — a thread renders its pin on the node', async () => {
    @Component({
      imports: [DiagramCanvasComponent],
      template: `<grafloria-diagram-canvas style="display:block;width:400px;height:300px"
        [viewport]="{ x: 0, y: 0, width: 400, height: 300 }" [zoom]="1"
        [(nodes)]="nodes" [comments]="true" />`,
    })
    class CommentsHost {
      nodes = signal<NodeSpec[]>([{ id: 'a', position: { x: 100, y: 100 }, size: { width: 120, height: 60 }, label: 'A' }]);
    }
    await TestBed.configureTestingModule({ imports: [CommentsHost] }).compileComponents();
    const fixture = TestBed.createComponent(CommentsHost);
    fixture.detectChanges();
    const canvas = fixture.debugElement.query(By.directive(DiagramCanvasComponent)).componentInstance;
    (canvas as unknown as { renderNow(): void }).renderNow();
    const store = canvas.getCommentStore()!;
    expect(store).toBeTruthy();

    const threadId = store.createThread({ kind: 'node', nodeId: 'a' }, 'check this');
    (canvas as unknown as { renderNow(): void }).renderNow();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector(`[data-comment-thread-id="${threadId}"]`)).toBeTruthy();
    fixture.destroy();
  });
});
