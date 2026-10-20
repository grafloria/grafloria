// The contract of an imported Mermaid diagram's layout (import-layout.ts):
// the gap between two ranks fits the labels in it, every edge carries the
// route the layout made for it, that route belongs to the boxes where the
// import put them (it goes the moment one moves — a user's own bends never do),
// it never leaks into the exported Mermaid, and the same text always draws the
// same picture. The picture itself is checked with the renderer's numbers in
// libs/renderer/src/svg/mermaid-import-layout.spec.ts.
import { importDiagramText, exportDiagramText } from '../../serialization/TextFormat';
import { estimateLabelWidth, edgeLabelBox, IMPORT_EDGE_FONT, wrapLabelLines, fitNodeToLabel } from './import-layout';
import { NodeModel } from '../../models/NodeModel';
import { DiagramModel } from '../../models/DiagramModel';

const LR = `flowchart LR
    Inquiry -->|convert| Offer
    Offer -->|Convert To Order of every line| Order
    Order --> Delivered`;

describe('imported Mermaid layout', () => {
  it('the gap between two ranks holds the widest label on an edge between them — wrapped, as Mermaid wraps it', () => {
    const d = importDiagramText(LR).diagram;
    const offer = d.getNode('Offer')!;
    const order = d.getNode('Order')!;
    const gap = order.position.x - (offer.position.x + offer.size.width);
    const text = 'Convert To Order of every line';
    expect(wrapLabelLines(text, 200, IMPORT_EDGE_FONT)).toEqual(['Convert To Order of', 'every line']);
    expect(gap).toBeGreaterThan(edgeLabelBox(text).w);
    // …and no wider than it needs: one long line would push the ranks apart.
    expect(gap).toBeLessThan(estimateLabelWidth(text, IMPORT_EDGE_FONT));
  });

  it("an edge label draws at the node text's size, wrapped at 200 px; the export says nothing about it", () => {
    const d = importDiagramText(LR).diagram;
    for (const link of d.getLinks().filter((l) => l.labels.length)) {
      expect(link.labels[0]).toMatchObject({ style: { fontSize: 16 }, textWrap: true, maxWidth: 200 }); // Mermaid's
    }
    expect(exportDiagramText(d, { lossless: false })).not.toMatch(/linkStyle/);
    // An author's own size is theirs, and travels.
    const sized = importDiagramText(`${LR}\n    linkStyle 0 font-size:20px`).diagram;
    expect(sized.getLinks()[0].labels[0].style?.fontSize).toBe(20);
    expect(exportDiagramText(sized, { lossless: false })).toMatch(/linkStyle 0 .*font-size:\s*20px/);
  });

  it('every edge between laid-out boxes carries its route: waypoints, and its label where room was made', () => {
    const d = importDiagramText(LR).diagram;
    for (const link of d.getLinks()) {
      expect(link.getMetadata('importRoute')).toBe(true);
      expect(link.getMetadata('hasManualWaypoints')).toBe(true);
      expect(link.style.spline).toBe('basis'); // drawn as Mermaid draws a route
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

  it("a box is Mermaid's: its text at 16 px, wrapped at 200, with Mermaid's padding — and it holds its words", () => {
    const node = (label: string, shape: Record<string, unknown> = { type: 'rect' }, type = 'rect') => {
      const n = new NodeModel({ id: 'n', type, position: { x: 0, y: 0 }, size: { width: 120, height: 80, depth: 0 } });
      n.setLabel(label);
      n.setMetadata('shape', shape);
      fitNodeToLabel(n);
      return n;
    };
    const text = (label: string) => estimateLabelWidth(label, 16); // no canvas here: the renderer's estimate
    // `[Short]`: 30 px each side, 15 above and below one 24 px line — the placeholder 120×80 goes.
    const short = node('Short');
    expect(short.style.fontSize).toBe(16);
    expect(short.size).toMatchObject({ width: Math.ceil(text('Short') + 60), height: 24 + 30 });
    // `(Short)`: 15 px each side; a state: 8 all round; a note: 15 all round.
    expect(node('Short', { type: 'rect', cornerRadius: 10 }).size.width).toBe(Math.ceil(text('Short') + 30));
    expect(node('Draft', { type: 'rect', cornerRadius: 8 }, 'state:state').size).toMatchObject({ width: Math.ceil(text('Draft') + 16), height: 24 + 16 });
    // A long label wraps at 200 px and the box grows taller, a line at a time.
    const long = 'Warehouse detailed delivery work for each of the delivered items and their packaging';
    const lines = wrapLabelLines(long, 200, 16);
    expect(lines.length).toBeGreaterThan(2);
    const box = node(long).size;
    expect(box.width).toBeLessThanOrEqual(200 + 60);
    expect(box.height).toBe(lines.length * 24 + 30);
    // …and the renderer, wrapping at the box's inner width, never needs more lines than it has room for.
    expect(wrapLabelLines(long, box.width - 16, 16).length).toBeLessThanOrEqual(Math.floor((box.height - 16) / (16 * 1.2)));
    // A word wider than 200 px widens its box rather than shrinking.
    expect(node('GoodsReleasedForShipmentToTheCustomer').size.width).toBeGreaterThanOrEqual(text('GoodsReleasedForShipmentToTheCustomer') + 16);
    // A classDef's own size is the author's, and stays.
    const sized = new NodeModel({ id: 's', type: 'rect', position: { x: 0, y: 0 }, size: { width: 120, height: 80, depth: 0 } });
    sized.setLabel('Short');
    sized.setStyle({ fontSize: 20 });
    fitNodeToLabel(sized);
    expect(sized.style.fontSize).toBe(20);
    expect(sized.size.width).toBe(Math.ceil(estimateLabelWidth('Short', 20) + 60));
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

  it('a move never scans the diagram for routes: nothing on a plain diagram, its own ports on an imported one', () => {
    // A full-graph move of 3,600 nodes went from ~75 to ~925 ms when every move
    // looked through every link for a route to drop.
    const plain = new DiagramModel();
    const a = new NodeModel({ id: 'a', type: 'default', position: { x: 0, y: 0 }, size: { width: 100, height: 50 } });
    const b = new NodeModel({ id: 'b', type: 'default', position: { x: 300, y: 0 }, size: { width: 100, height: 50 } });
    plain.addNode(a);
    plain.addNode(b);
    plain.connectNodes(a, b);
    const plainScan = jest.spyOn(plain, 'getLinksForNode');
    a.setPosition(10, 10);
    b.setSize(120, 60);
    expect(plainScan).not.toHaveBeenCalled();

    const d = importDiagramText(LR).diagram;
    const scan = jest.spyOn(d, 'getLinksForNode');
    d.getNode('Offer')!.setPosition(0, 500);
    expect(scan).not.toHaveBeenCalled();
    expect(d.getLinks().map((l) => l.getMetadata('importRoute'))).toEqual([false, false, true]);

    // A saved diagram loads with its routes, and a move still takes them back.
    const loaded = DiagramModel.fromJSON(importDiagramText(LR).diagram.serialize());
    expect(loaded.getLinks().every((l) => l.getMetadata('importRoute') === true)).toBe(true);
    loaded.getNode('Delivered')!.setPosition(0, 500);
    expect(loaded.getLinks().map((l) => l.getMetadata('importRoute'))).toEqual([true, true, false]);
  });

  it('measures the words as they will draw when the host can, and tells the renderer it did', () => {
    // A stand-in for the renderer's canvas: a face narrower than the estimate.
    const measureText = (text: string, font: { size: number }) => text.length * font.size * 0.5;
    const flow = 'flowchart LR\n  A[Short] -->|go on| B[Longer name]';
    const measured = importDiagramText(flow, { measureText }).diagram;
    expect(measured.getMetadata('measuredText')).toBe(true);
    expect(measured.getNode('A')!.size.width).toBe(Math.ceil('Short'.length * 16 * 0.5 + 60));
    // Without one (a server, a test), the renderer's own estimate — and no flag.
    const estimated = importDiagramText(flow).diagram;
    expect(estimated.getMetadata('measuredText')).toBeUndefined();
    expect(estimated.getNode('A')!.size.width).toBe(Math.ceil('Short'.length * 16 * 0.6 + 60));
    // A state diagram the same.
    const state = importDiagramText('stateDiagram-v2\n  Draft --> Sent: send', { measureText }).diagram;
    expect(state.getMetadata('measuredText')).toBe(true);
    // Mermaid's 8 px each side — and measured text keeps ~4% room, as it draws
    // wider at a reader's small zooms (hinting).
    const draft = 'Draft'.length * 16 * 0.5;
    expect(state.getNode('Draft')!.size.width).toBe(Math.max(Math.ceil(draft + 16), Math.ceil(draft * 1.04 + 2) + 16));
    // …and a native diagram never carries it: it draws exactly as it always has.
    const native = new DiagramModel();
    expect(native.getMetadata('measuredText')).toBeUndefined();
  });

  it('taking a route back restores the label too: its slot, or no added label at all', () => {
    const flow = importDiagramText(LR).diagram;
    const labelled = flow.getLinks().find((l) => l.labels[0]?.text === 'convert')!;
    expect(labelled.labels[0].slot).toBeUndefined(); // pinned where the layout made room
    flow.getNode('Inquiry')!.setPosition(0, 400);
    expect(labelled.labels[0].slot).toBe('center'); // back at its own slot on the re-routed line
    expect(labelled.labels[0].position).toBe(0.5);

    // …and the curve: the route drew as a basis curve; the link's own spline comes back.
    expect(labelled.style.spline).toBeUndefined();

    const state = importDiagramText('stateDiagram-v2\n  A --> B: go').diagram;
    const go = state.getLinks()[0];
    expect(go.labels.map((l) => l.text)).toEqual(['go']); // the route placed a real label
    state.getNode('A')!.setPosition(0, 400);
    expect(go.labels).toEqual([]); // …and takes it back: the link's own label draws as before
    expect(go.getMetadata('label')).toBe('go');
  });
});
