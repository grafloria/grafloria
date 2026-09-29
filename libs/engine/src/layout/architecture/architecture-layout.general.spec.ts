/**
 * The architecture layout beyond its first diagram: top-to-bottom flow, a longer
 * row, zones inside zones, a cycle, loose boxes, an empty diagram. Each is held
 * to the same promises — nothing overlaps, every box has its words' room, a
 * zone's boxes sit inside its frame — because a layout that only draws the
 * diagram it was built for is a picture, not a layout.
 */
import { importDiagramText } from '../../serialization/TextFormat';
import { layoutArchitecture } from './architecture-layout';
import type { DiagramModel } from '../../models/DiagramModel';

type Rect = { x: number; y: number; w: number; h: number };
const R = (d: DiagramModel, id: string): Rect => {
  const n = d.getNode(id);
  if (n) return { x: n.position.x, y: n.position.y, w: n.size.width, h: n.size.height };
  const b = d.getGroup(id)!.getOuterBounds();
  return { x: b.x, y: b.y, w: b.width, h: b.height };
};
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const inside = (a: Rect, b: Rect) => a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h;
const arch = (body: string) => importDiagramText(`${body.trim()}\n  %%grafloria:layout architecture\n`).diagram;

/** No two boxes overlap; every box sits inside every zone it belongs to and outside every other. */
function expectClean(d: DiagramModel): void {
  const nodes = d.getNodes();
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
    expect([nodes[i]!.id, nodes[j]!.id, overlaps(R(d, nodes[i]!.id), R(d, nodes[j]!.id))]).toEqual([nodes[i]!.id, nodes[j]!.id, false]);
  }
  for (const g of d.getGroups()) {
    const frame = R(d, g.id);
    for (const n of nodes) {
      const member = [...g.members].includes(n.id) || [...g.members].some((m) => d.getGroup(m)?.members.has(n.id));
      if (member) expect([g.id, n.id, inside(R(d, n.id), frame)]).toEqual([g.id, n.id, true]);
      else expect([g.id, n.id, overlaps(R(d, n.id), frame)]).toEqual([g.id, n.id, false]);
    }
  }
}

describe('the architecture layout, in general', () => {
  it('flowchart TB: ranks go DOWN, a zone with direction LR still lays its boxes in a row', () => {
    const d = arch(`flowchart TB
  user[User]
  subgraph svc[Services]
    direction LR
    a[Auth] --> b[Billing]
  end
  user --> a`);
    expect(R(d, 'user').y + R(d, 'user').h).toBeLessThan(R(d, 'svc').y);
    expect(R(d, 'a').y).toBeCloseTo(R(d, 'b').y, 0);
    expect(R(d, 'a').x + R(d, 'a').w).toBeLessThan(R(d, 'b').x);
    expectClean(d);
  });

  it('a chain of three in a zone is a row of three, evenly tall', () => {
    const d = arch(`flowchart LR
  subgraph z[Pipeline]
    e[Extract] --> t[Transform] --> l[Load]
  end`);
    expect(R(d, 'e').x < R(d, 't').x && R(d, 't').x < R(d, 'l').x).toBe(true);
    expect(new Set(['e', 't', 'l'].map((id) => Math.round(R(d, id).y))).size).toBe(1);
    expect(new Set(['e', 't', 'l'].map((id) => Math.round(R(d, id).h))).size).toBe(1);
    expectClean(d);
  });

  it('zones inside zones: the inner frame sits inside the outer one, each box inside both', () => {
    const d = arch(`flowchart LR
  subgraph cloud[Cloud]
    gw[Gateway]
    subgraph vpc[Private network]
      app[App server] --> db[(Database)]
    end
    gw --> app
  end
  client[Client] --> gw`);
    expect(inside(R(d, 'vpc'), R(d, 'cloud'))).toBe(true);
    expectClean(d);
  });

  it('a cycle is broken in declaration order: A before B, both placed, no loop', () => {
    const d = arch(`flowchart LR
  a[Alpha] --> b[Beta]
  b --> a`);
    expect(R(d, 'a').x + R(d, 'a').w).toBeLessThan(R(d, 'b').x);
    expectClean(d);
  });

  it('loose boxes with no lines stack in the first column, in the order written', () => {
    const d = arch(`flowchart LR
  one[One]
  two[Two]
  three[Three]`);
    expect(R(d, 'one').y).toBeLessThan(R(d, 'two').y);
    expect(R(d, 'two').y).toBeLessThan(R(d, 'three').y);
    expect(R(d, 'one').x).toBeCloseTo(R(d, 'two').x, 0);
    expectClean(d);
  });

  it('an empty diagram lays out to nothing, without failing', () => {
    const d = importDiagramText('flowchart LR\n').diagram;
    expect(layoutArchitecture(d).nodePositions.size).toBe(0);
  });

  it('a long label widens the gap it crosses', () => {
    const short = arch(`flowchart LR
  a[A] -->|ok| b[B]`);
    const long = arch(`flowchart LR
  a[A] -->|a much longer label that needs room| b[B]`);
    const gap = (d: DiagramModel) => R(d, 'b').x - (R(d, 'a').x + R(d, 'a').w);
    expect(gap(long)).toBeGreaterThan(gap(short) + 100);
  });

  it('an exact %%grafloria:at still wins for the box it names', () => {
    const d = arch(`flowchart LR
  a[A] --> b[B]
  %%grafloria:at b 900,500 160x60`);
    expect([R(d, 'b').x, R(d, 'b').y, R(d, 'b').w, R(d, 'b').h]).toEqual([900, 500, 160, 60]);
  });

  it('laying out again changes nothing (its own anchors are not mistaken for an author pin) …', () => {
    const d = arch(`flowchart LR
  a[Alpha] --> b[Beta]
  a --> c[Gamma]`);
    const snap = () => d.getNodes().map((n) => [n.id, n.position.x, n.position.y, n.size.width, n.size.height, d.getLinks().map((l) => `${l.sourcePortId}>${l.targetPortId}`).join(',')]);
    const first = JSON.stringify(snap());
    layoutArchitecture(d);
    expect(JSON.stringify(snap())).toBe(first);
  });

  it('… and after a box grows, its lines are anchored again, straight', () => {
    const d = arch(`flowchart LR
  a[Alpha] --> b[Beta]`);
    d.getNode('b')!.setLabel('Beta, now with a much longer name\nand a second line');
    layoutArchitecture(d);
    const l = d.getLinks()[0]!;
    const at = (portId: string | undefined, id: string) => {
      const handle = (portId ?? '').split('__')[1] ?? '';
      const m = /@(-?\d+)/.exec(handle);
      return d.getNode(id)!.position.y + Number(m?.[1]);
    };
    expect(Math.round(at(l.sourcePortId, 'a'))).toBe(Math.round(at(l.targetPortId, 'b')));
    // re-anchored for the NEW height: the middle of the box, not the old 28 px
    const b = d.getNode('b')!;
    expect(Math.abs(at(l.targetPortId, 'b') - b.position.y - b.size.height / 2)).toBeLessThanOrEqual(1); // anchors land on whole px
    expect(b.size.height).toBeGreaterThan(70);
  });
});

