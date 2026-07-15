// wave14/model — DEFECT 1: soft refs to deleted nodes, held with the QUARANTINE philosophy.
//
// `removeNode()` deliberately leaves two soft references dangling:
//   (a) other nodes' `parentId` still points at the removed node;
//   (b) the removed id stays inside `GroupModel.members`.
//
// That is NOT the bug — it is the design. Hard-clearing those refs at delete time is
// irreversible under collab/undo: undo-of-parent-delete restores children exactly BECAUSE
// the ref dangles and re-resolves (the same argument collab/integrity.ts makes for links:
// QUARANTINE, derived and reversible, over cascade, chatty and destructive).
//
// The bug was the READERS: a relative child whose parent stopped resolving fell back to
// its RAW OFFSET as if it were world coordinates — delete a parent and every child
// visually JUMPS to a corner of the canvas. The fix completes the tolerant readers: the
// diagram remembers a LAST-KNOWN ANCHOR (world position + global frame) for every node it
// removes, and an unresolvable parent chain resolves to that anchor — so children FREEZE
// exactly where they were, the document is never touched, and the moment the parent comes
// back (undo, redo, remote re-add) the chain re-resolves through the live node.
//
// Everything here is proved through the REAL model API and, where it matters, through a
// REAL Replica (collab/op-log.spec.ts is the harness pattern) — no collab source edits.

import { DiagramModel } from './DiagramModel';
import { NodeModel } from './NodeModel';
import { GroupModel } from './GroupModel';
import { Replica } from '../collab/replica';
import { GroupCollapseService } from '../interaction/GroupCollapseService';
import type { Op } from '../collab/op';

function node(id: string, x: number, y: number): NodeModel {
  const n = new NodeModel({ type: 'basic', position: { x, y }, size: { width: 100, height: 50 } });
  (n as unknown as { id: string }).id = id;
  return n;
}

/**
 * The shared document, as in op-log.spec.ts: strip per-replica counters and viewer-local
 * state, keep every durable fact. See that file for why `version` legitimately differs.
 */
const NOT_DOCUMENT = new Set(['version', 'selected', 'hovered', 'highlighted', 'focused']);
function documentBytes(d: DiagramModel): string {
  const strip = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(strip);
    if (v && typeof v === 'object') {
      return Object.fromEntries(
        Object.entries(v as Record<string, unknown>)
          .filter(([k]) => !NOT_DOCUMENT.has(k))
          .map(([k, val]) => [k, strip(val)])
      );
    }
    return v;
  };
  // Entity arrays reflect Map INSERTION order, which a remove+undo legitimately rotates
  // (the resurrected entity re-enters last). Order is not document content; sort by id
  // so the oracle compares the entities, not the round-trip's insertion history.
  const doc = d.serialize() as unknown as {
    nodes: Array<{ id: string }>;
    links: Array<{ id: string }>;
    groups: Array<{ id: string }>;
  };
  const byId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id);
  doc.nodes = [...doc.nodes].sort(byId);
  doc.links = [...doc.links].sort(byId);
  doc.groups = [...doc.groups].sort(byId);
  return JSON.stringify(strip(doc));
}

describe('DEFECT 1a — delete a parent: relative children FREEZE, they do not jump', () => {
  it('children keep their EXACT world position when the parent is removed', () => {
    const d = new DiagramModel('d');
    d.addNode(node('p', 200, 100));
    const child = node('c', 30, 40);
    d.addNode(child);
    child.setParent('p');
    expect(child.getWorldPosition()).toMatchObject({ x: 230, y: 140 });

    d.removeNode('p');

    // The soft ref is KEPT (quarantine, not destruction)…
    expect(child.parentId).toBe('p');
    // …and the reader tolerates it: the child stays where the user last saw it.
    expect(child.getWorldPosition()).toMatchObject({ x: 230, y: 140 });
  });

  it('getGlobalPosition and getBoundingBox agree with the frozen frame', () => {
    const d = new DiagramModel('d');
    d.addNode(node('p', 200, 100));
    const child = node('c', 30, 40);
    d.addNode(child);
    child.setParent('p');
    const boxBefore = child.getBoundingBox();
    const globalBefore = child.getGlobalPosition();

    d.removeNode('p');

    expect(child.getGlobalPosition()).toEqual(globalBefore);
    expect(child.getBoundingBox()).toEqual(boxBefore);
  });

  it('a transform-carrying parent (rotation + scale) freezes byte-identically too', () => {
    const d = new DiagramModel('d');
    const p = node('p', 200, 100);
    p.rotation = Math.PI / 6;
    p.scale = { x: 2, y: 1.5 };
    d.addNode(p);
    const child = node('c', 30, 40);
    d.addNode(child);
    child.setParent('p');

    const globalBefore = child.getGlobalPosition();
    const boundsBefore = child.getGlobalBounds();

    d.removeNode('p');

    expect(child.getGlobalPosition()).toEqual(globalBefore);
    expect(child.getGlobalBounds()).toEqual(boundsBefore);
  });

  it('a mid-chain removal freezes the whole subtree at its last-known anchor', () => {
    const d = new DiagramModel('d');
    d.addNode(node('gp', 1000, 0));
    const p = node('p', 50, 60);
    const c = node('c', 5, 6);
    d.addNode(p);
    d.addNode(c);
    p.setParent('gp');
    c.setParent('p');
    expect(c.getWorldPosition()).toMatchObject({ x: 1055, y: 66 });

    d.removeNode('p');

    // The anchor is LAST-KNOWN: it captured gp's contribution at removal time.
    expect(c.getWorldPosition()).toMatchObject({ x: 1055, y: 66 });
    // …and it is FROZEN: gp moving later does not drag the orphaned subtree along,
    // because the link through the chain — p — is gone. Freeze, not live re-derivation.
    d.getNode('gp')!.setPosition(2000, 0);
    expect(c.getWorldPosition()).toMatchObject({ x: 1055, y: 66 });
  });

  it('moving an orphaned child works IN the frozen frame — reads and writes agree', () => {
    const d = new DiagramModel('d');
    d.addNode(node('p', 200, 100));
    const child = node('c', 30, 40);
    d.addNode(child);
    child.setParent('p');
    d.removeNode('p');

    // Relative write: offsets stay offsets against the anchor.
    child.setPosition(31, 41);
    expect(child.getWorldPosition()).toMatchObject({ x: 231, y: 141 });

    // Global write: converts through the same frozen frame the readers use.
    child.setGlobalPosition(240, 150);
    expect(child.getWorldPosition()).toMatchObject({ x: 240, y: 150 });
    expect(child.position).toMatchObject({ x: 40, y: 50 });
  });

  it('a parentId the diagram has NEVER seen (loaded dangle) still reads as raw offset — the validator owns that case', () => {
    // A document saved with a dangling parentId arrives with no removal event and hence no
    // anchor. There is nothing to freeze AT; DiagramValidator flags it at load. The reader
    // must simply not crash and must keep today's deterministic fallback.
    const d = new DiagramModel('d');
    const child = node('c', 30, 40);
    d.addNode(child);
    child.setParent('ghost-never-existed');
    expect(child.getWorldPosition()).toMatchObject({ x: 30, y: 40 });
  });
});

describe('DEFECT 1b — the dangle is REVERSIBLE: restore/undo reattaches children byte-identically', () => {
  it('model-level: restoreNode(parent snapshot) re-resolves the chain', () => {
    const d = new DiagramModel('d');
    d.addNode(node('p', 200, 100));
    const child = node('c', 30, 40);
    d.addNode(child);
    child.setParent('p');

    const childBytes = JSON.stringify(child.serialize());
    const parentSnapshot = d.getNode('p')!.serialize();

    d.removeNode('p');
    expect(child.getWorldPosition()).toMatchObject({ x: 230, y: 140 }); // frozen

    d.restoreNode(parentSnapshot);

    // Byte-identical reattach: the child was never touched — that is exactly WHY
    // hard-clearing parentId at delete time would have been wrong.
    expect(JSON.stringify(child.serialize())).toEqual(childBytes);
    // …and the chain is LIVE again, not anchored: moving the parent moves the child.
    d.getNode('p')!.setPosition(300, 100);
    expect(child.getWorldPosition()).toMatchObject({ x: 330, y: 140 });
  });

  it('collab-level: UNDO of a parent delete reattaches children byte-identically', () => {
    const r = new Replica(new DiagramModel('shared'), { actor: 'alice' });
    r.diagram.addNode(node('p', 200, 100));
    const child = node('c', 30, 40);
    r.diagram.addNode(child);
    child.setParent('p');

    const childBytes = JSON.stringify(child.serialize());
    const docBytes = documentBytes(r.diagram);

    r.diagram.removeNode('p');
    expect(child.getWorldPosition()).toMatchObject({ x: 230, y: 140 }); // frozen while gone

    r.undo();

    expect(r.diagram.getNode('p')).toBeDefined();
    expect(JSON.stringify(r.diagram.getNode('c')!.serialize())).toEqual(childBytes);
    expect(documentBytes(r.diagram)).toEqual(docBytes);
    // The chain resolves through the LIVE parent again (anchor is bypassed).
    r.diagram.getNode('p')!.setPosition(250, 150);
    expect(child.getWorldPosition()).toMatchObject({ x: 280, y: 190 });

    r.dispose();
  });
});

describe('DEFECT 1c — concurrent delete-parent vs move-child CONVERGES (two real Replicas)', () => {
  it('both peers hold the same document AND freeze the child at the same world position', () => {
    const base = new DiagramModel('shared');
    const mk = (actor: string, sink: Op[]) =>
      new Replica(new DiagramModel(base.name, { id: base.id, uuid: base.uuid }), {
        actor,
        onLocalOp: (o) => sink.push(o),
      });

    // Seed both peers with the same parented pair, exactly as op-log.spec.ts seeds.
    const seedOps: Op[] = [];
    const S = mk('seed', seedOps);
    S.diagram.addNode(node('p', 200, 100));
    const seedChild = node('c', 30, 40);
    S.diagram.addNode(seedChild);
    seedChild.setParent('p');

    const aOps: Op[] = [];
    const bOps: Op[] = [];
    const A = mk('alice', aOps);
    const B = mk('bob', bOps);
    A.receive(seedOps);
    B.receive(seedOps);

    // CONCURRENTLY — neither has seen the other's op yet:
    A.diagram.removeNode('p'); // Alice deletes the parent
    B.diagram.getNode('c')!.setPosition(35, 45); // Bob drags the child

    // …then they exchange (and re-deliver, because real transports do).
    A.receive(bOps);
    B.receive(aOps);
    A.receive([...bOps, ...aOps]);
    B.receive([...aOps, ...bOps]);

    // The document converged: parent gone on both, child offset is Bob's write.
    expect(documentBytes(A.diagram)).toEqual(documentBytes(B.diagram));
    expect(A.diagram.getNode('p')).toBeUndefined();
    expect(A.diagram.getNode('c')!.position).toMatchObject({ x: 35, y: 45 });

    // And the DERIVED freeze agrees too: both peers recorded the same last-known anchor
    // (the parent's registers had converged before either applied the remove), so the
    // child renders at the same world position on both screens.
    const wA = A.diagram.getNode('c')!.getWorldPosition();
    const wB = B.diagram.getNode('c')!.getWorldPosition();
    expect(wA).toEqual(wB);
    expect(wA).toMatchObject({ x: 235, y: 145 }); // anchor(200,100) + Bob's offset(35,45)

    [A, B, S].forEach((p) => p.dispose());
  });
});

describe('DEFECT 1d — group readers tolerate a member the diagram no longer holds', () => {
  function grouped(): { d: DiagramModel; g: GroupModel } {
    const d = new DiagramModel('d');
    d.addNode(node('n1', 0, 0));
    d.addNode(node('n2', 300, 0));
    const g = new GroupModel({ name: 'G' });
    (g as unknown as { id: string }).id = 'g1';
    d.addGroup(g);
    g.addMember('n1', d);
    g.addMember('n2', d);
    return { d, g };
  }

  it('collapse over a missing member neither crashes nor resurrects it', () => {
    const { d, g } = grouped();
    d.removeNode('n2'); // model-level delete: the id stays in g.members (the soft ref)
    expect(g.members.has('n2')).toBe(true);

    const svc = new GroupCollapseService(d);
    expect(() => svc.collapse(g)).not.toThrow();
    expect(g.isCollapsed).toBe(true);
    expect(d.getNode('n2')).toBeUndefined(); // not resurrected by collapse

    expect(() => svc.expand(g)).not.toThrow();
    expect(g.isCollapsed).toBe(false);
    expect(d.getNode('n2')).toBeUndefined(); // …nor by expand
    expect(d.getNode('n1')!.state.visible).not.toBe(false); // survivor came back
  });

  it('bounds/extent/layout readers skip the missing member instead of crashing', () => {
    const { d, g } = grouped();
    d.removeNode('n2');

    expect(() => g.calculateBounds(d)).not.toThrow();
    expect(g.bounds).toMatchObject({ x: 0, y: 0 }); // n1 alone
    expect(() => g.fitToContents(d)).not.toThrow();
    expect(() => g.applyLayout(d)).not.toThrow();
  });
});
