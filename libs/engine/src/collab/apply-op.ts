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
      if (diagram.getNode(id)) return false; // already here: duplicate delivery
      const node = NodeModel.fromJSON(data as SerializedNode);
      diagram.addNode(node);
      return true;
    }
    case 'link': {
      if (diagram.getLink(id)) return false;
      const link = LinkModel.fromJSON(data as SerializedLink);
      diagram.addLink(link);
      return true;
    }
    case 'group': {
      if (diagram.getGroup(id)) return false;
      const group = GroupModel.fromJSON(data as SerializedGroup);
      diagram.addGroup(group);
      return true;
    }
  }
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
        const incoming = (Array.isArray(value) ? value : []) as unknown as SerializedPort[];
        const next = new Map<string, PortModel>();
        for (const p of incoming) {
          // Reuse the LIVE PortModel where the id already exists: ports carry connection
          // state and identity that a rebuilt instance would drop on the floor.
          const existing = entity.ports.get(p.id);
          next.set(p.id, existing ?? PortModel.fromJSON(p));
        }
        entity.ports.clear();
        for (const [id, p] of next) entity.ports.set(id, p);
        return true;
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

function setDiagramProp(diagram: DiagramModel, path: string, value: OpValue): boolean {
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
