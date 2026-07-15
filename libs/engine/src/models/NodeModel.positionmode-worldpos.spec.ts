// wave13 — issue A, done properly this time.
//
// getWorldPosition() walked the parent chain UNCONDITIONALLY while getGlobalPosition()
// honoured positionMode — so an absolute-mode child with a parentId double-counted in one
// method and not the other. A first attempt fixed only getWorldPosition and broke 19 tests
// (ERD tables, ports, nesting), because setParent() children carried the default 'absolute'
// while every consumer treated them as relative. THE MODEL WAS LYING ABOUT ITS OWN SEMANTICS.
//
// The real fix is threefold: setParent() now DECLARES relative positioning (matching
// setLocalPosition/setGlobalPosition, which always did); getWorldPosition honours the mode;
// and a v2→v3 document migration re-labels legacy parented nodes 'relative' so every old
// document renders byte-identically.
import { DiagramModel } from './DiagramModel';
import { NodeModel } from './NodeModel';
import { runDiagramMigrations } from '../serialization/DiagramMigrations';
import type { SerializedDiagram } from './DiagramModel';

function node(id: string, x: number, y: number): NodeModel {
  const n = new NodeModel({ type: 'basic', position: { x, y }, size: { width: 100, height: 50 } });
  (n as unknown as { id: string }).id = id;
  return n;
}

describe('coordinate semantics: getWorldPosition agrees with getGlobalPosition', () => {
  it('setParent() DECLARES relative positioning — the model stops lying', () => {
    const d = new DiagramModel('d');
    const parent = node('p', 200, 100);
    const child = node('c', 30, 40);
    d.addNode(parent);
    d.addNode(child);

    expect(child.positionMode).toBe('absolute'); // the default, pre-parent
    child.setParent('p');
    expect(child.positionMode).toBe('relative'); // gaining a parent means offsets

    // …and BOTH methods now give the same summed answer.
    expect(child.getWorldPosition()).toMatchObject({ x: 230, y: 140 });
    const gp = child.getGlobalPosition();
    expect({ x: gp.x, y: gp.y }).toEqual({ x: 230, y: 140 });
  });

  it('an EXPLICITLY absolute child with a parentId is world-positioned (no double-count)', () => {
    const d = new DiagramModel('d');
    d.addNode(node('p', 200, 100));
    const child = node('c', 500, 400);
    d.addNode(child);
    child.setParent('p');
    child.positionMode = 'absolute'; // author explicitly opts out of offsets

    // Old getWorldPosition: {700, 500} (the double-count). Now: what it says.
    expect(child.getWorldPosition()).toMatchObject({ x: 500, y: 400 });
    const gp = child.getGlobalPosition();
    expect({ x: gp.x, y: gp.y }).toEqual({ x: 500, y: 400 });
  });

  it('nested relative chains still sum through to the absolute root', () => {
    const d = new DiagramModel('d');
    d.addNode(node('gp', 1000, 0));
    const p = node('p', 50, 60);
    const c = node('c', 5, 6);
    d.addNode(p);
    d.addNode(c);
    p.setParent('gp');
    c.setParent('p');

    expect(c.getWorldPosition()).toMatchObject({ x: 1055, y: 66 });
  });

  it('clearing the parent leaves the mode alone — relative with no parent behaves as absolute', () => {
    const d = new DiagramModel('d');
    d.addNode(node('p', 200, 100));
    const child = node('c', 30, 40);
    d.addNode(child);
    child.setParent('p');
    child.setParent(undefined);

    expect(child.positionMode).toBe('relative'); // history, not a lie
    expect(child.getWorldPosition()).toMatchObject({ x: 30, y: 40 }); // no parent → own position
  });
});

describe('v2→v3 migration: legacy documents keep rendering identically', () => {
  it('re-labels a parented node whose mode was absent or the "absolute" default', () => {
    // A v2 document: parented child, positionMode never written (or the old default).
    // Pre-v3 engines rendered it by SUMMATION, so it must load as 'relative'.
    const legacy = {
      schemaVersion: 2,
      id: 'd1', uuid: 'u1', type: 'diagram', version: 1, metadata: {}, name: 'legacy',
      nodes: [
        { id: 'p', uuid: 'up', type: 'basic', version: 1, metadata: {}, position: { x: 200, y: 100 },
          size: { width: 100, height: 50 }, rotation: 0, scale: { x: 1, y: 1 }, children: ['c'],
          ports: [], state: {}, behavior: {}, style: {}, data: {} },
        { id: 'c', uuid: 'uc', type: 'basic', version: 1, metadata: {}, position: { x: 30, y: 40 },
          size: { width: 100, height: 50 }, rotation: 0, scale: { x: 1, y: 1 }, parentId: 'p',
          children: [], ports: [], state: {}, behavior: {}, style: {}, data: {} },
      ],
      links: [], groups: [],
      viewport: { x: 0, y: 0, width: 1200, height: 800, zoom: 1 },
    } as unknown as SerializedDiagram;

    const migrated = runDiagramMigrations(legacy);
    expect(migrated.schemaVersion).toBe(3);
    expect(migrated.nodes.find((n: { id: string }) => n.id === 'c')!.positionMode).toBe('relative');
    expect(migrated.nodes.find((n: { id: string }) => n.id === 'p')!.positionMode).toBeUndefined(); // no parent → untouched

    // …and the loaded model places the child exactly where the old engine did.
    const d = DiagramModel.fromJSON(migrated);
    expect(d.getNode('c')!.getWorldPosition()).toMatchObject({ x: 230, y: 140 });
  });

  it('respects an explicit "layout" mode (never part of the summation contract)', () => {
    const doc = {
      schemaVersion: 2, id: 'd', uuid: 'u', type: 'diagram', version: 1, metadata: {}, name: 'x',
      nodes: [{ id: 'c', uuid: 'uc', type: 'basic', version: 1, metadata: {}, position: { x: 1, y: 2 },
        size: { width: 10, height: 10 }, rotation: 0, scale: { x: 1, y: 1 }, parentId: 'p',
        positionMode: 'layout', children: [], ports: [], state: {}, behavior: {}, style: {}, data: {} }],
      links: [], groups: [], viewport: { x: 0, y: 0, width: 100, height: 100, zoom: 1 },
    } as unknown as SerializedDiagram;
    expect(runDiagramMigrations(doc).nodes[0].positionMode).toBe('layout');
  });
});
