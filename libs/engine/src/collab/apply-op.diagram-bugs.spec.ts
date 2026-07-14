// Wave 9 — two bugs in MY OWN Card-0 reducer, found by the wave9/comments agent.
//
// The first is the one I am least proud of. apply-op.ts contains a large comment block
// explaining that `metadata` is a Map and that a generic object assignment would produce
// a model which serializes correctly while every getMetadata() in the engine silently
// returns undefined. I wrote that. I fixed it for ENTITIES. And I left precisely that bug
// in the DIAGRAM path, six lines away.
//
// The second: applySet() early-returns into setDiagramProp() BEFORE reaching the
// redundant-write guard, so the diagram is the one object in the system where re-applying
// an identical op still bumps the version counter.

import { DiagramModel } from '../models/DiagramModel';
import { applyOp } from './apply-op';
import type { Op } from './op';

describe('applyOp on the DIAGRAM itself (bugs found by wave9/comments)', () => {
  it('writes diagram metadata through setMetadata — the Map must survive', () => {
    const d = new DiagramModel('d');
    d.setMetadata('reviewed', true);

    // …now the same edit arriving at a PEER as an op. The peer inherits the document's
    // identity (that comes from the snapshot at join time, not from the op stream), so
    // byte-equality is a fair oracle here.
    const peer = new DiagramModel('d', { id: d.id, uuid: d.uuid });
    applyOp(peer, {
      op: 'set', target: 'diagram', id: '', path: 'metadata.reviewed', value: true,
      clock: 1, actor: 'a',
    } as Op);

    // Before the fix: `metadata` was replaced by a plain object. serialize() does
    // Object.fromEntries(this.metadata) — which throws or yields nonsense — and every
    // getMetadata() call in the engine returns undefined FOREVER.
    expect(peer.metadata instanceof Map).toBe(true);
    expect(peer.getMetadata('reviewed')).toBe(true);
    expect(() => peer.serialize()).not.toThrow();
    expect(JSON.stringify(peer.serialize())).toEqual(JSON.stringify(d.serialize()));
  });

  it('a redundant write to a diagram register does nothing — same rule as entities', () => {
    const d = new DiagramModel('d');
    const op: Op = {
      op: 'set', target: 'diagram', id: '', path: 'name', value: 'Renamed',
      clock: 1, actor: 'a',
    } as Op;

    expect(applyOp(d, op)).toBe(true);
    const after = d.version;

    // Re-delivery is routine (reconnect, mesh relay). It must cost nothing — including
    // not bumping the version counter, which is what makes two peers' saved bytes differ.
    expect(applyOp(d, op)).toBe(false);
    expect(d.version).toBe(after);
  });
});
