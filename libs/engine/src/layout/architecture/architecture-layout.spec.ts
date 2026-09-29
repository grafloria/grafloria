/**
 * THE ARCHITECTURE LAYOUT — the look of an AI-drawn diagram with no coordinates.
 *
 * The HealthPay card-flow diagram, written in Grafloria Mermaid with every
 * position, size, pixel anchor and bend removed. What is left is structure
 * (who is in which zone, who talks to whom) and RELATIONS that are not
 * coordinates: a line leaves one box from its bottom, a note sits to the right of
 * the fake page. Layered, ELK and dagre all drew it "correct but wrong" — zones
 * packed over their captions, U-turning lines, labels on labels, the note
 * anywhere — because they rank a graph. This diagram is a COMPOSITION: regions on
 * a grid, boxes aligned in rows inside them, lines straight where boxes line up,
 * elbows in the gutters.
 */
import { importDiagramText, exportDiagramText } from '../../serialization/TextFormat';
import { parseSideAnchor } from '../../ports/side-anchor';
import type { DiagramModel } from '../../models/DiagramModel';
import type { LinkModel } from '../../models/LinkModel';

export const HEALTHPAY_STRUCTURE = `flowchart LR
  %%grafloria:layout architecture
  customer["<b>Customer</b><br/>phone or browser"]
  subgraph hp["HEALTHPAY'S SIDE · CARDS ARE TYPED HERE"]
    direction LR
    page["<b>HealthPay payment page</b><br/>the card is typed here"]
    wallets["<b>HealthPay wallets</b><br/>hold the customer's money"]
  end
  subgraph ours["OUR SIDE · MUST NEVER SEE A CARD"]
    direction LR
    api["<b>Our API</b><br/><code>sherkety-erp-api</code>"]
    db["<b>Our database</b><br/>keys, ledger, bank numbers"]
  end
  fake["<b>Fake card page</b><br/>not HealthPay's"]:::bad
  note@{ shape: text, label: "if someone swaps the link, the customer lands here (M1)" }
  customer -->|card number and CVV| page
  page -->|adds money| wallets
  api -->|asks HealthPay to move money| wallets
  api -->|saves keys| db
  api -->|sends the payment link| customer
  customer -.->|"card typed as a<br/>#quot;bank account#quot; (H1)"| api
  customer -.-> fake
  classDef box fill:#ffffff,stroke:#d0d5dd,shadow:none,rx:4,font-size:13px
  classDef bad fill:#fdecec,stroke:#e5a0a0,shadow:none,rx:4,font-size:13px
  class customer,page,wallets,api,db box
  style note color:#cf222e,font-weight:bold,font-size:11px
  style hp fill:#e9f2f3,stroke:#7aabb3,stroke-dasharray:5 4,color:#2a7a86,font-weight:bold,letter-spacing:1px
  style ours fill:#f3f4f6,stroke:#d7dbe0,color:#4b5563,font-weight:bold,letter-spacing:1px
  linkStyle default interpolate stepBefore
  linkStyle 0 stroke:#1a7f37,color:#1a7f37,font-weight:bold,font-size:11px,stroke-width:1.5px
  linkStyle 1,2,3,4 stroke:#6b7785,color:#5f6b7a,font-size:11px,stroke-width:1.5px
  linkStyle 5,6 stroke:#cf222e,color:#cf222e,font-weight:bold,font-size:11px,stroke-width:1.5px
  %%grafloria:group ours caption:bottom-left
  %%grafloria:edge * * label:above
  %%grafloria:edge customer api label:below
  %%grafloria:edge api wallets from:top, to:bottom
  %%grafloria:edge customer fake from:bottom, to:top
  %%grafloria:near note fake right
`;

type Rect = { x: number; y: number; w: number; h: number };
const R = (d: DiagramModel, id: string): Rect => {
  const n = d.getNode(id);
  if (n) return { x: n.position.x, y: n.position.y, w: n.size.width, h: n.size.height };
  const b = d.getGroup(id)!.getOuterBounds();
  return { x: b.x, y: b.y, w: b.width, h: b.height };
};
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const link = (d: DiagramModel, s: string, t: string) => d.getLinks().find((l) => l.sourceNodeId === s && l.targetNodeId === t)!;
/** Where a line meets a box: its side anchor, read back from the port the layout chose. */
const anchor = (d: DiagramModel, l: LinkModel, end: 'source' | 'target') => {
  const nodeId = end === 'source' ? l.sourceNodeId! : l.targetNodeId!;
  const portId = (end === 'source' ? l.sourcePortId : l.targetPortId) ?? '';
  const handle = portId.split('__')[1] ?? '';
  const a = parseSideAnchor(handle);
  const r = R(d, nodeId);
  // No side anchor is a failure, never a NaN that compares equal to another NaN.
  if (!a) throw new Error(`${l.sourceNodeId}→${l.targetNodeId} ${end}: no side anchor (port "${portId}")`);
  const along = a.side === 'left' || a.side === 'right' ? r.h : r.w;
  const off = a.at.pct !== undefined ? (a.at.pct / 100) * along : a.at.px!;
  const x = a.side === 'left' ? r.x : a.side === 'right' ? r.x + r.w : r.x + off;
  const y = a.side === 'top' ? r.y : a.side === 'bottom' ? r.y + r.h : r.y + off;
  return { side: a.side, x, y };
};

describe('the architecture layout draws the AI-diagram look from structure alone', () => {
  const d = importDiagramText(HEALTHPAY_STRUCTURE).diagram;
  const boxes = ['customer', 'page', 'wallets', 'api', 'db', 'fake', 'note'];

  describe('regions', () => {
    it('the two zones stack in one column — HealthPay above ours (the line from Our API leaves its TOP) — same left edge, same width, never overlapping', () => {
      const hp = R(d, 'hp'), ours = R(d, 'ours');
      expect(hp.y + hp.h).toBeLessThan(ours.y);
      expect(hp.x).toBeCloseTo(ours.x, 0);
      expect(hp.w).toBeCloseTo(ours.w, 0);
    });

    it('the customer stands left of both zones; the fake page sits below the customer (the dashed line leaves its BOTTOM)', () => {
      const c = R(d, 'customer'), hp = R(d, 'hp'), f = R(d, 'fake');
      expect(c.x + c.w).toBeLessThan(hp.x);
      expect(f.y).toBeGreaterThan(c.y + c.h);
      expect(f.x + f.w / 2).toBeCloseTo(c.x + c.w / 2, 0);
    });

    it('nothing overlaps: no two boxes, and no box over a zone it is not in', () => {
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
        expect([boxes[i], boxes[j], overlaps(R(d, boxes[i]), R(d, boxes[j]))]).toEqual([boxes[i], boxes[j], false]);
      }
      for (const id of ['customer', 'fake', 'note']) for (const z of ['hp', 'ours']) {
        expect([id, z, overlaps(R(d, id), R(d, z))]).toEqual([id, z, false]);
      }
    });
  });

  describe('boxes', () => {
    it('inside a zone the boxes form a ROW (subgraph direction LR): same top, same height', () => {
      expect(R(d, 'page').y).toBeCloseTo(R(d, 'wallets').y, 0);
      expect(R(d, 'page').h).toBeCloseTo(R(d, 'wallets').h, 0);
      expect(R(d, 'api').y).toBeCloseTo(R(d, 'db').y, 0);
      expect(R(d, 'page').x + R(d, 'page').w).toBeLessThan(R(d, 'wallets').x);
    });

    it('stacked zones share one column grid: the payment page sits over Our API, the wallets over the database, same widths', () => {
      // "Our API" alone needs ~120 px; in the payment page's column it takes the column's width
      expect(R(d, 'api').w).toBeGreaterThanOrEqual(190);
      expect(R(d, 'page').x).toBeCloseTo(R(d, 'api').x, 0);
      expect(R(d, 'page').w).toBeCloseTo(R(d, 'api').w, 0);
      expect(R(d, 'wallets').x).toBeCloseTo(R(d, 'db').x, 0);
      expect(R(d, 'wallets').w).toBeCloseTo(R(d, 'db').w, 0);
    });

    it('every box is sized to its words: wide enough for its name, tall enough for a name over a subtitle', () => {
      expect(R(d, 'page').w).toBeGreaterThanOrEqual(190); // "HealthPay payment page", 13 px bold
      expect(R(d, 'page').h).toBeGreaterThanOrEqual(56);
      // one line of bold 11 px words, never cut: they measured 314 px drawn at 1:1 in Chromium
      expect(R(d, 'note').w).toBeGreaterThanOrEqual(314);
    });

    it('each zone keeps a band for its caption: HealthPay at its top, ours at its bottom (caption:bottom-left)', () => {
      const hp = R(d, 'hp'), ours = R(d, 'ours');
      expect(R(d, 'page').y - hp.y).toBeGreaterThanOrEqual(36);
      expect(ours.y + ours.h - (R(d, 'api').y + R(d, 'api').h)).toBeGreaterThanOrEqual(36);
    });
  });

  describe('lines', () => {
    it('the customer spans the rows it talks to, so its lines to BOTH zones run straight', () => {
      for (const [s, t] of [['customer', 'page'], ['api', 'customer'], ['customer', 'api']]) {
        const a = anchor(d, link(d, s, t), 'source'), b = anchor(d, link(d, s, t), 'target');
        expect([s, t, Math.round(a.y)]).toEqual([s, t, Math.round(b.y)]);
      }
    });

    it('the two lines between Our API and the customer run at different heights, both on Our API', () => {
      const out = anchor(d, link(d, 'api', 'customer'), 'source').y;
      const back = anchor(d, link(d, 'customer', 'api'), 'target').y;
      const api = R(d, 'api');
      expect(Math.abs(out - back)).toBeGreaterThanOrEqual(16);
      for (const y of [out, back]) {
        expect(y).toBeGreaterThan(api.y);
        expect(y).toBeLessThan(api.y + api.h);
      }
    });

    it('lines inside a row are straight: payment page → wallets, API → database', () => {
      for (const [s, t] of [['page', 'wallets'], ['api', 'db']]) {
        expect(Math.round(anchor(d, link(d, s, t), 'source').y)).toBe(Math.round(anchor(d, link(d, s, t), 'target').y));
      }
    });

    it("the line from Our API's top to the wallets' bottom bends in the GUTTER between the zones", () => {
      const l = link(d, 'api', 'wallets');
      expect(anchor(d, l, 'source').side).toBe('top');
      expect(anchor(d, l, 'target').side).toBe('bottom');
      const hp = R(d, 'hp'), ours = R(d, 'ours');
      const bends = l.points.slice(1, -1);
      expect(bends.length).toBeGreaterThanOrEqual(2);
      for (const p of bends) {
        expect(p.y).toBeGreaterThan(hp.y + hp.h);
        expect(p.y).toBeLessThan(ours.y);
      }
    });

    it('the dashed line to the fake page runs straight down', () => {
      const l = link(d, 'customer', 'fake');
      expect(Math.round(anchor(d, l, 'source').x)).toBe(Math.round(anchor(d, l, 'target').x));
      expect(anchor(d, l, 'source').side).toBe('bottom');
    });

    it('the gap between the customer and the zones fits the widest label crossing it', () => {
      // "sends the payment link" — 22 characters at 11 px
      expect(R(d, 'hp').x - (R(d, 'customer').x + R(d, 'customer').w)).toBeGreaterThanOrEqual(150);
    });
  });

  it('the note sits to the RIGHT of the fake page, level with it', () => {
    const n = R(d, 'note'), f = R(d, 'fake');
    expect(n.x).toBeGreaterThanOrEqual(f.x + f.w);
    expect(n.x - (f.x + f.w)).toBeLessThanOrEqual(24);
    expect(n.y + n.h / 2).toBeCloseTo(f.y + f.h / 2, 0);
  });
});

describe("engine.layout('architecture') — the same composition for a diagram built any way", () => {
  it('lays out a diagram that did not ask for it in its text, zones included (the nested-container path does not take it over)', async () => {
    const { DiagramEngine } = await import('../../engine/DiagramEngine');
    const text = HEALTHPAY_STRUCTURE.replace('%%grafloria:layout architecture', '');
    const d = importDiagramText(text).diagram;
    expect(R(d, 'hp').y + R(d, 'hp').h).toBeGreaterThan(R(d, 'ours').y); // not composed yet: the zones overlap
    const engine = new DiagramEngine();
    engine.setDiagram(d);
    const result = await engine.layout('architecture');
    expect(result.algorithm).toBe('architecture');
    expect(R(d, 'hp').y + R(d, 'hp').h).toBeLessThan(R(d, 'ours').y);
    expect(R(d, 'page').y - R(d, 'hp').y).toBeGreaterThanOrEqual(36); // the caption band: our frames, not the nested path's
    const a = anchor(d, link(d, 'customer', 'page'), 'source'), b = anchor(d, link(d, 'customer', 'page'), 'target');
    expect(Math.round(a.y)).toBe(Math.round(b.y));
  });

  it('is listed with the other layouts', async () => {
    const { DiagramEngine } = await import('../../engine/DiagramEngine');
    expect(new DiagramEngine().getLayoutRegistry().names()).toContain('architecture');
  });
});

describe('…and the composition ROUND-TRIPS as readable Mermaid, with no coordinates in it', () => {
  const d = importDiagramText(HEALTHPAY_STRUCTURE).diagram;
  const body = exportDiagramText(d, { lossless: false });

  it('the export keeps the relations and asks for the layout — and writes no position', () => {
    expect(body).toMatch(/%%grafloria:layout architecture/);
    expect(body).toMatch(/%%grafloria:near note fake right/);
    expect(body).toMatch(/%%grafloria:edge customer fake[^\n]*from:bottom/);
    expect(body).toMatch(/%%grafloria:edge api wallets[^\n]*from:top/);
    expect(body).toMatch(/subgraph hp[^\n]*\n\s*direction LR/);
    expect(body).not.toMatch(/%%grafloria:at/);
  });

  it('importing the export draws the same picture', () => {
    const back = importDiagramText(body).diagram;
    for (const id of ['customer', 'page', 'wallets', 'api', 'db', 'fake', 'note', 'hp', 'ours']) {
      const a = R(d, id), b = R(back, id);
      expect([id, Math.round(b.x), Math.round(b.y), Math.round(b.w), Math.round(b.h)]).toEqual([id, Math.round(a.x), Math.round(a.y), Math.round(a.w), Math.round(a.h)]);
    }
  });

  it('nested subgraphs export nested', () => {
    const nestedText = `flowchart LR
  subgraph cloud[Cloud]
    gw[Gateway]
    subgraph vpc[Private network]
      app[App] --> db[DB]
    end
    gw --> app
  end`;
    const out = exportDiagramText(importDiagramText(nestedText).diagram, { lossless: false });
    const cloudAt = out.indexOf('subgraph cloud');
    const vpcAt = out.indexOf('subgraph vpc');
    expect(cloudAt).toBeGreaterThanOrEqual(0);
    expect(vpcAt).toBeGreaterThan(cloudAt);
    // vpc's block closes before cloud's
    const tail = out.slice(vpcAt);
    expect((tail.match(/\n\s*end\b/g) ?? []).length).toBeGreaterThanOrEqual(2);
    const back = importDiagramText(out).diagram;
    expect(back.getGroup('vpc')!.parentGroupId).toBe('cloud');
  });
});

