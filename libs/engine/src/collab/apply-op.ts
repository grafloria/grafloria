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
import { StrokeModel } from '../models/StrokeModel';
import { PortModel } from '../models/PortModel';
import type { SerializedNode } from '../models/NodeModel';
import type { SerializedLink } from '../models/LinkModel';
import type { SerializedGroup } from '../models/GroupModel';
import type { SerializedStroke } from '../models/StrokeModel';
import type { SerializedPort } from '../models/PortModel';
import { setValueOf, type Op, type OpValue, type OpTarget } from './op';

/** Any entity an op can target (everything but the diagram singleton). */
type Entity = NodeModel | LinkModel | GroupModel | StrokeModel;
type EntityTarget = Exclude<OpTarget, 'diagram'>;

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
  target: EntityTarget,
  id: string,
  data: SerializedNode | SerializedLink | SerializedGroup | SerializedStroke
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
    case 'stroke': {
      // wave10/whiteboard: a stroke `add` is the whole ink, minted once at pointerup. It is
      // an INCARNATION like every other add — an already-present stroke is replaced, not
      // ignored — so the presence barrier (older writes void) is coherent for ink too.
      const existing = diagram.getStroke(id);
      if (existing) {
        if (sameContent(existing.serialize(), data)) return false;
        diagram.removeStroke(id);
      }
      diagram.addStroke(StrokeModel.fromJSON(data as SerializedStroke));
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
  target: EntityTarget,
  id: string
): boolean {
  switch (target) {
    case 'node':
      return diagram.removeNode(id) !== undefined;
    case 'link':
      return diagram.removeLink(id) !== undefined;
    case 'group':
      return diagram.removeGroup(id) !== undefined;
    case 'stroke':
      return diagram.removeStroke(id) !== undefined;
  }
}

function applySet(diagram: DiagramModel, op: Extract<Op, { op: 'set' }>): boolean {
  const { target, id, path } = op;
  // Clears are normalised to `undefined` HERE, in one place: an explicit `clear: true`
  // (wave14) and an absent value key (every pre-wave14 log — JSON dropped the undefined)
  // apply identically. See setValueOf.
  const value = setValueOf(op);

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
        : target === 'group'
          ? diagram.getGroup(id)
          : diagram.getStroke(id);

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
  entity: Entity,
  path: string,
  value: OpValue | undefined
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
export function readProp(entity: Entity, path: string): unknown {
  return readEntityProp(entity, path);
}

/** Read the register an op path names, so we can tell a real write from a redundant one. */
function readEntityProp(entity: Entity, path: string): unknown {
  if (path.startsWith('metadata.')) {
    return entity.getMetadata(path.slice('metadata.'.length));
  }
  // A PER-PORT register (wave14): `ports.<portId>` holds one serialized port, minus
  // `version` — which is a per-replica mutation counter, excluded from the wire value at
  // capture for the same reason the convergence oracle exempts it. Strip it here too, or
  // the idempotence guard would compare a local counter against a remote one and never
  // fire. An absent port reads as undefined: the register is empty.
  if (path.startsWith('ports.') && entity instanceof NodeModel) {
    const port = entity.getPort(path.slice('ports.'.length));
    if (!port) return undefined;
    const { version: _version, ...data } = port.serialize();
    return data;
  }
  // LEGACY: the whole-collection `ports` register. Held as a Map but travels as a
  // serialized array — compare like with like, or the idempotence guard never fires and
  // every duplicate delivery rebuilds the collection and bumps `version`, which the
  // byte-identical replay oracle would then catch.
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
 * `undefined` and `null` are NOT the same thing here, and the old `a == b` on the line
 * below said they were. `undefined` means THE REGISTER IS EMPTY (a cleared metadata
 * key, an absent port); `null` is a VALUE a user can store. Conflating them made the
 * idempotence guard drop a peer's `set(metadata.note, null)` as "redundant" against an
 * empty register — the value never landed, and only on the RECEIVING side, the one
 * place a single-process test never looks. Storing null and clearing must stay
 * distinguishable end to end (op.ts's clear is explicit for the same reason).
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined || a === null || b === null) return false;
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
  entity: Entity,
  path: string,
  value: OpValue | undefined
): boolean {
  // A CLEAR (value normalised to undefined — explicit `clear: true`, or the absent value
  // key every old log encodes). The register is EMPTIED, not set to a value: the
  // metadata KEY is deleted (a Map that keeps the key with an undefined value only looks
  // identical until someone calls `has()` — the receiving side used to diverge exactly
  // there), and a cleared port register means the port is REMOVED, through the real
  // mutator.
  if (value === undefined) return clearEntityProp(entity, path);

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

  // A PER-PORT register (wave14): add if absent, update IN PLACE if present.
  //
  // THROUGH THE REAL MUTATORS, never a raw field write — node.ports is a Map and the
  // original whole-collection bug replaced it with a plain object, after which
  // getPorts() returned nothing and serialize() threw. addPort/removePort also emit
  // port:added/port:removed, which is what keeps DiagramModel's portIndex current on
  // the receiving peer.
  //
  // IN PLACE matters for a reason that is easy to miss: serialize() writes ports in Map
  // insertion order, and order is part of the document. The AUTHOR of a port edit
  // mutated the port where it stood; a receiver that did remove+add would move it to
  // the end and the two would save byte-different files. (It would also drop the port's
  // live connection state, which a rebuilt instance does not carry.)
  if (path.startsWith('ports.') && entity instanceof NodeModel) {
    const portId = path.slice('ports.'.length);
    const data = value as unknown as SerializedPort;
    const existing = entity.getPort(portId);
    if (!existing) {
      entity.addPort(PortModel.fromJSON(structuredClone(data)));
      return true;
    }
    return updatePortInPlace(existing, data);
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
 * EMPTY a register — the apply half of an explicit clear (and of every old log's
 * clear-by-omission).
 */
function clearEntityProp(entity: Entity, path: string): boolean {
  // The KEY is deleted. setMetadata(key, undefined) — which is what the old
  // missing-as-undefined accident amounted to — leaves the key in the Map holding
  // undefined: serialize() happens to drop it (JSON), so every byte oracle stayed green,
  // but `metadata.has(key)` answered true on the receiver and false on the author.
  if (path.startsWith('metadata.')) {
    entity.deleteMetadata(path.slice('metadata.'.length));
    return true;
  }

  // A cleared per-port register is the port's REMOVAL — through the real mutator, which
  // fires port:removed and keeps the diagram's portIndex honest.
  if (path.startsWith('ports.') && entity instanceof NodeModel) {
    return entity.removePort(path.slice('ports.'.length)) !== undefined;
  }

  // The legacy whole-collection register is never cleared — no version of capture ever
  // emitted that — so a clear here is malformed traffic; refuse it rather than strip a
  // node of every port it has on a guess.
  if (path === 'ports' && entity instanceof NodeModel) return false;

  // Generic: empty the slot the way the author's clear did (clearFlexItem assigns
  // undefined and fires trackChange; there is no removeFlexConfig mutator to prefer).
  const [head, ...rest] = path.split('.');
  const holder = entity as unknown as Record<string, unknown>;
  if (rest.length === 0) {
    holder[head] = undefined;
    return true;
  }
  const current = holder[head];
  const next: Record<string, unknown> =
    typeof current === 'object' && current !== null && !Array.isArray(current)
      ? (structuredClone(current) as Record<string, unknown>)
      : {};
  setPath(next, rest.join('.'), undefined);
  holder[head] = next;
  return true;
}

/**
 * Update a LIVE port from its register value, in place.
 *
 * The live instance is KEPT — it carries connection state and its position in the
 * node's ports Map (which is serialize() order, i.e. part of the document) — and its
 * fields are brought to the register value. Geometry goes through the port's REAL
 * mutators (setPosition/setAlignment/setOffset fire trackChange, which is what lets a
 * peer's capture re-emit when this runs under a LIVE capture — the undo path — and what
 * keeps renderers listening on the port informed). Registry-backed fields go through
 * their mutators for the same reason. The remaining declarative config is plain data
 * with no mutator to prefer; it is assigned, cloned, exactly as fromJSON does.
 *
 * `version` is deliberately untouched: it is a per-replica counter, excluded from the
 * wire value at capture, and the mutators below advance it as a real mutation should.
 */
function updatePortInPlace(port: PortModel, data: SerializedPort): boolean {
  let changed = false;

  if (!deepEqual({ ...port.position }, data.position)) {
    port.setPosition(structuredClone(data.position));
    changed = true;
  }
  if (!deepEqual({ ...port.alignment }, data.alignment)) {
    port.setAlignment(structuredClone(data.alignment));
    changed = true;
  }
  if (!deepEqual({ ...port.offset }, data.offset)) {
    port.setOffset(structuredClone(data.offset));
    changed = true;
  }
  // AFTER setAlignment, which forces explicitSide=true — the register value decides.
  if (port.explicitSide !== (data.explicitSide === true)) {
    port.explicitSide = data.explicitSide === true;
    changed = true;
  }

  // allowedTypes is a Set; its mutators are the funnel (and they trackChange).
  const wantTypes = new Set(data.allowedTypes ?? []);
  for (const t of [...port.allowedTypes]) {
    if (!wantTypes.has(t)) {
      port.removeAllowedType(t);
      changed = true;
    }
  }
  for (const t of wantTypes) {
    if (!port.allowedTypes.has(t)) {
      port.addAllowedType(t);
      changed = true;
    }
  }

  // metadata is a Map — same discipline as every other Map in this file.
  const wantMeta = (data.metadata ?? {}) as Record<string, unknown>;
  for (const k of [...port.metadata.keys()]) {
    if (!(k in wantMeta)) {
      port.deleteMetadata(k);
      changed = true;
    }
  }
  for (const [k, v] of Object.entries(wantMeta)) {
    if (!deepEqual(port.getMetadata(k), v)) {
      port.setMetadata(k, structuredClone(v));
      changed = true;
    }
  }

  if (!deepEqual(port.renderingConfig, data.renderingConfig)) {
    port.setRenderingConfig(structuredClone(data.renderingConfig));
    changed = true;
  }

  // The serialize() sentinel: null means unlimited (Infinity is not JSON-representable).
  const wantMax = data.maxConnections === null || data.maxConnections === undefined
    ? Infinity
    : data.maxConnections;
  if (port.maxConnections !== wantMax) {
    port.maxConnections = wantMax;
    changed = true;
  }

  // Declarative config: plain values, assigned as fromJSON assigns them. `undefined`
  // incoming means the author UNSET the field, and unset must travel too.
  const assign = <K extends keyof PortModel>(key: K, want: PortModel[K]): void => {
    if (deepEqual(port[key], want)) return;
    (port as Record<K, unknown>)[key] = typeof want === 'object' && want !== null ? structuredClone(want) : want;
    changed = true;
  };
  assign('type', data.type);
  assign('systemType', data.systemType);
  assign('nodeId', data.nodeId);
  assign('index', data.index ?? 0);
  assign('visible', data.visible);
  assign('style', (data.style ?? {}) as PortModel['style']);
  assign('data', (data.data ?? {}) as PortModel['data']);
  assign('group', data.group);
  assign('shape', data.shape);
  assign('label', data.label);
  assign('layout', data.layout);
  assign('fromSpot', data.fromSpot);
  assign('toSpot', data.toSpot);
  assign('spread', data.spread);
  assign('dataType', data.dataType);
  assign('isConnectableStart', data.isConnectableStart);
  assign('isConnectableEnd', data.isConnectableEnd);
  assign('fromMaxLinks', data.fromMaxLinks);
  assign('toMaxLinks', data.toMaxLinks);
  assign('allowSelfLink', data.allowSelfLink);
  assign('allowDuplicateLinks', data.allowDuplicateLinks);
  assign('dynamic', data.dynamic);

  return changed;
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
  entity: Entity,
  path: string,
  value: OpValue | undefined
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

function setDiagramProp(diagram: DiagramModel, path: string, value: OpValue | undefined): boolean {
  // THE DIAGRAM'S metadata IS A Map TOO — and I wrote the comment above warning about
  // exactly this, fixed it for entities, and left the identical bug six lines away. The
  // generic branch below would replace the Map with a plain object: getMetadata() returns
  // undefined forever after, and serialize()'s Object.fromEntries(this.metadata) breaks.
  // Silent, permanent, and it only bites the peer RECEIVING the edit — the one place a
  // single-process test can never look.
  if (path.startsWith('metadata.')) {
    // A clear DELETES the key (see clearEntityProp — the Map must not keep a key
    // holding undefined); a value is stored through the mutator.
    if (value === undefined) diagram.deleteMetadata(path.slice('metadata.'.length));
    else diagram.setMetadata(path.slice('metadata.'.length), structuredClone(value));
    return true;
  }

  switch (path) {
    case 'name':
      // A name is never cleared — no capture path emits that — so a clear here is
      // malformed traffic; refuse it rather than store the string "undefined".
      if (value === undefined) return false;
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
