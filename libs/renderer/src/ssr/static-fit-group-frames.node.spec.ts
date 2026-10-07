/**
 * @jest-environment node
 *
 * `renderToStaticSVG({ fitView: true })` frames what the canvas DRAWS — group and
 * lane frames included — exactly as the live `fitView()` does.
 *
 * The server path had its own `contentBoundsOf` that counted node boxes only, and
 * it never applied `groups` at all: a lane spanning -300..2400 × -300..1600 around
 * four nodes came out with the frame missing and a viewBox fitted to the nodes
 * (-116 -250 2333 1750), so the lane would have been clipped had it been drawn.
 */
import { renderToStaticSVG } from './render-to-static';
import type { GroupSpec, NodeSpec } from '../instance/model-input';

const NODES: NodeSpec[] = [
  { id: 'a', label: 'A', position: { x: 0, y: 0 } },
  { id: 'b', label: 'B', position: { x: 2000, y: 0 } },
  { id: 'c', label: 'C', position: { x: 0, y: 1200 } },
  { id: 'd', label: 'D', position: { x: 2000, y: 1200 } },
];
const LANE: GroupSpec = { id: 'lane', label: 'Lane', bounds: { x: -300, y: -300, width: 2700, height: 1900 } };

const viewBoxOf = (svg: string) => {
  const [x, y, w, h] = (svg.match(/viewBox="([^"]+)"/) ?? [])[1]!.split(/\s+/).map(Number);
  return { x, y, w, h };
};

describe('renderToStaticSVG fitView takes in group frames', () => {
  it('draws the groups it is given', () => {
    const { svg } = renderToStaticSVG({ nodes: NODES, groups: [LANE], width: 800, height: 600 });
    expect(svg).toContain('data-group-id="lane"');
  });

  it('the fitted viewBox contains the whole lane frame', () => {
    const { svg } = renderToStaticSVG({ nodes: NODES, groups: [LANE], width: 800, height: 600, fitView: true });
    const vb = viewBoxOf(svg);
    expect(vb.x).toBeLessThanOrEqual(-300);
    expect(vb.y).toBeLessThanOrEqual(-300);
    expect(vb.x + vb.w).toBeGreaterThanOrEqual(2400);
    expect(vb.y + vb.h).toBeGreaterThanOrEqual(1600);
  });

  it('a group fitted around its children: the frame (padding + caption) is in view too', () => {
    const { svg } = renderToStaticSVG({
      nodes: NODES.slice(0, 2),
      groups: [{ id: 'g', label: 'A rather long caption for this zone', children: ['a', 'b'], padding: 60 }],
      width: 800,
      height: 600,
      fitView: true,
    });
    const vb = viewBoxOf(svg);
    expect(vb.x).toBeLessThanOrEqual(-60);
    expect(vb.y).toBeLessThanOrEqual(-60);
  });

  it('without groups the fit is unchanged (nodes only)', () => {
    const { svg } = renderToStaticSVG({ nodes: NODES, width: 800, height: 600, fitView: true });
    const vb = viewBoxOf(svg);
    expect(vb.x).toBeGreaterThan(-300);
    expect(vb.x).toBeLessThanOrEqual(0);
  });
});
