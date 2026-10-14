// draw.io POOLS. A draw.io pool is a swimlane container that stacks swimlane
// LANES (its stackLayout); the steps are children of the lanes. Imported as
// plain groups it was frames inside frames: no lane could be resized,
// reordered, folded or laid out. It now arrives as the engine's pool and lanes.
import { importDrawio } from './importDrawio';
import type { DiagramModel } from '../../models/DiagramModel';

const model = (cells: string): string =>
  `<mxGraphModel dx="800" dy="600" grid="1"><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells}</root></mxGraphModel>`;
const vertex = (id: string, o: { parent?: string; value?: string; style?: string; x?: number; y?: number; w?: number; h?: number } = {}): string =>
  `<mxCell id="${id}" value="${o.value ?? ''}" style="${o.style ?? 'rounded=0;whiteSpace=wrap;html=1;'}" vertex="1" parent="${o.parent ?? '1'}">` +
  `<mxGeometry x="${o.x ?? 0}" y="${o.y ?? 0}" width="${o.w ?? 120}" height="${o.h ?? 60}" as="geometry"/></mxCell>`;
const edge = (id: string, s: string, t: string) =>
  `<mxCell id="${id}" style="edgeStyle=orthogonalEdgeStyle;" edge="1" parent="1" source="${s}" target="${t}"><mxGeometry relative="1" as="geometry"/></mxCell>`;

// draw.io's "Horizontal Pool" template, as it saves it: title strip on the left (horizontal=0), lanes stacked down.
const POOL = 'swimlane;html=1;childLayout=stackLayout;resizeParent=1;resizeParentMax=0;horizontal=0;startSize=20;horizontalStack=0;';
const LANE = 'swimlane;html=1;startSize=20;horizontal=0;';
const horizontalPool = model(
  vertex('pool', { value: 'Orders', style: POOL, x: 40, y: 40, w: 640, h: 360 }) +
  vertex('l1', { parent: 'pool', value: 'Customer', style: LANE, x: 20, y: 0, w: 620, h: 120 }) +
  vertex('l2', { parent: 'pool', value: 'Sales', style: LANE, x: 20, y: 120, w: 620, h: 120 }) +
  vertex('l3', { parent: 'pool', value: 'Warehouse', style: LANE, x: 20, y: 240, w: 620, h: 120 }) +
  vertex('a', { parent: 'l1', value: 'Order', x: 60, y: 30 }) +
  vertex('b', { parent: 'l2', value: 'Confirm', x: 220, y: 30 }) +
  vertex('c', { parent: 'l3', value: 'Ship', x: 380, y: 30 }) +
  edge('e1', 'a', 'b') + edge('e2', 'b', 'c')
);
const pool = (d: DiagramModel) => d.getGroup('pool')!;

describe('importDrawio — pools and lanes', () => {
  it('a horizontal draw.io pool arrives as a pool of lanes, in order, with its header', async () => {
    const { diagram } = await importDrawio(horizontalPool);
    const d = diagram!;
    expect(pool(d).laneConfig).toMatchObject({ role: 'pool', orientation: 'horizontal', headerSize: 20, laneOrder: ['l1', 'l2', 'l3'] });
    for (const id of ['l1', 'l2', 'l3']) expect(d.getGroup(id)!.laneConfig).toMatchObject({ role: 'lane', orientation: 'horizontal' });
  });

  it('its lanes keep their drawn sizes and tile the pool; its steps stay in their lanes where they were drawn', async () => {
    const { diagram } = await importDrawio(horizontalPool);
    const d = diagram!;
    expect(['l1', 'l2', 'l3'].map((id) => d.getGroup(id)!.getOuterBounds())).toEqual([
      { x: 60, y: 40, width: 620, height: 120 },
      { x: 60, y: 160, width: 620, height: 120 },
      { x: 60, y: 280, width: 620, height: 120 },
    ]);
    expect(d.getGroup('l2')!.members.has('b')).toBe(true);
    expect(d.getNode('b')!.position).toMatchObject({ x: 40 + 20 + 220, y: 40 + 120 + 30 });
    expect(d.getLinks()).toHaveLength(2);
  });

  it('a vertical pool (lanes side by side) arrives with its lanes as columns', async () => {
    const { diagram } = await importDrawio(model(
      vertex('pool', { value: 'Orders', style: 'swimlane;html=1;childLayout=stackLayout;resizeParent=1;resizeParentMax=0;startSize=20;', x: 0, y: 0, w: 480, h: 400 }) +
      vertex('l1', { parent: 'pool', value: 'Customer', style: 'swimlane;html=1;startSize=20;', x: 0, y: 20, w: 160, h: 380 }) +
      vertex('l2', { parent: 'pool', value: 'Sales', style: 'swimlane;html=1;startSize=20;', x: 160, y: 20, w: 160, h: 380 }) +
      vertex('l3', { parent: 'pool', value: 'Warehouse', style: 'swimlane;html=1;startSize=20;', x: 320, y: 20, w: 160, h: 380 })
    ));
    expect(diagram!.getGroup('pool')!.laneConfig).toMatchObject({ role: 'pool', orientation: 'vertical', headerSize: 20, laneOrder: ['l1', 'l2', 'l3'] });
    expect(diagram!.getGroup('l2')!.getOuterBounds()).toEqual({ x: 160, y: 20, width: 160, height: 380 });
  });

  it('a swimlane that is not a pool of lanes stays a plain group', async () => {
    const { diagram } = await importDrawio(model(
      vertex('lane', { value: 'Team A', style: 'swimlane;', x: 40, y: 40, w: 300, h: 200 }) +
      vertex('a', { parent: 'lane', x: 30, y: 50 }) +
      // a swimlane holding a step AND a swimlane is a container, not a pool
      vertex('mixed', { value: 'Mixed', style: 'swimlane;', x: 400, y: 40, w: 300, h: 300 }) +
      vertex('inner', { parent: 'mixed', style: 'swimlane;', x: 0, y: 20, w: 300, h: 100 }) +
      vertex('loose', { parent: 'mixed', x: 30, y: 200 })
    ));
    expect(diagram!.getGroup('lane')!.laneConfig).toBeUndefined();
    expect(diagram!.getGroup('mixed')!.laneConfig).toBeUndefined();
  });

  it('a lane tiled by swimlanes of its own arrives split into sub-lanes', async () => {
    const SUB = 'swimlane;html=1;startSize=20;horizontal=0;';
    const { diagram } = await importDrawio(model(
      vertex('pool', { value: 'Orders', style: POOL, x: 0, y: 0, w: 640, h: 360 }) +
      vertex('l1', { parent: 'pool', value: 'Sales', style: LANE, x: 20, y: 0, w: 620, h: 120 }) +
      vertex('l2', { parent: 'pool', value: 'Warehouse', style: LANE, x: 20, y: 120, w: 620, h: 240 }) +
      vertex('s1', { parent: 'l2', value: 'Picking', style: SUB, x: 20, y: 0, w: 600, h: 120 }) +
      vertex('s2', { parent: 'l2', value: 'Dispatch', style: SUB, x: 20, y: 120, w: 600, h: 120 }) +
      vertex('p', { parent: 's1', value: 'Pick', x: 60, y: 30 })
    ));
    const d = diagram!;
    expect(d.getGroup('l2')!.laneConfig).toMatchObject({ role: 'lane', laneOrder: ['s1', 's2'], headerSize: 20 });
    expect(d.getGroup('s1')!.laneConfig).toMatchObject({ role: 'lane', orientation: 'horizontal', fixedSize: 120 });
    expect(d.getGroup('s1')!.members.has('p')).toBe(true);
    expect(d.getGroup('s1')!.getOuterBounds()).toEqual({ x: 40, y: 120, width: 600, height: 120 });
  });
});
