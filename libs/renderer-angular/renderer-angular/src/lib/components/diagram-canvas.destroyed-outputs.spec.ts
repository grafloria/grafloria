/**
 * NG0953 "Unexpected emit for destroyed `OutputRef`": nothing in the canvas (or
 * the components it hosts) may emit after it has been destroyed.
 *
 * Angular marks a component's outputs (and `model()` signals) destroyed BEFORE
 * ngOnDestroy runs, and warns on every later `emit()` / `model.set()`. The
 * review saw the warning in the quick starts; the sources are work that
 * outlives the component — a queued frame or timer, an awaited layout, a host
 * calling the public camera API on a canvas an `@if` already removed.
 */
import { Component, signal, viewChild } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DiagramEngine, DiagramModel, LinkModel } from '@grafloria/engine';
import { buildNode } from '@grafloria/renderer';
import { DiagramCanvasComponent } from './diagram-canvas.component';
import { NodeToolbarComponent } from './node-toolbar/node-toolbar.component';

const ng0953 = (spy: jest.SpyInstance) =>
  spy.mock.calls.filter((args) => args.some((a: unknown) => String(a).includes('NG0953')));

const flushFrames = async () => {
  for (let i = 0; i < 4; i++) await new Promise((r) => setTimeout(r, 20));
};

@Component({
  imports: [DiagramCanvasComponent],
  template: `
    @if (shown()) {
      <grafloria-diagram-canvas
        [engine]="engine"
        (zoomChanged)="zooms = zooms + 1"
        (viewportChanged)="views = views + 1"
        (layoutDone)="layouts = layouts + 1" />
    }
  `,
})
class Host {
  readonly canvas = viewChild(DiagramCanvasComponent);
  readonly shown = signal(true);
  engine!: DiagramEngine;
  zooms = 0;
  views = 0;
  layouts = 0;
}

describe('DiagramCanvasComponent — no emits after destroy (NG0953)', () => {
  let fixture: ComponentFixture<Host>;
  let host: Host;
  let engine: DiagramEngine;
  let diagram: DiagramModel;
  let warn: jest.SpyInstance;

  beforeEach(async () => {
    warn = jest.spyOn(console, 'warn');
    await TestBed.configureTestingModule({ imports: [Host, NodeToolbarComponent] }).compileComponents();
    engine = new DiagramEngine();
    diagram = engine.createDiagram('ng0953');
    diagram.addNode(buildNode({ id: 'a', position: { x: 50, y: 50 }, size: { width: 120, height: 60 } } as never, 0));
    diagram.addNode(buildNode({ id: 'b', position: { x: 350, y: 50 }, size: { width: 120, height: 60 } } as never, 1));
    fixture = TestBed.createComponent(Host);
    host = fixture.componentInstance;
    host.engine = engine;
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
    engine.destroy();
    warn.mockRestore();
  });

  const canvas = () => host.canvas()!;
  const paint = () => {
    (canvas() as unknown as { renderNow(): void }).renderNow();
    fixture.detectChanges();
  };
  const destroyCanvas = () => {
    host.shown.set(false);
    fixture.detectChanges();
  };

  test('the edge toolbar destroyed before its queued re-position runs does not emit', async () => {
    const link = new LinkModel(
      diagram.getNode('a')!.getPortBySide('right')!.id,
      diagram.getNode('b')!.getPortBySide('left')!.id
    );
    diagram.addLink(link);
    link.setState('selected');
    paint(); // the toolbar mounts and queues its first re-position
    expect(fixture.nativeElement.querySelector('grafloria-link-toolbar')).not.toBeNull();

    link.setState('default');
    paint(); // …and is destroyed before that runs
    expect(fixture.nativeElement.querySelector('grafloria-link-toolbar')).toBeNull();
    await flushFrames();

    expect(ng0953(warn)).toEqual([]);
  });

  test('a layout that finishes after the canvas is gone does not emit layoutDone', async () => {
    const pending = canvas().applyLayout('grid');
    destroyCanvas();
    await pending;
    await flushFrames();

    expect(ng0953(warn)).toEqual([]);
    expect(host.layouts).toBe(0);
  });

  test('the public camera API on a destroyed canvas does not emit (or write its models)', async () => {
    const dead = canvas();
    destroyCanvas();

    dead.fitToContent();
    dead.zoomIn();
    dead.zoomAtClient(2, 100, 100);
    dead.resetZoom();
    await flushFrames();

    expect(ng0953(warn)).toEqual([]);
    expect(host.zooms).toBe(0);
  });

  test('control: the same calls on a live canvas do emit', () => {
    canvas().zoomIn();
    expect(host.zooms).toBe(1);
    expect(host.views).toBeGreaterThan(0);
  });

  describe('the node toolbar', () => {
    // jsdom has no DOMRect; the toolbar builds one for the node's screen box.
    const hadDOMRect = 'DOMRect' in globalThis;
    beforeAll(() => {
      if (!hadDOMRect) {
        (globalThis as { DOMRect?: unknown }).DOMRect = class {
          constructor(public x = 0, public y = 0, public width = 0, public height = 0) {}
          get left() { return this.x; }
          get top() { return this.y; }
          get right() { return this.x + this.width; }
          get bottom() { return this.y + this.height; }
        };
      }
    });
    afterAll(() => {
      if (!hadDOMRect) delete (globalThis as { DOMRect?: unknown }).DOMRect;
    });

    function mountToolbar(): { fixture: ComponentFixture<NodeToolbarComponent>; count(): number } {
      const toolbarFixture = TestBed.createComponent(NodeToolbarComponent);
      const toolbar = toolbarFixture.componentInstance;
      toolbar.node = diagram.getNode('a')!;
      toolbar.engine = engine;
      toolbar.canvasElement = document.createElement('div');
      let positions = 0;
      toolbar.positionUpdated.subscribe(() => positions++);
      toolbarFixture.detectChanges(); // ngOnInit queues the first re-position
      return { fixture: toolbarFixture, count: () => positions };
    }

    test('control: a live toolbar emits positionUpdated once its first re-position runs', async () => {
      const { fixture: toolbarFixture, count } = mountToolbar();
      await flushFrames();
      expect(count()).toBeGreaterThan(0);
      toolbarFixture.destroy();
    });

    test('destroyed before that re-position runs, it does not emit', async () => {
      const { fixture: toolbarFixture } = mountToolbar();
      toolbarFixture.destroy();
      await flushFrames();
      expect(ng0953(warn)).toEqual([]);
    });
  });
});
