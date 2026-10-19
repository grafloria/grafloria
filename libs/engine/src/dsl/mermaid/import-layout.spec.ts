// The contract of an imported Mermaid diagram's layout (import-layout.ts):
// the gap between two ranks fits the labels in it, every edge carries the
// route the layout made for it, that route belongs to the boxes where the
// import put them (it goes the moment one moves — a user's own bends never do),
// it never leaks into the exported Mermaid, and the same text always draws the
// same picture. The picture itself is checked with the renderer's numbers in
// libs/renderer/src/svg/mermaid-import-layout.spec.ts.
import { importDiagramText, exportDiagramText } from '../../serialization/TextFormat';
import { estimateLabelWidth, IMPORT_EDGE_FONT, IMPORT_EDGE_PAD, wrapLabelLines, fitNodeToLabel } from './import-layout';
import { NodeModel } from '../../models/NodeModel';

const LR = `flowchart LR
    Inquiry -->|convert| Offer
    Offer -->|Convert To Order of every line| Order
    Order --> Delivered`;

describe('imported Mermaid layout', () => {
  it('the gap between two ranks is at least the widest label on an edge between them', () => {
    const d = importDiagramText(LR).diagram;
    const offer = d.getNode('Offer')!;
    const order = d.getNode('Order')!;
    const gap = order.position.x - (offer.position.x + offer.size.width);
    const label = estimateLabelWidth('Convert To Order of every line', IMPORT_EDGE_FONT) + 2 * IMPORT_EDGE_PAD;
    expect(gap).toBeGreaterThan(label);
  });

  it('every edge between laid-out boxes carries its route: waypoints, and its label where room was made', () => {
    const d = importDiagramText(LR).diagram;
    for (const link of d.getLinks()) {
      expect(link.getMetadata('importRoute')).toBe(true);
      expect(link.getMetadata('hasManualWaypoints')).toBe(true);
      expect(link.points.length).toBeGreaterThanOrEqual(2);
    }
    const labelled = d.getLinks().find((l) => l.labels[0]?.text === 'convert')!;
    expect(labelled.labels[0].slot).toBeUndefined(); // a slot would override the placed position
    expect(labelled.labels[0].position).toBeGreaterThan(0);
    expect(labelled.labels[0].position).toBeLessThan(1);
  });

  it('a route goes the moment either of its boxes moves or resizes — and a user bend never does', () => {
    const d = importDiagramText(LR).diagram;
    const [first, second, third] = d.getLinks();
    // A user's own bend on another link: hasManualWaypoints without importRoute.
    third.setMetadata('importRoute', false);
    const userBend = [...third.points];
    d.getNode('Inquiry')!.setPosition(0, 500);
    expect(first.getMetadata('importRoute')).toBe(false);
    expect(first.getMetadata('hasManualWaypoints')).toBe(false);
    expect(first.points).toEqual([]);
    expect(second.getMetadata('importRoute')).toBe(true); // Offer→Order: neither end moved
    d.getNode('Order')!.setSize(300, 200);
    expect(second.getMetadata('importRoute')).toBe(false);
    expect(third.points).toEqual(userBend); // Order→Delivered: the user's bend stays
    expect(third.getMetadata('hasManualWaypoints')).toBe(true);
  });

  it('the exported Mermaid says nothing about the routes (no %%grafloria:edge, no via:)', () => {
    const d = importDiagramText(LR).diagram;
    const body = exportDiagramText(d, { lossless: false });
    expect(body).not.toMatch(/%%grafloria:edge/);
    expect(body).not.toMatch(/via:/);
    // …and it reads back as the same structure.
    const again = importDiagramText(body).diagram;
    expect(again.getLinks().map((l) => `${l.sourceNodeId}>${l.targetNodeId}`).sort())
      .toEqual(d.getLinks().map((l) => `${l.sourceNodeId}>${l.targetNodeId}`).sort());
  });

  it('the same text draws the same picture, every time', () => {
    const picture = (text: string) => {
      const d = importDiagramText(text).diagram;
      return JSON.stringify({
        nodes: d.getNodes().map((n) => [n.id, n.position, n.size]),
        links: d.getLinks().map((l) => [l.sourceNodeId, l.targetNodeId, l.points, l.labels.map((x) => x.position)]),
      });
    };
    expect(picture(LR)).toBe(picture(LR));
    const state = 'stateDiagram-v2\n  [*] --> A\n  A --> B: go\n  B --> A: back\n  A --> C: other way';
    expect(picture(state)).toBe(picture(state));
  });

  it('a box grows to hold its label: wrap at 200 px, then taller; a long word widens it', () => {
    const node = (label: string) => {
      const n = new NodeModel({ id: 'n', type: 'rect', position: { x: 0, y: 0 }, size: { width: 120, height: 80, depth: 0 } });
      n.setLabel(label);
      n.setMetadata('shape', { type: 'rect' });
      fitNodeToLabel(n);
      return n.size;
    };
    expect(node('Short')).toMatchObject({ width: 120, height: 80 });
    const long = 'Warehouse detailed delivery work for each of the delivered items and their packaging';
    const size = node(long);
    expect(size.width).toBeLessThanOrEqual(216);
    const lines = wrapLabelLines(long, size.width - 16, 14).length;
    expect(Math.floor((size.height - 16) / 16.8)).toBeGreaterThanOrEqual(lines);
    expect(node('GoodsReleasedForShipmentToTheCustomer').width).toBeGreaterThanOrEqual(
      estimateLabelWidth('GoodsReleasedForShipmentToTheCustomer', 14) + 16
    );
  });

  it('a state note sits on the side the author named, beside its own state, on nothing else', () => {
    const d = importDiagramText(`stateDiagram-v2
    [*] --> Draft
    Draft --> Sent: send
    Sent --> Archived: archive
    note right of Draft : Only the owner edits a draft
    note left of Sent
        A sent record is read only
    end note`).diagram;
    const notes = d.getNodes().filter((n) => n.getMetadata('stateNote') === true);
    expect(notes).toHaveLength(2);
    const box = (n: NodeModel) => ({ x: n.position.x, y: n.position.y, w: n.size.width, h: n.size.height });
    const overlap = (a: ReturnType<typeof box>, b: ReturnType<typeof box>) =>
      Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
    for (const note of notes) {
      const target = d.getNode(String(note.getMetadata('noteTarget')))!;
      const right = String(note.getMetadata('notePosition')).startsWith('right');
      if (right) expect(note.position.x).toBeGreaterThanOrEqual(target.position.x + target.size.width);
      else expect(note.position.x + note.size.width).toBeLessThanOrEqual(target.position.x);
      // level with its state
      expect(note.position.y + note.size.height).toBeGreaterThan(target.position.y);
      expect(note.position.y).toBeLessThan(target.position.y + target.size.height);
      for (const other of d.getNodes()) if (other !== note) expect([note.id, other.id, overlap(box(note), box(other))]).toEqual([note.id, other.id, 0]);
      // its line joins the two sides that face each other
      const line = d.getLinks().find((l) => l.getMetadata('noteLink') === true && l.sourceNodeId === note.id)!;
      expect(note.getPort(line.sourcePortId)?.side).toBe(right ? 'left' : 'right');
      expect(target.getPort(line.targetPortId)?.side).toBe(right ? 'right' : 'left');
    }
  });

  it('taking a route back restores the label too: its slot, or no added label at all', () => {
    const flow = importDiagramText(LR).diagram;
    const labelled = flow.getLinks().find((l) => l.labels[0]?.text === 'convert')!;
    expect(labelled.labels[0].slot).toBeUndefined(); // pinned where the layout made room
    flow.getNode('Inquiry')!.setPosition(0, 400);
    expect(labelled.labels[0].slot).toBe('center'); // back at its own slot on the re-routed line
    expect(labelled.labels[0].position).toBe(0.5);

    const state = importDiagramText('stateDiagram-v2\n  A --> B: go').diagram;
    const go = state.getLinks()[0];
    expect(go.labels.map((l) => l.text)).toEqual(['go']); // the route placed a real label
    state.getNode('A')!.setPosition(0, 400);
    expect(go.labels).toEqual([]); // …and takes it back: the link's own label draws as before
    expect(go.getMetadata('label')).toBe('go');
  });
});
