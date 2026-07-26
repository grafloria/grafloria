// INTEGRATION: a REAL .drawio file, byte-for-byte as draw.io saved it — not a
// hand-built fixture that can only ever agree with the importer's assumptions.
//
// fixtures/bulb.drawio is the "lamp doesn't work" flowchart from
// github.com/jgraph/drawio-diagrams (diagrams/bulb.xml, Apache-2.0) — saved by
// draw.io itself in the DEFAULT format: <mxfile> wrapper, page payload
// base64 → raw-deflate → URI-encoded. It exercises in one file: the real
// compression pipeline, rounded/rhombus styles, fill/stroke colours, and edge
// labels stored as CHILD cells (the "Yes"/"No" decision branches).

import { readFileSync } from 'fs';
import { join } from 'path';
import { importDrawio } from './importDrawio';

const fixture = readFileSync(join(__dirname, 'fixtures', 'bulb.drawio'), 'utf8');

describe('importDrawio — real-world draw.io file (compressed default save)', () => {
  it('imports the full flowchart: 6 nodes, 5 edges, labels, shapes, paints', async () => {
    const { diagram, warnings, error } = await importDrawio(fixture);
    expect(error).toBeUndefined();
    const d = diagram!;

    expect(d.getNodes()).toHaveLength(6);
    expect(d.getLinks()).toHaveLength(5);

    // Labels arrive HTML-stripped and entity-decoded.
    const labels = d.getNodes().map((n) => n.getLabel());
    expect(labels).toContain("Lamp doesn't work");
    expect(labels).toContain('Replace Bulb');

    // The decision diamonds keep their silhouette AND their draw.io paints.
    const decision = d.getNodes().find((n) => n.getLabel() === 'Lamp plugged in?')!;
    const shape = decision.getMetadata('shape') as Record<string, unknown>;
    expect(shape['type']).toBe('diamond');
    expect(shape['fill']).toBe('#FFF2CC');
    expect(shape['stroke']).toBe('#D6B656');

    // Edge labels stored as child cells reach the links.
    const edgeLabels = d.getLinks().map((l) => l.getLabel()).filter(Boolean);
    expect(edgeLabels.sort()).toEqual(['No', 'No', 'Yes', 'Yes']);

    // Geometry survives the compressed pipeline exactly.
    const start = d.getNodes().find((n) => n.getLabel() === "Lamp doesn't work")!;
    expect(start.position).toMatchObject({ x: 280, y: 80 });

    // Honesty: the presentational keys v1 does not map are NAMED, once.
    expect(warnings.filter((w) => w.startsWith('unmapped style keys'))).toHaveLength(1);
    // ...and nothing structural was lost: no skipped edges, no unknown shapes.
    expect(warnings.some((w) => w.includes('skipped'))).toBe(false);
    expect(warnings.some((w) => w.includes('unknown shape'))).toBe(false);
  });
});
