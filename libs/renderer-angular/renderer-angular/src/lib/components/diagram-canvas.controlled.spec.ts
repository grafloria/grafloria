// wave4/ngwrapper — Cards 1 & 2.
//
// Card 1: the wrapper is signal-based and ZONELESS. Proven by running the whole
//         component under `provideZonelessChangeDetection()` — mount, paint,
//         signal-input changes, engine mutations and the controlled binding — plus
//         a guard that the source never reaches for NgZone or EventEmitter.
// Card 2: declarative controlled data binding — `[(nodes)]` / `[(edges)]` over the
//         SHARED NodeSpec/EdgeSpec reconciler, `modelChange` deltas,
//         `skipModelUpdate`, and (THE bug of this feature) no feedback loop when
//         the host round-trips the array we emit.

import {
  Component,
  ViewChild,
  // Angular 19 still ships the zoneless provider under its experimental name;
  // v20 renames it to `provideZonelessChangeDetection`. Aliased so intent is plain.
  provideExperimentalZonelessChangeDetection as provideZonelessChangeDetection,
} from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { readFileSync } from 'fs';
import { join } from 'path';
import { DiagramCanvasComponent } from './diagram-canvas.component';
import { DiagramEngine, NodeModel, type DiagramIncremental } from '@grafloria/engine';
import type { NodeSpec, EdgeSpec } from '@grafloria/renderer';

/** Drain the microtask queue (the outbound emission is coalesced onto one). */
const microtasks = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const nodeAt = (id: string, x: number, y: number): NodeSpec => ({
  id,
  type: 'rect',
  position: { x, y },
  size: { width: 100, height: 60 },
});

// ---------------------------------------------------------------------------
// The host is exactly what a consumer writes. `[(nodes)]` desugars to
// `[nodes]="nodes" (nodesChange)="nodes = $event"`, so the setter below IS the
// round-trip a controlled wrapper has to survive.
// ---------------------------------------------------------------------------
@Component({
  standalone: true,
  imports: [DiagramCanvasComponent],
  template: `
    <grafloria-diagram-canvas
      [(nodes)]="nodes"
      [(edges)]="edges"
      [skipModelUpdate]="skip"
      (modelChange)="patches.push($event)">
    </grafloria-diagram-canvas>
  `,
})
class ControlledHostComponent {
  @ViewChild(DiagramCanvasComponent) canvas!: DiagramCanvasComponent;

  /** How many times the CANVAS has written a new array back into the host. */
  nodeWrites = 0;

  /** Set true to reproduce the "host clones the array" pattern (breaks ===). */
  cloneOnWrite = false;

  private _nodes: readonly NodeSpec[] = [nodeAt('a', 0, 0), nodeAt('b', 300, 0)];
  get nodes(): readonly NodeSpec[] {
    return this._nodes;
  }
  set nodes(next: readonly NodeSpec[]) {
    this.nodeWrites++;
    this._nodes = this.cloneOnWrite ? next.map((n) => ({ ...n })) : next;
  }

  edges: readonly EdgeSpec[] = [];
  skip = false;
  patches: DiagramIncremental[] = [];
}

describe('DiagramCanvasComponent — controlled data binding (wave4/ngwrapper, Card 2)', () => {
  let fixture: ComponentFixture<ControlledHostComponent>;
  let host: ControlledHostComponent;

  /** Let the coalesced emission fire and the two-way binding settle. */
  const settle = async () => {
    await microtasks();
    fixture.detectChanges();
    await microtasks();
    fixture.detectChanges();
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ControlledHostComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(ControlledHostComponent);
    host = fixture.componentInstance;
    fixture.detectChanges();
  });

  const diagram = () => host.canvas.activeEngine()!.getDiagram()!;

  test('creates an engine of its own and hydrates it from [nodes]', () => {
    expect(host.canvas.activeEngine()).toBeInstanceOf(DiagramEngine);
    expect(
      diagram()
        .getNodes()
        .map((n) => n.id)
        .sort()
    ).toEqual(['a', 'b']);
    expect(diagram().getNode('a')!.position).toEqual({ x: 0, y: 0 });
  });

  test('adding to the array adds to the model; removing removes', () => {
    host.nodes = [...host.nodes, nodeAt('c', 600, 0)];
    fixture.detectChanges();
    expect(diagram().getNodes()).toHaveLength(3);

    host.nodes = host.nodes.filter((n) => n.id !== 'a');
    fixture.detectChanges();
    expect(diagram().getNode('a')).toBeUndefined();
    expect(diagram().getNodes()).toHaveLength(2);
  });

  test('a moved spec updates the node IN PLACE (object identity preserved)', () => {
    const a = diagram().getNode('a')!;

    host.nodes = [{ ...nodeAt('a', 42, 7) }, nodeAt('b', 300, 0)];
    fixture.detectChanges();

    expect(diagram().getNode('a')).toBe(a); // the renderer's reference still holds
    expect(a.position).toEqual({ x: 42, y: 7 });
  });

  test('edges bind declaratively, node-to-node (React Flow shape)', () => {
    host.edges = [{ id: 'e1', source: 'a', target: 'b' }];
    fixture.detectChanges();

    expect(diagram().getLinks()).toHaveLength(1);
    const link = diagram().getLink('e1')!;
    // The shared reconciler resolves node ids to the deterministic default ports.
    expect(link.sourceNodeId).toBe('a');
    expect(link.targetNodeId).toBe('b');

    host.edges = [];
    fixture.detectChanges();
    expect(diagram().getLinks()).toHaveLength(0);
  });

  // ==========================================================================
  // THE feedback loop. An engine-side edit emits `nodesChange`; the host writes it
  // straight back into `[nodes]`. If the wrapper re-applies that array as if it
  // were new input, it mutates the model, which emits again, forever.
  // ==========================================================================
  describe('external state round-trip does not loop or double-apply', () => {
    test('an engine-side move emits exactly ONE round-trip and then settles', async () => {
      const a = diagram().getNode('a')!;
      const mutations: string[] = [];
      diagram().on('node:changed', () => mutations.push('changed'));
      diagram().on('node:moved', () => mutations.push('moved'));

      a.setPosition(50, 50); // as a drag would
      await settle();

      // The host was told once...
      expect(host.nodeWrites).toBe(1);
      expect(host.patches).toHaveLength(1);
      // ...with the truth...
      expect(host.nodes.find((n) => n.id === 'a')!.position).toEqual({ x: 50, y: 50 });
      // ...and the echo did NOT re-enter the model (no double-apply).
      expect(a.position).toEqual({ x: 50, y: 50 });
      const mutationsAfterEmit = mutations.length;

      // Keep pumping: a loop would keep producing writes/patches/mutations here.
      await settle();
      await settle();
      expect(host.nodeWrites).toBe(1);
      expect(host.patches).toHaveLength(1);
      expect(mutations.length).toBe(mutationsAfterEmit);
    });

    test('...even when the host CLONES the array on write (identity guard defeated)', async () => {
      host.cloneOnWrite = true; // `nodes = $event.map(n => ({...n}))` — very common
      const a = diagram().getNode('a')!;

      a.setPosition(120, 90);
      await settle();
      await settle();
      await settle();

      // The reconciler is what stops it here: re-applying a spec that already
      // describes the model writes no field, so it emits no engine event.
      expect(host.nodeWrites).toBe(1);
      expect(host.patches).toHaveLength(1);
      expect(a.position).toEqual({ x: 120, y: 90 });
      expect(diagram().getNodes()).toHaveLength(2);
    });

    test('a host-originated change is NOT echoed back as nodesChange', async () => {
      host.nodes = [...host.nodes, nodeAt('c', 600, 0)];
      host.nodeWrites = 0; // discount the host's OWN assignment through the setter
      fixture.detectChanges();
      await settle();

      expect(diagram().getNodes()).toHaveLength(3);
      expect(host.nodeWrites).toBe(0); // the host already knows what it did
      expect(host.patches).toHaveLength(0);
    });
  });

  describe('skipModelUpdate (GoJS skipsDiagramUpdate)', () => {
    test('suspends the inbound half, and re-syncs on release', () => {
      host.skip = true;
      fixture.detectChanges();

      host.nodes = [...host.nodes, nodeAt('c', 600, 0)];
      fixture.detectChanges();
      expect(diagram().getNodes()).toHaveLength(2); // ignored while skipping

      host.skip = false;
      fixture.detectChanges();
      expect(diagram().getNodes()).toHaveLength(3); // applied on release
    });

    test('does not suppress the OUTBOUND half', async () => {
      host.skip = true;
      fixture.detectChanges();

      diagram().getNode('a')!.setPosition(9, 9);
      await settle();

      expect(host.patches).toHaveLength(1);
    });
  });

  describe('modelChange (incremental patch)', () => {
    test('carries exactly what changed, coalesced per burst', async () => {
      diagram().addNode(new NodeModel({ id: 'c', type: 'rect', position: { x: 700, y: 0 } }));
      diagram().getNode('a')!.setPosition(11, 22);
      await settle();

      expect(host.patches).toHaveLength(1); // ONE patch for the whole burst
      const patch = host.patches[0];
      expect(patch.added.nodes.map((n) => n.id)).toEqual(['c']);
      expect(patch.modified.nodes.map((n) => n.id)).toEqual(['a']);
      expect(patch.removed.nodes).toEqual([]);
    });
  });
});

// ===========================================================================
// Card 1 — zoneless.
// ===========================================================================
describe('DiagramCanvasComponent — zoneless (wave4/ngwrapper, Card 1)', () => {
  test('the component source never touches NgZone or EventEmitter', () => {
    const raw = readFileSync(join(__dirname, 'diagram-canvas.component.ts'), 'utf8');
    // The COMMENTS talk about NgZone (that is the point of the card); the CODE must not.
    const code = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
    expect(code).not.toMatch(/\bNgZone\b/);
    expect(code).not.toMatch(/\bEventEmitter\b/);
    expect(code).not.toMatch(/@Input\b/);
    expect(code).not.toMatch(/@Output\b/);
  });

  test('mounts, paints and reacts to signal inputs under provideZonelessChangeDetection()', async () => {
    await TestBed.configureTestingModule({
      imports: [DiagramCanvasComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    const fixture = TestBed.createComponent(DiagramCanvasComponent);
    const engine = new DiagramEngine();
    const model = engine.createDiagram('zoneless');
    fixture.componentRef.setInput('engine', engine);
    fixture.componentRef.setInput('viewport', { x: 0, y: 0, width: 800, height: 600 });

    fixture.detectChanges();
    await fixture.whenStable();

    // It painted — with no zone anywhere in the picture.
    const svg = () => fixture.nativeElement.querySelector('svg.grafloria-diagram');
    expect(svg()).toBeTruthy();
    expect(svg().getAttribute('viewBox')).toBe('0 0 800 600');

    // A signal-input change repaints (camera effect → scheduleRender → frame).
    fixture.componentRef.setInput('zoom', 2);
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 32)); // let the rAF land
    await fixture.whenStable();

    expect(svg().getAttribute('viewBox')).toBe('200 150 400 300'); // centre-anchored, size/zoom

    // And an ENGINE mutation repaints, with no zone to notice it.
    // (Placed inside the zoom-2 viewBox above, or the renderer culls it.)
    model.addNode(
      new NodeModel({
        id: 'n1',
        type: 'rect',
        position: { x: 300, y: 200 },
        size: { width: 50, height: 50 },
      })
    );
    await new Promise((resolve) => setTimeout(resolve, 32));
    await fixture.whenStable();

    expect(
      fixture.nativeElement.querySelectorAll('svg.grafloria-diagram .nodes-layer > *').length
    ).toBe(1);

    engine.destroy();
  });

  test('the controlled binding works under zoneless too', async () => {
    await TestBed.configureTestingModule({
      imports: [ControlledHostComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    const fixture = TestBed.createComponent(ControlledHostComponent);
    const host = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();

    const diagram = host.canvas.activeEngine()!.getDiagram()!;
    expect(diagram.getNodes()).toHaveLength(2);

    diagram.getNode('a')!.setPosition(70, 70);
    await new Promise((resolve) => setTimeout(resolve, 32));
    await fixture.whenStable();

    expect(host.nodeWrites).toBe(1);
    expect(host.nodes.find((n) => n.id === 'a')!.position).toEqual({ x: 70, y: 70 });
  });
});
