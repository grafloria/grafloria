/**
 * A cyclic `parentId` chain must never spin forever.
 *
 * Found in wave 6 (a11y) by an outline test that deliberately corrupts the
 * parent chain: `getWorldPosition()`, `getAncestors()` and `getDepth()` all
 * walked `parentId` with no termination condition beyond "reached a parentless
 * node". Give them a→b→a and they loop until the tab dies.
 *
 * This is not academic. `getBoundingBox()` calls `getWorldPosition()`, and the
 * renderer calls `getBoundingBox()` on every node on every frame — so a single
 * corrupt parent link (a bad deserialize, a hand-set `parentId`, a buggy import)
 * hangs the whole browser with no error and no stack trace.
 *
 * And the cruellest part: `SetParentCommand` rejects cycles by calling
 * `getAncestors()`. The guard meant to keep cycles OUT walked the same unguarded
 * chain, so it would itself hang the instant a cycle got in by any other route.
 *
 * Every test here would hang — not fail, HANG — before the fix.
 */
import { DiagramEngine } from '../engine/DiagramEngine';
import { DiagramModel } from './DiagramModel';
import { NodeModel } from './NodeModel';

describe('NodeModel — cyclic parent chains cannot hang the app', () => {
  let engine: DiagramEngine;
  let diagram: DiagramModel;

  beforeEach(() => {
    engine = new DiagramEngine();
    diagram = engine.createDiagram('parent-cycle');
  });

  afterEach(() => engine.destroy());

  function addNode(x: number, y: number): NodeModel {
    const node = new NodeModel({
      type: 'task',
      position: { x, y },
      size: { width: 100, height: 50, depth: 0 },
    });
    diagram.addNode(node);
    return node;
  }

  /** a → b → a */
  function twoCycle(): [NodeModel, NodeModel] {
    const a = addNode(10, 10);
    const b = addNode(20, 20);
    a.parentId = b.id;
    b.parentId = a.id;
    return [a, b];
  }

  test('getWorldPosition terminates on a 2-cycle', () => {
    const [a] = twoCycle();
    const position = a.getWorldPosition();
    expect(Number.isFinite(position.x)).toBe(true);
    expect(Number.isFinite(position.y)).toBe(true);
  });

  test('getBoundingBox terminates — this is the one the renderer calls every frame', () => {
    const [a] = twoCycle();
    const box = a.getBoundingBox();
    expect(Number.isFinite(box.left)).toBe(true);
    expect(Number.isFinite(box.top)).toBe(true);
  });

  test('getAncestors terminates, and does not repeat a node', () => {
    const [a] = twoCycle();
    const ancestors = a.getAncestors();

    const ids = ancestors.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length); // no repeats
    expect(ids).not.toContain(a.id); // never itself
  });

  test('getDepth terminates on a 2-cycle', () => {
    const [a] = twoCycle();
    expect(Number.isFinite(a.getDepth())).toBe(true);
  });

  test('a LONGER cycle (a→b→c→a) also terminates', () => {
    const a = addNode(0, 0);
    const b = addNode(10, 10);
    const c = addNode(20, 20);
    a.parentId = b.id;
    b.parentId = c.id;
    c.parentId = a.id;

    expect(Number.isFinite(a.getWorldPosition().x)).toBe(true);
    expect(Number.isFinite(a.getDepth())).toBe(true);
    expect(a.getAncestors().length).toBeLessThanOrEqual(3);
  });

  test('a node that is its OWN parent terminates', () => {
    const a = addNode(5, 5);
    a.parentId = a.id;

    expect(a.getWorldPosition()).toMatchObject({ x: 5, y: 5 });
    expect(a.getAncestors()).toEqual([]);
    expect(a.getDepth()).toBe(0);
  });

  test('validateHierarchy still REPORTS the cycle (the guard must not hide it)', () => {
    const [a] = twoCycle();
    // Terminating quietly must not mean pretending the model is sound — the
    // detector still has to say "this is broken".
    expect(a.validateHierarchy()).toBe(false);
  });

  // ---- and the healthy case is unchanged -----------------------------------

  test('a legitimate parent chain still accumulates world position', () => {
    const parent = addNode(100, 200);
    const child = addNode(10, 20);
    child.setParent(parent.id); // wave13: the API declares relative semantics; a raw field poke does not

    expect(child.getWorldPosition()).toMatchObject({ x: 110, y: 220 });
    expect(child.getDepth()).toBe(1);
    expect(child.getAncestors().map((n) => n.id)).toEqual([parent.id]);
    expect(child.validateHierarchy()).toBe(true);
  });

  test('a three-deep chain still nests correctly', () => {
    const grandparent = addNode(100, 100);
    const parent = addNode(10, 10);
    const child = addNode(1, 1);
    parent.setParent(grandparent.id); // wave13: use the API — it declares relative semantics
    child.setParent(parent.id);

    expect(child.getWorldPosition()).toMatchObject({ x: 111, y: 111 });
    expect(child.getDepth()).toBe(2);
  });
});
