/**
 * Mermaid `architecture-beta` — services and groups joined by lines that NAME
 * THEIR SIDES. `db:L -- R:server` says the line leaves the database's left side
 * and enters the server's right side: the server sits to the database's LEFT.
 * That is exactly the relation the architecture layout reads, so the import is
 * the composition — groups as regions, services in rows, lines straight — not
 * Mermaid's force layout. Grafloria recognised the type and returned an empty
 * diagram; now it parses, lays out, and writes itself back as architecture-beta.
 */
import { importDiagramText, exportDiagramText } from '../../serialization/TextFormat';
import { parseMermaidArchitecture } from './MermaidArchitecture';
import type { DiagramModel } from '../../models/DiagramModel';

const imp = (t: string) => importDiagramText(t).diagram;
type Rect = { x: number; y: number; w: number; h: number };
const R = (d: DiagramModel, id: string): Rect => {
  const n = d.getNode(id);
  if (n) return { x: n.position.x, y: n.position.y, w: n.size.width, h: n.size.height };
  const b = d.getGroup(id)!.getOuterBounds();
  return { x: b.x, y: b.y, w: b.width, h: b.height };
};
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const link = (d: DiagramModel, s: string, t: string) => d.getLinks().find((l) => l.sourceNodeId === s && l.targetNodeId === t)!;
const at = (d: DiagramModel, portId: string | undefined, id: string) => {
  const m = /__(top|right|bottom|left)@(-?\d+)/.exec(portId ?? '');
  const r = R(d, id);
  if (!m) throw new Error(`no side anchor on ${id}: ${portId}`);
  const off = Number(m[2]);
  return m[1] === 'left' ? { x: r.x, y: r.y + off } : m[1] === 'right' ? { x: r.x + r.w, y: r.y + off } : m[1] === 'top' ? { x: r.x + off, y: r.y } : { x: r.x + off, y: r.y + r.h };
};

// Mermaid's own documentation example
const DOCS = `architecture-beta
    group api(cloud)[API]

    service db(database)[Database] in api
    service disk1(disk)[Storage] in api
    service disk2(disk)[Storage] in api
    service server(server)[Server] in api

    db:L -- R:server
    disk1:T -- B:server
    disk2:T -- B:db`;

describe('Mermaid architecture-beta', () => {
  describe('parsing', () => {
    it('reads groups, services, junctions (with icons, titles, parents) and edges with their sides, arrows and labels', () => {
      const m = parseMermaidArchitecture(`architecture-beta
  group cloud(cloud)[My Cloud]
  group net(internet)[Network] in cloud
  service web(server)[Web server] in net
  service db(database)[DB]
  junction j in cloud
  web:R --> L:db
  db:B <-- T:j
  web{group}:T <-[sync]-> B:db{group}`);
      expect(m.groups).toEqual([
        { id: 'cloud', icon: 'cloud', title: 'My Cloud' },
        { id: 'net', icon: 'internet', title: 'Network', parent: 'cloud' },
      ]);
      expect(m.services).toEqual([
        { id: 'web', icon: 'server', title: 'Web server', parent: 'net' },
        { id: 'db', icon: 'database', title: 'DB' },
      ]);
      expect(m.junctions).toEqual([{ id: 'j', parent: 'cloud' }]);
      expect(m.edges).toEqual([
        { from: 'web', fromSide: 'R', to: 'db', toSide: 'L', arrowFrom: false, arrowTo: true },
        { from: 'db', fromSide: 'B', to: 'j', toSide: 'T', arrowFrom: true, arrowTo: false },
        { from: 'web', fromSide: 'T', to: 'db', toSide: 'B', arrowFrom: true, arrowTo: true, label: 'sync', fromGroup: true, toGroup: true },
      ]);
    });
  });

  describe("the docs example, laid out by what the sides say", () => {
    const d = imp(DOCS);

    it('is an architecture-beta diagram: a group of four services with their titles and icons', () => {
      expect(d.getMetadata('diagramType')).toBe('architecture-beta');
      expect(d.getGroup('api')!.name).toBe('API');
      expect([...d.getGroup('api')!.members].sort()).toEqual(['db', 'disk1', 'disk2', 'server']);
      expect(d.getNode('db')!.getLabel()).toBe('Database');
      expect(d.getNode('db')!.getMetadata('icon')).toBe('database');
      expect((d.getNode('db')!.getMetadata('panel') as { icon?: { name?: string } })?.icon?.name).toBe('database');
    });

    it('db:L -- R:server puts the server LEFT of the database, on a straight line', () => {
      expect(R(d, 'server').x + R(d, 'server').w).toBeLessThan(R(d, 'db').x);
      const l = link(d, 'db', 'server');
      expect(Math.round(at(d, l.sourcePortId, 'db').y)).toBe(Math.round(at(d, l.targetPortId, 'server').y));
    });

    it('disk1:T -- B:server hangs the storage BELOW the server, straight down', () => {
      expect(R(d, 'disk1').y).toBeGreaterThan(R(d, 'server').y + R(d, 'server').h);
      const l = link(d, 'disk1', 'server');
      expect(Math.round(at(d, l.sourcePortId, 'disk1').x)).toBe(Math.round(at(d, l.targetPortId, 'server').x));
      expect(R(d, 'disk2').y).toBeGreaterThan(R(d, 'db').y + R(d, 'db').h);
    });

    it('a plain -- line has no arrowheads', () => {
      const l = link(d, 'db', 'server');
      expect(l.style.arrowHead?.type).toBe('none');
      expect(l.style.arrowTail?.type ?? 'none').toBe('none');
    });

    it('nothing overlaps, and every service sits inside its group', () => {
      const ids = d.getNodes().map((n) => n.id);
      for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) expect(overlaps(R(d, ids[i]!), R(d, ids[j]!))).toBe(false);
      const g = R(d, 'api');
      for (const id of ids) {
        const r = R(d, id);
        expect(r.x >= g.x && r.y >= g.y && r.x + r.w <= g.x + g.w && r.y + r.h <= g.y + g.h).toBe(true);
      }
    });
  });

  it('arrows: --> points at the target, <-- at the source, <--> both; -[label]- labels the line', () => {
    const d = imp(`architecture-beta
  service a(server)[A]
  service b(server)[B]
  service c(server)[C]
  service e(server)[E]
  a:R --> L:b
  b:R <-- L:c
  c:B <-[replicates]-> T:e`);
    expect(link(d, 'a', 'b').style.arrowHead?.type).not.toBe('none');
    expect(link(d, 'b', 'c').style.arrowTail?.type).not.toBe('none');
    expect(link(d, 'b', 'c').style.arrowHead?.type).toBe('none');
    const both = link(d, 'c', 'e');
    expect(both.style.arrowHead?.type).not.toBe('none');
    expect(both.style.arrowTail?.type).not.toBe('none');
    expect(both.getLabel()).toBe('replicates');
    expect(R(d, 'e').y).toBeGreaterThan(R(d, 'c').y + R(d, 'c').h); // c:B → e below c
  });

  it('a junction is a small dot the lines meet at; nested groups nest', () => {
    const d = imp(`architecture-beta
  group outer(cloud)[Outer]
  group inner(server)[Inner] in outer
  service a(server)[A] in inner
  service b(database)[B] in outer
  junction j in outer
  a:R -- L:j
  j:R -- L:b`);
    expect(R(d, 'j').w).toBeLessThanOrEqual(16);
    expect(d.getGroup('inner')!.parentGroupId).toBe('outer');
    const o = R(d, 'outer'), i = R(d, 'inner');
    expect(i.x >= o.x && i.y >= o.y && i.x + i.w <= o.x + o.w && i.y + i.h <= o.y + o.h).toBe(true);
  });

  it('round trip: exports as architecture-beta with its sides, and imports back to the same picture', () => {
    const d = imp(DOCS);
    const out = exportDiagramText(d, { lossless: false });
    expect(out.trimStart().startsWith('architecture-beta')).toBe(true);
    expect(out).toMatch(/group api\(cloud\)\[API\]/);
    expect(out).toMatch(/service db\(database\)\[Database\] in api/);
    expect(out).toMatch(/db:L -- R:server/);
    const back = imp(out);
    for (const id of ['db', 'disk1', 'disk2', 'server', 'api']) {
      const a = R(d, id), b = R(back, id);
      expect([id, Math.round(b.x), Math.round(b.y), Math.round(b.w), Math.round(b.h)]).toEqual([id, Math.round(a.x), Math.round(a.y), Math.round(a.w), Math.round(a.h)]);
    }
  });
});
