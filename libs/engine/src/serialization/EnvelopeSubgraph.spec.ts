// Card 5: portable document envelope + first-class subgraph serialization.

import { DiagramModel } from '../models/DiagramModel';
import { NodeModel } from '../models/NodeModel';
import { PortModel } from '../models/PortModel';
import { LinkModel } from '../models/LinkModel';
import { GroupModel } from '../models/GroupModel';
import { DiagramSerializer } from './Serializer';
import {
  wrapDiagramDocument,
  unwrapDiagramDocument,
  isDiagramDocumentEnvelope,
  checksumOf,
  canonicalStringify,
  DiagramChecksumError,
  DIAGRAM_ENVELOPE_VERSION,
} from './DocumentEnvelope';
import { serializeSubgraph, deserializeSubgraphInto } from './Subgraph';

const throughJSON = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

function buildDiagram(): DiagramModel {
  const d = new DiagramModel('envelope-spec');
  const mk = (id: string, x: number) => {
    const n = new NodeModel({ id, type: 'rect', position: { x, y: 10 } });
    n.ports.clear();
    const out = new PortModel({ id: `${id}-out`, type: 'output', side: 'right' });
    out.nodeId = id;
    n.ports.set(out.id, out);
    const inp = new PortModel({ id: `${id}-in`, type: 'input', side: 'left' });
    inp.nodeId = id;
    n.ports.set(inp.id, inp);
    d.addNode(n);
    return n;
  };
  mk('a', 0);
  mk('b', 200);
  mk('c', 400);
  d.addLink(new LinkModel('a-out', 'b-in', 'orthogonal')); // inside pair a,b
  d.addLink(new LinkModel('b-out', 'c-in', 'direct')); // crosses a,b boundary
  const g = new GroupModel({ id: 'g1', name: 'Pair' });
  d.addGroup(g);
  g.addMember('a', d);
  g.addMember('b', d);
  g.addMember('c', d); // c will NOT travel with the {a,b} subgraph
  return d;
}

describe('document envelope', () => {
  it('wraps with generator identity + checksum and unwraps verified', () => {
    const d = buildDiagram();
    const envelope = wrapDiagramDocument(d.serialize(), { createdAt: '2026-07-13T00:00:00Z' });
    expect(envelope.envelopeVersion).toBe(DIAGRAM_ENVELOPE_VERSION);
    expect(envelope.generator).toBe('@grafloria/engine');
    expect(envelope.checksum).toBe(checksumOf(envelope.document));

    const { document, envelope: seen } = unwrapDiagramDocument(throughJSON(envelope));
    expect(seen).toBeDefined();
    expect(document.name).toBe('envelope-spec');
  });

  it('canonical checksum is stable across key order', () => {
    const a = { x: 1, y: { b: 2, a: 3 } };
    const b = { y: { a: 3, b: 2 }, x: 1 };
    expect(canonicalStringify(a)).toBe(canonicalStringify(b));
  });

  it('detects tampering via checksum', () => {
    const d = buildDiagram();
    const envelope = throughJSON(wrapDiagramDocument(d.serialize()));
    envelope.document.name = 'tampered';
    expect(() => unwrapDiagramDocument(envelope)).toThrow(DiagramChecksumError);
  });

  it('rejects an envelope newer than the runtime', () => {
    const d = buildDiagram();
    const envelope = throughJSON(wrapDiagramDocument(d.serialize()));
    envelope.envelopeVersion = DIAGRAM_ENVELOPE_VERSION + 1;
    expect(() => unwrapDiagramDocument(envelope)).toThrow(/newer/i);
  });

  it('passes legacy flat payloads through unchanged', () => {
    const d = buildDiagram();
    const flat = throughJSON(d.serialize());
    expect(isDiagramDocumentEnvelope(flat)).toBe(false);
    expect(unwrapDiagramDocument(flat).document).toBe(flat);
  });

  it('DiagramSerializer round-trips the enveloped form losslessly', () => {
    const d = buildDiagram();
    const serializer = new DiagramSerializer();
    const envelope = throughJSON(serializer.serializeEnvelope(d));
    const restored = serializer.deserialize(envelope);
    expect(throughJSON(restored.serialize())).toEqual(throughJSON(d.serialize()));
  });
});

describe('subgraph serialization', () => {
  it('captures inside links, records boundary links, filters group membership', () => {
    const d = buildDiagram();
    const sub = serializeSubgraph(d, { nodeIds: ['a', 'b'], groupIds: ['g1'] });

    expect(sub.nodes.map((n) => n.id).sort()).toEqual(['a', 'b']);
    expect(sub.links).toHaveLength(1); // only a→b travels
    expect(sub.boundaryLinks).toHaveLength(1); // b→c recorded, not silently dropped
    expect(sub.boundaryLinks[0].insideEnd).toBe('source');
    expect(sub.groups[0].members.sort()).toEqual(['a', 'b']); // c filtered out
  });

  it('deserializes into another diagram with fresh ids, fully wired', () => {
    const source = buildDiagram();
    const sub = throughJSON(serializeSubgraph(source, { nodeIds: ['a', 'b'], groupIds: ['g1'] }));

    const target = new DiagramModel('target');
    const result = deserializeSubgraphInto(target, sub, { offset: { x: 50, y: 60 } });

    expect(result.nodes).toHaveLength(2);
    expect(result.links).toHaveLength(1);
    // fresh identity
    expect(target.getNode('a')).toBeUndefined();
    const newA = target.getNode(result.idMap.get('a')!)!;
    expect(newA.position).toEqual({ x: 50, y: 70 }); // 0+50, 10+60
    // fully wired: back-ref, spatial index, port index, registries
    expect(newA.diagram).toBe(target);
    expect(target.getVisibleNodes({ x: 0, y: 0, width: 1000, height: 1000 })).toHaveLength(2);
    const link = result.links[0];
    expect(target.getNodeByPortId(link.sourcePortId)!.id).toBe(result.idMap.get('a'));
    expect(target.getPortById(link.sourcePortId)!.currentConnections.has(link.id)).toBe(true);
    // group came along with remapped members
    const newGroup = target.getGroup(result.idMap.get('g1')!)!;
    expect([...newGroup.members].sort()).toEqual(
      [result.idMap.get('a')!, result.idMap.get('b')!].sort()
    );
  });

  it('pasting the same subgraph twice yields independent copies (no id collisions)', () => {
    const source = buildDiagram();
    const sub = throughJSON(serializeSubgraph(source, { nodeIds: ['a', 'b'] }));
    const target = new DiagramModel('target');
    const first = deserializeSubgraphInto(target, sub);
    const second = deserializeSubgraphInto(target, sub);
    expect(target.getNodes()).toHaveLength(4);
    expect(first.idMap.get('a')).not.toBe(second.idMap.get('a'));
    // uuids are fresh per copy
    const uuidA1 = target.getNode(first.idMap.get('a')!)!.uuid;
    const uuidA2 = target.getNode(second.idMap.get('a')!)!.uuid;
    expect(uuidA1).not.toBe(uuidA2);
  });

  it('remapIds:false imports verbatim into an empty diagram (template instantiation)', () => {
    const source = buildDiagram();
    const sub = throughJSON(serializeSubgraph(source, { nodeIds: ['a', 'b'], groupIds: ['g1'] }));
    const target = new DiagramModel('template-target');
    deserializeSubgraphInto(target, sub, { remapIds: false });
    expect(target.getNode('a')).toBeDefined();
    expect(target.getLinks()[0].sourcePortId).toBe('a-out');
    expect(target.getGroup('g1')).toBeDefined();
  });

  it('paste is a real mutation: node:added fires per pasted node', () => {
    const source = buildDiagram();
    const sub = throughJSON(serializeSubgraph(source, { nodeIds: ['a', 'b'] }));
    const target = new DiagramModel('events');
    const added = jest.fn();
    target.on('node:added', added);
    deserializeSubgraphInto(target, sub);
    expect(added).toHaveBeenCalledTimes(2);
  });
});
