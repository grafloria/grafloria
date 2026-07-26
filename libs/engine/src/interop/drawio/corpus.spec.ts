// INTEGRATION: three more REAL files from github.com/jgraph/drawio-diagrams
// (Apache-2.0), byte-for-byte as published — the survivors of a 12-file corpus
// drive (flowcharts, org charts, UML, sequence, network, AWS, Azure, Citrix,
// C4, swimlanes) that was imported AND rendered through the live demo page
// until a full pass produced no new defect class. Each fixture pins the
// defect family it caught:
//
// - WorkflowFlowchart.xml         seven side-by-side swimlane containers with
//                                 REAL membership and 22 cross-lane edges
// - aws-simple-architecture.drawio  the COMPRESSED default save; deeply nested
//                                 aws4 "group" vertices (containers by style,
//                                 not by the group token) and the stencil
//                                 caption idiom (verticalLabelPosition=bottom);
//                                 an architecture file with ZERO edges — the
//                                 import must not invent any
// - NetworkDiagram.xml            citrix stencil shapes (all unknown → rect,
//                                 every one NAMED), coloured zone rectangles,
//                                 and 13 outside captions synthesized below
//                                 their icons

import { readFileSync } from 'fs';
import { join } from 'path';
import { importDrawio } from './importDrawio';

const fixture = (name: string): string =>
  readFileSync(join(__dirname, 'fixtures', name), 'utf8');

describe('importDrawio — real-world corpus fixtures', () => {
  it('WorkflowFlowchart.xml: seven swimlanes, cross-lane edges, membership intact', async () => {
    const { diagram, warnings, error } = await importDrawio(fixture('WorkflowFlowchart.xml'));
    expect(error).toBeUndefined();
    const d = diagram!;

    expect(d.getNodes()).toHaveLength(20);
    expect(d.getLinks()).toHaveLength(22);
    expect(d.getGroups()).toHaveLength(7);

    const laneNames = d.getGroups().map((g) => g.name).sort();
    expect(laneNames).toContain('Inside Sales Rep');
    expect(laneNames).toContain('Director');

    // Membership is REAL: every AUTHORED node lives in exactly one lane. The
    // 20th node is the synthesized anchor for an edge that ends on a fixed
    // POINT (no target cell) — correctly laneless.
    const memberCount = d.getGroups().reduce((n, g) => n + g.members.size, 0);
    expect(memberCount).toBe(19);
    const laneless = d.getNodes().filter(
      (n) => !d.getGroups().some((g) => g.members.has(n.id))
    );
    expect(laneless).toHaveLength(1);
    expect(laneless[0].getMetadata('drawioPointAnchor')).toBeDefined();

    // Every warning is a NAMED loss, and nothing structural was skipped.
    expect(warnings.some((w) => w.includes('skipped'))).toBe(false);
    expect(warnings.filter((w) => w.includes('unknown shape token "document"')).length).toBeGreaterThan(0);
  });

  it('aws-simple-architecture.drawio: compressed save, nested containers-as-nodes, captions below icons, NO invented edges', async () => {
    const { diagram, warnings, error } = await importDrawio(fixture('aws-simple-architecture.drawio'));
    expect(error).toBeUndefined();
    const d = diagram!;

    // 23 vertices + 11 synthesized outside captions; the file has NO edges and
    // the import must not fabricate any.
    expect(d.getNodes()).toHaveLength(34);
    expect(d.getLinks()).toHaveLength(0);

    const captions = d.getNodes().filter((n) => n.getMetadata('drawioLabelFor'));
    expect(captions).toHaveLength(11);
    const users = captions.find((c) => c.getLabel() === 'Users')!;
    expect(users).toBeDefined();
    // The caption sits BELOW its icon (the stencil idiom verticalLabelPosition=bottom).
    const icon = d.getNode(users.getMetadata('drawioLabelFor') as string)!;
    expect(users.position.y).toBeGreaterThanOrEqual(icon.position.y + icon.size.height);
    expect(icon.getMetadata('drawioOutsideLabel')).toBe('center/bottom');

    // Nested structure survives the compressed pipeline: the AWS Cloud frame
    // contains the VPC frame contains the availability zones.
    const cloud = d.getNodes().find((n) => n.getLabel() === 'AWS Cloud')!;
    const vpc = d.getNodes().find((n) => n.getLabel() === 'VPC')!;
    const az1 = d.getNodes().find((n) => n.getLabel() === 'Availability Zone 1')!;
    const inside = (a: typeof vpc, b: typeof cloud): boolean =>
      a.position.x >= b.position.x &&
      a.position.y >= b.position.y &&
      a.position.x + a.size.width <= b.position.x + b.size.width &&
      a.position.y + a.size.height <= b.position.y + b.size.height;
    expect(inside(vpc, cloud)).toBe(true);
    expect(inside(az1, vpc)).toBe(true);

    expect(warnings.some((w) => w.includes('skipped'))).toBe(false);
  });

  it('NetworkDiagram.xml: unknown citrix stencils all NAMED, 13 captions synthesized, edges intact', async () => {
    const { diagram, warnings, error } = await importDrawio(fixture('NetworkDiagram.xml'));
    expect(error).toBeUndefined();
    const d = diagram!;

    expect(d.getNodes()).toHaveLength(48); // 35 vertices + 13 captions
    expect(d.getLinks()).toHaveLength(25);

    const captions = d.getNodes().filter((n) => n.getMetadata('drawioLabelFor'));
    expect(captions).toHaveLength(13);
    expect(captions.map((c) => c.getLabel())).toContain('Web Server');

    // Every unknown stencil is a NAMED loss with its cell id...
    const unknown = warnings.filter((w) => w.includes('unknown shape token "mxgraph.citrix.'));
    expect(unknown.length).toBeGreaterThanOrEqual(20);
    // ...and no edge was dropped for it.
    expect(warnings.some((w) => w.includes('skipped'))).toBe(false);
  });
});
