// IMPORTED MERMAID, MEASURED THE WAY IT IS DRAWN.
//
// A documentation reader's fences (business flows: inquiries → offers →
// orders, a lifecycle per record) drew with text lost or hidden on 13 of 32
// diagrams: edge labels under boxes ("Convert To Order" → "nvert To Ord") and
// on top of each other, node text cut with "…", the two directions of a pair on
// one track, LR edges looping out of a box's top. The import now lays out like
// Mermaid (dagre, each label a box between the ranks — engine
// dsl/mermaid/import-layout.ts). This spec checks the result with the
// RENDERER's own numbers — the label box LabelRenderer draws, the shape's inner
// rect, the wrap the node label engine runs, the point a label is drawn at — so
// it fails exactly when the picture would.

import { importDiagramText, linkLabelPosition, type DiagramModel, type LinkModel, type NodeModel } from '@grafloria/engine';
import { LabelRenderer } from './LabelRenderer';
import { getShape, getInnerRect } from './shape-registry';
import { wrapText } from './text-block';
import { fitFontSize } from './svg-renderer';
import { createDiagram, type DiagramInstance } from '../instance/create-diagram';

type Rect = { x: number; y: number; w: number; h: number };

// Shaped like the reader's fences (flowchart LR and stateDiagram-v2), not taken from them.
const FENCES: Record<string, string> = {
  'sibling labels at a split, a long label between two ranks': `flowchart LR
    Lead -->|qualify| Inquiry
    Inquiry -->|Convert To Quotation| Quotation
    Inquiry -->|cancel inquiry| Cancelled
    Inquiry -->|mark as lost| Lost
    Quotation -->|Convert To Order| Order`,
  'a state lifecycle that fans out three ways at every step': `stateDiagram-v2
    [*] --> Leads
    Leads --> Inquiries: convert lead
    Leads --> Missed: mark missed
    Inquiries --> Quotes: convert inquiry
    Inquiries --> CancelledInquiries: cancel inquiry
    Inquiries --> LostInquiries: mark lost
    Quotes --> Orders: convert quote
    Quotes --> CancelledQuotes: cancel quote
    Orders --> Delivered: deliver all active orders
    Orders --> CancelledOrders: cancel order
    Orders --> RejectedOrders: reject order`,
  'both directions of a pair, each labelled': `stateDiagram-v2
    Draft --> Review: Submit for review
    Review --> Draft: Send back to draft
    Review --> Approved: Approve
    Approved --> Draft: Reopen the approved draft`,
  'two transitions between the same pair': `stateDiagram-v2
    Approved --> Awarded: Send the award to the supplier
    Approved --> Awarded: Consider the award as submitted
    Awarded --> Active: Activate`,
  'a writer flow with a quoted target and a way back': `flowchart LR
    Draft -->|Submit| R["In review"]
    R -->|Reject| Draft
    R -->|Approve| P[Published]`,
  'long node text': `flowchart LR
    O[Order] --> C[Orders confirmation and activation of every line of the order]
    C --> D[Delivered]
    D --> W[Warehouse detailed delivery work for each of the delivered items and their packaging]`,
  'fan-in from three sources': `flowchart LR
    A[Sales] --> T[Invoice]
    B[Projects] --> T
    C[Services] --> T
    T -->|send| P[Payment]`,
  'right to left': `flowchart RL
    A[Request a quote] -->|send| B[Quotation]
    B -->|approve| C[Purchase order]
    C --> D[Sales invoice]`,
  'top down, with a decision': `flowchart TD
    S[Start] --> Q{Is the stock enough?}
    Q -->|yes| P[Pick and pack]
    Q -->|no, order more| O[Order from the supplier]
    O --> P`,
  'subgraphs': `flowchart LR
    subgraph Sales[Sales team]
      I[Inquiry] --> F[Offer]
    end
    subgraph Ops[Operations]
      R[Order] --> D[Delivery]
    end
    F -->|win| R`,
};

const labels = new LabelRenderer();
const nodeBox = (n: NodeModel): Rect => ({ x: n.position.x, y: n.position.y, w: n.size.width, h: n.size.height });
const overlap = (a: Rect, b: Rect): number =>
  Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

/** The text a link's label shows: its first label, else the legacy metadata label. */
const labelText = (link: LinkModel): string | undefined =>
  link.labels?.[0]?.text ?? (link.getMetadata('label') as string | undefined);

/**
 * The label's box where the renderer draws it: centred on its point along the
 * link. A link with only a metadata label is drawn by the renderer's legacy
 * path — at the middle, 12 px, nudged 10 px up — so that is measured too.
 */
function labelRect(link: LinkModel): Rect | undefined {
  const label = link.labels?.[0];
  if (label) {
    const at = link.getPointAtPosition(linkLabelPosition(label));
    if (!at) return undefined;
    const { width, height } = labels.labelBox(label);
    const off = label.offset ?? { x: 0, y: 0 };
    return { x: at.x + off.x - width / 2, y: at.y + off.y - height / 2, w: width, h: height };
  }
  const legacy = link.getMetadata('label') as string | undefined;
  if (!legacy) return undefined;
  const at = link.getPointAtPosition(0.5);
  if (!at) return undefined;
  const { width, height } = labels.labelBox({ id: 'legacy', text: legacy, position: 0.5, offset: { x: 0, y: -10 }, style: { fontSize: 12 } });
  return { x: at.x - width / 2, y: at.y - 10 - height / 2, w: width, h: height };
}

const mounted: Array<{ container: HTMLElement; instance: DiagramInstance }> = [];
afterEach(() => {
  for (const { container, instance } of mounted.splice(0)) {
    instance.dispose();
    container.remove();
  }
});

/**
 * The fence AS DRAWN: loaded into a real canvas, fitted, painted once. The
 * renderer writes every painted line back onto `link.points`, so what is
 * measured below is the picture, not the import's intentions.
 */
function load(text: string): DiagramModel {
  expect(importDiagramText(text).errors ?? []).toEqual([]);
  const container = document.createElement('div');
  container.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 1200, height: 900, right: 1200, bottom: 900, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  document.body.appendChild(container);
  const instance = createDiagram(container, { readonly: true });
  mounted.push({ container, instance });
  instance.loadText(text);
  instance.fitView(16);
  instance.renderNow();
  return instance.getModel();
}

describe('imported Mermaid: every word the author wrote is visible', () => {
  it.each(Object.entries(FENCES))('%s: no edge label under a box or another label', (_name, text) => {
    const d = load(text);
    const boxes = d.getNodes().map(nodeBox);
    const labelled = d.getLinks().filter((l) => labelText(l));
    const placed = labelled.map((l) => ({ link: l, box: labelRect(l) }));
    expect(placed.filter((x) => !x.box).map((x) => labelText(x.link))).toEqual([]); // every label is drawn somewhere
    for (const { link, box } of placed) {
      for (const node of boxes) expect({ link: labelText(link), overlap: overlap(box!, node) }).toEqual({ link: labelText(link), overlap: 0 });
    }
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const pair = `${labelText(placed[i].link)} / ${labelText(placed[j].link)}`;
        expect({ pair, overlap: overlap(placed[i].box!, placed[j].box!) }).toEqual({ pair, overlap: 0 });
      }
    }
  });

  it.each(Object.entries(FENCES))('%s: no node label is cut short (the node label engine fits it whole)', (_name, text) => {
    const d = load(text);
    for (const node of d.getNodes()) {
      const label = String(node.getLabel?.() ?? '');
      if (!label) continue;
      const shape = getShape((node.getMetadata('shape') as { type?: string } | undefined)?.type ?? 'rect');
      const inner = getInnerRect(shape, node.size.width, node.size.height);
      // The renderer shrinks the font only for a word too wide for its box: never here.
      expect({ label, font: fitFontSize(label, inner.w, 14) }).toEqual({ label, font: 14 });
      const lines = wrapText(label, inner.w, 14).length;
      expect({ label, fits: lines <= Math.floor(inner.h / (14 * 1.2)) }).toEqual({ label, fits: true });
    }
  });

  it.each(Object.entries(FENCES))('%s: a labelled line stays visible on both sides of its label', (_name, text) => {
    const d = load(text);
    for (const link of d.getLinks()) {
      const box = labelRect(link);
      if (!box) continue;
      const text = labelText(link);
      const pts = link.points;
      const outside = (p: { x: number; y: number }) => p.x < box.x || p.x > box.x + box.w || p.y < box.y || p.y > box.y + box.h;
      // Sample the polyline: some of it must lie outside the label box before and after it.
      const samples = Array.from({ length: 41 }, (_, i) => link.getPointAtPosition(i / 40)!).filter(Boolean);
      const t = link.labels?.[0] ? linkLabelPosition(link.labels[0]) : 0.5;
      const before = samples.filter((_, i) => i / 40 < t && outside(samples[i]));
      const after = samples.filter((_, i) => i / 40 > t && outside(samples[i]));
      expect({ label: text, before: before.length > 0, after: after.length > 0 }).toEqual({ label: text, before: true, after: true });
      expect(pts.length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('imported Mermaid: boxes grow to hold their text', () => {
  it('wraps at 200 px, then grows taller — never an ellipsis', () => {
    const d = load(`flowchart LR
      A[Short] --> B[A label of a dozen or so words that is far too long for one line of the box]
      B --> C[A label twice as long again, a label of a couple of dozen words that has to wrap onto many lines of the box before it fits]`);
    const [a, b, c] = ['A', 'B', 'C'].map((id) => d.getNode(id)!);
    expect(a.size).toMatchObject({ width: 120, height: 80 }); // the default stays the floor
    expect(b.size.width).toBeLessThanOrEqual(200 + 16);
    expect(c.size.width).toBeLessThanOrEqual(200 + 16);
    expect(c.size.height).toBeGreaterThan(b.size.height); // more lines, a taller box
  });

  it('a long one-word state name widens its box instead of shrinking its font', () => {
    const d = load(`stateDiagram-v2
      Draft --> GoodsReleasedForShipmentToTheCustomer: release`);
    const node = d.getNode('GoodsReleasedForShipmentToTheCustomer')!;
    const inner = getInnerRect(getShape('rect'), node.size.width, node.size.height);
    expect(fitFontSize('GoodsReleasedForShipmentToTheCustomer', inner.w, 14)).toBe(14);
  });
});

describe('imported Mermaid: two edges between one pair never share a track', () => {
  const samePath = (a: LinkModel, b: LinkModel) => JSON.stringify(a.points) === JSON.stringify(b.points);

  it('opposite directions get two curves, each label on its own', () => {
    const d = load(FENCES['a writer flow with a quoted target and a way back']);
    const there = d.getLinks().find((l) => labelText(l) === 'Submit')!;
    const back = d.getLinks().find((l) => labelText(l) === 'Reject')!;
    expect(samePath(there, back)).toBe(false);
    expect(overlap(labelRect(there)!, labelRect(back)!)).toBe(0);
  });

  it('two transitions the same way get two curves, each label on its own', () => {
    const d = load(FENCES['two transitions between the same pair']);
    const [first, second] = d.getLinks().filter((l) => l.sourceNodeId === 'Approved' && l.targetNodeId === 'Awarded');
    expect(samePath(first, second)).toBe(false);
    expect(overlap(labelRect(first)!, labelRect(second)!)).toBe(0);
  });
});

describe('imported Mermaid: edges leave the side facing the next rank', () => {
  const sideOf = (d: DiagramModel, link: LinkModel, end: 'source' | 'target') => {
    const nodeId = end === 'source' ? link.sourceNodeId! : link.targetNodeId!;
    const portId = end === 'source' ? link.sourcePortId : link.targetPortId;
    return d.getNode(nodeId)!.getPort(portId)?.side;
  };

  it('LR: right side out, left side in; RL: the mirror', () => {
    for (const [text, out, inn] of [
      [FENCES['long node text'], 'right', 'left'],
      [FENCES['right to left'], 'left', 'right'],
    ] as const) {
      const d = load(text);
      for (const link of d.getLinks()) {
        expect([sideOf(d, link, 'source'), sideOf(d, link, 'target')]).toEqual([out, inn]);
      }
    }
  });

  it('RL places the chain exactly as LR does, mirrored', () => {
    const rl = load(FENCES['right to left']);
    const lr = load(FENCES['right to left'].replace('flowchart RL', 'flowchart LR'));
    const order = (d: DiagramModel) => d.getNodes().slice().sort((a, b) => a.position.x - b.position.x).map((n) => n.id);
    expect(order(rl)).toEqual(order(lr).reverse());
  });

  it('fan-in: the edges arrive in the order their sources stand, so none cross before the box', () => {
    const d = load(FENCES['fan-in from three sources']);
    const into = d.getLinks().filter((l) => l.targetNodeId === 'T');
    const bySource = into.slice().sort((a, b) => d.getNode(a.sourceNodeId!)!.position.y - d.getNode(b.sourceNodeId!)!.position.y);
    const byEntry = into.slice().sort((a, b) => a.points[a.points.length - 1].y - b.points[b.points.length - 1].y);
    expect(byEntry.map((l) => l.id)).toEqual(bySource.map((l) => l.id));
  });
});

/** The line as drawn: its `d` (M, L and C commands), each cubic sampled 16 times. */
function drawnLine(d: string): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [];
  for (const [, cmd, args] of d.matchAll(/([MLC])([^MLC]*)/g)) {
    const n = (args.match(/-?\d+(?:\.\d+)?(?:e-?\d+)?/g) ?? []).map(Number);
    if (cmd !== 'C') {
      for (let i = 0; i + 1 < n.length; i += 2) out.push({ x: n[i], y: n[i + 1] });
      continue;
    }
    for (let i = 0; i + 5 < n.length; i += 6) {
      const p = out[out.length - 1];
      const [ax, ay, bx, by, x, y] = n.slice(i, i + 6);
      for (let s = 1; s <= 16; s++) {
        const t = s / 16;
        const u = 1 - t;
        out.push({
          x: u * u * u * p.x + 3 * u * u * t * ax + 3 * u * t * t * bx + t * t * t * x,
          y: u * u * u * p.y + 3 * u * u * t * ay + 3 * u * t * t * by + t * t * t * y,
        });
      }
    }
  }
  return out;
}

/** How far a line's heading turns over its last `span` units, in degrees. */
function endTurn(line: Array<{ x: number; y: number }>, span: number): number {
  let total = 0;
  let walked = 0;
  let heading: number | null = null;
  for (let i = line.length - 1; i > 0 && walked < span; i--) {
    const dx = line[i].x - line[i - 1].x;
    const dy = line[i].y - line[i - 1].y;
    const step = Math.hypot(dx, dy);
    if (step < 1e-6) continue;
    walked += step;
    const a = Math.atan2(dy, dx);
    if (heading !== null) {
      let turn = Math.abs(a - heading);
      if (turn > Math.PI) turn = 2 * Math.PI - turn;
      total += turn;
    }
    heading = a;
  }
  return (total * 180) / Math.PI;
}

describe('imported Mermaid: no edge end hooks back past its arrowhead', () => {
  // A smooth line through a route pulls the stretch beside each end toward the
  // point before it; a lead shorter than that pull ran the curve past the box
  // and curled it back into its own arrowhead (38 ends in 15 of a reader's 32
  // fences). Measured on the drawn path over its last 20 units — about the
  // 14 px a reader sees at the zoom such a figure fits at.
  it.each(Object.entries(FENCES))('%s', (_name, text) => {
    load(text);
    const { container } = mounted[mounted.length - 1];
    const paths = Array.from(container.querySelectorAll('g.link-group path.diagram-link'));
    expect(paths.length).toBeGreaterThan(0);
    for (const path of paths) {
      const line = drawnLine(path.getAttribute('d') ?? '');
      const id = path.closest('g.link-group')?.getAttribute('data-link-id');
      const worst = Math.round(Math.max(endTurn(line, 20), endTurn([...line].reverse(), 20)));
      expect({ id, hooks: worst > 120 }).toEqual({ id, hooks: false });
    }
  });
});

describe('imported Mermaid: an edge label draws as Mermaid draws it', () => {
  it('at the node text size, wrapped at 200 px — so the ranks stay close and the figure keeps its size', () => {
    const d = load(`flowchart LR
      Offer -->|Convert To Order of every line, as accepted| Order
      Order -->|deliver| Delivered`);
    const long = d.getLinks().find((l) => labelText(l)?.startsWith('Convert'))!;
    const label = long.labels[0];
    expect(label).toMatchObject({ style: { fontSize: 14 }, textWrap: true, maxWidth: 200 });
    const lines = wrapText(label.text, 200, 14);
    expect(lines.length).toBeGreaterThan(1);
    // The gap between the two ranks holds the WRAPPED label, and is narrower than one long line.
    const [offer, order] = ['Offer', 'Order'].map((id) => d.getNode(id)!);
    const gap = order.position.x - (offer.position.x + offer.size.width);
    expect(gap).toBeGreaterThanOrEqual(labels.labelBox(label).width);
    expect(gap).toBeLessThan(label.text.length * 14 * 0.6);
  });

  it('a state transition label too', () => {
    const d = load(`stateDiagram-v2
      Approved --> Awarded: Consider the award as submitted to the supplier`);
    expect(d.getLinks()[0].labels[0]).toMatchObject({ style: { fontSize: 14 }, textWrap: true, maxWidth: 200 });
  });
});
