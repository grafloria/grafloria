// Wave 9 — Card 4: shared test harness.
//
// NOT exported from index.ts — this is scaffolding for the specs, not API.
//
// The convergence ORACLE lives here, and it is the most important thing in the file.
// Card 0 established the discipline and it is kept exactly: content equality, with
// per-entity `version` as the ONLY field permitted to differ (it is a per-replica
// mutation counter — a local quantity, like a vector-clock component, not part of the
// shared document). A test that widened this to make a failure go away would be
// laundering a divergence into a green tick.

import { DiagramModel } from '../models/DiagramModel';
import { NodeModel } from '../models/NodeModel';
import { LinkModel } from '../models/LinkModel';
import { PortModel } from '../models/PortModel';
import { StrokeModel } from '../models/StrokeModel';
import { Replica } from './replica';
import type { ActorId, Op } from './op';

/** serialize() is the byte-level oracle: "looks the same" is not a test. */
export function bytes(d: DiagramModel): string {
  return JSON.stringify(d.serialize());
}

/**
 * Fields that are NOT part of the shared document, and therefore cannot appear in any
 * document-equality oracle.
 *
 *   `version` — a per-replica mutation counter. When two peers race a register the winner
 *               applies two writes and the loser applies one (its remote is REFUSED, which
 *               is exactly what makes them converge), so the counters legitimately differ.
 *
 *   selected / hovered / highlighted / focused
 *             — VIEWER state, added to this list AT MERGE. These live inside NodeState next
 *               to durable facts like `locked`, and capture used to sync the whole object —
 *               so moving your mouse wrote permanent ops into the document and your click
 *               deselected my node (found by wave9/sync in two real browser tabs). Capture
 *               now strips them, so by construction they never travel, and a peer will not
 *               have them. Demanding that they match would be demanding the bug back.
 *
 * The safeguard that stops this being oracle-weakening: `expectConverged` asserts that
 * NOTHING ELSE in the entire document differs. We are not deleting fields until the suite
 * goes green; we are stating exactly what is local and proving everything else is shared.
 */
const NOT_DOCUMENT = ['version', 'selected', 'hovered', 'highlighted', 'focused'];

/** The document minus the per-replica and per-viewer fields. See the header. */
export function contentBytes(d: DiagramModel): string {
  const strip = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(strip);
    if (v && typeof v === 'object') {
      return Object.fromEntries(
        Object.entries(v as Record<string, unknown>)
          .filter(([k]) => !NOT_DOCUMENT.includes(k))
          .map(([k, val]) => [k, strip(val)])
      );
    }
    return v;
  };
  return JSON.stringify(strip(d.serialize()));
}

/** Every leaf of the document as path->value, for a diff that names the field. */
export function flatten(
  v: unknown,
  path = '',
  out: Record<string, string> = {}
): Record<string, string> {
  if (v && typeof v === 'object') {
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      flatten(val, `${path}.${k}`, out);
    }
  } else {
    out[path] = JSON.stringify(v);
  }
  return out;
}

/**
 * ASSERT CONVERGENCE between two peers.
 *
 * Two assertions, and the second is what stops the first from being a cop-out:
 *   1. the CONTENT is identical;
 *   2. `version` is the ONLY field anywhere in the document that differs.
 * Any other divergence — one field, one node, anywhere — still fails.
 */
export function expectConverged(a: DiagramModel, b: DiagramModel, context: unknown = {}): void {
  // The NAMED-FIELD check runs first, purely so a failure is readable: it reports
  // `nodes.3.position.x` rather than two 3KB JSON blobs that a human has to diff by eye. The
  // whole-document check below is still the one that decides, and it is strictly stronger —
  // it catches a field PRESENT on one side and ABSENT on the other, key order, everything.
  const fa = flatten(JSON.parse(bytes(a)));
  const fb = flatten(JSON.parse(bytes(b)));
  const keys = new Set([...Object.keys(fa), ...Object.keys(fb)]);
  const differing = [...keys]
    .filter(
      (k) => fa[k] !== fb[k] && !NOT_DOCUMENT.some((local) => k.endsWith(`.${local}`))
    )
    .map((k) => `${k}: ${fa[k]} != ${fb[k]}`);
  expect({ ...(context as object), differing }).toEqual({ ...(context as object), differing: [] });

  expect({ ...(context as object), doc: contentBytes(a) }).toEqual({
    ...(context as object),
    doc: contentBytes(b),
  });
}

/** A node with an in port and an out port, at a known id. */
export function node(id: string, x: number, y: number): NodeModel {
  const n = new NodeModel({
    type: 'basic',
    position: { x, y },
    size: { width: 120, height: 60 },
  });
  (n as unknown as { id: string }).id = id;
  n.addPort(new PortModel({ id: `${id}-out`, type: 'output', side: 'right' }));
  n.addPort(new PortModel({ id: `${id}-in`, type: 'input', side: 'left' }));
  return n;
}

/** A link between two nodes' ports, at a known id. */
export function link(id: string, from: string, to: string): LinkModel {
  const l = new LinkModel(`${from}-out`, `${to}-in`, 'orthogonal');
  (l as unknown as { id: string }).id = id;
  return l;
}

/** A short ink stroke at a known id — the whiteboard content the fuzz must converge on. */
export function stroke(id: string, x: number, y: number): StrokeModel {
  return new StrokeModel(
    [
      { x, y },
      { x: x + 10, y: y + 4 },
      { x: x + 22, y: y + 1 },
    ],
    { color: '#1f2933', width: 3 },
    { id }
  );
}

/**
 * A peer joining a session.
 *
 * It takes the SOURCE DOCUMENT'S identity, because that is where a real peer gets it: an
 * op log carries CONTENT, not the identity of the document it belongs to. You join by
 * loading a snapshot (which carries id/uuid) and replaying the op tail onto it.
 */
export function peer(actor: ActorId, seed?: DiagramModel, sink?: Op[]): Replica {
  const d = seed
    ? new DiagramModel(seed.name, { id: seed.id, uuid: seed.uuid })
    : new DiagramModel('shared');
  return new Replica(d, { actor, onLocalOp: sink ? (o) => sink.push(o) : undefined });
}

/** A seeded PRNG. A flaky fuzz is worse than no fuzz — a failure must be reproducible. */
export function rng(seed: number): { next: () => number; pick: <T>(xs: readonly T[]) => T } {
  let s = seed >>> 0;
  const next = () => {
    // xorshift32 — a full-period generator. (The LCG in Card 0's fuzz has a badly
    // non-random low bit, which is exactly the bit `rand() < 0.5` reads.)
    s ^= s << 13;
    s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 0x100000000;
  };
  return { next, pick: <T,>(xs: readonly T[]): T => xs[Math.floor(next() * xs.length)] };
}
