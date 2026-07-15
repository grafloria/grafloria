// wave14/model — DEFECT 3: `behaviorOverrides` deleted; legacy documents must still load.
//
// The chain (NodeModel field + accessors + serialize/deserialize branches +
// DiagramEngine.getNodeBehaviorForMode) was dead machinery: the engine method was the only
// reader and IT had no caller outside its own spec. The real read-only mechanism has been
// the wave-9 ReadonlyLock since it shipped. Deleting code is easy; the part that needs a
// test is the WRITTEN RECORD: documents saved by older engines carry the key, and they
// must keep loading forever.
//
// ON THE ROUND-TRIP INVARIANT, precisely: the byte-identical serialize() oracle
// (op-log/card1) is enforced for CURRENT WRITER OUTPUT — load(save(x)) must reproduce
// save(x) for any x the current engine can save. It has never promised byte-identity for
// LEGACY input; migrations already rewrite old payloads on load (see DiagramMigrations).
// A legacy document that carried `behaviorOverrides` therefore re-saves WITHOUT the key,
// and that is the CORRECT output of the current writer — asserted exactly below.

import { DiagramModel } from './DiagramModel';
import { NodeModel, SerializedNode } from './NodeModel';

function legacyNodePayload(): SerializedNode & { behaviorOverrides: unknown } {
  return {
    id: 'n1',
    uuid: 'u-n1',
    type: 'basic',
    version: 7,
    metadata: {},
    position: { x: 10, y: 20 },
    size: { width: 100, height: 50 },
    rotation: 0,
    scale: { x: 1, y: 1 },
    parentId: undefined,
    children: [],
    ports: [],
    state: {
      visible: true, locked: false, selected: false, hovered: false,
      focused: false, expanded: true, enabled: true,
    },
    behavior: {
      selectable: true, draggable: true, resizable: true, rotatable: false,
      deletable: true, editable: true, connectable: true, groupable: true, cloneable: true,
    },
    style: {},
    data: { label: 'Legacy' },
    positionMode: 'absolute',
    transformOrigin: { x: 0.5, y: 0.5 },
    // The retired key, exactly as an older engine wrote it:
    behaviorOverrides: { running: { draggable: true }, view: { selectable: false } },
  } as SerializedNode & { behaviorOverrides: unknown };
}

describe('DEFECT 3 — legacy `behaviorOverrides` keys: tolerated on load, dropped on save', () => {
  it('a serialized node WITH a behaviorOverrides key deserializes cleanly', () => {
    const node = NodeModel.fromJSON(legacyNodePayload());

    expect(node.id).toBe('n1');
    expect(node.uuid).toBe('u-n1');
    expect(node.version).toBe(7);
    expect(node.getData('label')).toBe('Legacy');
    expect(node.position).toMatchObject({ x: 10, y: 20 });
    // The retired key left no residue on the model.
    expect((node as unknown as Record<string, unknown>)['behaviorOverrides']).toBeUndefined();
  });

  it('…and RE-SAVES without the key — the correct current-writer output', () => {
    const node = NodeModel.fromJSON(legacyNodePayload());
    const resaved = node.serialize();

    expect('behaviorOverrides' in resaved).toBe(false);

    // The rest of the document survived the trip: the re-save equals the legacy payload
    // minus exactly the retired key — nothing else changed, nothing else was dropped.
    const expected = { ...legacyNodePayload() } as Record<string, unknown>;
    delete expected['behaviorOverrides'];
    expect(JSON.parse(JSON.stringify(resaved))).toEqual(JSON.parse(JSON.stringify(expected)));
  });

  it('the round-trip invariant holds where it is enforced: on CURRENT writer output', () => {
    // load(save(x)) reproduces save(x) byte-for-byte for what the current engine writes.
    // (Legacy input is migrated-not-mirrored by design; the previous test pins that.)
    const node = NodeModel.fromJSON(legacyNodePayload());
    const once = node.serialize();
    const twice = NodeModel.fromJSON(once).serialize();
    expect(JSON.stringify(twice)).toEqual(JSON.stringify(once));
  });

  it('a whole legacy DIAGRAM carrying the key loads through DiagramModel.fromJSON', () => {
    const doc = {
      schemaVersion: 3,
      id: 'd1', uuid: 'u-d1', type: 'diagram', version: 1, metadata: {}, name: 'legacy',
      nodes: [legacyNodePayload()],
      links: [], groups: [],
      viewport: { x: 0, y: 0, width: 1200, height: 800, zoom: 1 },
    };

    const d = DiagramModel.fromJSON(doc as never);
    expect(d.getNode('n1')).toBeDefined();
    expect('behaviorOverrides' in d.getNode('n1')!.serialize()).toBe(false);
  });
});
