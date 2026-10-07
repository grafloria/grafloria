// Which side of a shape an imported edge leaves and enters — the way draw.io draws it.
//
// The docs' draw.io picture (the gallery's misc/drawio-import demo) showed the "yes"
// edge mis-routed: it left the decision's RIGHT side, dropped to its waypoints,
// doubled back to a dead-end stub, and snaked into "Pick items" from the LEFT.
// The importer chose ports from the two shapes' relative positions and spliced the
// author's waypoints in between. draw.io does not: with waypoints, an orthogonal
// edge leaves its source TOWARD the first waypoint and enters its target FROM the
// last one (mxGraph's segment connector); and `exitX/exitY` / `entryX/entryY` pin
// the side outright.
import { importDrawio } from './importDrawio';
import type { DiagramModel } from '../../models/DiagramModel';
import type { LinkModel } from '../../models/LinkModel';

// The demo's own order flow, verbatim.
const ORDER_FLOW = `<mxGraphModel dx="800" dy="600" grid="1">
  <root>
    <mxCell id="0"/>
    <mxCell id="1" parent="0"/>
    <mxCell id="start" value="New order" style="rounded=1;fillColor=#dae8fc;strokeColor=#6c8ebf;" vertex="1" parent="1">
      <mxGeometry x="40" y="70" width="150" height="60" as="geometry"/>
    </mxCell>
    <mxCell id="check" value="In stock?" style="rhombus;fillColor=#fff2cc;strokeColor=#d6b656;" vertex="1" parent="1">
      <mxGeometry x="45" y="220" width="140" height="90" as="geometry"/>
    </mxCell>
    <mxCell id="lane" value="Fulfilment" style="swimlane;" vertex="1" parent="1">
      <mxGeometry x="330" y="70" width="380" height="280" as="geometry"/>
    </mxCell>
    <mxCell id="pick" value="Pick items" style="rounded=0;fillColor=#d5e8d4;strokeColor=#82b366;" vertex="1" parent="lane">
      <mxGeometry x="30" y="50" width="130" height="60" as="geometry"/>
    </mxCell>
    <mxCell id="e2" value="yes" style="edgeStyle=orthogonalEdgeStyle;" edge="1" parent="1" source="check" target="pick">
      <mxGeometry relative="1" as="geometry">
        <Array as="points"><mxPoint x="115" y="420"/><mxPoint x="425" y="420"/></Array>
      </mxGeometry>
    </mxCell>
  </root>
</mxGraphModel>`;

const sideOf = (d: DiagramModel, link: LinkModel, end: 'source' | 'target'): string | undefined => {
  const portId = end === 'source' ? link.sourcePortId : link.targetPortId;
  for (const n of d.getNodes()) {
    const p = n.getPort(portId);
    if (p) return p.alignment.side;
  }
  return undefined;
};

const model = (cells: string): string =>
  `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells}</root></mxGraphModel>`;
const box = (id: string, x: number, y: number, w = 120, h = 60): string =>
  `<mxCell id="${id}" value="${id}" style="rounded=0;" vertex="1" parent="1"><mxGeometry x="${x}" y="${y}" width="${w}" height="${h}" as="geometry"/></mxCell>`;

describe('importDrawio — terminal sides follow draw.io', () => {
  it('the demo\'s "yes" edge leaves the decision\'s bottom and enters "Pick items" from below', async () => {
    const { diagram } = await importDrawio(ORDER_FLOW);
    const link = diagram!.getLinks().find((l) => l.getMetadata('drawioId') === 'e2')!;

    expect(sideOf(diagram!, link, 'source')).toBe('bottom');
    expect(sideOf(diagram!, link, 'target')).toBe('bottom');
    // draw.io's own route: down from the diamond's bottom point, along the
    // waypoints, up into the bottom of "Pick items" (lane x 330 + 30, width 130).
    expect(link.points.map((p) => [Math.round(p.x), Math.round(p.y)])).toEqual([
      [115, 310],
      [115, 420],
      [425, 420],
      [425, 180],
    ]);
  });

  it('a first waypoint level with the source leaves from the side facing it', async () => {
    // b is BELOW a, but the author routed the edge out to the right first.
    const xml = model(
      box('a', 0, 0) + box('b', 0, 300) +
        `<mxCell id="e" style="edgeStyle=orthogonalEdgeStyle;" edge="1" parent="1" source="a" target="b">` +
        `<mxGeometry relative="1" as="geometry"><Array as="points"><mxPoint x="300" y="30"/><mxPoint x="300" y="330"/></Array></mxGeometry></mxCell>`
    );
    const { diagram } = await importDrawio(xml);
    const link = diagram!.getLinks()[0];
    expect(sideOf(diagram!, link, 'source')).toBe('right');
    expect(sideOf(diagram!, link, 'target')).toBe('right');
  });

  it('exitX/exitY and entryX/entryY pin the sides, whatever the geometry says', async () => {
    // b is straight to the right of a; the author pinned top → top.
    const xml = model(
      box('a', 0, 100) + box('b', 400, 100) +
        `<mxCell id="e" style="edgeStyle=orthogonalEdgeStyle;exitX=0.5;exitY=0;entryX=0.5;entryY=0;" edge="1" parent="1" source="a" target="b">` +
        `<mxGeometry relative="1" as="geometry"/></mxCell>`
    );
    const { diagram, warnings } = await importDrawio(xml);
    const link = diagram!.getLinks()[0];
    expect(sideOf(diagram!, link, 'source')).toBe('top');
    expect(sideOf(diagram!, link, 'target')).toBe('top');
    // Read, so no longer reported as dropped.
    expect(warnings.join(' ')).not.toMatch(/exitX|entryY/);
  });

  it('without waypoints or constraints the choice is unchanged', async () => {
    const xml = model(
      box('a', 0, 0) + box('b', 400, 0) +
        `<mxCell id="e" style="edgeStyle=orthogonalEdgeStyle;" edge="1" parent="1" source="a" target="b"><mxGeometry relative="1" as="geometry"/></mxCell>`
    );
    const { diagram } = await importDrawio(xml);
    const link = diagram!.getLinks()[0];
    expect(sideOf(diagram!, link, 'source')).toBe('right');
    expect(sideOf(diagram!, link, 'target')).toBe('left');
  });
});
