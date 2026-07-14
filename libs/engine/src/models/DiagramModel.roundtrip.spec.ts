// Provable save/load round-trip — the contract for the unified load path.
//
// The invariant under test: serialize(fromJSON(serialize(d))) deep-equals
// serialize(d), AND a loaded diagram is wired identically to an authored one
// (diagram back-refs, spatial index, port index, listeners, port-connection
// registries, version parity, clean change log).

import { DiagramModel } from './DiagramModel';
import { NodeModel } from './NodeModel';
import { PortModel } from './PortModel';
import { LinkModel } from './LinkModel';
import { GroupModel } from './GroupModel';
import { StrokeModel } from './StrokeModel';
import { DiagramSerializer } from '../serialization/Serializer';
import { DiagramValidationError } from '../serialization/DiagramValidator';
import { DIAGRAM_SCHEMA_VERSION } from '../serialization/DiagramMigrations';

/** JSON round-trip: also proves the payload is JSON-safe (no circular refs). */
function throughJSON<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function buildRichDiagram(): { diagram: DiagramModel; linkId: string } {
  const diagram = new DiagramModel('roundtrip-rich');
  diagram.setMetadata('author', 'roundtrip-spec');
  diagram.viewport = { x: 12, y: -30, width: 1440, height: 900, zoom: 1.5 };

  const a = new NodeModel({
    id: 'node-a',
    type: 'rect',
    position: { x: 10, y: 20 },
    size: { width: 120, height: 60 },
  });
  a.ports.clear(); // curated port set (defaults removed)
  const aOut = new PortModel({ id: 'a-out', type: 'output', side: 'right', maxConnections: 1 });
  aOut.nodeId = 'node-a';
  a.ports.set(aOut.id, aOut);
  a.rotation = 15;
  a.style = { fill: '#fef3c7', strokeWidth: 2 };
  a.data = { label: 'Source', weight: 3 };
  a.setMetadata('shape', { type: 'rect', cornerRadius: 6 });

  const b = new NodeModel({
    id: 'node-b',
    type: 'rect',
    position: { x: 400, y: 220 },
    size: { width: 140, height: 80 },
  });
  b.ports.clear();
  const bIn = new PortModel({ id: 'b-in', type: 'input', side: 'left' });
  bIn.nodeId = 'node-b';
  b.ports.set(bIn.id, bIn);
  const bAux = new PortModel({ id: 'b-aux', type: 'bi', side: 'bottom', index: 1 });
  bAux.nodeId = 'node-b';
  b.ports.set(bAux.id, bAux);

  diagram.addNode(a);
  diagram.addNode(b);

  const link = new LinkModel('a-out', 'b-in', 'orthogonal');
  link.style = { stroke: '#059669', strokeWidth: 2 };
  link.data = { kind: 'flow' };
  link.labels = [
    { id: 'lbl-1', text: 'transfers', position: 0.5, offset: { x: 0, y: -12 } } as any,
  ];
  diagram.addLink(link);
  // Interactive connection registry (what reconcile must reproduce on load)
  aOut.addConnection(link.id);
  bIn.addConnection(link.id);

  const outer = new GroupModel({ id: 'g-outer', name: 'Outer' });
  const inner = new GroupModel({ id: 'g-inner', name: 'Inner' });
  diagram.addGroup(outer);
  diagram.addGroup(inner);
  outer.position = { x: 5, y: 6 };
  outer.size = { width: 320, height: 240, depth: 0 };
  outer.addMember('node-a', diagram);
  outer.addMember('g-inner', diagram); // nested group (containment tree)
  inner.addMember('node-b', diagram);

  // wave10/whiteboard — INK IN THE FIXTURE, and this is the point of putting it here
  // rather than in a spec of its own.
  //
  // The round-trip invariant above is a whole-payload deep-equal over THIS fixture. It
  // iterates over nothing; it asserts on what it is given. So a new entity kind that
  // round-trips losslessly and a new entity kind that is DROPPED ENTIRELY ON LOAD both
  // pass it — vacuously — unless the fixture actually contains one. That is precisely
  // the shape of bug this repository keeps shipping, and a "lossless serialization"
  // suite that cannot see strokes is exactly a test wired to nothing.
  //
  // Both flavours, because they serialize down different branches:
  const pen = new StrokeModel(
    [
      { x: 10, y: 10 },
      { x: 40, y: 65 },
      { x: 90, y: 20 },
    ],
    { color: '#dc2626', width: 3, opacity: 0.9 },
    { id: 'stroke-pen', label: 'circled for review' } // labelled → in the a11y tree
  );
  const inked = new StrokeModel(
    [
      { x: 200, y: 10, pressure: 0.15 },
      { x: 240, y: 40, pressure: 0.8 },
      { x: 280, y: 12, pressure: 0.35 },
    ],
    { color: '#1f2933', width: 5 } // pressure-bearing, unlabelled → aria-hidden ink
  );
  inked.setMetadata('tool', 'pen');
  diagram.addStroke(pen);
  diagram.addStroke(inked);

  return { diagram, linkId: link.id };
}

describe('DiagramModel round-trip (unified load path)', () => {
  it('serialize → fromJSON → serialize is lossless (deep-equal, JSON-safe)', () => {
    const { diagram } = buildRichDiagram();
    const s1 = throughJSON(diagram.serialize());
    const restored = DiagramModel.fromJSON(throughJSON(s1));
    const s2 = throughJSON(restored.serialize());
    expect(s2).toEqual(s1);
  });

  it('stays byte-stable across repeated save/load cycles (no accretion)', () => {
    const { diagram } = buildRichDiagram();
    const s1 = throughJSON(diagram.serialize());
    const d2 = DiagramModel.fromJSON(throughJSON(s1));
    const s2 = throughJSON(d2.serialize());
    const d3 = DiagramModel.fromJSON(throughJSON(s2));
    const s3 = throughJSON(d3.serialize());
    expect(s3).toEqual(s1);
  });

  it('does NOT duplicate auto-created default ports across a round-trip', () => {
    const d = new DiagramModel('defaults');
    const n = new NodeModel({ id: 'n1', type: 'rect', position: { x: 0, y: 0 } });
    const defaultCount = n.getPorts().length; // constructor auto-creates these
    expect(defaultCount).toBeGreaterThan(0);
    d.addNode(n);

    const restored = DiagramModel.fromJSON(throughJSON(d.serialize()));
    expect(restored.getNode('n1')!.getPorts().length).toBe(defaultCount);

    // and the cycle after that too (the old bug grew the set every cycle)
    const restored2 = DiagramModel.fromJSON(throughJSON(restored.serialize()));
    expect(restored2.getNode('n1')!.getPorts().length).toBe(defaultCount);
  });

  it('restores a node saved with ZERO ports as having zero ports', () => {
    const d = new DiagramModel('no-ports');
    const n = new NodeModel({ id: 'n1', type: 'rect', position: { x: 0, y: 0 } });
    n.ports.clear();
    d.addNode(n);
    const restored = DiagramModel.fromJSON(throughJSON(d.serialize()));
    expect(restored.getNode('n1')!.getPorts().length).toBe(0);
  });

  it('round-trips an empty diagram', () => {
    const d = new DiagramModel('empty');
    const s1 = throughJSON(d.serialize());
    const s2 = throughJSON(DiagramModel.fromJSON(throughJSON(s1)).serialize());
    expect(s2).toEqual(s1);
  });

  it('preserves entity identity: diagram/node/port/link/group ids AND uuids', () => {
    const { diagram, linkId } = buildRichDiagram();
    const restored = DiagramModel.fromJSON(throughJSON(diagram.serialize()));

    expect(restored.id).toBe(diagram.id);
    expect(restored.uuid).toBe(diagram.uuid);
    expect(restored.getNode('node-a')!.uuid).toBe(diagram.getNode('node-a')!.uuid);
    expect(restored.getPortById('a-out')!.uuid).toBe(diagram.getPortById('a-out')!.uuid);
    expect(restored.getLink(linkId)!.uuid).toBe(diagram.getLink(linkId)!.uuid);
    expect(restored.getGroup('g-outer')!.uuid).toBe(diagram.getGroup('g-outer')!.uuid);
    expect(restored.getStroke('stroke-pen')!.uuid).toBe(diagram.getStroke('stroke-pen')!.uuid);
  });

  // wave10/whiteboard. The deep-equal above would catch a lossy stroke round-trip, but it
  // would report it as "some object differs somewhere in a 400-line payload". These say
  // which property, and they pin the two things most likely to be quietly lost.
  it('round-trips stroke geometry, pressure, style and label exactly', () => {
    const { diagram } = buildRichDiagram();
    const restored = DiagramModel.fromJSON(throughJSON(diagram.serialize()));

    const pen = restored.getStroke('stroke-pen')!;
    expect(pen.getPoints()).toEqual(diagram.getStroke('stroke-pen')!.getPoints());
    expect(pen.getStyle()).toEqual({ color: '#dc2626', width: 3, opacity: 0.9 });
    expect(pen.getLabel()).toBe('circled for review');

    // PRESSURE SURVIVES. It is optional and per-point, so it is exactly the kind of
    // field a serializer drops without anyone noticing — and if it were dropped, the
    // variable-width outline would silently flatten to a uniform line on reload.
    const inked = restored.getStrokes().find((s) => s.getPoints().some((p) => p.pressure));
    expect(inked!.getPoints().map((p) => p.pressure)).toEqual([0.15, 0.8, 0.35]);
    expect(inked!.getMetadata('tool')).toBe('pen');

    // …and the UNLABELLED stroke must come back unlabelled, not as `label: undefined`
    // or `label: ''` — the a11y layer keys entirely off `label === undefined`.
    expect(inked!.getLabel()).toBeUndefined();
    expect('label' in inked!.serialize()).toBe(false);
  });

  it('a diagram with NO ink serializes to no `strokes` key at all', () => {
    // Byte-stability for every document written before this wave: adding the ink
    // capability must not rewrite a single existing document. (`strokes: []` would.)
    const d = new DiagramModel('inkless');
    d.addNode(new NodeModel({ id: 'n1', type: 'rect', position: { x: 0, y: 0 } }));
    expect('strokes' in d.serialize()).toBe(false);
  });

  it('loads a pre-wave10 document (no `strokes` key) as a diagram with zero strokes', () => {
    const { diagram } = buildRichDiagram();
    const doc = throughJSON(diagram.serialize());
    delete (doc as { strokes?: unknown }).strokes; // as an older writer would have left it

    const restored = DiagramModel.fromJSON(doc);
    expect(restored.getStrokes()).toEqual([]);
    expect(restored.getNodes().length).toBe(2); // …and the rest of the document is fine
  });

  it('reports the SAVED version and an empty change log after load', () => {
    const { diagram } = buildRichDiagram();
    const saved = throughJSON(diagram.serialize());
    const restored = DiagramModel.fromJSON(saved);
    expect(restored.version).toBe(saved.version);
    expect(restored.getChangeLog()).toHaveLength(0);
  });
});

describe('DiagramModel.fromJSON runtime wiring (loaded === authored)', () => {
  it('sets the diagram back-reference on every node', () => {
    const { diagram } = buildRichDiagram();
    const restored = DiagramModel.fromJSON(throughJSON(diagram.serialize()));
    for (const node of restored.getNodes()) {
      expect(node.diagram).toBe(restored);
    }
  });

  it('populates the spatial index (viewport virtualization works after load)', () => {
    const { diagram } = buildRichDiagram();
    const restored = DiagramModel.fromJSON(throughJSON(diagram.serialize()));
    const visible = restored.getVisibleNodes({ x: -100, y: -100, width: 2000, height: 2000 });
    expect(visible.map((n) => n.id).sort()).toEqual(['node-a', 'node-b']);
  });

  it('resolves ports O(1) and re-stashes the group diagram back-reference', () => {
    const { diagram } = buildRichDiagram();
    const restored = DiagramModel.fromJSON(throughJSON(diagram.serialize()));
    expect(restored.getNodeByPortId('a-out')!.id).toBe('node-a');
    expect(restored.getPortById('b-aux')!.type).toBe('bi');
    // installGroup re-stashes the RUNTIME back-ref that serialize() excludes
    expect(restored.getGroup('g-outer')!.getMetadata('diagram')).toBe(restored);
  });

  it('backfills link sourceNodeId/targetNodeId when a payload lacks them', () => {
    const { diagram, linkId } = buildRichDiagram();
    const payload = throughJSON(diagram.serialize());
    const rawLink = payload.links.find((l: any) => l.id === linkId)!;
    delete (rawLink as any).sourceNodeId;
    delete (rawLink as any).targetNodeId;

    const restored = DiagramModel.fromJSON(payload);
    expect(restored.getLink(linkId)!.sourceNodeId).toBe('node-a');
    expect(restored.getLink(linkId)!.targetNodeId).toBe('node-b');
  });

  it('wires change-forwarding listeners exactly once (node move fires one event)', () => {
    const { diagram } = buildRichDiagram();
    const restored = DiagramModel.fromJSON(throughJSON(diagram.serialize()));
    const moved = jest.fn();
    restored.on('node:moved', moved);
    restored.getNode('node-a')!.setPosition(99, 111);
    expect(moved).toHaveBeenCalledTimes(1);
    expect(moved).toHaveBeenCalledWith(
      expect.objectContaining({ nodeId: 'node-a', position: { x: 99, y: 111 } })
    );
  });

  it('rebuilds port-connection registries so maxConnections enforcement survives load', () => {
    const { diagram, linkId } = buildRichDiagram();
    const restored = DiagramModel.fromJSON(throughJSON(diagram.serialize()));

    const aOut = restored.getPortById('a-out')!;
    expect(aOut.currentConnections.has(linkId)).toBe(true);
    // maxConnections is 1 and the link occupies it: the port must refuse more
    expect(aOut.canConnect()).toBe(false);
    // an unconnected port is free
    expect(restored.getPortById('b-aux')!.canConnect()).toBe(true);
  });

  it('reconcilePortConnections reports dangling endpoints instead of throwing', () => {
    const { diagram, linkId } = buildRichDiagram();
    const payload = throughJSON(diagram.serialize());
    // corrupt: point the link at a port that no node owns
    const rawLink = payload.links.find((l: any) => l.id === linkId)!;
    (rawLink as any).targetPortId = 'ghost-port';

    const restored = DiagramModel.fromJSON(payload); // default: validation off
    const dangling = restored.reconcilePortConnections();
    expect(dangling).toEqual([{ linkId, portId: 'ghost-port', end: 'target' }]);
  });
});

describe('serialization safety + schema versioning', () => {
  it('serialize() excludes the runtime group diagram back-ref (JSON.stringify must not throw)', () => {
    const { diagram } = buildRichDiagram();
    // addGroup stashed the LIVE diagram in group metadata — the old poison
    expect(diagram.getGroup('g-outer')!.getMetadata('diagram')).toBe(diagram);
    expect(() => JSON.stringify(diagram.serialize())).not.toThrow();
    const payload = diagram.serialize();
    for (const g of payload.groups) {
      expect(g.metadata).not.toHaveProperty('diagram');
    }
  });

  it('stamps the current schemaVersion on save', () => {
    const d = new DiagramModel('stamp');
    expect(d.serialize().schemaVersion).toBe(DIAGRAM_SCHEMA_VERSION);
  });

  it('loads a legacy (pre-schemaVersion) document via the migration chain', () => {
    const { diagram } = buildRichDiagram();
    const legacy = throughJSON(diagram.serialize());
    delete (legacy as any).schemaVersion; // v1 document
    const restored = DiagramModel.fromJSON(legacy);
    expect(restored.getNodes()).toHaveLength(2);
    // re-saving a migrated document writes the current schema
    expect(restored.serialize().schemaVersion).toBe(DIAGRAM_SCHEMA_VERSION);
  });

  it('refuses to load a document newer than the runtime', () => {
    const { diagram } = buildRichDiagram();
    const future = throughJSON(diagram.serialize());
    (future as any).schemaVersion = DIAGRAM_SCHEMA_VERSION + 1;
    expect(() => DiagramModel.fromJSON(future)).toThrow(/newer/i);
  });
});

describe('load-time validation policies', () => {
  function corruptPayload() {
    const { diagram, linkId } = buildRichDiagram();
    const payload = throughJSON(diagram.serialize());
    const rawLink = payload.links.find((l: any) => l.id === linkId)!;
    (rawLink as any).sourcePortId = 'ghost-port';
    return payload;
  }

  it("default ('off') loads silently even when the document is corrupt", () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      expect(() => DiagramModel.fromJSON(corruptPayload())).not.toThrow();
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it("'warn' loads but reports the findings once", () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const restored = DiagramModel.fromJSON(corruptPayload(), { validate: 'warn' });
      expect(restored.getNodes()).toHaveLength(2);
      expect(warn).toHaveBeenCalledTimes(1);
      const report = warn.mock.calls[0][1];
      expect(report.errors[0].code).toBe('dangling-link-endpoint');
    } finally {
      warn.mockRestore();
    }
  });

  it("'strict' throws DiagramValidationError carrying the structured report", () => {
    try {
      DiagramModel.fromJSON(corruptPayload(), { validate: 'strict' });
      fail('expected DiagramValidationError');
    } catch (e) {
      expect(e).toBeInstanceOf(DiagramValidationError);
      const report = (e as DiagramValidationError).report;
      expect(report.ok).toBe(false);
      expect(report.errors.map((f) => f.code)).toContain('dangling-link-endpoint');
    }
  });

  it('a clean document passes strict validation', () => {
    const { diagram } = buildRichDiagram();
    expect(() =>
      DiagramModel.fromJSON(throughJSON(diagram.serialize()), { validate: 'strict' })
    ).not.toThrow();
  });
});

describe('DiagramSerializer pass-through', () => {
  it('round-trips through the serializer envelope losslessly', () => {
    const { diagram } = buildRichDiagram();
    const serializer = new DiagramSerializer();
    const envelope = throughJSON(serializer.serialize(diagram));
    const restored = serializer.deserialize(envelope);
    expect(throughJSON(restored.serialize())).toEqual(throughJSON(diagram.serialize()));
  });

  it('threads validation options through deserialize', () => {
    const { diagram, linkId } = buildRichDiagram();
    const serializer = new DiagramSerializer();
    const envelope = throughJSON(serializer.serialize(diagram));
    const rawLink = envelope.links.find((l: any) => l.id === linkId)!;
    (rawLink as any).sourcePortId = 'ghost-port';
    expect(() => serializer.deserialize(envelope, { validate: 'strict' })).toThrow(
      DiagramValidationError
    );
  });
});
