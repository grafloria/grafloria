// Wave 9 — THE EPHEMERAL-STATE LEAK, found by wave9/sync in a real two-peer session.
//
// `NodeState` mixes durable document facts (visible, locked, expanded) with per-viewer
// ephemera (selected, hovered, highlighted, focused) in ONE object — and OpCapture used to
// sync the whole object as a single register. So:
//
//   • Moving your mouse across a node wrote TWO PERMANENT OPS into the shared document.
//   • The peer APPLIED them: a node lit up on my screen because your cursor was near it.
//   • Your click DESELECTED MY NODE — selection is a property of a person, not a diagram.
//   • And all of it landed in the replayable, persisted, totally-ordered log FOREVER.
//
// The document still CONVERGED throughout, which is exactly why no convergence test could
// see this. It is a correctness bug about what belongs in a document at all.

import { DiagramEngine } from '../engine/DiagramEngine';
import { DiagramModel } from '../models/DiagramModel';
import { NodeModel } from '../models/NodeModel';
import { LinkModel } from '../models/LinkModel';
import { PortModel } from '../models/PortModel';
import { Replica } from './replica';
import type { Op } from './op';

function node(id: string): NodeModel {
  const n = new NodeModel({ type: 'basic', position: { x: 0, y: 0 }, size: { width: 100, height: 50 } });
  (n as unknown as { id: string }).id = id;
  n.addPort(new PortModel({ id: `${id}-out`, type: 'output', side: 'right' }));
  n.addPort(new PortModel({ id: `${id}-in`, type: 'input', side: 'left' }));
  return n;
}

describe('ephemeral viewer state must never enter the document', () => {
  let engine: DiagramEngine;
  let ops: Op[];
  let peer: Replica;

  beforeEach(() => {
    engine = new DiagramEngine();
    const d = engine.createDiagram('d')!;
    ops = [];
    peer = new Replica(d, { actor: 'alice', onLocalOp: (o) => ops.push(o) });
    d.addNode(node('n1'));
    ops.length = 0; // discard the add; we only care about what follows
  });

  afterEach(() => {
    peer.dispose();
    engine.destroy();
  });

  it('HOVERING A NODE PUTS NOTHING ON THE WIRE', () => {
    // The bug in one line. A user moving the mouse is not editing the document.
    const n = peer.diagram.getNode('n1')!;
    n.setState({ hovered: true });
    n.setState({ hovered: false });
    n.setState({ hovered: true });

    expect(ops).toHaveLength(0);
  });

  it('SELECTING A NODE PUTS NOTHING ON THE WIRE', () => {
    // Selection is a fact about a PERSON, not about the diagram. Sync it and my click
    // deselects your node.
    peer.diagram.getNode('n1')!.setState({ selected: true });
    expect(ops).toHaveLength(0);
  });

  it('focus and highlight are viewer-local too', () => {
    const n = peer.diagram.getNode('n1')!;
    n.setState({ focused: true });
    n.setState({ highlighted: true });
    expect(ops).toHaveLength(0);
  });

  it("a LINK's state is view state top to bottom — never synced", () => {
    // LinkModel.state is 'default' | 'selected' | 'hovered' | 'highlighted'. Every value
    // is a view state, so the register is ephemeral in its entirety.
    peer.diagram.addNode(node('n2'));
    const link = new LinkModel('n1-out', 'n2-in', 'orthogonal');
    (link as unknown as { id: string }).id = 'l1';
    peer.diagram.addLink(link);
    ops.length = 0;

    link.setState('hovered');
    link.setState('selected');

    expect(ops).toHaveLength(0);
  });

  it('…but LOCKING a node IS a document fact, and still travels', () => {
    // The other half of the fix, and the half a blunt "do not sync state" would break.
    // `locked`, `visible`, `expanded` are facts about the DOCUMENT — everyone must see
    // them — and they live in the same object as the ephemera.
    peer.diagram.getNode('n1')!.setState({ locked: true });

    expect(ops).toHaveLength(1);
    const op = ops[0] as Extract<Op, { op: 'set' }>;
    expect(op.path).toBe('state');
    expect((op.value as Record<string, unknown>)['locked']).toBe(true);

    // …and the viewer-local keys are STRIPPED OUT of what goes on the wire, so applying
    // this op on a peer cannot clobber that peer's own selection.
    expect(op.value).not.toHaveProperty('selected');
    expect(op.value).not.toHaveProperty('hovered');
    expect(op.value).not.toHaveProperty('focused');
  });

  it('THE ONE THAT MATTERS: my selection survives your edit', () => {
    // Bob has n1 selected on his screen. Alice locks it. Bob must keep his selection —
    // the op carries a durable fact and must not smuggle Alice's (empty) selection along.
    const bobEngine = new DiagramEngine();
    const bobDoc = bobEngine.createDiagram('d')!;
    const bob = new Replica(
      new DiagramModel(peer.diagram.name, { id: peer.diagram.id, uuid: peer.diagram.uuid }),
      { actor: 'bob' }
    );
    bob.receive(peer.log.toArray()); // bob catches up: he has n1

    bob.diagram.getNode('n1')!.setState({ selected: true }); // Bob selects it, locally

    peer.diagram.getNode('n1')!.setState({ locked: true }); // Alice locks it
    bob.receive(ops);

    const n = bob.diagram.getNode('n1')!;
    expect(n.state.locked).toBe(true);      // Alice's document edit arrived
    expect(n.state.selected).toBe(true);    // …and Bob's selection SURVIVED it

    bob.dispose();
    bobEngine.destroy();
  });
});
