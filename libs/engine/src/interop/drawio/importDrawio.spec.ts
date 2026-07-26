// .drawio import v1 — the mapping contract, specced against hand-built mxGraph
// fixtures AND a compressed round-trip produced with Node's own zlib
// (deflateRawSync emits exactly the raw-deflate stream DecompressionStream
// must consume, so the compressed spec proves the REAL decode path end-to-end).

import { deflateRawSync } from 'zlib';
import { importDrawio, stripHtmlToText } from './importDrawio';
import type { DiagramModel } from '../../models/DiagramModel';

/** Wrap cell markup in the standard mxGraph skeleton (root + default layer). */
const model = (cells: string): string =>
  `<mxGraphModel dx="800" dy="600" grid="1"><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells}</root></mxGraphModel>`;

const vertex = (id: string, opts: { parent?: string; value?: string; style?: string; x?: number; y?: number; w?: number; h?: number } = {}): string =>
  `<mxCell id="${id}" value="${opts.value ?? ''}" style="${opts.style ?? 'rounded=0;whiteSpace=wrap;html=1;'}" vertex="1" parent="${opts.parent ?? '1'}">` +
  `<mxGeometry x="${opts.x ?? 0}" y="${opts.y ?? 0}" width="${opts.w ?? 120}" height="${opts.h ?? 60}" as="geometry"/></mxCell>`;

/** draw.io's exact compressed page encoding: URI-encode → raw deflate → base64. */
const compress = (xml: string): string =>
  deflateRawSync(Buffer.from(encodeURIComponent(xml), 'ascii')).toString('base64');

const shapeOf = (d: DiagramModel, id: string): Record<string, unknown> =>
  d.getNode(id)!.getMetadata('shape') as Record<string, unknown>;

describe('importDrawio — vertices and geometry', () => {
  it('imports a plain <mxGraphModel> vertex with absolute geometry, label and size', async () => {
    const { diagram, error } = await importDrawio(model(vertex('a', { value: 'Start', x: 40, y: 80, w: 160, h: 70 })));
    expect(error).toBeUndefined();
    const node = diagram!.getNode('a')!;
    expect(node.position).toMatchObject({ x: 40, y: 80 });
    expect(node.size).toMatchObject({ width: 160, height: 70 });
    expect(node.getLabel()).toBe('Start');
  });

  it('converts child geometry (RELATIVE to its parent) to absolute — nested containers sum', async () => {
    // outer at (300,80); inner container at (20,30) INSIDE outer; leaf at (5,7) INSIDE inner.
    const xml = model(
      vertex('outer', { style: 'swimlane;', x: 300, y: 80, w: 400, h: 300 }) +
        vertex('inner', { parent: 'outer', style: 'swimlane;', x: 20, y: 30, w: 200, h: 150 }) +
        vertex('leaf', { parent: 'inner', x: 5, y: 7, w: 80, h: 40 })
    );
    const { diagram } = await importDrawio(xml);
    expect(diagram!.getNode('leaf')!.position).toMatchObject({ x: 325, y: 117 });
    // The containers themselves became groups with world-absolute frames.
    expect(diagram!.getGroup('outer')!.getOuterBounds()).toMatchObject({ x: 300, y: 80, width: 400, height: 300 });
    expect(diagram!.getGroup('inner')!.getOuterBounds()).toMatchObject({ x: 320, y: 110, width: 200, height: 150 });
  });

  it('strips HTML from values into plain-text labels', async () => {
    const { diagram } = await importDrawio(
      model(vertex('a', { value: '&lt;b&gt;Bold&lt;/b&gt;&lt;br&gt;line' }))
    );
    expect(diagram!.getNode('a')!.getLabel()).toBe('Bold line');
    expect(stripHtmlToText('<div>one</div><div>two</div>')).toBe('one two');
  });

  it('unwraps UserObject wrappers, keeping label, link and custom data', async () => {
    const xml = model(
      '<UserObject id="u1" label="Wrapped" link="https://example.com" dept="ops">' +
        '<mxCell style="rounded=0;" vertex="1" parent="1"><mxGeometry x="10" y="10" width="100" height="40" as="geometry"/></mxCell>' +
        '</UserObject>'
    );
    const { diagram, warnings } = await importDrawio(xml);
    const node = diagram!.getNode('u1')!;
    expect(node.getLabel()).toBe('Wrapped');
    expect(node.getMetadata('drawioLink')).toBe('https://example.com');
    expect(node.getMetadata('drawioData')).toEqual({ dept: 'ops' });
    expect(warnings.filter((w) => w.includes('u1'))).toHaveLength(0); // kept, so no warning
  });
});

describe('importDrawio — style mapping', () => {
  it('maps the known shape tokens and rounded=1 → rect + cornerRadius', async () => {
    const xml = model(
      vertex('r', { style: 'rounded=1;fillColor=#dae8fc;strokeColor=#6c8ebf;' }) +
        vertex('e', { style: 'ellipse;whiteSpace=wrap;' }) +
        vertex('d', { style: 'rhombus;' }) +
        vertex('t', { style: 'triangle;' }) +
        vertex('h', { style: 'shape=hexagon;perimeter=hexagonPerimeter2;' }) +
        vertex('c', { style: 'shape=cylinder3;whiteSpace=wrap;' })
    );
    const { diagram } = await importDrawio(xml);
    expect(shapeOf(diagram!, 'r')).toMatchObject({ type: 'rect', cornerRadius: 8, fill: '#dae8fc', stroke: '#6c8ebf' });
    expect(shapeOf(diagram!, 'e')['type']).toBe('ellipse');
    expect(shapeOf(diagram!, 'd')['type']).toBe('diamond');
    expect(shapeOf(diagram!, 't')['type']).toBe('triangle');
    expect(shapeOf(diagram!, 'h')['type']).toBe('hexagon');
    expect(shapeOf(diagram!, 'c')['type']).toBe('cylinder');
  });

  it('falls back to rect for an UNKNOWN shape token — with a warning NAMING it', async () => {
    const { diagram, warnings } = await importDrawio(model(vertex('x', { style: 'shape=mscae/Cloud;' })));
    expect(shapeOf(diagram!, 'x')['type']).toBe('rect');
    expect(warnings.some((w) => w.includes('mscae/Cloud') && w.includes('"x"'))).toBe(true);
  });

  it('maps dashed and fontColor into the typed style bag (they must PAINT, not ride as data)', async () => {
    const { diagram } = await importDrawio(
      model(vertex('a', { style: 'rounded=0;dashed=1;fontColor=#990000;opacity=50;' }))
    );
    const style = diagram!.getNode('a')!.style!;
    expect(style.strokeDasharray).toBeTruthy();
    expect(style.color).toBe('#990000');
    expect(style.opacity).toBe(0.5);
  });

  it('imports text-style cells as label-only nodes (no box paint)', async () => {
    const { diagram } = await importDrawio(
      model(vertex('t1', { value: 'Just a note', style: 'text;html=1;align=center;' }))
    );
    const node = diagram!.getNode('t1')!;
    expect(node.getLabel()).toBe('Just a note');
    expect(shapeOf(diagram!, 't1')).toMatchObject({ fill: 'none', stroke: 'none' });
  });

  it('aggregates unmapped style keys into ONE deduped warning', async () => {
    const { warnings } = await importDrawio(
      model(vertex('a', { style: 'rounded=0;whiteSpace=wrap;html=1;' }) + vertex('b', { style: 'rounded=1;whiteSpace=wrap;glass=1;' }))
    );
    const styleWarnings = warnings.filter((w) => w.startsWith('unmapped style keys'));
    expect(styleWarnings).toHaveLength(1);
    expect(styleWarnings[0]).toContain('whiteSpace');
    expect(styleWarnings[0]).toContain('glass');
    // deduped: whiteSpace appears once despite two cells carrying it
    expect(styleWarnings[0].match(/whiteSpace/g)).toHaveLength(1);
  });
});

describe('importDrawio — groups', () => {
  it('swimlanes become groups with real membership; plain parent-referenced vertices too', async () => {
    const xml = model(
      vertex('lane', { value: 'Team A', style: 'swimlane;', x: 40, y: 40, w: 300, h: 200 }) +
        vertex('a', { parent: 'lane', x: 30, y: 50 }) +
        // 'box' has NO group-ish style — it is a container ONLY because 'b' names it parent.
        vertex('box', { x: 400, y: 40, w: 250, h: 180 }) +
        vertex('b', { parent: 'box', x: 10, y: 20 })
    );
    const { diagram } = await importDrawio(xml);
    const lane = diagram!.getGroup('lane')!;
    expect(lane.name).toBe('Team A');
    expect(lane.members.has('a')).toBe(true);
    const box = diagram!.getGroup('box')!;
    expect(box.members.has('b')).toBe(true);
    expect(diagram!.getNode('b')!.position).toMatchObject({ x: 410, y: 60 });
  });

  it('nested containers nest: the inner group is a MEMBER of the outer group', async () => {
    const xml = model(
      vertex('outer', { style: 'swimlane;', x: 0, y: 0, w: 500, h: 400 }) +
        vertex('inner', { parent: 'outer', style: 'swimlane;', x: 40, y: 60, w: 200, h: 150 }) +
        vertex('n', { parent: 'inner', x: 10, y: 10 })
    );
    const { diagram } = await importDrawio(xml);
    expect(diagram!.getGroup('outer')!.members.has('inner')).toBe(true);
    expect(diagram!.getGroup('inner')!.members.has('n')).toBe(true);
    expect(diagram!.getGroup('inner')!.parentGroupId).toBe('outer');
  });

  it('imports a collapsed container EXPANDED (via alternateBounds) with a warning', async () => {
    const xml = model(
      `<mxCell id="c1" value="Folded" style="swimlane;" vertex="1" collapsed="1" parent="1">` +
        `<mxGeometry x="10" y="10" width="140" height="30" as="geometry">` +
        `<mxRectangle x="10" y="10" width="300" height="220" as="alternateBounds"/></mxGeometry></mxCell>` +
        vertex('k', { parent: 'c1', x: 20, y: 40 })
    );
    const { diagram, warnings } = await importDrawio(xml);
    expect(diagram!.getGroup('c1')!.getOuterBounds()).toMatchObject({ width: 300, height: 220 });
    expect(warnings.some((w) => w.includes('collapsed container "c1"'))).toBe(true);
  });
});

describe('importDrawio — edges', () => {
  const twoNodes = vertex('a', { x: 0, y: 0 }) + vertex('b', { x: 300, y: 0 });

  it('imports an edge between two vertices, with its inline label', async () => {
    const xml = model(
      twoNodes +
        `<mxCell id="e1" value="yes" style="edgeStyle=orthogonalEdgeStyle;" edge="1" parent="1" source="a" target="b"><mxGeometry relative="1" as="geometry"/></mxCell>`
    );
    const { diagram, warnings } = await importDrawio(xml);
    expect(diagram!.getLinks()).toHaveLength(1);
    const link = diagram!.getLinks()[0];
    expect(link.sourceNodeId).toBe('a');
    expect(link.targetNodeId).toBe('b');
    expect(link.getLabel()).toBe('yes');
    expect(link.pathType).toBe('orthogonal');
    expect(link.getMetadata('drawioId')).toBe('e1');
    expect(warnings.filter((w) => w.includes('e1'))).toHaveLength(0);
  });

  it('reads the label from a CHILD edge-label cell when the edge itself has no value', async () => {
    const xml = model(
      twoNodes +
        `<mxCell id="e1" style="" edge="1" parent="1" source="a" target="b"><mxGeometry relative="1" as="geometry"/></mxCell>` +
        `<mxCell id="e1lab" value="maybe" style="edgeLabel;html=1;" vertex="1" connectable="0" parent="e1"><mxGeometry x="-0.2" relative="1" as="geometry"/></mxCell>`
    );
    const { diagram } = await importDrawio(xml);
    expect(diagram!.getLinks()[0].getLabel()).toBe('maybe');
    // the label cell is CONSUMED, not imported as a stray node
    expect(diagram!.getNode('e1lab')).toBeUndefined();
  });

  it('skips edges with missing endpoints — one warning each, naming the reason', async () => {
    const xml = model(
      twoNodes +
        `<mxCell id="dangling" style="" edge="1" parent="1" source="a"><mxGeometry relative="1" as="geometry"/></mxCell>` +
        `<mxCell id="ghost" style="" edge="1" parent="1" source="a" target="nope"><mxGeometry relative="1" as="geometry"/></mxCell>`
    );
    const { diagram, warnings } = await importDrawio(xml);
    expect(diagram!.getLinks()).toHaveLength(0);
    expect(warnings.some((w) => w.includes('"dangling"') && w.includes('no target'))).toBe(true);
    expect(warnings.some((w) => w.includes('"ghost"') && w.includes('"nope"'))).toBe(true);
  });

  it('stores manual waypoints under metadata (NOT link.points) and warns once', async () => {
    const xml = model(
      twoNodes +
        `<mxCell id="e1" style="" edge="1" parent="1" source="a" target="b">` +
        `<mxGeometry relative="1" as="geometry"><Array as="points"><mxPoint x="150" y="200"/><mxPoint x="180" y="220"/></Array></mxGeometry></mxCell>`
    );
    const { diagram, warnings } = await importDrawio(xml);
    const link = diagram!.getLinks()[0];
    expect(link.getMetadata('drawioWaypoints')).toEqual([
      { x: 150, y: 200 },
      { x: 180, y: 220 },
    ]);
    // the routed polyline is the engine's own, not the mxGraph waypoints
    expect(link.points.some((p) => p.x === 150 && p.y === 200)).toBe(false);
    expect(warnings.filter((w) => w.includes('waypoints'))).toHaveLength(1);
  });
});

describe('importDrawio — mxfile wrapper and compression', () => {
  const flow = model(
    vertex('a', { value: 'A', x: 0, y: 0 }) +
      vertex('b', { value: 'B', x: 200, y: 0 }) +
      `<mxCell id="e" style="" edge="1" parent="1" source="a" target="b"><mxGeometry relative="1" as="geometry"/></mxCell>`
  );

  it('decodes the compressed <mxfile><diagram> payload IDENTICALLY to the plain import', async () => {
    const wrapped = `<mxfile host="app.diagrams.net"><diagram id="d1" name="Page-1">${compress(flow)}</diagram></mxfile>`;
    const plain = await importDrawio(flow);
    const compressed = await importDrawio(wrapped);
    expect(compressed.error).toBeUndefined();
    const view = (d: DiagramModel) => ({
      nodes: d.getNodes().map((n) => ({ id: n.id, label: n.getLabel(), pos: n.position })),
      links: d.getLinks().map((l) => [l.sourceNodeId, l.targetNodeId]),
    });
    expect(view(compressed.diagram!)).toEqual(view(plain.diagram!));
    expect(compressed.warnings).toEqual(plain.warnings);
  });

  it('accepts an UNCOMPRESSED <mxfile> whose page nests the model as a child element', async () => {
    const wrapped = `<mxfile host="app.diagrams.net"><diagram id="d1" name="Page-1">${flow}</diagram></mxfile>`;
    const { diagram, error } = await importDrawio(wrapped);
    expect(error).toBeUndefined();
    expect(diagram!.getNodes()).toHaveLength(2);
  });

  it('imports the FIRST page of a multi-page file and says so', async () => {
    const wrapped =
      `<mxfile><diagram id="d1" name="One">${compress(flow)}</diagram>` +
      `<diagram id="d2" name="Two">${compress(model(vertex('z')))}</diagram></mxfile>`;
    const { diagram, warnings } = await importDrawio(wrapped);
    expect(diagram!.getNode('a')).toBeDefined();
    expect(diagram!.getNode('z')).toBeUndefined();
    expect(warnings.some((w) => w.includes('page 1 of 2'))).toBe(true);
  });
});

describe('importDrawio — failure honesty', () => {
  it('returns {error} and never throws on garbage input', async () => {
    for (const garbage of ['', 'hello world', '<html><body>nope</body></html>', '<mxfile><diagram>%%%not-base64%%%</diagram></mxfile>']) {
      const result = await importDrawio(garbage);
      expect(result.error).toBeTruthy();
      expect(result.diagram).toBeUndefined();
    }
  });

  it('returns {error} on TRUNCATED compressed payloads', async () => {
    const truncated = compress(model(vertex('a'))).slice(0, 12);
    const result = await importDrawio(`<mxfile><diagram>${truncated}</diagram></mxfile>`);
    expect(result.error).toBeTruthy();
    expect(result.diagram).toBeUndefined();
  });

  it('imports an EMPTY model as an empty diagram with NO warnings', async () => {
    const { diagram, warnings, error } = await importDrawio(model(''));
    expect(error).toBeUndefined();
    expect(diagram!.getNodes()).toHaveLength(0);
    expect(diagram!.getLinks()).toHaveLength(0);
    expect(diagram!.getGroups()).toHaveLength(0);
    expect(warnings).toEqual([]);
  });
});
