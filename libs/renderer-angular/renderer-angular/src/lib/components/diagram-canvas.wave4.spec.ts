/**
 * Wave 4 — Cards 5-7 END TO END through the Angular canvas.
 *
 * The controllers are unit-tested framework-free in `@grafloria/renderer`; THIS file
 * proves the wiring: that a real pointer/keyboard event reaches them, that what
 * they compute is actually RENDERED into the overlay DOM, and that what they
 * change lands on the engine's undo stack.
 *
 * jsdom notes: `getBoundingClientRect()` is all-zero, so the canvas falls back to
 * its declared viewport (800×600) and, at zoom 1, client coords ARE world coords.
 */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DiagramCanvasComponent } from './diagram-canvas.component';
import { DiagramEngine, DiagramModel, NodeModel, LinkModel } from '@grafloria/engine';

describe('DiagramCanvasComponent — wave4/interaction (Cards 5-7)', () => {
  let component: DiagramCanvasComponent;
  let fixture: ComponentFixture<DiagramCanvasComponent>;
  let engine: DiagramEngine;
  let diagram: DiagramModel;
  let host: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DiagramCanvasComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(DiagramCanvasComponent);
    component = fixture.componentInstance;

    engine = new DiagramEngine();
    diagram = engine.createDiagram('wave4-canvas');
    fixture.componentRef.setInput('engine', engine);
    fixture.componentRef.setInput('viewport', { x: 0, y: 0, width: 800, height: 600 });
    fixture.componentRef.setInput('zoom', 1);

    fixture.detectChanges(); // ngAfterViewInit → renderer + controllers + first paint
    host = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => {
    fixture.destroy();
    engine.destroy();
  });

  function addNode(x: number, y: number, label?: string): NodeModel {
    const node = new NodeModel({
      type: 'test',
      position: { x, y },
      size: { width: 100, height: 50, depth: 0 },
    });
    if (label) node.setMetadata('label', label);
    diagram.addNode(node);
    return node;
  }

  /** Paint synchronously (the render loop is rAF-coalesced) and run CD. */
  function paint(): void {
    (component as unknown as { renderNow(): void }).renderNow();
    fixture.detectChanges();
  }

  /** Await whatever command the last gesture/keystroke dispatched. */
  async function settle(): Promise<void> {
    await (component as unknown as { pendingCommand: Promise<void> | null }).pendingCommand;
    paint();
  }

  function mouse(
    type: 'mousedown' | 'mousemove' | 'mouseup',
    x: number,
    y: number,
    init: MouseEventInit = {}
  ): void {
    host.dispatchEvent(
      new MouseEvent(type, { clientX: x, clientY: y, button: 0, bubbles: true, ...init })
    );
  }

  function key(k: string, init: KeyboardEventInit = {}): void {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...init }));
  }

  function overlay(selector: string): Element[] {
    return Array.from(host.querySelectorAll(`.grafloria-tool-overlay ${selector}`));
  }

  // ==========================================================================
  // Card 5 — the tool layer reaches the DOM
  // ==========================================================================

  describe('Card 5 — tool layer', () => {
    test('a selected node renders 8 resize handles, a remove button and the Halo', () => {
      const node = addNode(100, 100);
      diagram.selectNode(node);
      paint();

      expect(overlay('.grafloria-tool-resize')).toHaveLength(8);
      expect(overlay('.grafloria-tool-remove')).toHaveLength(1);
      expect(overlay('.grafloria-tool-halo')).toHaveLength(4);
      expect(overlay('.grafloria-selection-frame')).toHaveLength(1);

      // The tools carry their accessible names.
      const titles = overlay('.grafloria-tool-halo title').map((t) => t.textContent);
      expect(titles).toEqual(['Connect', 'Clone', 'Fork', 'Delete']);
    });

    test('no selection → no tools', () => {
      addNode(100, 100);
      paint();
      expect(overlay('.grafloria-tool-resize')).toHaveLength(0);
    });

    test('dragging the SE handle resizes the node — and it is ONE undo step', async () => {
      const node = addNode(100, 100); // 100×50 → SE handle at (200, 150)
      diagram.selectNode(node);
      paint();

      mouse('mousedown', 200, 150);
      mouse('mousemove', 240, 180);
      mouse('mouseup', 240, 180);
      await settle();

      expect(node.size.width).toBeCloseTo(140, 3);
      expect(node.size.height).toBeCloseTo(80, 3);
      expect(engine.canUndo()).toBe(true);

      await engine.undo();
      expect(node.size.width).toBe(100);
      expect(node.size.height).toBe(50);
    });

    test('the rotate handle rotates the node, and the SVG actually rotates', async () => {
      const node = addNode(100, 100);
      node.behavior.rotatable = true;
      diagram.selectNode(node);
      paint();

      // Rotate handle sits above the top edge, centred: (150, 100 - 26).
      mouse('mousedown', 150, 74);
      mouse('mousemove', 300, 125); // swing to due east of the centre (150,125)
      mouse('mouseup', 300, 125);
      await settle();

      expect(node.rotation).toBeCloseTo(90, 1);

      // …and the rendered node group carries the rotation (the latent bug).
      const group = host.querySelector(`[data-vnode-key="node-${node.id}"]`);
      expect(group?.getAttribute('transform')).toContain('rotate(');

      await engine.undo();
      expect(node.rotation).toBe(0);
    });

    test('the Halo delete button removes the selection, undoably', async () => {
      const node = addNode(100, 100);
      diagram.selectNode(node);
      paint();

      const halo = component.toolLayer.handles.find((h) => h.action === 'delete')!;
      mouse('mousedown', halo.world.x, halo.world.y);
      await settle();

      expect(diagram.getNodes()).toHaveLength(0);
      await engine.undo();
      expect(diagram.getNodes()).toHaveLength(1);
    });

    test('the Halo clone button duplicates the node', async () => {
      const node = addNode(100, 100);
      diagram.selectNode(node);
      paint();

      const halo = component.toolLayer.handles.find((h) => h.action === 'clone')!;
      mouse('mousedown', halo.world.x, halo.world.y);
      await settle();

      expect(diagram.getNodes()).toHaveLength(2);
    });

    test('a selected link shows endpoint + add-vertex tools, and adding a vertex undoes', async () => {
      const a = addNode(0, 0);
      const b = addNode(300, 0);
      const link = new LinkModel(a.getPortBySide('right')!.id, b.getPortBySide('left')!.id);
      link.setSourcePort(a.getPortBySide('right')!.id, a.id);
      link.setTargetPort(b.getPortBySide('left')!.id, b.id);
      link.setPoints([
        { x: 100, y: 25 },
        { x: 300, y: 25 },
      ]);
      diagram.addLink(link);
      link.setState('selected');
      paint();

      expect(overlay('.grafloria-tool-link-endpoint')).toHaveLength(2);
      expect(overlay('.grafloria-tool-vertex-add')).toHaveLength(1);

      const add = component.toolLayer.handles.find((h) => h.kind === 'vertex-add')!;
      mouse('mousedown', add.world.x, add.world.y);
      await settle();

      expect(link.points).toHaveLength(3);
      await engine.undo();
      expect(link.points).toHaveLength(2);
    });

    test('double-clicking a node opens an in-place editor that commits undoably', async () => {
      const node = addNode(100, 100, 'Before');
      paint();

      host.dispatchEvent(new MouseEvent('dblclick', { clientX: 150, clientY: 125, bubbles: true }));
      const input = host.querySelector('input.grafloria-node-label-editor') as HTMLInputElement;
      expect(input).toBeTruthy();
      expect(input.value).toBe('Before');

      input.value = 'After';
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await settle();

      expect(node.getMetadata('label')).toBe('After');
      expect(host.querySelector('input.grafloria-node-label-editor')).toBeNull();

      await engine.undo();
      expect(node.getMetadata('label')).toBe('Before');
    });

    test('highlighters render for a hovered node', () => {
      const node = addNode(100, 100);
      node.setState({ hovered: true });
      paint();

      const hover = overlay('.grafloria-highlighter-hover');
      expect(hover).toHaveLength(1);
      expect(hover[0]!.getAttribute('x')).toBe('98'); // padded by 2
    });
  });

  // ==========================================================================
  // Card 6 — snapping + proximity connect
  // ==========================================================================

  describe('Card 6 — snapping', () => {
    test('a dragged node SNAPS to a sibling edge and the snapline is drawn', () => {
      addNode(400, 0); // sibling: left edge x = 400
      const moving = addNode(100, 300);
      diagram.selectNode(moving);
      paint();

      // Grab the moving node and drop its left edge at 403 — inside the 6px slack.
      mouse('mousedown', 150, 325);
      mouse('mousemove', 453, 325);
      paint();

      expect(moving.position.x).toBe(400); // snapped from 403
      expect(overlay('.grafloria-snapline').length).toBeGreaterThan(0);

      mouse('mouseup', 453, 325);
    });

    test('equal-spacing guides appear with a live distance label', () => {
      addNode(0, 0);
      addNode(500, 0);
      const moving = addNode(100, 200);
      diagram.selectNode(moving);
      paint();

      // Free span 400 − 100 wide box ⇒ 150 each side ⇒ target x = 250.
      mouse('mousedown', 150, 225); // grab at the node's centre
      mouse('mousemove', 303, 25); // → left edge lands at 253, y row of the others
      paint();

      expect(moving.position.x).toBe(250);
      const labels = overlay('.grafloria-spacing-label').map((t) => t.textContent);
      expect(labels).toContain('150');

      mouse('mouseup', 303, 25);
    });

    test('keep-in-bounds stops a drag from leaving the canvas rect', () => {
      fixture.componentRef.setInput('canvasBounds', { x: 0, y: 0, width: 500, height: 500 });
      fixture.detectChanges(); // flush the canvasBounds effect into the SnapController

      const node = addNode(100, 100);
      diagram.selectNode(node);
      paint();

      mouse('mousedown', 150, 125);
      mouse('mousemove', -200, 125); // way off the left edge
      paint();

      expect(node.position.x).toBe(0);
      mouse('mouseup', -200, 125);
    });

    test('proximity connect: dropping a node near a compatible port AUTO-LINKS it', async () => {
      addNode(0, 0); // right port at (100, 25)
      const moving = addNode(400, 0); // left port at (400, 25)
      diagram.selectNode(moving);
      paint();

      expect(diagram.getLinks()).toHaveLength(0);

      // Drag the node so its left port lands 40px from the other's right port.
      mouse('mousedown', 450, 25);
      mouse('mousemove', 190, 25); // node x → 140, left port at (140, 25)
      mouse('mouseup', 190, 25);
      await settle();

      expect(diagram.getLinks()).toHaveLength(1);

      // The move AND the link are ONE undo step.
      await engine.undo();
      expect(diagram.getLinks()).toHaveLength(0);
      expect(moving.position.x).toBe(400);
    });

    test('proximity connect can be switched off', async () => {
      fixture.componentRef.setInput('enableProximityConnect', false);
      addNode(0, 0);
      const moving = addNode(400, 0);
      diagram.selectNode(moving);
      paint();

      mouse('mousedown', 450, 25);
      mouse('mousemove', 190, 25);
      mouse('mouseup', 190, 25);
      await settle();

      expect(diagram.getLinks()).toHaveLength(0);
    });
  });

  // ==========================================================================
  // Card 7 — keyboard + a11y
  // ==========================================================================

  describe('Card 7 — keyboard-first canvas', () => {
    test('the canvas is an accessible application with a live region', () => {
      const container = host.querySelector('.diagram-canvas-container')!;
      expect(container.getAttribute('role')).toBe('application');
      expect(container.getAttribute('aria-label')).toBe('Diagram canvas');

      const live = host.querySelector('.grafloria-live-region')!;
      expect(live.getAttribute('role')).toBe('status');
      expect(live.getAttribute('aria-live')).toBe('polite');
    });

    test('Tab moves focus and draws a focus ring', () => {
      const a = addNode(0, 0, 'Alpha');
      addNode(300, 0, 'Beta');
      paint();

      key('Tab');
      paint();

      expect(component.focusRing?.id).toBe(a.id);
      expect(overlay('.grafloria-focus-ring')).toHaveLength(1);
      expect(host.querySelector('.grafloria-live-region')!.textContent).toContain('Alpha');

      key('Tab');
      paint();
      expect(component.focusRing?.label).toContain('Beta');
    });

    test('arrow keys nudge the SELECTION (Shift = coarse) — each is one undo step', async () => {
      const node = addNode(100, 100);
      diagram.selectNode(node);
      paint();

      key('ArrowRight');
      await settle();
      expect(node.position.x).toBe(101);

      key('ArrowRight', { shiftKey: true });
      await settle();
      expect(node.position.x).toBe(111);

      await engine.undo();
      expect(node.position.x).toBe(101); // only the coarse step came back
    });

    test('with nothing selected, the arrows move the FOCUS instead', () => {
      const a = addNode(0, 0, 'Left');
      const b = addNode(300, 0, 'Right');
      paint();

      key('Tab');
      paint();
      expect(component.focusRing?.id).toBe(a.id);

      key('ArrowRight');
      paint();
      expect(component.focusRing?.id).toBe(b.id);
      expect(a.position.x).toBe(0); // nothing moved
    });

    test('Enter selects the focused node and opens its label editor', () => {
      const node = addNode(0, 0, 'Task');
      paint();

      key('Tab');
      key('Enter');
      paint();

      expect(node.isSelected()).toBe(true);
      const input = host.querySelector('input.grafloria-node-label-editor') as HTMLInputElement;
      expect(input?.value).toBe('Task');
    });

    test('keyboard connect: C → Enter → Enter builds an undoable link', async () => {
      const a = addNode(0, 0, 'A');
      const b = addNode(300, 0, 'B');
      paint();

      key('Tab'); // focus A
      key('c'); // begin connect
      key('Enter'); // confirm source port → target phase
      key('Enter'); // commit
      await settle();

      expect(diagram.getLinks()).toHaveLength(1);
      const link = diagram.getLinks()[0]!;
      expect(a.getPort(link.sourcePortId)).toBeDefined();
      expect(b.getPort(link.targetPortId)).toBeDefined();

      await engine.undo();
      expect(diagram.getLinks()).toHaveLength(0);
    });

    test('Escape cancels an in-flight keyboard connection', () => {
      addNode(0, 0);
      addNode(300, 0);
      paint();

      key('Tab');
      key('c');
      key('Escape');
      paint();

      expect(host.querySelector('.grafloria-live-region')!.textContent).toBe('Connection cancelled');
      expect(diagram.getLinks()).toHaveLength(0);
    });

    test('structure changes are announced to the live region', async () => {
      const node = addNode(100, 100);
      diagram.selectNode(node);
      paint();

      const halo = component.toolLayer.handles.find((h) => h.action === 'clone')!;
      mouse('mousedown', halo.world.x, halo.world.y);
      await settle();

      expect(host.querySelector('.grafloria-live-region')!.textContent).toContain('2 nodes');
    });

    test('keyboard navigation can be switched off entirely', () => {
      fixture.componentRef.setInput('enableKeyboardNavigation', false);
      addNode(0, 0, 'A');
      paint();

      key('Tab');
      paint();
      expect(component.focusRing).toBeNull();
      expect(overlay('.grafloria-focus-ring')).toHaveLength(0);
    });
  });
});
