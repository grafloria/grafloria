// Card 4: incremental (diff) serialization.
//
// THE invariant: for any mutation window,
//   load(before) + applyIncremental(patch)  ===  after   (by serialize equality)

import { DiagramModel } from '../models/DiagramModel';
import { NodeModel } from '../models/NodeModel';
import { PortModel } from '../models/PortModel';
import { LinkModel } from '../models/LinkModel';
import { GroupModel } from '../models/GroupModel';
import { beginIncrementalCapture, INCREMENTAL_FORMAT } from './Incremental';

const throughJSON = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

function mkNode(d: DiagramModel, id: string, x: number): NodeModel {
  const n = new NodeModel({ id, type: 'rect', position: { x, y: 10 } });
  n.ports.clear();
  const out = new PortModel({ id: `${id}-out`, type: 'output', side: 'right' });
  out.nodeId = id;
  n.ports.set(out.id, out);
  const inp = new PortModel({ id: `${id}-in`, type: 'input', side: 'left' });
  inp.nodeId = id;
  n.ports.set(inp.id, inp);
  d.addNode(n);
  return n;
}

function buildBase(): DiagramModel {
  const d = new DiagramModel('incremental-spec');
  mkNode(d, 'a', 0);
  mkNode(d, 'b', 200);
  d.addLink(new LinkModel('a-out', 'b-in', 'orthogonal'));
  return d;
}

/** Clone the "before" state via the (now provably lossless) JSON round-trip. */
const cloneModel = (d: DiagramModel) => DiagramModel.fromJSON(throughJSON(d.serialize()));

/** The invariant checker. */
function expectReplayEquals(before: DiagramModel, mutate: (d: DiagramModel) => void): void {
  const replica = cloneModel(before);
  const capture = beginIncrementalCapture(before);
  mutate(before);
  const patch = capture.commit();
  capture.stop();
  expect(patch).not.toBeNull();
  replica.applyIncremental(throughJSON(patch!));
  expect(throughJSON(replica.serialize())).toEqual(throughJSON(before.serialize()));
}

describe('incremental capture + apply — replay invariant', () => {
  it('replays additions (node + link)', () => {
    expectReplayEquals(buildBase(), (d) => {
      mkNode(d, 'c', 400);
      d.addLink(new LinkModel('b-out', 'c-in', 'direct'));
    });
  });

  it('replays removals', () => {
    expectReplayEquals(buildBase(), (d) => {
      d.removeLink(d.getLinks()[0].id);
      d.removeNode('b');
    });
  });

  it('replays in-place modifications (move, style, label, ports)', () => {
    expectReplayEquals(buildBase(), (d) => {
      const a = d.getNode('a')!;
      a.setPosition(500, 600);
      // direct field write: rides along in the full-entity snapshot because
      // setPosition above already marks node 'a' modified in this window
      a.style = { ...a.style, fill: '#ff0000' };
      const link = d.getLinks()[0];
      link.setPathType('bezier');
      const g = new GroupModel({ id: 'g1', name: 'G' });
      d.addGroup(g);
      g.addMember('a', d);
    });
  });

  it('replays diagram-level changes (name, viewport, metadata)', () => {
    expectReplayEquals(buildBase(), (d) => {
      d.name = 'renamed';
      d.viewport = { ...d.viewport, zoom: 2 };
      d.setMetadata('touched', true);
    });
  });

  it('replays a mixed transaction across two sequential commits', () => {
    const before = buildBase();
    const replica = cloneModel(before);
    const capture = beginIncrementalCapture(before);

    mkNode(before, 'c', 400);
    const patch1 = capture.commit()!;
    replica.applyIncremental(throughJSON(patch1));

    before.getNode('c')!.setPosition(1, 2);
    before.removeNode('a');
    const patch2 = capture.commit()!;
    capture.stop();
    replica.applyIncremental(throughJSON(patch2));

    expect(throughJSON(replica.serialize())).toEqual(throughJSON(before.serialize()));
  });
});

describe('incremental semantics', () => {
  it('coalesces add+remove of the same entity to a no-op', () => {
    const d = buildBase();
    const capture = beginIncrementalCapture(d);
    const temp = mkNode(d, 'temp', 999);
    d.removeNode(temp.id);
    expect(capture.commit()).toBeNull();
    capture.stop();
  });

  it('an added-then-modified entity ships once, as an add with final state', () => {
    const d = buildBase();
    const capture = beginIncrementalCapture(d);
    const c = mkNode(d, 'c', 400);
    c.setPosition(777, 888);
    const patch = capture.commit()!;
    capture.stop();
    expect(patch.added.nodes.map((n) => n.id)).toEqual(['c']);
    expect(patch.modified.nodes).toHaveLength(0);
    expect(patch.added.nodes[0].position).toEqual({ x: 777, y: 888 });
  });

  it('commit() returns null when nothing changed, and capture continues after commit', () => {
    const d = buildBase();
    const capture = beginIncrementalCapture(d);
    expect(capture.commit()).toBeNull();
    d.getNode('a')!.setPosition(5, 5);
    expect(capture.commit()).not.toBeNull();
    expect(capture.commit()).toBeNull(); // window drained
    capture.stop();
  });

  it('patch shape carries format + schemaVersion; newer patches are refused', () => {
    const d = buildBase();
    const capture = beginIncrementalCapture(d);
    d.getNode('a')!.setPosition(5, 5);
    const patch = capture.commit()!;
    capture.stop();
    expect(patch.format).toBe(INCREMENTAL_FORMAT);

    const future = { ...patch, schemaVersion: patch.schemaVersion + 10 };
    expect(() => cloneModel(d).applyIncremental(future)).toThrow(/newer/i);
  });

  it('apply preserves object identity for modified entities and fires change events', () => {
    const before = buildBase();
    const replica = cloneModel(before);
    const sameInstance = replica.getNode('a')!;
    const changed = jest.fn();
    replica.on('node:changed', changed);

    const capture = beginIncrementalCapture(before);
    before.getNode('a')!.setPosition(321, 654);
    const patch = capture.commit()!;
    capture.stop();

    replica.applyIncremental(throughJSON(patch));
    expect(replica.getNode('a')).toBe(sameInstance); // identity preserved
    expect(sameInstance.position).toEqual({ x: 321, y: 654 });
    expect(changed).toHaveBeenCalled();
  });

  it('modified-but-missing entities are installed as adds, fully wired', () => {
    const before = buildBase();
    const capture = beginIncrementalCapture(before);
    before.getNode('a')!.setPosition(50, 50);
    const patch = capture.commit()!;
    capture.stop();

    const emptyReplica = new DiagramModel('divergent');
    emptyReplica.applyIncremental(throughJSON(patch));
    const a = emptyReplica.getNode('a')!;
    expect(a).toBeDefined();
    expect(a.diagram).toBe(emptyReplica);
    expect(emptyReplica.getNodeByPortId('a-out')!.id).toBe('a');
  });

  it('applied link additions update port-connection registries', () => {
    const before = buildBase();
    const replica = cloneModel(before);
    const capture = beginIncrementalCapture(before);
    mkNode(before, 'c', 400);
    const link = new LinkModel('b-out', 'c-in', 'direct');
    before.addLink(link);
    const patch = capture.commit()!;
    capture.stop();

    replica.applyIncremental(throughJSON(patch));
    expect(replica.getPortById('b-out')!.currentConnections.has(link.id)).toBe(true);
  });

  it('stop() detaches listeners (later mutations are not captured)', () => {
    const d = buildBase();
    const capture = beginIncrementalCapture(d);
    capture.stop();
    d.getNode('a')!.setPosition(9, 9);
    expect(() => capture.commit()).toThrow(/stopped/i);
  });
});
