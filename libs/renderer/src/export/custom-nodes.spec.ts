// Custom-node export — the pure half.
//
// THE BUG UNDER TEST: an HTML-layer node draws nothing in the VNode tree, so every
// export path emitted an empty `<g>` for a dashboard widget and said nothing about it.
// These tests hold the replacement to three promises:
//
//   1. PLACED     — a captured widget lands at the node's world rect, and its geometry
//                   is real geometry (so `vnodeBounds` and the PDF painter both see it).
//   2. NEVER SILENT — every degradation (HTML-only, empty, dropped) produces a warning
//                   AND a visible box. A blank with no diagnostic is the failure mode
//                   this whole module exists to make impossible.
//   3. PURE       — same captures in, same VNodes and warnings out. No DOM reaches here.

import {
  customNodeBounds,
  customNodeVNodes,
  filterCaptures,
  viewBoxTransform,
  type CustomNodeCapture,
} from './custom-nodes';
import { exportSvg } from './svg-export';
import type { VNode } from '../types/vnode.types';

const rect = { x: 100, y: 40, width: 320, height: 180 };

const vectorCapture = (overrides: Partial<CustomNodeCapture> = {}): CustomNodeCapture => ({
  id: 'w1',
  rect,
  fidelity: 'vector',
  content: [{ type: 'circle', props: { cx: 10, cy: 10, r: 5, fill: '#3b52d9' }, children: [] }],
  ...overrides,
});

/** The root a real export starts from. */
const root = (children: VNode[] = []): VNode => ({
  type: 'svg',
  props: { viewBox: '0 0 800 600' },
  children,
});

describe('customNodeVNodes — placement', () => {
  it('wraps a vector capture in a group translated to the node world rect', () => {
    const { nodes, warnings } = customNodeVNodes([vectorCapture()]);

    expect(warnings).toEqual([]);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].type).toBe('g');
    expect(nodes[0].props['transform']).toBe('translate(100 40)');
    expect(nodes[0].props['data-node-id']).toBe('w1');
    // The captured content is carried through untouched — host-relative stays
    // host-relative, because the group's translate is what makes it world-space.
    expect(nodes[0].children?.[0]).toEqual({
      type: 'circle',
      props: { cx: 10, cy: 10, r: 5, fill: '#3b52d9' },
      children: [],
    });
  });

  it('preserves input order, so two exports of one board are byte-identical', () => {
    const captures = [
      vectorCapture({ id: 'a' }),
      vectorCapture({ id: 'b' }),
      vectorCapture({ id: 'c' }),
    ];
    const once = customNodeVNodes(captures);
    const twice = customNodeVNodes(captures);

    expect(once.nodes.map(n => n.props['data-node-id'])).toEqual(['a', 'b', 'c']);
    expect(JSON.stringify(once)).toBe(JSON.stringify(twice));
  });
});

describe('customNodeVNodes — never a silent blank', () => {
  it('warns AND emits a box when the host had nothing capturable', () => {
    const { nodes, warnings } = customNodeVNodes([{ id: 'w1', rect, fidelity: 'empty' }]);

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('w1');
    expect(warnings[0]).toContain('EMPTY BOX');
    // The box is REAL geometry at the node's rect — the diagnostic is visible in the
    // file as well as in the warnings array.
    expect(nodes[0].type).toBe('rect');
    expect(nodes[0].props).toMatchObject({ x: 100, y: 40, width: 320, height: 180 });
  });

  it('treats a vector capture with empty content as empty rather than emitting a bare group', () => {
    const { nodes, warnings } = customNodeVNodes([vectorCapture({ content: [] })]);

    expect(nodes[0].type).toBe('rect');
    expect(warnings[0]).toContain('captured content was empty');
  });

  it('embeds HTML in a foreignObject and names the targets that will drop it', () => {
    const capture: CustomNodeCapture = {
      id: 'grid',
      rect,
      fidelity: 'html',
      html: '<div>rows</div>',
    };
    const { nodes, warnings } = customNodeVNodes([capture]);

    expect(nodes[0].type).toBe('foreignObject');
    expect(nodes[0].props).toMatchObject({ x: 100, y: 40, width: 320, height: 180 });
    expect(nodes[0].children?.[0].props['innerHTML']).toBe('<div>rows</div>');
    // The warning has to be actionable: it must say WHERE this will be blank.
    expect(warnings[0]).toContain('grid');
    expect(warnings[0]).toMatch(/PDF/);
    expect(warnings[0]).toMatch(/foreignObject/);
  });

  it('htmlFallback "placeholder" swaps the embed for a box, and says so', () => {
    const { nodes, warnings } = customNodeVNodes(
      [{ id: 'grid', rect, fidelity: 'html', html: '<div>rows</div>' }],
      { htmlFallback: 'placeholder' }
    );

    expect(nodes[0].type).toBe('rect');
    expect(warnings[0]).toContain('PLACEHOLDER BOX');
  });

  it('htmlFallback "omit" drops the node — but never quietly', () => {
    const { nodes, warnings } = customNodeVNodes(
      [{ id: 'grid', rect, fidelity: 'html', html: '<div>rows</div>' }],
      { htmlFallback: 'omit' }
    );

    expect(nodes).toHaveLength(0);
    expect(warnings[0]).toContain('DROPPED');
    expect(warnings[0]).toContain('missing from this export');
  });

  it('falls back to a placeholder when a capture claims HTML but carries none', () => {
    const { nodes, warnings } = customNodeVNodes([{ id: 'grid', rect, fidelity: 'html' }]);

    expect(nodes[0].type).toBe('rect');
    expect(warnings[0]).toContain('nothing to embed');
  });
});

describe('viewBoxTransform — the fit the browser does for an inline <svg>', () => {
  it('scales uniformly and centres the slack under the default meet', () => {
    // 640x250 viewBox into a 320x250 box: uniform scale 0.5, so the drawn height is
    // 125 and 62.5px of vertical slack is split evenly.
    expect(viewBoxTransform({ x: 0, y: 0, width: 640, height: 250 }, { width: 320, height: 250 })).toBe(
      'translate(0 62.5) scale(0.5)'
    );
  });

  it('honours xMin/yMin alignment by not centring', () => {
    expect(
      viewBoxTransform({ x: 0, y: 0, width: 640, height: 250 }, { width: 320, height: 250 }, 'xMinYMin meet')
    ).toBe('scale(0.5)');
  });

  it('stretches each axis independently under preserveAspectRatio="none"', () => {
    // This is the KPI sparkline's mode — it is meant to distort to the card's width.
    expect(
      viewBoxTransform({ x: 0, y: 0, width: 240, height: 40 }, { width: 480, height: 40 }, 'none')
    ).toBe('scale(2 1)');
  });

  it('undoes a non-zero viewBox origin', () => {
    expect(viewBoxTransform({ x: 10, y: 5, width: 100, height: 100 }, { width: 100, height: 100 })).toBe(
      'translate(-10 -5)'
    );
  });

  it('returns no transform for a degenerate viewBox rather than dividing by zero', () => {
    expect(viewBoxTransform({ x: 0, y: 0, width: 0, height: 100 }, { width: 50, height: 50 })).toBe('');
  });
});

describe('customNodeBounds', () => {
  it('unions the capture rects', () => {
    expect(
      customNodeBounds([
        vectorCapture({ id: 'a', rect: { x: 0, y: 0, width: 100, height: 50 } }),
        vectorCapture({ id: 'b', rect: { x: 200, y: 80, width: 100, height: 50 } }),
      ])
    ).toEqual({ x: 0, y: 0, width: 300, height: 130 });
  });

  it('respects an id filter', () => {
    const bounds = customNodeBounds(
      [
        vectorCapture({ id: 'a', rect: { x: 0, y: 0, width: 100, height: 50 } }),
        vectorCapture({ id: 'b', rect: { x: 900, y: 900, width: 100, height: 50 } }),
      ],
      new Set(['a'])
    );
    expect(bounds).toEqual({ x: 0, y: 0, width: 100, height: 50 });
  });

  it('is null when there is nothing to measure', () => {
    expect(customNodeBounds([])).toBeNull();
  });

  it('ignores a capture with a non-finite rect instead of poisoning the union', () => {
    const bounds = customNodeBounds([
      vectorCapture({ id: 'a', rect: { x: 0, y: 0, width: 100, height: 50 } }),
      vectorCapture({ id: 'bad', rect: { x: NaN, y: 0, width: 10, height: 10 } }),
    ]);
    expect(bounds).toEqual({ x: 0, y: 0, width: 100, height: 50 });
  });
});

describe('filterCaptures', () => {
  it('passes everything through when no ids are given', () => {
    const captures = [vectorCapture({ id: 'a' }), vectorCapture({ id: 'b' })];
    expect(filterCaptures(captures, undefined)).toBe(captures);
  });

  it('keeps only the requested ids', () => {
    const kept = filterCaptures([vectorCapture({ id: 'a' }), vectorCapture({ id: 'b' })], ['b']);
    expect(kept.map(c => c.id)).toEqual(['b']);
  });
});

describe('exportSvg — custom nodes reach the document', () => {
  it('serializes captured widget content into the file', () => {
    const { svg } = exportSvg(root(), { customNodes: [vectorCapture()] });

    expect(svg).toContain('<g class="grafloria-custom-node"');
    expect(svg).toContain('transform="translate(100 40)"');
    expect(svg).toContain('<circle cx="10" cy="10" r="5" fill="#3b52d9"/>');
  });

  it('paints custom nodes ABOVE the diagram, as the live html layer does', () => {
    const tree = root([{ type: 'rect', props: { x: 0, y: 0, width: 10, height: 10 }, children: [] }]);
    const { svg } = exportSvg(tree, { customNodes: [vectorCapture()] });

    expect(svg.indexOf('<rect')).toBeLessThan(svg.indexOf('grafloria-custom-node'));
  });

  it('fits the viewBox to the widgets when the tree itself draws NOTHING', () => {
    // The regression that made this whole task necessary: a board of six HTML-layer
    // widgets renders as six empty groups, so the content fit found no geometry and
    // produced a 40px square containing nothing whatsoever.
    const { svg, viewBox } = exportSvg(root(), {
      customNodes: [vectorCapture({ rect: { x: 100, y: 40, width: 320, height: 180 } })],
      padding: 10,
    });

    expect(viewBox).toEqual({ x: 90, y: 30, width: 340, height: 200 });
    expect(svg).toContain('viewBox="90 30 340 200"');
  });

  it('unions widget rects with the drawn geometry rather than replacing it', () => {
    const tree = root([
      { type: 'rect', props: { x: 0, y: 0, width: 50, height: 50 }, children: [] },
    ]);
    const { viewBox } = exportSvg(tree, {
      customNodes: [vectorCapture({ rect: { x: 200, y: 200, width: 100, height: 100 } })],
      padding: 0,
    });

    expect(viewBox).toEqual({ x: 0, y: 0, width: 300, height: 300 });
  });

  it('scopes widgets by includeIds, exactly as it prunes nodes', () => {
    const { svg } = exportSvg(root(), {
      customNodes: [vectorCapture({ id: 'keep' }), vectorCapture({ id: 'drop' })],
      includeIds: ['keep'],
    });

    expect(svg).toContain('data-node-id="keep"');
    expect(svg).not.toContain('data-node-id="drop"');
  });

  it('surfaces capture warnings on the export result', () => {
    const { warnings } = exportSvg(root(), {
      customNodes: [{ id: 'w1', rect, fidelity: 'empty' }],
    });

    expect(warnings.some(w => w.includes('w1') && w.includes('EMPTY BOX'))).toBe(true);
  });

  it('stays deterministic with custom nodes present', () => {
    const options = { customNodes: [vectorCapture({ id: 'a' }), vectorCapture({ id: 'b' })] };
    expect(exportSvg(root(), options).svg).toBe(exportSvg(root(), options).svg);
  });

  it('is unchanged when no captures are supplied — the pure path keeps its bytes', () => {
    const tree = root([{ type: 'rect', props: { x: 0, y: 0, width: 10, height: 10 }, children: [] }]);
    expect(exportSvg(tree, { customNodes: [] }).svg).toBe(exportSvg(tree).svg);
  });
});
