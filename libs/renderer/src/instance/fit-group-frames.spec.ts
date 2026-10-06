// fitView / contentBounds take in the group FRAMES the canvas draws, captions included.
//
// The docs review found the "Delivery" lane pool clipped after fitView: the fit
// measured nodes and link waypoints only, and a pool's frame (its padding, its
// rotated title strip, its empty lane space) reaches well past its members. The
// gallery's swimlanes demo shows it too: the pool's title strip is cut off.

import { GroupModel, SwimlaneService } from '@grafloria/engine';
import { contentBounds, createDiagram } from './create-diagram';
import type { DiagramInstance } from './create-diagram';
import type { NodeSpec } from './model-input';

const WIDTH = 800;
const HEIGHT = 600;

function makeContainer(): HTMLElement {
  const el = document.createElement('div');
  el.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: WIDTH, height: HEIGHT, right: WIDTH, bottom: HEIGHT }) as DOMRect;
  document.body.appendChild(el);
  return el;
}

type Box = { x: number; y: number; width: number; height: number };
const contains = (outer: Box, inner: Box) =>
  outer.x <= inner.x + 0.01 &&
  outer.y <= inner.y + 0.01 &&
  outer.x + outer.width >= inner.x + inner.width - 0.01 &&
  outer.y + outer.height >= inner.y + inner.height - 0.01;

function makeGroup(name: string, x: number, y: number, width: number, height: number): GroupModel {
  const g = new GroupModel({ name });
  g.position = { x, y };
  g.size = { width, height, depth: 0 };
  return g;
}

describe('fitView / contentBounds include group and lane frames', () => {
  let container: HTMLElement;
  let diagram: DiagramInstance | undefined;

  beforeEach(() => {
    container = makeContainer();
  });

  afterEach(() => {
    diagram?.dispose();
    diagram = undefined;
    container.remove();
  });

  it('fits a lane pool whole — title strip and empty lane space included', () => {
    // The gallery swimlanes geometry: tickets sit well inside the pool.
    const tickets: NodeSpec[] = [
      { id: 'login', position: { x: 200, y: 90 }, size: { width: 172, height: 46 }, label: 'Login' },
      { id: 'billing', position: { x: 480, y: 260 }, size: { width: 172, height: 46 }, label: 'Billing' },
    ];
    diagram = createDiagram(container, { nodes: tickets });
    const model = diagram.getModel();
    const svc = new SwimlaneService(model);
    const { pool } = svc.createPool({
      name: 'Delivery',
      orientation: 'horizontal',
      bounds: { x: 60, y: 40, width: 980, height: 480 },
      lanes: [{ name: 'Backlog', weight: 1 }, { name: 'In progress', weight: 2 }, { name: 'Done', weight: 1 }],
      headerSize: 40,
    });

    diagram.fitView(40);

    const frame = pool.getOuterBounds();
    expect(contains(diagram.viewport.getViewBox(), frame)).toBe(true);
    expect(contains(contentBounds(model)!, frame)).toBe(true);
  });

  it("takes in a plain group's frame, padding beyond its members", () => {
    diagram = createDiagram(container, {
      nodes: [{ id: 'a', position: { x: 100, y: 100 }, size: { width: 120, height: 60 }, label: 'A' }],
    });
    const model = diagram.getModel();
    const group = makeGroup('Team', 40, 20, 400, 300);
    group.addMember('a', model);
    model.addGroup(group);

    const bounds = contentBounds(model)!;
    expect(contains(bounds, { x: 40, y: 20, width: 400, height: 300 })).toBe(true);
  });

  it('takes in a caption that runs past its frame', () => {
    diagram = createDiagram(container, {
      nodes: [{ id: 'a', position: { x: 100, y: 100 }, size: { width: 60, height: 40 }, label: 'A' }],
    });
    const model = diagram.getModel();
    const name = 'A deliberately long group caption that is wider than its frame';
    const group = makeGroup(name, 90, 60, 100, 100);
    group.addMember('a', model);
    model.addGroup(group);

    const bounds = contentBounds(model)!;
    // The caption starts 8px in from the frame's left and runs well past its right.
    expect(bounds.x + bounds.width).toBeGreaterThan(90 + 8 + name.length * 5);
  });

  it('ignores a layout container that draws no frame (frameChrome: none)', () => {
    diagram = createDiagram(container, {
      nodes: [{ id: 'a', position: { x: 100, y: 100 }, size: { width: 120, height: 60 }, label: 'A' }],
    });
    const model = diagram.getModel();
    const layout = makeGroup('grid', -2000, -2000, 5000, 5000);
    layout.setMetadata('frameChrome', 'none');
    model.addGroup(layout);

    const bounds = contentBounds(model)!;
    expect(bounds.x).toBe(100);
    expect(bounds.width).toBe(120);
  });

  it('still counts a COLLAPSED group, which always draws', () => {
    diagram = createDiagram(container, {
      nodes: [{ id: 'a', position: { x: 100, y: 100 }, size: { width: 120, height: 60 }, label: 'A' }],
    });
    const model = diagram.getModel();
    const g = makeGroup('G', 600, 400, 200, 80);
    g.setMetadata('frameChrome', 'none');
    model.addGroup(g);
    g.collapse();

    const bounds = contentBounds(model)!;
    expect(contains(bounds, g.getOuterBounds())).toBe(true);
  });
});
