// Wave 14 — EVERY register must travel as its VALUE, and every undo must travel at all.
//
// ---------------------------------------------------------------------------
// THE BUG FAMILY THIS FILE EXISTS TO KEEP FIXED
// ---------------------------------------------------------------------------
//
// group-members.spec.ts and style-undo.spec.ts each documented one instance of a
// defect this suite proves was never a one-off. There are three ways a mutation
// escapes the collab funnel, and the engine had all three, on nine registers:
//
//   1. THE FUNNEL REPORTS A DELTA, NOT A VALUE.
//      `trackChange(prop, old, new)` is the single funnel capture reads. Every
//      register in this engine reports the property's VALUE — except the ones that
//      report the ITEM THAT MOVED. `GroupModel.addMember` was the known case.
//      `LinkModel.addLabel`, `NodeModel.addChild` and `NodeModel.addClass` were
//      three more, all unfound, all shipping since the register existed. Measured
//      before the fix, over a real wire:
//
//        addLabel  → peer's `link.labels` became the LABEL OBJECT.
//                    serialize() threw "this.labels.map is not a function".
//        removeLabel → peer's `link.labels` became null. serialize() threw.
//        addChild('beta') → peer serialized children as ['b','e','t','a'].
//        addClass  → peer's `classes` became a string; the peer's next addClass()
//                    threw "this.classes.has is not a function".
//
//      A peer that cannot serialize cannot save, autosave, or snapshot — on the
//      machine that made no edit.
//
//   2. THE REDUCER MERGES WHERE THE OP CARRIES A WHOLE VALUE.
//      `style` was fixed for nodes in an earlier wave; `state`, `behavior` and a
//      STROKE's `style` were the same bug, still open. A peer could gain a key and
//      never lose one: the author clears `state.error` and every other peer keeps
//      the error badge forever, with no later edit able to correct it.
//
//   3. THE REDUCER GUESSES A MUTATOR BY NAME.
//      `writeGeneric` called `entity['set' + Prop](value)` for any matching name.
//      That silently assumed every such method is a single-argument whole-value
//      writer. Three are not:
//
//        setData(key, value)          → called as setData({color:'red'}), so the
//                                       peer stored a key named "[object Object]"
//                                       and NEVER received `data` at all.
//        setScale(x, y)               → peer got {x:{x:2,y:3}}.
//        setTransformOrigin(x, y)     → peer got {x:{x:0.25,y:0.75}}.
//
// ---------------------------------------------------------------------------
// AND THE ONE THAT SUBSUMES THE OTHERS: A SILENT UNDO
// ---------------------------------------------------------------------------
//
// `UndoStack.undo()` applies the inverse THROUGH THE MODEL WITH CAPTURE LIVE and
// then reads back whatever capture minted (`lastLogged`). So a reducer write that
// does not reach `trackChange()` produces NO op, and the undo reaches nobody —
// exactly the `UpdateLinkStyleCommand` defect, one layer down and affecting every
// register at once. `writeGeneric`'s raw-assignment fallback did not track. Measured:
//
//     link style   execute → 1 op   undo → 0 ops
//     flexConfig   execute → 1 op   undo → 0 ops
//     isCollapsed  execute → 1 op   undo → 0 ops
//     position     execute → 1 op   undo → 1 op    ← the control: a real mutator
//
// EVERY assertion below runs the edit through a SECOND REPLICA and demands the
// PEER's value. An assertion on the author's model passes with all of these
// present — which is precisely why they survived 196 collab tests, a 200-trial
// convergence fuzz and a byte-identical replay oracle.

import { GroupModel } from '../models/GroupModel';
import { SetLinkLabelsCommand } from '../commands/basic/SetLinkLabelsCommand';
import { bytes, expectConverged, link, node, peer, stroke } from './test-helpers';
import type { Op } from './op';
import type { CommandContext } from '../commands/Command';
import type { LinkLabel } from '../types';

/** A real wire hop: an op that cannot survive JSON has not travelled. */
function overTheWire(ops: readonly Op[]): Op[] {
  return JSON.parse(JSON.stringify(ops)) as Op[];
}

/**
 * Alice (capturing) and Bob (a replica seeded BY SHIPPING ALICE'S OPS).
 *
 * Bob is never built by constructing the same entities a second time: two
 * separately-constructed peers disagree about every `uuid` (the generator is
 * sequential), which would make a REAL divergence indistinguishable from that noise.
 *
 * The ids are deliberately MULTI-CHARACTER. A single-character id hides the whole
 * delta-vs-value family: `Array.from('b')` is `['b']`, so a peer holding the raw
 * string 'b' instead of the collection ['b'] serializes CORRECTLY and the test
 * passes with the bug fully present. 'beta' serializes as ['b','e','t','a'].
 */
function twoPeers() {
  const wire: Op[] = [];
  const alice = peer('alice', undefined, wire);
  const bob = peer('bob', alice.diagram);
  alice.diagram.addNode(node('alpha', 0, 0));
  alice.diagram.addNode(node('beta', 200, 0));
  alice.diagram.addLink(link('edge', 'alpha', 'beta'));
  alice.diagram.addStroke(stroke('ink', 10, 10));
  bob.receive(overTheWire(wire));
  wire.length = 0;

  /** Run `fn`, ship what it emitted to Bob, and report the op count. */
  const sync = (fn: () => void): number => {
    wire.length = 0;
    fn();
    const ops = overTheWire(wire);
    bob.receive(ops);
    return ops.length;
  };
  /** Undo Alice's last step and ship the result. Reports the op count. */
  const undoSync = (): number => sync(() => alice.undo());

  return { wire, alice, bob, sync, undoSync };
}

// ---------------------------------------------------------------------------
// 1. DELTA-SHAPED FUNNEL REPORTS
// ---------------------------------------------------------------------------

describe('link labels travel as the COLLECTION, not the label that moved', () => {
  it('an added label arrives as an array — and the peer can still serialize', () => {
    const { wire, alice, bob, sync } = twoPeers();

    sync(() => alice.diagram.getLink('edge')!.addLabel({ id: 'cap', text: 'yes', position: 0.5 }));

    // The register value is the COLLECTION. Before the fix this was the bare
    // LinkLabel object, which the peer assigned straight over its array.
    expect(wire[0]).toMatchObject({ path: 'labels' });
    expect(Array.isArray((wire[0] as { value: unknown }).value)).toBe(true);

    const peerLink = bob.diagram.getLink('edge')!;
    expect(Array.isArray(peerLink.labels)).toBe(true);
    expect(peerLink.labels.map((l) => l.text)).toEqual(['yes']);
    // The loudest assertion: before the fix this threw
    // "this.labels.map is not a function".
    expect(() => bob.diagram.serialize()).not.toThrow();
    expectConverged(alice.diagram, bob.diagram);
  });

  it('a removed label does not leave the peer unable to serialize at all', () => {
    const { alice, bob, sync } = twoPeers();
    const l = alice.diagram.getLink('edge')!;
    sync(() => {
      l.addLabel({ id: 'one', text: 'A', position: 0.25 });
      l.addLabel({ id: 'two', text: 'B', position: 0.75 });
    });

    sync(() => l.removeLabel('one'));

    // Before the fix `labels` was null here and serialize() threw
    // "Cannot read properties of null (reading 'map')".
    expect(() => bob.diagram.serialize()).not.toThrow();
    expect(bob.diagram.getLink('edge')!.labels.map((x) => x.id)).toEqual(['two']);
    expectConverged(alice.diagram, bob.diagram);
  });

  it('an EDITED label reaches the peer as the whole collection', () => {
    const { alice, bob, sync } = twoPeers();
    const l = alice.diagram.getLink('edge')!;
    sync(() => {
      l.addLabel({ id: 'one', text: 'A', position: 0.25 });
      l.addLabel({ id: 'two', text: 'B', position: 0.75 });
    });

    sync(() => l.updateLabel(1, { text: 'edited' }));

    // updateLabel reported the ONE label it touched. A peer that assigned that
    // lost the other label entirely — and its array type with it.
    expect(bob.diagram.getLink('edge')!.labels.map((x) => x.text)).toEqual(['A', 'edited']);
    expectConverged(alice.diagram, bob.diagram);
  });

  it('label ORDER survives the hop and is byte-visible', () => {
    const { alice, bob, sync } = twoPeers();
    const l = alice.diagram.getLink('edge')!;
    sync(() => {
      l.addLabel({ id: 'z', text: 'Z', position: 0.9 });
      l.addLabel({ id: 'a', text: 'A', position: 0.1 });
    });
    expect(bob.diagram.getLink('edge')!.serialize().labels.map((x) => x.id)).toEqual(['z', 'a']);
    expect(bytes(bob.diagram)).toEqual(bytes(alice.diagram));
  });

  it('UNDO of a label edit reaches the peer', () => {
    const { alice, bob, sync, undoSync } = twoPeers();
    const l = alice.diagram.getLink('edge')!;
    sync(() => l.addLabel({ id: 'cap', text: 'first', position: 0.5 }));

    expect(undoSync()).toBeGreaterThan(0);
    expect(alice.diagram.getLink('edge')!.labels).toEqual([]);
    expect(bob.diagram.getLink('edge')!.labels).toEqual([]);
    expectConverged(alice.diagram, bob.diagram);
  });
});

describe('node children travel as the COLLECTION, not the child that moved', () => {
  it('an added child arrives as one child, not as four characters of one', () => {
    const { wire, alice, bob, sync } = twoPeers();

    sync(() => alice.diagram.getNode('alpha')!.addChild('beta'));

    expect(wire[0]).toMatchObject({ path: 'children', value: ['beta'] });
    const peerNode = bob.diagram.getNode('alpha')!;
    expect(peerNode.children).toBeInstanceOf(Set);
    // Before the fix: ['b','e','t','a'] — four child ids that exist nowhere.
    expect(peerNode.serialize().children).toEqual(['beta']);
    expectConverged(alice.diagram, bob.diagram);
  });

  it('a removed child does not leave the peer unable to serialize', () => {
    const { alice, bob, sync } = twoPeers();
    const n = alice.diagram.getNode('alpha')!;
    sync(() => n.addChild('beta'));

    sync(() => n.removeChild('beta'));

    expect(() => bob.diagram.serialize()).not.toThrow();
    expect(bob.diagram.getNode('alpha')!.children).toBeInstanceOf(Set);
    expect(bob.diagram.getNode('alpha')!.serialize().children).toEqual([]);
    expectConverged(alice.diagram, bob.diagram);
  });

  it('UNDO of a child add reaches the peer', () => {
    const { alice, bob, sync, undoSync } = twoPeers();
    sync(() => alice.diagram.getNode('alpha')!.addChild('beta'));

    expect(undoSync()).toBeGreaterThan(0);
    expect(bob.diagram.getNode('alpha')!.serialize().children).toEqual([]);
    expectConverged(alice.diagram, bob.diagram);
  });
});

describe('node classes travel as the COLLECTION, not the class that moved', () => {
  it('an added class leaves the peer with a usable Set', () => {
    const { wire, alice, bob, sync } = twoPeers();

    sync(() => alice.diagram.getNode('alpha')!.addClass('selected-ring'));

    expect(wire[0]).toMatchObject({ path: 'classes', value: ['selected-ring'] });
    const peerNode = bob.diagram.getNode('alpha')!;
    expect(peerNode.classes).toBeInstanceOf(Set);
    expect([...peerNode.classes]).toEqual(['selected-ring']);
    // Before the fix `classes` was the raw string and THIS threw
    // "this.classes.has is not a function" — the peer's model was
    // permanently unable to accept another class.
    expect(() => peerNode.addClass('another')).not.toThrow();
  });

  it('a removed class travels', () => {
    const { alice, bob, sync } = twoPeers();
    const n = alice.diagram.getNode('alpha')!;
    sync(() => {
      n.addClass('one');
      n.addClass('two');
    });

    sync(() => n.removeClass('one'));

    expect(bob.diagram.getNode('alpha')!.classes).toBeInstanceOf(Set);
    expect([...bob.diagram.getNode('alpha')!.classes]).toEqual(['two']);
  });

  it('UNDO of a class add reaches the peer', () => {
    const { alice, bob, sync, undoSync } = twoPeers();
    sync(() => alice.diagram.getNode('alpha')!.addClass('ring'));

    expect(undoSync()).toBeGreaterThan(0);
    expect([...bob.diagram.getNode('alpha')!.classes]).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 2. MERGE WHERE THE OP CARRIES A WHOLE VALUE
// ---------------------------------------------------------------------------

describe('a peer can LOSE a key, not only gain one', () => {
  it('node state: a cleared error clears on the peer too', () => {
    const { alice, bob, sync } = twoPeers();
    sync(() => alice.diagram.getNode('alpha')!.setState({ error: 'boom' }));
    expect(bob.diagram.getNode('alpha')!.state.error).toBe('boom');

    sync(() => alice.diagram.getNode('alpha')!.setState({ error: undefined }));

    // THE TOOTH. `setState` MERGES, so the reducer could add `error` and never
    // remove it: the author went back to clean and every peer kept the badge.
    expect(alice.diagram.getNode('alpha')!.state.error).toBeUndefined();
    expect(bob.diagram.getNode('alpha')!.state.error).toBeUndefined();
    expectConverged(alice.diagram, bob.diagram);
  });

  it("node state: a peer's OWN selection survives a remote state write", () => {
    // The other half of the same fix, and the reason it is not simply a wholesale
    // replace: `selected`/`hovered`/`highlighted`/`focused` are per-VIEWER facts that
    // capture deliberately strips, so an incoming register value never carries them.
    // Replacing wholesale would blank them — reintroducing "your click deselected my
    // node", the bug ephemeral-state.spec.ts exists to prevent.
    const { alice, bob, sync } = twoPeers();
    bob.diagram.getNode('alpha')!.setState({ selected: true, hovered: true });

    sync(() => alice.diagram.getNode('alpha')!.setState({ error: 'boom' }));

    expect(bob.diagram.getNode('alpha')!.state.selected).toBe(true);
    expect(bob.diagram.getNode('alpha')!.state.hovered).toBe(true);
    expect(bob.diagram.getNode('alpha')!.state.error).toBe('boom');
  });

  it('node behavior: a cleared dragHandler clears on the peer too', () => {
    const { alice, bob, sync } = twoPeers();
    sync(() =>
      alice.diagram.getNode('alpha')!.setBehavior({ dragHandler: { isDragHandler: true } })
    );
    expect(bob.diagram.getNode('alpha')!.behavior.dragHandler).toBeDefined();

    sync(() => alice.diagram.getNode('alpha')!.setBehavior({ dragHandler: undefined }));

    expect(alice.diagram.getNode('alpha')!.behavior.dragHandler).toBeUndefined();
    expect(bob.diagram.getNode('alpha')!.behavior.dragHandler).toBeUndefined();
    expectConverged(alice.diagram, bob.diagram);
  });

  it('stroke style: a cleared opacity clears on the peer too', () => {
    const { alice, bob, sync } = twoPeers();
    sync(() => alice.diagram.getStroke('ink')!.setStyle({ opacity: 0.5 }));
    expect(bob.diagram.getStroke('ink')!.getStyle().opacity).toBe(0.5);

    sync(() => alice.diagram.getStroke('ink')!.setStyle({ opacity: undefined }));

    expect(alice.diagram.getStroke('ink')!.getStyle().opacity).toBeUndefined();
    expect(bob.diagram.getStroke('ink')!.getStyle().opacity).toBeUndefined();
    expectConverged(alice.diagram, bob.diagram);
  });
});

// ---------------------------------------------------------------------------
// 3. THE REDUCER GUESSED A MUTATOR BY NAME
// ---------------------------------------------------------------------------

describe('registers whose mutator does not take the register value', () => {
  it('node data reaches the peer AT ALL', () => {
    const { alice, bob, sync } = twoPeers();

    sync(() => alice.diagram.getNode('alpha')!.setData('color', 'red'));

    // `setData(key, value)` takes TWO arguments and the reducer called it with one —
    // the whole rebuilt `data` object as the KEY. The peer stored "[object Object]"
    // and never received `color` at all. Every setData edit was lost, on every peer.
    expect(bob.diagram.getNode('alpha')!.data).toEqual({ color: 'red' });
    expect(Object.keys(bob.diagram.getNode('alpha')!.data)).not.toContain('[object Object]');
    expectConverged(alice.diagram, bob.diagram);
  });

  it('link data reaches the peer AT ALL', () => {
    const { alice, bob, sync } = twoPeers();

    sync(() => alice.diagram.getLink('edge')!.setData('weight', 7));

    expect(bob.diagram.getLink('edge')!.data).toEqual({ weight: 7 });
    expectConverged(alice.diagram, bob.diagram);
  });

  it('a SECOND data key does not evict the first', () => {
    const { alice, bob, sync } = twoPeers();
    sync(() => alice.diagram.getNode('alpha')!.setData('color', 'red'));
    sync(() => alice.diagram.getNode('alpha')!.setData('shape', 'round'));

    expect(bob.diagram.getNode('alpha')!.data).toEqual({ color: 'red', shape: 'round' });
    expectConverged(alice.diagram, bob.diagram);
  });

  it('node scale arrives as a point, not nested inside itself', () => {
    const { alice, bob, sync } = twoPeers();

    sync(() => alice.diagram.getNode('alpha')!.setScale(2, 3));

    // `setScale(x, y)` called with one object gave the peer {x:{x:2,y:3}}.
    expect(bob.diagram.getNode('alpha')!.scale).toEqual({ x: 2, y: 3 });
    expectConverged(alice.diagram, bob.diagram);
  });

  it('node transformOrigin arrives as a point, not nested inside itself', () => {
    const { alice, bob, sync } = twoPeers();

    sync(() => alice.diagram.getNode('alpha')!.setTransformOrigin(0.25, 0.75));

    expect(bob.diagram.getNode('alpha')!.transformOrigin).toEqual({ x: 0.25, y: 0.75 });
    expectConverged(alice.diagram, bob.diagram);
  });

  it('node rotation still goes through its real mutator', () => {
    // The control for the fix above: killing the name-guess must not stop the
    // registers whose `set<Prop>` IS a whole-value writer from using it.
    const { alice, bob, sync } = twoPeers();
    sync(() => alice.diagram.getNode('alpha')!.setRotation(45));
    expect(bob.diagram.getNode('alpha')!.rotation).toBe(45);
    expectConverged(alice.diagram, bob.diagram);
  });
});

// ---------------------------------------------------------------------------
// 4. THE SILENT UNDO — a reducer write that never reached the funnel
// ---------------------------------------------------------------------------

describe('an undo of a register with no dedicated mutator still reaches the peer', () => {
  it('link style', () => {
    const { alice, bob, sync, undoSync } = twoPeers();
    expect(sync(() => alice.diagram.getLink('edge')!.replaceStyle({ stroke: 'red' }))).toBe(1);
    expect(bob.diagram.getLink('edge')!.style.stroke).toBe('red');

    // Before the fix: execute 1 op, undo 0 ops. Bob stayed red forever.
    expect(undoSync()).toBeGreaterThan(0);
    expect(bob.diagram.getLink('edge')!.style.stroke).toBeUndefined();
    expectConverged(alice.diagram, bob.diagram);
  });

  it('node flexConfig', () => {
    const { alice, bob, sync, undoSync } = twoPeers();
    sync(() => alice.diagram.getNode('alpha')!.setFlexItem({ grow: 2 } as never));
    expect(bob.diagram.getNode('alpha')!.flexConfig).toEqual({ grow: 2 });

    expect(undoSync()).toBeGreaterThan(0);
    expect(bob.diagram.getNode('alpha')!.flexConfig).toBeUndefined();
    expectConverged(alice.diagram, bob.diagram);
  });

  it('group isCollapsed', () => {
    const wire: Op[] = [];
    const alice = peer('alice', undefined, wire);
    const bob = peer('bob', alice.diagram);
    alice.diagram.addGroup(new GroupModel({ id: 'cluster', name: 'Cluster' }));
    bob.receive(overTheWire(wire));
    wire.length = 0;

    alice.diagram.getGroup('cluster')!.collapse();
    bob.receive(overTheWire(wire));
    wire.length = 0;
    expect(bob.diagram.getGroup('cluster')!.isCollapsed).toBe(true);

    alice.undo();
    const undoOps = overTheWire(wire);
    bob.receive(undoOps);

    expect(undoOps.length).toBeGreaterThan(0);
    expect(alice.diagram.getGroup('cluster')!.isCollapsed).toBe(false);
    expect(bob.diagram.getGroup('cluster')!.isCollapsed).toBe(false);
    expectConverged(alice.diagram, bob.diagram);
  });

  it('node position — the control case, a real mutator, which always worked', () => {
    const { alice, bob, sync, undoSync } = twoPeers();
    sync(() => alice.diagram.getNode('alpha')!.setPosition(500, 500));
    expect(undoSync()).toBeGreaterThan(0);
    expect(bob.diagram.getNode('alpha')!.position).toMatchObject({ x: 0, y: 0 });
    expectConverged(alice.diagram, bob.diagram);
  });
});

// ---------------------------------------------------------------------------
// 5. THE COMMAND THAT EMITTED NOTHING AT ALL
// ---------------------------------------------------------------------------

describe('SetLinkLabelsCommand over the wire', () => {
  const labelsOf = (...texts: string[]): LinkLabel[] =>
    texts.map((text, i) => ({
      id: `lab-${i}`,
      text,
      position: (i + 1) / (texts.length + 1),
      offset: { x: 0, y: 0 },
    }));

  it('execute AND undo both reach the peer', () => {
    const { alice, bob, sync, undoSync } = twoPeers();
    const cmd = new SetLinkLabelsCommand('edge', labelsOf('one', 'two'));
    const ctx = { diagram: alice.diagram } as unknown as CommandContext;

    // Before the fix BOTH of these were 0: the command assigned `link.labels`
    // directly on execute and on undo, so a whole-array label edit was invisible
    // to every peer in both directions.
    expect(sync(() => cmd.execute(ctx))).toBeGreaterThan(0);
    expect(bob.diagram.getLink('edge')!.labels.map((l) => l.text)).toEqual(['one', 'two']);

    expect(sync(() => cmd.undo(ctx))).toBeGreaterThan(0);
    expect(bob.diagram.getLink('edge')!.labels).toEqual([]);
    expectConverged(alice.diagram, bob.diagram);
  });

  it('replacing a label set removes the labels it dropped, on the peer', () => {
    const { alice, bob, sync } = twoPeers();
    const ctx = { diagram: alice.diagram } as unknown as CommandContext;
    sync(() => new SetLinkLabelsCommand('edge', labelsOf('a', 'b', 'c')).execute(ctx));
    expect(bob.diagram.getLink('edge')!.labels).toHaveLength(3);

    sync(() => new SetLinkLabelsCommand('edge', labelsOf('only')).execute(ctx));

    // A merge would leave three. The register is a value.
    expect(bob.diagram.getLink('edge')!.labels.map((l) => l.text)).toEqual(['only']);
    expectConverged(alice.diagram, bob.diagram);
  });
});

// ---------------------------------------------------------------------------
// 6. HOSTILE / LEGACY TRAFFIC
// ---------------------------------------------------------------------------

describe('logs persisted BEFORE the fix carry the broken shapes', () => {
  const legacy = (target: string, id: string, path: string, value: unknown): Op =>
    ({ op: 'set', target, id, path, value, clock: 999, actor: 'ancient' }) as unknown as Op;

  it('a bare label object (the pre-fix addLabel) is refused, not assigned', () => {
    const { alice, bob, sync } = twoPeers();
    sync(() => alice.diagram.getLink('edge')!.addLabel({ id: 'keep', text: 'K', position: 0.5 }));

    bob.receive([legacy('link', 'edge', 'labels', { id: 'x', text: 'junk', position: 0.5 })]);

    expect(Array.isArray(bob.diagram.getLink('edge')!.labels)).toBe(true);
    expect(bob.diagram.getLink('edge')!.labels.map((l) => l.id)).toEqual(['keep']);
    expect(() => bob.diagram.serialize()).not.toThrow();
  });

  it('a bare null (the pre-fix removeLabel) is refused, not assigned', () => {
    const { bob } = twoPeers();
    bob.receive([legacy('link', 'edge', 'labels', null)]);
    expect(Array.isArray(bob.diagram.getLink('edge')!.labels)).toBe(true);
    expect(() => bob.diagram.serialize()).not.toThrow();
  });

  it('a bare child id (the pre-fix addChild) is refused, not assigned', () => {
    const { bob } = twoPeers();
    bob.receive([legacy('node', 'alpha', 'children', 'beta')]);
    expect(bob.diagram.getNode('alpha')!.children).toBeInstanceOf(Set);
    expect(bob.diagram.getNode('alpha')!.serialize().children).toEqual([]);
  });

  it('a bare class name (the pre-fix addClass) is refused, not assigned', () => {
    const { bob } = twoPeers();
    bob.receive([legacy('node', 'alpha', 'classes', 'ring')]);
    expect(bob.diagram.getNode('alpha')!.classes).toBeInstanceOf(Set);
  });

  it('junk entries inside a collection are dropped, not stored', () => {
    const { bob } = twoPeers();
    bob.receive([legacy('node', 'alpha', 'children', ['beta', 42, null, { id: 'x' }])]);
    expect(bob.diagram.getNode('alpha')!.serialize().children).toEqual(['beta']);
  });
});

// ---------------------------------------------------------------------------
// 7. IDEMPOTENCE — a duplicate delivery must change nothing
// ---------------------------------------------------------------------------

describe('redelivery of these registers is a no-op', () => {
  it.each([
    ['labels', (d: ReturnType<typeof twoPeers>['alice']) =>
      d.diagram.getLink('edge')!.addLabel({ id: 'l', text: 'T', position: 0.5 })],
    ['children', (d: ReturnType<typeof twoPeers>['alice']) =>
      d.diagram.getNode('alpha')!.addChild('beta')],
    ['classes', (d: ReturnType<typeof twoPeers>['alice']) =>
      d.diagram.getNode('alpha')!.addClass('ring')],
    ['data', (d: ReturnType<typeof twoPeers>['alice']) =>
      d.diagram.getNode('alpha')!.setData('color', 'red')],
    ['scale', (d: ReturnType<typeof twoPeers>['alice']) =>
      d.diagram.getNode('alpha')!.setScale(2, 3)],
    ['behavior', (d: ReturnType<typeof twoPeers>['alice']) =>
      d.diagram.getNode('alpha')!.setBehavior({ draggable: false })],
  ])('%s', (_name, edit) => {
    const { wire, alice, bob } = twoPeers();
    edit(alice);
    const ops = overTheWire(wire);
    bob.receive(ops);
    const after = bytes(bob.diagram);
    const version = bob.diagram.getNode('alpha')!.version;

    bob.receive(ops);

    // If the idempotence guard cannot compare like with like, every redelivery
    // rebuilds the register and bumps `version` — which the byte oracle catches.
    expect(bytes(bob.diagram)).toEqual(after);
    expect(bob.diagram.getNode('alpha')!.version).toBe(version);
  });
});
