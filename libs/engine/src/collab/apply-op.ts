// Wave 9 — Card 0: applyOp(model, op).
//
// The reducer the old command stream never had. `Command.serialize()` exists on every
// command in this codebase and NOTHING can deserialize it — the stream is write-only.
// This file is the other half: given a model and an op, produce the next model state,
// deterministically, with no reference to wall time, no random ids, and no dependence
// on anything outside (model, op).
//
// THE CONTRACT, and every later card leans on it:
//
//     Replaying the same ORDERED log from the same start state, on any peer, any
//     number of times, yields a BYTE-IDENTICAL diagram. (serialize() equality — not
//     "looks the same".)
//
// Two disciplines make that true, and both are easy to lose:
//
//   1. NO AMBIENT INPUT. An op carries everything it needs. If a reducer ever reaches
//      for Date.now(), Math.random() or a fresh uuid, replay stops being deterministic
//      and every downstream guarantee dies with it. (This engine has been bitten by
//      exactly that before: three layout adapters seeded from Math.random(), which
//      made layouts untestable and saved diagrams move on reload.)
//
//   2. APPLYING AN OP MUST NOT EMIT AN OP. The capture layer listens to the same model
//      mutations this reducer performs. Without a re-entrancy guard, applying a remote
//      op would capture it as a *local* op, re-broadcast it, and the two peers would
//      ping-pong forever. `applyOps` takes the guard; see OpCapture.

import { DiagramModel } from '../models/DiagramModel';
import { NodeModel } from '../models/NodeModel';
import { LinkModel } from '../models/LinkModel';
import { GroupModel } from '../models/GroupModel';
import { PortModel } from '../models/PortModel';
import type { SerializedNode } from '../models/NodeModel';
import type { SerializedLink } from '../models/LinkModel';
import type { SerializedGroup } from '../models/GroupModel';
import type { SerializedPort } from '../models/PortModel';
import type { Op, OpValue } from './op';

/** Thrown only for a MALFORMED op — never for a merely-losing one. */
export class OpApplyError extends Error {
  constructor(message: string, readonly op: Op) {
    super(message);
    this.name = 'OpApplyError';
  }
}

/**
 * Write a dotted path into a plain object, creating intermediate objects.
 * `metadata.label` → obj.metadata.label.
 */
function setPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.');
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    const next = cur[k];
    if (typeof next !== 'object' || next === null || Array.isArray(next)) {
      cur[k] = {};
    }
    cur = cur[k] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = value;
}

/**
 * Apply ONE op. Returns true if it changed anything.
 *
 * A NO-OP IS NOT AN ERROR, and this is load-bearing rather than lenient. In a
 * distributed log you will legitimately receive:
 *   • a `set` on an entity a concurrent `remove` already deleted,
 *   • a `remove` for something already removed (duplicate delivery, or two peers
 *     deleting the same node),
 *   • an `add` for an id that already exists (the same op delivered twice).
 * Every one of those is normal traffic, not corruption. Throwing on them would mean a
 * single duplicated packet takes down the session. So we IGNORE them and say so by
 * returning false — while still throwing loudly on an op that is genuinely malformed
 * (unknown kind, missing id), because that IS a bug and hiding it helps nobody.
 */
export function applyOp(diagram: DiagramModel, op: Op): boolean {
  switch (op.op) {
    case 'add':
      return applyAdd(diagram, op.target, op.id, op.data);
    case 'remove':
      return applyRemove(diagram, op.target, op.id);
    case 'set':
      return applySet(diagram, op);
    default: {
      const bad = op as { op?: unknown };
      throw new OpApplyError(`unknown op kind: ${String(bad.op)}`, op as Op);
    }
  }
}

function applyAdd(
  diagram: DiagramModel,
  target: 'node' | 'link' | 'group',
  id: string,
  data: SerializedNode | SerializedLink | SerializedGroup
): boolean {
  if (!id) throw new OpApplyError('add op has no id', { op: 'add' } as Op);
  if (!data) throw new OpApplyError(`add op for ${target} ${id} has no data`, { op: 'add' } as Op);

  switch (target) {
    case 'node': {
      const existing = diagram.getNode(id);
      if (existing) {
        if (sameContent(existing.serialize(), data)) return false; // duplicate delivery
        diagram.removeNode(id); // a NEW INCARNATION — see reincarnate() below
      }
      diagram.addNode(NodeModel.fromJSON(data as SerializedNode));
      return true;
    }
    case 'link': {
      const existing = diagram.getLink(id);
      if (existing) {
        if (sameContent(existing.serialize(), data)) return false;
        diagram.removeLink(id);
      }
      diagram.addLink(LinkModel.fromJSON(data as SerializedLink));
      return true;
    }
    case 'group': {
      const existing = diagram.getGroup(id);
      if (existing) {
        if (sameContent(existing.serialize(), data)) return false;
        diagram.removeGroup(id);
      }
      diagram.addGroup(GroupModel.fromJSON(data as SerializedGroup));
      return true;
    }
  }
}

/**
 * WHY AN `add` FOR AN ENTITY THAT ALREADY EXISTS REPLACES IT INSTEAD OF BEING IGNORED.
 *
 * The fuzz found this one and it is the subtlest bug in the wave. It needs a resurrection
 * and an out-of-order delivery, which is to say: a Tuesday.
 *
 *     Alice deletes node C            → remove C @X
 *     Alice presses Ctrl-Z            → add C @Y, carrying her SNAPSHOT of C
 *     Bob receives the ADD before the REMOVE (partial delivery — entirely normal)
 *
 * Bob still has C. The old reducer said "already here: duplicate delivery" and returned
 * false, THROWING THE SNAPSHOT AWAY. The gate, meanwhile, had admitted the add and moved
 * C's presence stamp to Y — so the presence barrier then refused every write older than Y,
 * and Bob's C was frozen in whatever state Bob happened to have it in. When the remove @X
 * finally arrived it was refused as superseded, so Bob never rebuilt C either.
 *
 * Result: Alice's C is her snapshot, Bob's C is a state that exists nowhere else in the
 * system, both peers have seen every op, and nothing anywhere reports a problem.
 *
 * An `add` is not "create if absent". It ESTABLISHES AN INCARNATION: after it, the entity is
 * exactly `data`, and (by the presence barrier) every write older than it is void. That is
 * the only reading under which the barrier is coherent, and it is order-independent, which
 * is the property that actually matters.
 *
 * Identical content is still a no-op, because a duplicate delivery must not bump `version`
 * or fire a re-render — and `version` is precisely what must be ignored when comparing, since
 * it is a per-replica mutation counter and two peers legitimately disagree about it.
 */
function sameContent(a: unknown, b: unknown): boolean {
  return deepEqual(stripVersion(a), stripVersion(b));
}

function stripVersion(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stripVersion);
  if (v && typeof v === 'object') {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>)
        .filter(([k]) => k !== 'version')
        .map(([k, val]) => [k, stripVersion(val)])
    );
  }
  return v;
}

function applyRemove(
  diagram: DiagramModel,
  target: 'node' | 'link' | 'group',
  id: string
): boolean {
  switch (target) {
    case 'node':
      return diagram.removeNode(id) !== undefined;
    case 'link':
      return diagram.removeLink(id) !== undefined;
    case 'group':
      return diagram.removeGroup(id) !== undefined;
  }
}

function applySet(diagram: DiagramModel, op: Extract<Op, { op: 'set' }>): boolean {
  const { target, id, path, value } = op;

  if (target === 'diagram') {
    // The redundant-write guard applies HERE TOO. It did not, and that was a bug: this
    // branch used to return before ever reaching the check below, which made the diagram
    // the one object in the system where re-applying an identical op still bumped the
    // version counter and fired a spurious repaint on every duplicate packet.
    if (deepEqual(readDiagramProp(diagram, path), value)) return false;
    return setDiagramProp(diagram, path, value);
  }

  const entity =
    target === 'node'
      ? diagram.getNode(id)
      : target === 'link'
        ? diagram.getLink(id)
        : diagram.getGroup(id);

  // The entity is gone — a concurrent remove won, or this set arrived before its add.
  // Dropping the write is correct under remove-wins (see CONVERGENCE in op-log.ts):
  // resurrecting an entity from a stray property write would be far worse than losing
  // one property write on a node that no longer exists.
  //
  // Card 4 note: "dropped" is right for a REMOVED entity and WRONG for one that has
  // merely not arrived yet, or that referential integrity is holding in quarantine. Those
  // two cases are caught ABOVE this function, by the Replica — see integrity.ts. applyOp
  // itself stays a pure function of (model, op) and keeps no memory of its own.
  if (!entity) return false;

  return applyEntitySet(entity, path, value);
}

/**
 * Write one property register of an entity that is ALREADY RESOLVED.
 *
 * Split out of applySet so that referential integrity can drive the identical write into
 * an entity it is holding OUTSIDE the diagram (a link quarantined because its endpoint
 * node is gone, see integrity.ts). Same mutators, same idempotence guard, same everything —
 * a quarantined entity that took a DIFFERENT write path would drift from a live one, and
 * that drift would only surface on resurrection, long after the cause.
 */
export function applyEntitySet(
  entity: NodeModel | LinkModel | GroupModel,
  path: string,
  value: OpValue
): boolean {
  // A WRITE THAT CHANGES NOTHING MUST DO NOTHING. This is not an optimisation, it is
  // what makes applyOp IDEMPOTENT, and idempotence is not optional here: redundant sets
  // are ROUTINE traffic (a duplicate delivery, a reconnect replaying the log, a peer
  // catching up from a snapshot that already contains the op).
  //
  // Without this guard, re-applying an identical op still calls setPosition(), which
  // bumps `version`, marks the entity dirty and fires a change event — because
  // trackChange() compares with `===`, and {x:50,y:120} is never `===` to another
  // {x:50,y:120}. So replaying a log twice drifts every version number (caught by the
  // byte-identical replay test, which is the entire reason it demands BYTES and not
  // "looks the same"), and every duplicate packet would trigger a spurious re-render
  // forever.
  if (deepEqual(readEntityProp(entity, path), value)) return false;

  return setEntityProp(entity, path, value);
}

/** Read the register an op path names. Exported for undo, which needs the value a
 *  register held before an op overwrote it. */
export function readProp(entity: NodeModel | LinkModel | GroupModel, path: string): unknown {
  return readEntityProp(entity, path);
}

/** Read the register an op path names, so we can tell a real write from a redundant one. */
function readEntityProp(entity: NodeModel | LinkModel | GroupModel, path: string): unknown {
  if (path.startsWith('metadata.')) {
    return entity.getMetadata(path.slice('metadata.'.length));
  }
  // `ports` is held as a Map but travels as a serialized array — compare like with like, or
  // the idempotence guard never fires and every duplicate delivery rebuilds the collection
  // and bumps `version`, which the byte-identical replay oracle would then catch.
  if (path === 'ports' && entity instanceof NodeModel) {
    return entity.getPorts().map((p) => p.serialize());
  }
  let cur: unknown = entity;
  for (const part of path.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

/**
 * Structural equality over JSON-shaped values.
 *
 * `undefined` and a missing key are the same thing here — an op that clears a metadata
 * key carries `undefined`, and the register genuinely holds nothing afterwards.
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined || a === null || b === null) return a == b;
  if (typeof a !== 'object' || typeof b !== 'object') return false;

  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }

  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const ak = Object.keys(ao);
  const bk = Object.keys(bo);
  if (ak.length !== bk.length) return false;
  return ak.every((k) => Object.prototype.hasOwnProperty.call(bo, k) && deepEqual(ao[k], bo[k]));
}

/**
 * Property writes go through the model's REAL mutators wherever one exists, and only
 * fall back to a generic path write otherwise.
 *
 * That is deliberate and it matters: setPosition() does not merely assign x/y — it
 * updates the spatial index, bumps the version, marks the entity dirty and fires
 * change events. A reducer that reached in and assigned `node.position.x = 4` would
 * produce a model that *looks* right, serializes right, and is invisible to culling,
 * routing and the renderer. It would pass every test in this file and be broken on
 * screen.
 */
function setEntityProp(
  entity: NodeModel | LinkModel | GroupModel,
  path: string,
  value: OpValue
): boolean {
  // METADATA IS A Map, NOT AN OBJECT. This is the trap in this file. A generic
  // `entity.metadata = {...}` assignment produces a model that serializes correctly,
  // passes every replay test, and is quietly broken everywhere else — every
  // getMetadata() call in the engine would hit a plain object and return undefined.
  // The model's own funnel already speaks this exact vocabulary (setMetadata emits
  // trackChange(`metadata.${key}`)), so the op path and the mutator line up 1:1.
  if (path.startsWith('metadata.')) {
    entity.setMetadata(path.slice('metadata.'.length), structuredClone(value));
    return true;
  }

  if (entity instanceof NodeModel) {
    switch (path) {
      case 'ports': {
        // PORTS ARE A Map, exactly like metadata, and exactly as dangerous. There is no
        // setPorts() mutator, so writeGeneric would fall through to a direct assignment and
        // REPLACE THE Map WITH A PLAIN OBJECT — after which getPorts() returns nothing and
        // serialize() throws on ports.values(). Rebuild it the way fromJSON does.
        //
        // A non-array is REFUSED rather than read as "no ports". `ports` always serializes as
        // an array, so a missing value means a bug upstream, and the cost of guessing is a
        // node stripped of every port it has and every link into it orphaned — which is
        // exactly what an undo of the first port-add used to do.
        if (!Array.isArray(value)) return false;
        const incoming = value as unknown as SerializedPort[];
        const wanted = new Map(incoming.map((p) => [p.id, p]));

        // THROUGH THE REAL MUTATORS — addPort/removePort — and NOT by rewriting the Map.
        //
        // This file's own header says property writes must go through the model's mutators,
        // and the first version of this branch broke that rule and paid for it. Rewriting
        // `entity.ports` directly produces a node that serializes perfectly and is invisible
        // to trackChange — which is to say invisible to CAPTURE. So a peer UNDOING its own
        // port-add reverted its screen and BROADCAST NOTHING: every other peer kept the port
        // forever. Two documents, identical logs, no error. The fuzz found it as a node with
        // seven ports on one peer and six on the other.
        //
        // Live PortModels are kept where the id already exists: a port carries connection
        // state and identity that a rebuilt instance would drop on the floor.
        let changed = false;
        for (const p of entity.getPorts()) {
          if (!wanted.has(p.id)) {
            entity.removePort(p.id);
            changed = true;
          }
        }
        for (const p of incoming) {
          if (!entity.ports.has(p.id)) {
            entity.addPort(PortModel.fromJSON(p));
            changed = true;
          }
        }

        // Same SET, possibly a different ORDER — and order is in serialize(). Align it with
        // the incoming collection, which every peer has. No mutator, and none wanted: this
        // reorders nothing the model considers a change.
        if (entity.ports.size === incoming.length) {
          const reordered = incoming
            .map((p) => entity.ports.get(p.id))
            .filter((p): p is PortModel => p !== undefined);
          if (reordered.length === incoming.length) {
            entity.ports.clear();
            for (const p of reordered) entity.ports.set(p.id, p);
          }
        }
        return changed;
      }
      case 'position': {
        const p = value as { x: number; y: number; z?: number };
        entity.setPosition(p.x, p.y, p.z);
        return true;
      }
      case 'size': {
        const s = value as { width: number; height: number; depth?: number };
        entity.setSize(s.width, s.height, s.depth);
        return true;
      }
      case 'state':
        entity.setState(structuredClone(value) as never);
        return true;
      case 'style':
        entity.setStyle(structuredClone(value) as never);
        return true;
    }
  }

  if (entity instanceof LinkModel && path === 'points') {
    entity.setPoints(structuredClone(value) as Array<{ x: number; y: number }>);
    return true;
  }

  return writeGeneric(entity, path, value);
}

/**
 * Anything without a dedicated mutator: `zIndex`, `router`, `pathType`, an author's
 * own field.
 *
 * Prefers a real `set<Prop>()` when the model defines one, because a mutator does more
 * than assign — it updates the spatial index, bumps the version, marks dirty and emits
 * change events. A reducer that reached in and assigned the field directly would build
 * a model that LOOKS right and serializes right while being invisible to culling,
 * routing and the renderer: green tests, broken screen. Direct assignment is the last
 * resort, and it still goes through structuredClone so two entities can never end up
 * aliasing one mutable object — a bug that only appears under concurrency and is then
 * almost impossible to find.
 */
function writeGeneric(
  entity: NodeModel | LinkModel | GroupModel,
  path: string,
  value: OpValue
): boolean {
  const [head, ...rest] = path.split('.');
  const holder = entity as unknown as Record<string, unknown>;
  const cloned = structuredClone(value);

  if (rest.length === 0) {
    const setter = holder[`set${head[0].toUpperCase()}${head.slice(1)}`];
    if (typeof setter === 'function') {
      (setter as (v: unknown) => void).call(entity, cloned);
      return true;
    }
    holder[head] = cloned;
    return true;
  }

  const current = holder[head];
  const next: Record<string, unknown> =
    typeof current === 'object' && current !== null && !Array.isArray(current)
      ? (structuredClone(current) as Record<string, unknown>)
      : {};
  setPath(next, rest.join('.'), cloned);

  const setter = holder[`set${head[0].toUpperCase()}${head.slice(1)}`];
  if (typeof setter === 'function') {
    (setter as (v: unknown) => void).call(entity, next);
    return true;
  }

  holder[head] = next;
  return true;
}

/** Read a diagram-level register, so a redundant write can be recognised as one. */
function readDiagramProp(diagram: DiagramModel, path: string): unknown {
  if (path.startsWith('metadata.')) {
    return diagram.getMetadata(path.slice('metadata.'.length));
  }
  let cur: unknown = diagram;
  for (const part of path.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function setDiagramProp(diagram: DiagramModel, path: string, value: OpValue): boolean {
  // THE DIAGRAM'S metadata IS A Map TOO — and I wrote the comment above warning about
  // exactly this, fixed it for entities, and left the identical bug six lines away. The
  // generic branch below would replace the Map with a plain object: getMetadata() returns
  // undefined forever after, and serialize()'s Object.fromEntries(this.metadata) breaks.
  // Silent, permanent, and it only bites the peer RECEIVING the edit — the one place a
  // single-process test can never look.
  if (path.startsWith('metadata.')) {
    diagram.setMetadata(path.slice('metadata.'.length), structuredClone(value));
    return true;
  }

  switch (path) {
    case 'name':
      diagram.name = String(value);
      return true;
    default: {
      const holder = diagram as unknown as Record<string, unknown>;
      const [head, ...rest] = path.split('.');
      if (rest.length === 0) {
        holder[head] = structuredClone(value);
        return true;
      }
      const current = holder[head];
      const next: Record<string, unknown> =
        typeof current === 'object' && current !== null && !Array.isArray(current)
          ? structuredClone(current as Record<string, unknown>)
          : {};
      setPath(next, rest.join('.'), structuredClone(value));
      holder[head] = next;
      return true;
    }
  }
}
