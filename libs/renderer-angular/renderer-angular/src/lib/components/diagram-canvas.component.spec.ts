import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DiagramCanvasComponent } from './diagram-canvas.component';
import { DiagramEngine, DiagramModel, NodeModel } from '@grafloria/engine';
import { LIGHT_THEME, DARK_THEME } from '@grafloria/renderer';

describe('DiagramCanvasComponent', () => {
  let component: DiagramCanvasComponent;
  let fixture: ComponentFixture<DiagramCanvasComponent>;
  let engine: DiagramEngine;
  let diagram: DiagramModel;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DiagramCanvasComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(DiagramCanvasComponent);
    component = fixture.componentInstance;

    // Create engine and diagram
    engine = new DiagramEngine();
    diagram = engine.createDiagram('Test Diagram');
    fixture.componentRef.setInput("engine", engine);
  });

  afterEach(() => {
    engine.destroy();
  });

  describe('Initialization', () => {
    test('should create component', () => {
      expect(component).toBeTruthy();
    });

    test('should require engine input', () => {
      fixture.componentRef.setInput("engine", undefined);
      fixture.detectChanges();

      // Component should handle missing engine gracefully
      expect(component).toBeTruthy();
    });

    test('should initialize with default viewport', () => {
      fixture.detectChanges();

      expect(component.viewport()).toBeDefined();
      expect(component.viewport().width).toBeGreaterThan(0);
      expect(component.viewport().height).toBeGreaterThan(0);
    });

    test('should initialize with light theme by default', () => {
      fixture.detectChanges();

      expect(component.theme()).toBeDefined();
      expect(component.theme().name).toBe('Light');
    });

    test('should accept custom theme input', () => {
      fixture.componentRef.setInput("theme", DARK_THEME);
      fixture.detectChanges();

      expect(component.theme().name).toBe('Dark');
    });

    test('should use custom viewport if provided', () => {
      fixture.componentRef.setInput("viewport", { x: 100, y: 100, width: 1000, height: 800 });
      fixture.detectChanges();

      expect(component.viewport().x).toBe(100);
      expect(component.viewport().y).toBe(100);
      expect(component.viewport().width).toBe(1000);
      expect(component.viewport().height).toBe(800);
    });
  });

  describe('Rendering', () => {
    test('should render SVG element', () => {
      fixture.detectChanges();

      const svg = fixture.nativeElement.querySelector('svg');
      expect(svg).toBeTruthy();
    });

    test('should render diagram with nodes', () => {
      const node = new NodeModel({
        type: 'basic',
        position: { x: 100, y: 100 },
        size: { width: 200, height: 100 },
      });
      diagram.addNode(node);

      fixture.detectChanges();

      const svg = fixture.nativeElement.querySelector('svg');
      expect(svg).toBeTruthy();

      // Should have nodes layer
      const nodesLayer = svg.querySelector('.nodes-layer');
      expect(nodesLayer).toBeTruthy();
    });

    test('should update when diagram changes', (done) => {
      fixture.detectChanges();

      const initialChildren = fixture.nativeElement.querySelector('svg')?.children.length || 0;

      // Add a node
      const node = new NodeModel({
        type: 'basic',
        position: { x: 100, y: 100 },
        size: { width: 200, height: 100 },
      });
      diagram.addNode(node);

      // Wait for change detection
      setTimeout(() => {
        fixture.detectChanges();
        const svg = fixture.nativeElement.querySelector('svg');
        expect(svg).toBeTruthy();
        done();
      }, 100);
    });

    test('should apply viewport dimensions to SVG', () => {
      fixture.componentRef.setInput("viewport", { x: 0, y: 0, width: 1200, height: 900 });
      fixture.detectChanges();

      const svg = fixture.nativeElement.querySelector('svg');
      // The SVGRenderer deliberately omits width/height attributes (sized to 100%
      // via CSS) and applies the viewport dimensions through the viewBox instead.
      expect(svg.getAttribute('viewBox')).toBe('0 0 1200 900');
    });

    test('should include viewBox attribute', () => {
      fixture.componentRef.setInput("viewport", { x: 50, y: 50, width: 1000, height: 800 });
      fixture.detectChanges();

      const svg = fixture.nativeElement.querySelector('svg');
      expect(svg.getAttribute('viewBox')).toBe('50 50 1000 800');
    });
  });

  describe('Zoom', () => {
    test('should use default zoom level', () => {
      fixture.detectChanges();

      expect(component.zoom()).toBe(1.0);
    });

    test('should accept custom zoom level', () => {
      fixture.componentRef.setInput("zoom", 1.5);
      fixture.detectChanges();

      expect(component.zoom()).toBe(1.5);
    });

    test('should schedule a re-render when zoom changes', () => {
      fixture.detectChanges();

      // wave2/rendering: renders are frame-coalesced, so a zoom change schedules a
      // frame rather than painting synchronously.
      // wave4/ngwrapper: ngOnChanges is GONE — the camera EFFECT reacts to the
      // `zoom` signal, and setInput() is exactly what a real `[zoom]` binding does.
      const spy = jest.spyOn(component as any, 'scheduleRender');

      fixture.componentRef.setInput('zoom', 2.0);
      fixture.detectChanges(); // flush effects

      expect(spy).toHaveBeenCalled();
      expect(component.zoom()).toBe(2.0);
    });

    test('two-way [(zoom)]: an internal zoom change emits zoomChange AND zoomChanged', () => {
      fixture.detectChanges();

      const twoWay: number[] = [];
      const legacy: number[] = [];
      // A `model()` signal IS the two-way output (`ModelSignal extends OutputRef`),
      // so `[(zoom)]` in a template subscribes to exactly this.
      component.zoom.subscribe((z: number) => twoWay.push(z));
      component.zoomChanged.subscribe((z: number) => legacy.push(z));

      component.zoomIn();

      expect(twoWay).toEqual([component.zoom()]);
      expect(legacy).toEqual([component.zoom()]);
    });
  });

  describe('Theme', () => {
    test('should schedule a re-render when theme changes', () => {
      fixture.detectChanges();

      const spy = jest.spyOn(component as any, 'scheduleRender');

      fixture.componentRef.setInput('theme', DARK_THEME);
      fixture.detectChanges(); // flush effects

      expect(spy).toHaveBeenCalled();
      expect(component.theme().name).toBe('Dark');
    });
  });

  describe('Cleanup', () => {
    test('should dispose renderer on destroy', () => {
      fixture.detectChanges();

      const renderer = (component as any).renderer;
      const disposeSpy = jest.spyOn(renderer, 'dispose');

      component.ngOnDestroy();

      expect(disposeSpy).toHaveBeenCalled();
    });

    test('should not throw if disposed multiple times', () => {
      fixture.detectChanges();

      expect(() => {
        component.ngOnDestroy();
        component.ngOnDestroy();
      }).not.toThrow();
    });
  });

  // ==========================================================================
  // wave2/rendering: frame-coalesced render loop + real metrics
  // ==========================================================================
  describe('Frame-coalesced render loop (wave2/rendering)', () => {
    let rafCallbacks: FrameRequestCallback[];
    let rafSpy: jest.SpyInstance;
    let cancelSpy: jest.SpyInstance;
    let nextRafId: number;

    // Deterministic rAF: capture callbacks and fire them on demand via flushRAF().
    const flushRAF = () => {
      const cbs = rafCallbacks;
      rafCallbacks = [];
      cbs.forEach((cb) => cb(performance.now()));
    };

    beforeEach(() => {
      rafCallbacks = [];
      nextRafId = 0;
      rafSpy = jest
        .spyOn(window, 'requestAnimationFrame')
        .mockImplementation((cb: FrameRequestCallback) => {
          rafCallbacks.push(cb);
          return ++nextRafId;
        });
      cancelSpy = jest
        .spyOn(window, 'cancelAnimationFrame')
        .mockImplementation(() => undefined);
      // Mount synchronously (renderNow, no rAF). rafSpy stays clean for asserts.
      fixture.detectChanges();
      rafSpy.mockClear();
    });

    afterEach(() => {
      rafSpy.mockRestore();
      cancelSpy.mockRestore();
    });

    test('coalesces N invalidations in one tick into a single animation frame', () => {
      component.scheduleRender();
      component.scheduleRender();
      component.scheduleRender();
      component.scheduleRender();
      component.scheduleRender();

      // Five schedule calls, exactly ONE frame queued.
      expect(rafSpy).toHaveBeenCalledTimes(1);
    });

    test('renders exactly once for a burst of invalidations, when something is dirty', () => {
      // Dirty a real entity so the frame is not idle-skipped.
      const node = new NodeModel({
        type: 'basic',
        position: { x: 10, y: 10 },
        size: { width: 80, height: 40 },
      });
      diagram.addNode(node); // triggers node:added -> scheduleRender (1 frame)
      node.markDirty('test');
      component.scheduleRender();
      component.scheduleRender();

      const renderSpy = jest.spyOn(component as any, 'renderDiagram');
      expect(rafSpy).toHaveBeenCalledTimes(1); // all coalesced into one frame

      flushRAF();

      expect(renderSpy).toHaveBeenCalledTimes(1);
    });

    test('skips the frame when nothing is dirty and the viewport is unchanged', () => {
      // Post-mount, guarantee a clean, unchanged state.
      diagram.markAllClean();
      const renderSpy = jest.spyOn(component as any, 'renderDiagram');

      component.scheduleRender();
      expect(rafSpy).toHaveBeenCalledTimes(1); // a frame is still queued...
      flushRAF();

      // ...but it is idle-skipped: no actual paint happens.
      expect(renderSpy).not.toHaveBeenCalled();
    });

    test('performance metrics record one sample per painted frame and none per skip', () => {
      // Mount already painted one frame.
      const afterMount = component.getPerformanceMetrics();
      expect(afterMount.sampleCount).toBe(1);
      expect(typeof afterMount.fps).toBe('number');
      expect(typeof afterMount.frameTime).toBe('number');
      expect(afterMount.droppedFrames).toBeGreaterThanOrEqual(0);

      // A real (dirty) frame adds a sample.
      const node = new NodeModel({
        type: 'basic',
        position: { x: 10, y: 10 },
        size: { width: 80, height: 40 },
      });
      diagram.addNode(node);
      node.markDirty('test');
      component.scheduleRender();
      flushRAF();
      expect(component.getPerformanceMetrics().sampleCount).toBe(2);

      // A skipped (clean) frame adds nothing.
      diagram.markAllClean();
      component.scheduleRender();
      flushRAF();
      expect(component.getPerformanceMetrics().sampleCount).toBe(2);

      // Two painted frames → rolling FPS is a finite, non-negative number.
      const metrics = component.getPerformanceMetrics();
      expect(Number.isFinite(metrics.fps)).toBe(true);
      expect(metrics.fps).toBeGreaterThanOrEqual(0);
    });

    test('cancels the queued frame on destroy', () => {
      component.scheduleRender();
      expect(rafSpy).toHaveBeenCalledTimes(1);

      component.ngOnDestroy();

      expect(cancelSpy).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // wave3/interaction — Card A: transactional edits (gestures → commands)
  // ==========================================================================
  describe('Undo/redo, cut/copy/paste (wave3/interaction, Card A)', () => {
    /** Drain the microtask queue so async CommandManager.execute() has settled. */
    const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

    const addNode = (x: number, y: number) => {
      const node = new NodeModel({
        type: 'basic',
        position: { x, y },
        size: { width: 100, height: 60 },
      });
      diagram.addNode(node);
      return node;
    };

    /** Simulate a full press-drag-release. jsdom's rect is all-zeros, so with the
     *  default 800x600 viewport at zoom 1, client coords ARE world coords. */
    const drag = (fromX: number, fromY: number, toX: number, toY: number) => {
      component.onMouseDown(
        new MouseEvent('mousedown', { clientX: fromX, clientY: fromY, button: 0 })
      );
      component.onMouseMove(
        new MouseEvent('mousemove', { clientX: toX, clientY: toY, buttons: 1 })
      );
      component.onMouseUp(new MouseEvent('mouseup', { clientX: toX, clientY: toY, button: 0 }));
    };

    const press = (key: string, opts: Partial<KeyboardEventInit> = {}) =>
      component.onKeyDown(new KeyboardEvent('keydown', { key, ...opts }));

    beforeEach(() => {
      fixture.detectChanges();
    });

    test('a node drag produces exactly ONE undo step that restores the original position', async () => {
      const node = addNode(100, 100);
      diagram.selectNode(node);

      drag(150, 130, 250, 230); // +100, +100
      await settle();

      expect(node.position.x).toBe(200);
      expect(node.position.y).toBe(200);

      // ONE gesture → ONE history entry.
      expect(engine.commandManager.getHistory().length).toBe(1);

      await engine.undo();
      expect(node.position.x).toBe(100);
      expect(node.position.y).toBe(100);

      await engine.redo();
      expect(node.position.x).toBe(200);
      expect(node.position.y).toBe(200);
    });

    test('a click (no movement past the threshold) records NO history entry', async () => {
      const node = addNode(100, 100);
      diagram.selectNode(node);

      component.onMouseDown(
        new MouseEvent('mousedown', { clientX: 150, clientY: 130, button: 0 })
      );
      component.onMouseUp(new MouseEvent('mouseup', { clientX: 150, clientY: 130, button: 0 }));
      await settle();

      expect(engine.commandManager.getHistory().length).toBe(0);
      expect(node.position.x).toBe(100);
    });

    test('a multi-node drag undoes as ONE step (MacroCommand)', async () => {
      const node1 = addNode(100, 100);
      const node2 = addNode(300, 100);
      diagram.selectNode(node1);
      diagram.toggleNodeSelection(node2); // both selected

      drag(150, 130, 200, 180); // +50, +50 on the grabbed node → both move

      await settle();

      expect(node1.position.x).toBe(150);
      expect(node2.position.x).toBe(350);
      expect(engine.commandManager.getHistory().length).toBe(1); // ONE step, not two

      await engine.undo();
      expect(node1.position.x).toBe(100);
      expect(node1.position.y).toBe(100);
      expect(node2.position.x).toBe(300);
      expect(node2.position.y).toBe(100);
    });

    test('Ctrl+Z undoes and Ctrl+Y / Ctrl+Shift+Z redo', async () => {
      const node = addNode(100, 100);
      diagram.selectNode(node);
      drag(150, 130, 250, 230);
      await settle();

      press('z', { ctrlKey: true });
      await settle();
      expect(node.position.x).toBe(100);

      press('y', { ctrlKey: true });
      await settle();
      expect(node.position.x).toBe(200);

      press('z', { ctrlKey: true });
      await settle();
      expect(node.position.x).toBe(100);

      press('Z', { ctrlKey: true, shiftKey: true }); // Ctrl+Shift+Z = redo
      await settle();
      expect(node.position.x).toBe(200);
    });

    test('Ctrl+C copies the click-selected node (model selection reaches the store)', async () => {
      const node = addNode(100, 100);
      diagram.selectNode(node); // model-level selection, as a click makes
      expect(engine.hasClipboardData()).toBe(false);

      press('c', { ctrlKey: true });
      await settle();

      expect(engine.hasClipboardData()).toBe(true);
      expect(engine.getClipboardData()!.nodes.length).toBe(1);
      expect(diagram.getNodes().length).toBe(1); // copy is non-destructive
    });

    test('Ctrl+X cuts: node removed, clipboard holds it, ONE undo brings it back', async () => {
      const node = addNode(100, 100);
      diagram.selectNode(node);

      press('x', { ctrlKey: true });
      await settle();

      expect(diagram.getNodes().length).toBe(0);
      expect(engine.hasClipboardData()).toBe(true);
      expect(engine.commandManager.getHistory().length).toBe(1);

      await engine.undo();
      expect(diagram.getNodes().length).toBe(1);
    });

    test('Ctrl+V pastes, re-creating nodes with VALID link endpoints', async () => {
      const node1 = addNode(0, 0);
      const node2 = addNode(200, 0);
      expect(diagram.connectNodes(node1, node2)).toBe(true);
      diagram.selectNode(node1);
      diagram.toggleNodeSelection(node2);

      press('x', { ctrlKey: true }); // cut both + the link
      await settle();
      expect(diagram.getNodes().length).toBe(0);
      expect(diagram.getLinks().length).toBe(0);

      press('v', { ctrlKey: true });
      await (component as any).pendingCommand;
      await settle();

      const nodes = diagram.getNodes();
      const links = diagram.getLinks();
      expect(nodes.length).toBe(2);
      expect(links.length).toBe(1);

      // The pasted link's endpoints resolve to REAL ports on the PASTED nodes
      // (remapNodePortIds still holds).
      const portIds = new Set(nodes.flatMap((n) => n.getPorts().map((p) => p.id)));
      expect(portIds.has(links[0].sourcePortId)).toBe(true);
      expect(portIds.has(links[0].targetPortId)).toBe(true);
      expect(diagram.getNodeByPortId(links[0].sourcePortId)).toBeDefined();
      expect(diagram.getNodeByPortId(links[0].targetPortId)).toBeDefined();
    });

    test('Delete is undoable and takes connected links with the nodes', async () => {
      const node1 = addNode(0, 0);
      const node2 = addNode(200, 0);
      expect(diagram.connectNodes(node1, node2)).toBe(true);
      diagram.selectNode(node1);
      diagram.toggleNodeSelection(node2);

      press('Delete');
      await settle();

      expect(diagram.getNodes().length).toBe(0);
      expect(diagram.getLinks().length).toBe(0); // no orphan link left behind

      await engine.undo();
      expect(diagram.getNodes().length).toBe(2);
      expect(diagram.getLinks().length).toBe(1);
    });

    test('does not steal shortcuts from a text input', async () => {
      const node = addNode(100, 100);
      diagram.selectNode(node);

      const input = document.createElement('input');
      document.body.appendChild(input);
      const event = new KeyboardEvent('keydown', { key: 'x', ctrlKey: true });
      Object.defineProperty(event, 'target', { value: input });
      component.onKeyDown(event);
      await settle();

      expect(diagram.getNodes().length).toBe(1); // not cut
      input.remove();
    });
  });

  // ==========================================================================
  // wave3/interaction — Card B: cursor-anchored zoom & pan/scroll surface
  // ==========================================================================
  describe('Cursor-anchored zoom & pan (wave3/interaction, Card B)', () => {
    /** Force a synchronous paint (scheduleRender is rAF-coalesced). */
    const paint = () => (component as any).renderNow();

    /** The viewBox the SVGRenderer ACTUALLY emitted, straight from the DOM. */
    const renderedViewBox = () => {
      const svg = fixture.nativeElement.querySelector('svg.grafloria-diagram');
      const [x, y, width, height] = (svg.getAttribute('viewBox') as string)
        .split(/\s+/)
        .map(Number);
      return { x, y, width, height };
    };

    const wheel = (opts: Partial<WheelEventInit> & { clientX: number; clientY: number }) =>
      component.onWheel(new WheelEvent('wheel', { ...opts } as WheelEventInit));

    beforeEach(() => {
      fixture.componentRef.setInput("viewport", { x: 0, y: 0, width: 800, height: 600 });
      fixture.componentRef.setInput("zoom", 1);
      fixture.detectChanges();
    });

    test('THE INVARIANT: the world point under the cursor is unchanged across a zoom step', () => {
      const cursor = { x: 200, y: 150 }; // deliberately NOT the canvas centre
      const before = (component as any).clientToWorld(cursor.x, cursor.y);

      wheel({ clientX: cursor.x, clientY: cursor.y, deltaY: -100, ctrlKey: true }); // zoom IN
      expect(component.zoom()).toBeGreaterThan(1);

      const after = (component as any).clientToWorld(cursor.x, cursor.y);
      expect(after.worldX).toBeCloseTo(before.worldX, 6);
      expect(after.worldY).toBeCloseTo(before.worldY, 6);

      // ...and still after zooming back OUT through a different factor.
      wheel({ clientX: cursor.x, clientY: cursor.y, deltaY: 100, ctrlKey: true });
      wheel({ clientX: cursor.x, clientY: cursor.y, deltaY: 100, ctrlKey: true });
      const after2 = (component as any).clientToWorld(cursor.x, cursor.y);
      expect(after2.worldX).toBeCloseTo(before.worldX, 6);
      expect(after2.worldY).toBeCloseTo(before.worldY, 6);
    });

    test('the world point under the cursor keeps its SCREEN position (worldToScreen)', () => {
      const cursor = { x: 640, y: 480 };
      const world = (component as any).clientToWorld(cursor.x, cursor.y);

      wheel({ clientX: cursor.x, clientY: cursor.y, deltaY: -100, ctrlKey: true });

      const screen = component.worldToScreen(world.worldX, world.worldY);
      expect(screen.screenX).toBeCloseTo(cursor.x, 6);
      expect(screen.screenY).toBeCloseTo(cursor.y, 6);
    });

    test('REGRESSION: the RENDERED viewBox and clientToWorld agree at zoom !== 1', () => {
      // The renderer used to divide by zoom a SECOND time (the component had
      // already pre-divided), so the picture and the hit-testing disagreed at any
      // zoom != 1. Assert against the viewBox actually in the DOM.
      fixture.componentRef.setInput("zoom", 2);
      paint();

      const vb = renderedViewBox();
      const pxW = 800; // jsdom has no layout → canvasPixelSize falls back to the viewport
      const pxH = 600;

      // Center-anchored: centre invariant, size = px/zoom.
      expect(vb.width).toBeCloseTo(pxW / 2, 6);
      expect(vb.height).toBeCloseTo(pxH / 2, 6);
      expect(vb.x + vb.width / 2).toBeCloseTo(400, 6);
      expect(vb.y + vb.height / 2).toBeCloseTo(300, 6);

      // clientToWorld must invert the SAME map: world = vb.origin + screen/zoom.
      for (const [cx, cy] of [
        [0, 0],
        [400, 300],
        [800, 600],
      ]) {
        const world = (component as any).clientToWorld(cx, cy);
        expect(world.worldX).toBeCloseTo(vb.x + (cx / pxW) * vb.width, 6);
        expect(world.worldY).toBeCloseTo(vb.y + (cy / pxH) * vb.height, 6);
      }
    });

    test('the HTML layer maps world → screen exactly like the SVG (no desync)', () => {
      fixture.componentRef.setInput("zoom", 2);
      paint();

      const match = /translate\((-?[\d.]+)px, (-?[\d.]+)px\) scale\(([\d.]+)\)/.exec(
        component.htmlLayerTransform()
      );
      expect(match).toBeTruthy();
      const [translateX, translateY, scale] = match!.slice(1).map(Number);

      const vb = renderedViewBox();
      // The layer positions children at their WORLD coords, so a node at world w
      // lands at translate + scale·w — which must equal the SVG's (w − vb.origin)·zoom.
      const world = { x: 250, y: 175 };
      expect(translateX + scale * world.x).toBeCloseTo((world.x - vb.x) * component.zoom(), 6);
      expect(translateY + scale * world.y).toBeCloseTo((world.y - vb.y) * component.zoom(), 6);
      expect(scale).toBe(component.zoom());
    });

    test('a plain wheel SCROLLS (pans) instead of zooming; ctrl+wheel zooms', () => {
      const zoomBefore = component.zoom();
      const xBefore = component.viewport().x;
      const yBefore = component.viewport().y;

      wheel({ clientX: 400, clientY: 300, deltaX: 30, deltaY: 50 });

      expect(component.zoom()).toBe(zoomBefore); // NOT a zoom
      expect(component.viewport().x).toBeCloseTo(xBefore + 30, 6);
      expect(component.viewport().y).toBeCloseTo(yBefore + 50, 6);

      wheel({ clientX: 400, clientY: 300, deltaY: -100, ctrlKey: true });
      expect(component.zoom()).toBeGreaterThan(zoomBefore);
    });

    test('zoom is clamped to [minZoom, maxZoom]', () => {
      for (let i = 0; i < 100; i++) {
        wheel({ clientX: 100, clientY: 100, deltaY: -100, ctrlKey: true });
      }
      expect(component.zoom()).toBeLessThanOrEqual(component.maxZoom());
      expect(component.zoom()).toBe(component.maxZoom());

      for (let i = 0; i < 200; i++) {
        wheel({ clientX: 100, clientY: 100, deltaY: 100, ctrlKey: true });
      }
      expect(component.zoom()).toBeGreaterThanOrEqual(component.minZoom());
      expect(component.zoom()).toBe(component.minZoom());
    });

    test('emits zoomChanged and viewportChanged (the visible world rect)', () => {
      const zooms: number[] = [];
      const viewports: any[] = [];
      component.zoomChanged.subscribe((z) => zooms.push(z));
      component.viewportChanged.subscribe((v) => viewports.push(v));

      wheel({ clientX: 200, clientY: 150, deltaY: -100, ctrlKey: true });

      expect(zooms.length).toBe(1);
      expect(zooms[0]).toBe(component.zoom());
      expect(viewports.length).toBe(1);
      // The emitted rect IS the visible world rect (= the viewBox).
      expect(viewports[0].width).toBeCloseTo(800 / component.zoom(), 6);
    });

    test('Ctrl+= zooms in, Ctrl+- zooms out, Ctrl+0 resets — around the canvas centre', () => {
      const centre = (component as any).clientToWorld(400, 300);

      component.onKeyDown(new KeyboardEvent('keydown', { key: '=', ctrlKey: true }));
      expect(component.zoom()).toBeGreaterThan(1);

      component.onKeyDown(new KeyboardEvent('keydown', { key: '-', ctrlKey: true }));
      expect(component.zoom()).toBeCloseTo(1, 6);

      component.onKeyDown(new KeyboardEvent('keydown', { key: '=', ctrlKey: true }));
      component.onKeyDown(new KeyboardEvent('keydown', { key: '0', ctrlKey: true }));
      expect(component.zoom()).toBe(1);

      // The centre point never moved.
      const after = (component as any).clientToWorld(400, 300);
      expect(after.worldX).toBeCloseTo(centre.worldX, 6);
      expect(after.worldY).toBeCloseTo(centre.worldY, 6);
    });

    test('fitToContent frames every node inside the visible world rect', () => {
      // Content far bigger than the canvas → must zoom OUT to fit.
      const a = new NodeModel({
        type: 'basic',
        position: { x: -500, y: -400 },
        size: { width: 200, height: 100 },
      });
      const b = new NodeModel({
        type: 'basic',
        position: { x: 1500, y: 1200 },
        size: { width: 200, height: 100 },
      });
      diagram.addNode(a);
      diagram.addNode(b);

      component.fitToContent(40);
      paint();

      expect(component.zoom()).toBeLessThan(1);
      expect(component.zoom()).toBeGreaterThanOrEqual(component.minZoom());

      const vb = renderedViewBox();
      // Every node's bbox is inside the rect that is actually drawn.
      for (const node of [a, b]) {
        expect(node.position.x).toBeGreaterThanOrEqual(vb.x);
        expect(node.position.y).toBeGreaterThanOrEqual(vb.y);
        expect(node.position.x + node.size.width).toBeLessThanOrEqual(vb.x + vb.width);
        expect(node.position.y + node.size.height).toBeLessThanOrEqual(vb.y + vb.height);
      }

      // ...and the content is centred in it.
      expect(vb.x + vb.width / 2).toBeCloseTo(600, 6); // (-500 + 1700) / 2
      expect(vb.y + vb.height / 2).toBeCloseTo(450, 6); // (-400 + 1300) / 2
    });

    test('fitToContent survives an empty diagram', () => {
      const zoom = component.zoom();
      expect(() => component.fitToContent()).not.toThrow();
      expect(component.zoom()).toBe(zoom);
    });

    test('zoomToSelection frames only the selected nodes', () => {
      const a = new NodeModel({
        type: 'basic',
        position: { x: 0, y: 0 },
        size: { width: 100, height: 100 },
      });
      const far = new NodeModel({
        type: 'basic',
        position: { x: 5000, y: 5000 },
        size: { width: 100, height: 100 },
      });
      diagram.addNode(a);
      diagram.addNode(far);
      diagram.selectNode(a);

      component.zoomToSelection(40);
      paint();

      const vb = renderedViewBox();
      // Centred on the SELECTED node, not on the pair.
      expect(vb.x + vb.width / 2).toBeCloseTo(50, 6);
      expect(vb.y + vb.height / 2).toBeCloseTo(50, 6);
      // The far node is nowhere near the view.
      expect(vb.x + vb.width).toBeLessThan(5000);
    });

    test('nodes stay visible when zoomed OUT (culling uses the real viewBox)', () => {
      // Regression: the renderer culled against the un-zoomed `viewport` rect, so
      // zooming out (which fit-to-content always does) dropped nodes that are
      // genuinely on screen. Culling now uses the rect it actually draws.
      const node = new NodeModel({
        type: 'basic',
        position: { x: 900, y: 100 }, // outside the 800x600 rect; INSIDE the viewBox at zoom 0.5
        size: { width: 100, height: 100 },
      });
      diagram.addNode(node);

      const nodeCount = () =>
        fixture.nativeElement.querySelector('svg.grafloria-diagram .nodes-layer')?.children.length ?? 0;

      fixture.componentRef.setInput("zoom", 0.5);
      paint();

      const vb = renderedViewBox();
      expect(vb.width).toBe(1600);
      // Genuinely inside the drawn rect...
      expect(node.position.x).toBeGreaterThanOrEqual(vb.x);
      expect(node.position.x + node.size.width).toBeLessThanOrEqual(vb.x + vb.width);
      // ...so it must actually be painted.
      expect(nodeCount()).toBe(1);
    });
  });
});
