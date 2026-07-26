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

  it('APPLIES manual waypoints: full polyline in link.points, hasManualWaypoints set, provenance kept', async () => {
    const xml = model(
      twoNodes +
        `<mxCell id="e1" style="" edge="1" parent="1" source="a" target="b">` +
        `<mxGeometry relative="1" as="geometry"><Array as="points"><mxPoint x="150" y="200"/><mxPoint x="180" y="220"/></Array></mxGeometry></mxCell>`
    );
    const { diagram, warnings } = await importDrawio(xml);
    const link = diagram!.getLinks()[0];
    // The authored points survive as provenance…
    expect(link.getMetadata('drawioWaypoints')).toEqual([
      { x: 150, y: 200 },
      { x: 180, y: 220 },
    ]);
    // …AND the polyline is applied: attach point, waypoints, attach point.
    expect(link.points.length).toBe(4);
    expect(link.points[1]).toEqual({ x: 150, y: 200 });
    expect(link.points[2]).toEqual({ x: 180, y: 220 });
    // The flag is what makes the router respect the polyline (and what the
    // layout invalidation clears when a layout moves an endpoint).
    expect(link.getMetadata('hasManualWaypoints')).toBe(true);
    // Applied means nothing was lost — no waypoint warning any more.
    expect(warnings.filter((w) => w.includes('waypoints'))).toHaveLength(0);
  });

  it('converts waypoints of a CONTAINER-NESTED edge to world coordinates (parent-space rule)', async () => {
    // The lane sits at (300,100); the edge and its endpoints live INSIDE it, so
    // the authored waypoint (50,60) is lane-relative and must land at (350,160).
    const xml = model(
      vertex('lane', { style: 'swimlane;', x: 300, y: 100, w: 400, h: 300 }) +
        vertex('a', { parent: 'lane', x: 10, y: 20 }) +
        vertex('b', { parent: 'lane', x: 250, y: 200 }) +
        `<mxCell id="e1" style="" edge="1" parent="lane" source="a" target="b">` +
        `<mxGeometry relative="1" as="geometry"><Array as="points"><mxPoint x="50" y="60"/></Array></mxGeometry></mxCell>`
    );
    const { diagram } = await importDrawio(xml);
    const link = diagram!.getLinks()[0];
    expect(link.points[1]).toEqual({ x: 350, y: 160 });
    // Provenance keeps the AUTHORED (parent-relative) values, untranslated.
    expect(link.getMetadata('drawioWaypoints')).toEqual([{ x: 50, y: 60 }]);
  });

  it('a layout that moves an endpoint clears the applied waypoints (the invalidation contract)', async () => {
    const xml = model(
      twoNodes +
        `<mxCell id="e1" style="" edge="1" parent="1" source="a" target="b">` +
        `<mxGeometry relative="1" as="geometry"><Array as="points"><mxPoint x="150" y="200"/></Array></mxGeometry></mxCell>`
    );
    const { diagram } = await importDrawio(xml);
    const link = diagram!.getLinks()[0];
    expect(link.getMetadata('hasManualWaypoints')).toBe(true);

    const before = new Map(diagram!.getNodes().map((n) => [n.id, { ...n.position }]));
    await diagram!.reLayout();
    const moved = diagram!
      .getNodes()
      .filter((n) => n.position.x !== before.get(n.id)!.x || n.position.y !== before.get(n.id)!.y);
    expect(moved.length).toBeGreaterThan(0); // otherwise this test asserts nothing

    expect(link.getMetadata('hasManualWaypoints')).toBe(false);
    expect(link.points).toEqual([]); // the canonical "re-route on next paint" state
    // Provenance is NOT part of the routed state; it survives the layout.
    expect(link.getMetadata('drawioWaypoints')).toEqual([{ x: 150, y: 200 }]);
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

describe('importDrawio — multi-page files', () => {
  const pageA = model(vertex('a', { value: 'Alpha' }));
  const pageB = model(vertex('z', { value: 'Zulu', x: 50, y: 60 }));

  it('imports EVERY page under pages[]; diagram stays page 1; top-level warnings stay page-1 + file-level', async () => {
    const wrapped =
      `<mxfile><diagram id="d1" name="One">${compress(pageA)}</diagram>` +
      `<diagram id="d2" name="Two">${pageB}</diagram></mxfile>`; // page 2 uncompressed on purpose: both encodings, one file
    const { diagram, warnings, error, pages } = await importDrawio(wrapped);
    expect(error).toBeUndefined();
    expect(pages).toHaveLength(2);
    expect(pages![0]).toMatchObject({ name: 'One', index: 0 });
    expect(pages![1]).toMatchObject({ name: 'Two', index: 1 });
    // diagram IS pages[0].diagram — the back-compatible face of the result.
    expect(diagram).toBe(pages![0].diagram);
    expect(diagram!.getNode('a')).toBeDefined();
    expect(diagram!.getNode('z')).toBeUndefined();
    // Page 2 compiled independently, into its OWN diagram.
    expect(pages![1].diagram!.getNode('z')!.getLabel()).toBe('Zulu');
    expect(pages![1].error).toBeUndefined();
    expect(warnings.some((w) => w.includes('page 1 of 2'))).toBe(true);
  });

  it('pages[] is present ONLY for files with more than one <diagram>', async () => {
    const single = await importDrawio(`<mxfile><diagram id="d1" name="Solo">${compress(pageA)}</diagram></mxfile>`);
    expect(single.pages).toBeUndefined();
    expect(single.diagram!.getNode('a')).toBeDefined();
    const bare = await importDrawio(pageA);
    expect(bare.pages).toBeUndefined();
  });

  it('one CORRUPT page fails ALONE, with its own error entry — the other pages still import', async () => {
    const wrapped =
      `<mxfile><diagram id="d1" name="Good">${compress(pageA)}</diagram>` +
      `<diagram id="d2" name="Broken">%%%not-base64%%%</diagram>` +
      `<diagram id="d3" name="AlsoGood">${compress(pageB)}</diagram></mxfile>`;
    const { diagram, warnings, error, pages } = await importDrawio(wrapped);
    expect(error).toBeUndefined(); // page 1 is fine, so the FILE is not fatal
    expect(diagram!.getNode('a')).toBeDefined();
    expect(pages).toHaveLength(3);
    expect(pages![1].error).toContain('page 2');
    expect(pages![1].error).toContain('Broken');
    expect(pages![1].diagram).toBeUndefined();
    expect(pages![2].diagram!.getNode('z')).toBeDefined();
    // The broken page is file-level news too — named once in the top warnings.
    expect(warnings.some((w) => w.includes('page 2') && w.includes('Broken'))).toBe(true);
  });

  it('a corrupt FIRST page fails that page (top-level error mirrors it) without sinking the rest', async () => {
    const wrapped =
      `<mxfile><diagram id="d1" name="Broken">%%%garbage%%%</diagram>` +
      `<diagram id="d2" name="Good">${compress(pageB)}</diagram></mxfile>`;
    const { diagram, error, pages } = await importDrawio(wrapped);
    expect(diagram).toBeUndefined();
    expect(error).toContain('page 1');
    expect(pages).toHaveLength(2);
    expect(pages![1].diagram!.getNode('z')).toBeDefined();
  });
});

describe('importDrawio — edge visual fidelity', () => {
  const twoNodes = vertex('a', { x: 0, y: 0 }) + vertex('b', { x: 300, y: 0 });
  const edge = (style: string, value = ''): string =>
    `<mxCell id="e1" value="${value}" style="${style}" edge="1" parent="1" source="a" target="b"><mxGeometry relative="1" as="geometry"/></mxCell>`;

  const importEdge = async (style: string, value = '') => {
    const { diagram, warnings } = await importDrawio(model(twoNodes + edge(style, value)));
    return { link: diagram!.getLinks()[0], warnings };
  };

  it('maps startArrow/endArrow tokens onto arrowTail/arrowHead', async () => {
    const { link } = await importEdge('startArrow=diamond;startFill=1;endArrow=block;endFill=1;');
    expect(link.style.arrowHead).toMatchObject({ type: 'arrow', filled: true });
    expect(link.style.arrowTail).toMatchObject({ type: 'diamond', filled: true });
  });

  it('open and unfilled markers arrive unfilled; oval maps; none kills the head arrow', async () => {
    const open = (await importEdge('endArrow=open;')).link;
    expect(open.style.arrowHead).toMatchObject({ type: 'open-arrow', filled: false });
    const unfilled = (await importEdge('endArrow=diamond;endFill=0;')).link;
    expect(unfilled.style.arrowHead).toMatchObject({ type: 'diamond', filled: false });
    const oval = (await importEdge('endArrow=oval;')).link;
    expect(oval.style.arrowHead).toMatchObject({ type: 'oval' });
    const none = (await importEdge('endArrow=none;')).link;
    expect(none.style.arrowHead).toMatchObject({ type: 'none' });
  });

  it('an UNKNOWN arrow token keeps the engine default — with a warning naming it', async () => {
    const { link, warnings } = await importEdge('endArrow=dragonTail;');
    expect(link.style.arrowHead).toBeUndefined();
    expect(warnings.some((w) => w.includes('dragonTail') && w.includes('"e1"'))).toBe(true);
  });

  it('absent arrow tokens set nothing — the engine default already matches draw.io defaults', async () => {
    const { link, warnings } = await importEdge('');
    expect(link.style.arrowHead).toBeUndefined();
    expect(link.style.arrowTail).toBeUndefined();
    expect(warnings.filter((w) => w.includes('Arrow'))).toHaveLength(0);
  });

  it('edge strokeColor / strokeWidth / dashed PAINT via LinkStyle', async () => {
    const { link } = await importEdge('strokeColor=#cc0000;strokeWidth=3;dashed=1;');
    expect(link.style.stroke).toBe('#cc0000');
    expect(link.style.strokeWidth).toBe(3);
    expect(link.style.strokeDasharray).toBeTruthy();
  });

  it('curved=1 beats an orthogonal edgeStyle: the link imports as smooth', async () => {
    const { link } = await importEdge('edgeStyle=orthogonalEdgeStyle;curved=1;');
    expect(link.pathType).toBe('smooth');
  });

  it('rounded on an orthogonal edge: 1 → rounded connector (arcSize/2 radius), 0 → hard corners', async () => {
    const roundedEdge = (await importEdge('edgeStyle=orthogonalEdgeStyle;rounded=1;arcSize=24;')).link;
    expect(roundedEdge.connector).toBe('rounded');
    expect(roundedEdge.style.cornerRadius).toBe(12);
    const hard = (await importEdge('edgeStyle=orthogonalEdgeStyle;rounded=0;')).link;
    expect(hard.connector).toBe('straight');
    const unstated = (await importEdge('edgeStyle=orthogonalEdgeStyle;')).link;
    expect(unstated.connector).toBeUndefined(); // engine default look
  });

  it('edge fontColor/fontSize land on a positioned label with style (canonical label intact)', async () => {
    const { link } = await importEdge('fontColor=#0000cc;fontSize=16;', 'go');
    expect(link.getLabel()).toBe('go');
    expect(link.labels).toHaveLength(1);
    expect(link.labels[0].text).toBe('go');
    expect(link.labels[0].style).toMatchObject({ color: '#0000cc', fontSize: 16 });
  });

  it('a styleless labelled edge keeps the plain canonical label — no positioned label minted', async () => {
    const { link } = await importEdge('', 'plain');
    expect(link.getLabel()).toBe('plain');
    expect(link.labels).toHaveLength(0);
  });
});

describe('importDrawio — arcSize (mxGraph corner-radius semantics)', () => {
  const shapeOfFirst = async (style: string, w = 120, h = 60) => {
    const { diagram } = await importDrawio(model(vertex('r', { style, w, h })));
    return diagram!.getNode('r')!.getMetadata('shape') as Record<string, unknown>;
  };

  it('absoluteArcSize=1: arcSize is a DIAMETER in px — radius = min(w/2, h/2, arcSize/2)', async () => {
    expect((await shapeOfFirst('rounded=1;arcSize=20;absoluteArcSize=1;'))['cornerRadius']).toBe(10);
    // clamped by the short side: min(120/2, 10/2, 90/2) = 5
    expect((await shapeOfFirst('rounded=1;arcSize=90;absoluteArcSize=1;', 120, 10))['cornerRadius']).toBe(5);
  });

  it('relative (default): radius = min(w,h) × arcSize/100, UNCAPPED like mxGraph', async () => {
    expect((await shapeOfFirst('rounded=1;arcSize=50;'))['cornerRadius']).toBe(30); // 60 × 0.5
    expect((await shapeOfFirst('rounded=1;arcSize=10;', 200, 100))['cornerRadius']).toBe(10); // 100 × 0.1
    // mxRectangleShape.paintBackground does NOT cap the percentage branch; the
    // verifier caught the importer capping at min(w,h)/2 and diverging for
    // arcSize>50. SVG clamps rx at paint time, so the MODEL stays faithful.
    expect((await shapeOfFirst('rounded=1;arcSize=80;'))['cornerRadius']).toBe(48); // 60 × 0.8, uncapped
  });

  it('rounded=1 with NO arcSize keeps the classic fixed 8px', async () => {
    expect((await shapeOfFirst('rounded=1;'))['cornerRadius']).toBe(8);
  });

  it('absoluteArcSize=1 with NO arcSize falls back to mxGraph LINE_ARCSIZE/2 = 10', async () => {
    expect((await shapeOfFirst('rounded=1;absoluteArcSize=1;'))['cornerRadius']).toBe(10);
  });
});

describe('importDrawio — container-endpoint edges', () => {
  const fixture = model(
    vertex('lane', { value: 'Zone', style: 'swimlane;', x: 300, y: 50, w: 300, h: 200 }) +
      vertex('in-lane', { parent: 'lane', x: 40, y: 60 }) +
      vertex('outside', { x: 0, y: 100 }) +
      `<mxCell id="e1" edge="1" parent="1" source="outside" target="lane"><mxGeometry relative="1" as="geometry"/></mxCell>`
  );

  it('an edge ending ON a container connects via an invisible group-owned anchor node — no skip warning', async () => {
    const { diagram, warnings } = await importDrawio(fixture);
    expect(diagram!.getLinks()).toHaveLength(1);
    expect(warnings.some((w) => w.includes('skipped'))).toBe(false);

    const link = diagram!.getLinks()[0];
    expect(link.sourceNodeId).toBe('outside');
    const anchor = diagram!.getNode(link.targetNodeId!)!;
    expect(anchor.getMetadata('drawioContainerAnchor')).toBe('lane');
    // Invisible: 1×1, no paint.
    expect(anchor.size).toMatchObject({ width: 1, height: 1 });
    expect(anchor.getMetadata('shape')).toMatchObject({ fill: 'none', stroke: 'none' });
    // Group-owned, so group operations (move/collapse) carry the edge endpoint.
    expect(diagram!.getGroup('lane')!.members.has(anchor.id)).toBe(true);
  });

  it('the anchor pins to the frame edge NEAREST the other endpoint', async () => {
    const { diagram } = await importDrawio(fixture);
    const link = diagram!.getLinks()[0];
    const anchor = diagram!.getNode(link.targetNodeId!)!;
    const cx = anchor.position.x + 0.5;
    const cy = anchor.position.y + 0.5;
    // 'outside' is at (0,100,120×60): center (60,130) — left of the lane frame
    // (300..600 × 50..250), so the pin lands ON the frame's LEFT edge at y=130.
    expect(cx).toBeCloseTo(300, 5);
    expect(cy).toBeCloseTo(130, 5);
  });

  it('an edge with waypoints aims its anchor at the ADJACENT waypoint, not the far endpoint', async () => {
    const withWaypoint = model(
      vertex('lane', { value: 'Zone', style: 'swimlane;', x: 300, y: 50, w: 300, h: 200 }) +
        vertex('outside', { x: 0, y: 100 }) +
        `<mxCell id="e1" edge="1" parent="1" source="outside" target="lane">` +
        `<mxGeometry relative="1" as="geometry"><Array as="points"><mxPoint x="450" y="400"/></Array></mxGeometry></mxCell>`
    );
    const { diagram } = await importDrawio(withWaypoint);
    const link = diagram!.getLinks()[0];
    const anchor = diagram!.getNode(link.targetNodeId!)!;
    // The waypoint (450,400) sits BELOW the frame → the pin lands on the
    // BOTTOM edge at x=450, y=250 — where draw.io painted the line's arrival.
    expect(anchor.position.x + 0.5).toBeCloseTo(450, 5);
    expect(anchor.position.y + 0.5).toBeCloseTo(250, 5);
    // …and the applied polyline detours through the waypoint.
    expect(link.points).toContainEqual({ x: 450, y: 400 });
  });

  it('container-to-container edges get an anchor on EACH frame', async () => {
    const xml = model(
      vertex('left', { style: 'swimlane;', x: 0, y: 0, w: 200, h: 150 }) +
        vertex('l1', { parent: 'left', x: 20, y: 40 }) +
        vertex('right', { style: 'swimlane;', x: 400, y: 0, w: 200, h: 150 }) +
        vertex('r1', { parent: 'right', x: 20, y: 40 }) +
        `<mxCell id="e1" edge="1" parent="1" source="left" target="right"><mxGeometry relative="1" as="geometry"/></mxCell>`
    );
    const { diagram, warnings } = await importDrawio(xml);
    expect(diagram!.getLinks()).toHaveLength(1);
    expect(warnings.some((w) => w.includes('skipped'))).toBe(false);
    const link = diagram!.getLinks()[0];
    const src = diagram!.getNode(link.sourceNodeId!)!;
    const tgt = diagram!.getNode(link.targetNodeId!)!;
    expect(src.getMetadata('drawioContainerAnchor')).toBe('left');
    expect(tgt.getMetadata('drawioContainerAnchor')).toBe('right');
    // Facing edges: left frame's right side (x=200), right frame's left side (x=400).
    expect(src.position.x + 0.5).toBeCloseTo(200, 5);
    expect(tgt.position.x + 0.5).toBeCloseTo(400, 5);
  });

  // The verifier's stranding repro: anchors must die with what they stand for.
  it('removing the container removes its anchor AND the edge — never an edge to empty space', async () => {
    const { diagram } = await importDrawio(fixture);
    const anchorId = diagram!.getLinks()[0].targetNodeId!;
    diagram!.removeGroup('lane');
    expect(diagram!.getNode(anchorId)).toBeUndefined();
    expect(diagram!.getLinks()).toHaveLength(0);
    // the authored content survives untouched
    expect(diagram!.getNode('outside')).toBeDefined();
    expect(diagram!.getNode('in-lane')).toBeDefined();
  });

  it('removing the link removes its now-orphaned anchors', async () => {
    const { diagram } = await importDrawio(fixture);
    const link = diagram!.getLinks()[0];
    const anchorId = link.targetNodeId!;
    diagram!.removeLink(link.id);
    expect(diagram!.getNode(anchorId)).toBeUndefined();
    expect(diagram!.getNode('outside')).toBeDefined();
  });

  it('a floating point-anchored edge cleans up BOTH point anchors on link removal', async () => {
    const floating = model(
      `<mxCell id="e1" edge="1" parent="1"><mxGeometry relative="1" as="geometry">` +
        `<mxPoint x="10" y="10" as="sourcePoint"/><mxPoint x="200" y="120" as="targetPoint"/>` +
        `</mxGeometry></mxCell>`
    );
    const { diagram } = await importDrawio(floating);
    const link = diagram!.getLinks()[0];
    const ids = [link.sourceNodeId!, link.targetNodeId!];
    diagram!.removeLink(link.id);
    for (const id of ids) expect(diagram!.getNode(id)).toBeUndefined();
    expect(diagram!.getNodes()).toHaveLength(0);
  });

  it('removing an ordinary group leaves ordinary members alone (lifecycle is anchor-scoped)', async () => {
    const { diagram } = await importDrawio(fixture);
    // in-lane is a REAL member of the lane, not an anchor
    diagram!.removeGroup('lane');
    expect(diagram!.getNode('in-lane')).toBeDefined();
  });
});

describe('importDrawio — floating (point-anchored) edge endpoints', () => {
  it('an edge with a targetPoint instead of a target cell imports via an invisible point anchor', async () => {
    const xml = model(
      vertex('a', { x: 0, y: 0 }) +
        `<mxCell id="e1" style="" edge="1" parent="1" source="a">` +
        `<mxGeometry relative="1" as="geometry"><mxPoint x="300" y="220" as="targetPoint"/></mxGeometry></mxCell>`
    );
    const { diagram, warnings } = await importDrawio(xml);
    expect(diagram!.getLinks()).toHaveLength(1);
    expect(warnings.some((w) => w.includes('skipped'))).toBe(false);
    const link = diagram!.getLinks()[0];
    expect(link.sourceNodeId).toBe('a');
    const anchor = diagram!.getNode(link.targetNodeId!)!;
    expect(anchor.getMetadata('drawioPointAnchor')).toEqual({ x: 300, y: 220 });
    expect(anchor.position.x + 0.5).toBeCloseTo(300, 5);
    expect(anchor.position.y + 0.5).toBeCloseTo(220, 5);
    expect(anchor.getMetadata('shape')).toMatchObject({ fill: 'none', stroke: 'none' });
  });

  it('a fully floating edge (sourcePoint AND targetPoint) imports between two anchors — in PARENT space', async () => {
    const xml = model(
      vertex('lane', { style: 'swimlane;', x: 100, y: 50, w: 400, h: 300 }) +
        vertex('k', { parent: 'lane', x: 10, y: 20 }) +
        `<mxCell id="e1" style="" edge="1" parent="lane">` +
        `<mxGeometry relative="1" as="geometry"><mxPoint x="20" y="30" as="sourcePoint"/><mxPoint x="200" y="180" as="targetPoint"/></mxGeometry></mxCell>`
    );
    const { diagram, warnings } = await importDrawio(xml);
    expect(diagram!.getLinks()).toHaveLength(1);
    expect(warnings.some((w) => w.includes('skipped'))).toBe(false);
    const link = diagram!.getLinks()[0];
    const src = diagram!.getNode(link.sourceNodeId!)!;
    const tgt = diagram!.getNode(link.targetNodeId!)!;
    // The points are authored in the LANE's space: (20,30) → world (120,80).
    expect(src.position.x + 0.5).toBeCloseTo(120, 5);
    expect(src.position.y + 0.5).toBeCloseTo(80, 5);
    expect(tgt.position.x + 0.5).toBeCloseTo(300, 5);
    expect(tgt.position.y + 0.5).toBeCloseTo(230, 5);
  });

  it('an edge with NO endpoint cell and NO point on a side is still skipped, with the naming warning', async () => {
    const xml = model(
      vertex('a', { x: 0, y: 0 }) +
        `<mxCell id="e1" style="" edge="1" parent="1" source="a"><mxGeometry relative="1" as="geometry"/></mxCell>`
    );
    const { diagram, warnings } = await importDrawio(xml);
    expect(diagram!.getLinks()).toHaveLength(0);
    expect(warnings.some((w) => w.includes('"e1"') && w.includes('no target'))).toBe(true);
  });
});

describe('importDrawio — corpus-driven hardening', () => {
  it('elbow/segment/entityRelation edge styles route orthogonally like their draw.io originals', async () => {
    const two = vertex('a', { x: 0, y: 0 }) + vertex('b', { x: 300, y: 0 });
    for (const styleName of ['elbowEdgeStyle', 'segmentEdgeStyle', 'entityRelationEdgeStyle']) {
      const { diagram } = await importDrawio(
        model(two + `<mxCell id="e1" style="edgeStyle=${styleName};" edge="1" parent="1" source="a" target="b"><mxGeometry relative="1" as="geometry"/></mxCell>`)
      );
      expect(diagram!.getLinks()[0].pathType).toBe('orthogonal');
    }
  });

  it('kilobyte stencil(...) shape tokens are truncated in the warning, not dumped whole', async () => {
    const bigToken = 'stencil(' + 'A'.repeat(2000) + ')';
    const { warnings } = await importDrawio(model(vertex('x', { style: `shape=${bigToken};` })));
    const w = warnings.find((w) => w.includes('unknown shape token'))!;
    expect(w).toBeDefined();
    expect(w.length).toBeLessThan(150);
    expect(w).toContain('stencil(');
    expect(w).toContain('…');
  });

  // The stencil-library caption idiom (`verticalLabelPosition=bottom;
  // verticalAlign=top` — AWS, Azure, Citrix, network shapes): draw.io paints
  // the label in a bounds-sized box BELOW the vertex. Painting it inside the
  // icon put black text on black stencils (citrix2 corpus) — invisible ink.
  it('verticalLabelPosition=bottom moves the caption to a synthesized text node BELOW the icon', async () => {
    const { diagram, warnings } = await importDrawio(
      model(vertex('icon', {
        value: 'Laptop',
        style: 'verticalLabelPosition=bottom;verticalAlign=top;strokeColor=none;shape=mxgraph.citrix2.laptop;fillColor=#000000;fontSize=14;',
        x: 100, y: 100, w: 72, h: 60,
      }))
    );
    const icon = diagram!.getNode('icon')!;
    expect(icon.getLabel() || '').toBe(''); // the caption no longer inks inside the icon
    expect(icon.getMetadata('drawioOutsideLabel')).toBe('center/bottom');

    const caption = diagram!.getNode('icon__label')!;
    expect(caption).toBeDefined();
    expect(caption.getLabel()).toBe('Laptop');
    expect(caption.getMetadata('drawioLabelFor')).toBe('icon');
    // Borderless text box, sitting fully below the icon and centered on it.
    const shape = caption.getMetadata('shape') as Record<string, unknown>;
    expect(shape['fill']).toBe('none');
    expect(shape['stroke']).toBe('none');
    expect(caption.position.y).toBeGreaterThanOrEqual(160); // below y+h
    const iconCx = 100 + 72 / 2;
    expect(caption.position.x + caption.size.width / 2).toBeCloseTo(iconCx, 5);
    // The placement keys are CONSUMED now — not named as dropped.
    expect(warnings.some((w) => w.includes('verticalLabelPosition'))).toBe(false);
  });

  it('a caption follows its icon into the icon\'s group', async () => {
    const xml = model(
      `<mxCell id="box" value="Zone" style="swimlane;" vertex="1" parent="1"><mxGeometry x="0" y="0" width="400" height="300" as="geometry"/></mxCell>` +
      vertex('icon', {
        parent: 'box', value: 'Server',
        style: 'verticalLabelPosition=bottom;verticalAlign=top;shape=mxgraph.aws4.ec2;',
        x: 40, y: 60, w: 48, h: 48,
      })
    );
    const { diagram } = await importDrawio(xml);
    const group = diagram!.getGroup('box')!;
    expect(group.members.has('icon')).toBe(true);
    expect(group.members.has('icon__label')).toBe(true);
  });

  it('a free-standing text; cell with label offsets MOVES ONTO its label bounds instead of growing a twin', async () => {
    const { diagram } = await importDrawio(
      model(vertex('t', {
        value: 'Amazon Route 53',
        style: 'text;labelPosition=right;verticalLabelPosition=bottom;fontColor=#3333FF;fontSize=25;',
        x: 500, y: 200, w: 60, h: 40,
      }))
    );
    const t = diagram!.getNode('t')!;
    // mxGraph label bounds: one width right, one height down.
    expect(t.position).toMatchObject({ x: 560, y: 240 });
    expect(t.getLabel()).toBe('Amazon Route 53');
    expect(t.getMetadata('drawioOutsideLabel')).toBe('right/bottom');
    expect(diagram!.getNode('t__label')).toBeFalsy();
  });

  it('an EMPTY caption synthesizes nothing and center labels stay put', async () => {
    const { diagram } = await importDrawio(
      model(
        vertex('a', { style: 'verticalLabelPosition=bottom;shape=mxgraph.citrix2.laptop;', x: 0, y: 0 }) +
        vertex('b', { value: 'Inside', style: 'labelPosition=center;verticalLabelPosition=middle;', x: 300, y: 0 })
      )
    );
    expect(diagram!.getNode('a__label')).toBeFalsy();
    const b = diagram!.getNode('b')!;
    expect(b.getLabel()).toBe('Inside');
    expect(b.position).toMatchObject({ x: 300, y: 0 });
    expect(diagram!.getNode('b__label')).toBeFalsy();
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

// Verifier finding: with html=1 the value is an HTML FRAGMENT, so a literal
// "&" arrives double-encoded and one XML-level decode still leaves "&amp;" in
// the label. The strip must decode the second level itself.
describe('stripHtmlToText — second-level entity decode', () => {
  const { stripHtmlToText } = require('./importDrawio');
  it('decodes entities left over after the XML pass', () => {
    expect(stripHtmlToText('<b>R&amp;D</b><br>&lt;stage 2&gt;')).toBe('R&D <stage 2>');
  });
  it('decodes numeric and hex references', () => {
    expect(stripHtmlToText('caf&#233; &#x2192; lab')).toBe('café → lab');
  });
  it('leaves unknown entity names literal instead of eating them', () => {
    expect(stripHtmlToText('a &bogus; b')).toBe('a &bogus; b');
  });
});
