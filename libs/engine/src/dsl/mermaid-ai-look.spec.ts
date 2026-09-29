/**
 * THE AI-DIAGRAM LOOK, IN GRAFLORIA'S MERMAID.
 *
 * The diagrams Claude and ChatGPT draw as hand-written SVG — zones with corner
 * captions, boxes with a bold name over a muted line, coloured labels riding
 * just over their lines, a red note — can be WRITTEN as Mermaid for Grafloria:
 * a body any Mermaid renderer still accepts (the look is carried by native
 * `style` / `classDef` / `linkStyle`, `<b>…</b><br/>…` labels, v11 `@{ shape:
 * text }`), plus `%%grafloria:` comment directives — ignored by Mermaid — for
 * what Mermaid has no words for: exact positions, anchors along a side, label
 * placement, bends, caption placement.
 */
import { importDiagramText, exportDiagramText } from '../serialization/TextFormat';

const imp = (t: string) => importDiagramText(t).diagram;

/** The reference diagram (a HealthPay card-flow review), as Grafloria Mermaid. */
export const HEALTHPAY_MERMAID = `flowchart LR
  customer["<b>Customer</b><br/>phone or browser"]
  subgraph hp["HEALTHPAY'S SIDE · CARDS ARE TYPED HERE"]
    page["<b>HealthPay payment page</b><br/>the card is typed here"]
    wallets["<b>HealthPay wallets</b><br/>hold the customer's money"]
  end
  subgraph ours["OUR SIDE · MUST NEVER SEE A CARD"]
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
  %% Grafloria layout — comments any other Mermaid renderer ignores
  %%grafloria:at customer 20,78 150x292
  %%grafloria:at page 410,78 210x72
  %%grafloria:at wallets 712,78 210x72
  %%grafloria:at api 410,264 210x72
  %%grafloria:at db 712,264 210x72
  %%grafloria:at fake 20,398 150x60
  %%grafloria:at note 186,421 360x24
  %%grafloria:at hp 380,36 566x138
  %%grafloria:at ours 380,236 566x150
  %%grafloria:group ours caption:bottom-left
  %%grafloria:edge * * label:above
  %%grafloria:edge customer page from:right@36, to:left@36
  %%grafloria:edge page wallets from:right@36, to:left@36
  %%grafloria:edge api wallets from:top@170, to:bottom@138, via:580 204 850 204
  %%grafloria:edge api db from:right@36, to:left@36
  %%grafloria:edge api customer from:left@24, to:right@210
  %%grafloria:edge customer api from:right@240, to:left@54, label:below
  %%grafloria:edge customer fake from:bottom@75, to:top@75
`;

describe("Grafloria's Mermaid draws the AI-diagram look", () => {
  const d = imp(HEALTHPAY_MERMAID);

  describe('labels', () => {
    it('a bold first line over a second line is a NAME and a SUBTITLE', () => {
      const c = d.getNode('customer')!;
      expect(c.getLabel()).toBe('Customer');
      expect(c.getMetadata('sublabel')).toBe('phone or browser');
    });

    it('a <code> subtitle is a monospace one', () => {
      expect(d.getNode('api')!.getMetadata('sublabel')).toEqual({ text: 'sherkety-erp-api', fontFamily: 'mono' });
    });

    it('markdown strings say the same thing: "`**Name**` + a newline + the subtitle"', () => {
      const m = imp('flowchart LR\n  a["`**Our API**\n  sherkety-erp-api`"]\n  b["**Our database**<br>keys, ledger"]');
      expect(m.getNode('a')!.getLabel()).toBe('Our API');
      expect(m.getNode('a')!.getMetadata('sublabel')).toBe('sherkety-erp-api');
      expect(m.getNode('b')!.getLabel()).toBe('Our database');
      expect(m.getNode('b')!.getMetadata('sublabel')).toBe('keys, ledger');
    });

    it('a line break and #quot; entities in an EDGE label become a two-line label with real quotes', () => {
      const link = d.getLinks().find((l) => l.sourceNodeId === 'customer' && l.targetNodeId === 'api')!;
      expect(link.getLabel()).toBe('card typed as a\n"bank account" (H1)');
    });

    it('a plain one-line label is untouched', () => {
      expect(imp('flowchart LR\n  a[Plain words]').getNode('a')!.getLabel()).toBe('Plain words');
    });
  });

  describe('notes and boxes', () => {
    it('v11 @{ shape: text } is a text note, styled by `style`', () => {
      const n = d.getNode('note')!;
      expect((n.getMetadata('shape') as { type?: string }).type).toBe('text');
      expect(n.getLabel()).toBe('if someone swaps the link, the customer lands here (M1)');
      expect(n.style.color).toBe('#cf222e');
      expect(n.style.fontWeight).toBe('bold');
      expect(n.style.fontSize).toBe(11);
    });

    it('classDef shadow:none makes a flat box (a CSS property any Mermaid ignores)', () => {
      expect(d.getNode('customer')!.style.shadow).toBe(false);
      expect(d.getNode('fake')!.style.fill).toBe('#fdecec');
    });
  });

  describe('zones', () => {
    it('`style <subgraph>` styles the zone: fill, border, dash (a value with a space), caption colour and weight', () => {
      const hp = d.getGroup('hp')!;
      expect(hp.name).toBe("HEALTHPAY'S SIDE · CARDS ARE TYPED HERE");
      expect([...hp.members].sort()).toEqual(['page', 'wallets']);
      expect(hp.getMetadata('frameStyle')).toEqual(
        expect.objectContaining({ fill: '#e9f2f3', stroke: '#7aabb3', strokeDasharray: '5 4', color: '#2a7a86', fontWeight: 'bold', letterSpacing: 1 })
      );
    });

    it('%%grafloria:group … caption:bottom-left places the caption', () => {
      expect(d.getGroup('ours')!.getMetadata('frameStyle')).toEqual(expect.objectContaining({ labelPlacement: 'bottom-left' }));
    });

    it('a subgraph with no pinned frame is FITTED around its members (it used to have no size, so it drew nothing)', () => {
      const m = imp('flowchart LR\n  subgraph pipeline\n    Extract --> Transform --> Load\n  end\n  Load --> Warehouse');
      const g = m.getGroup('pipeline')!;
      const b = g.getOuterBounds();
      expect(b.width).toBeGreaterThan(0);
      for (const id of ['Extract', 'Transform', 'Load']) {
        const n = m.getNode(id)!;
        expect(n.position.x).toBeGreaterThanOrEqual(b.x);
        expect(n.position.y).toBeGreaterThanOrEqual(b.y);
        expect(n.position.x + n.size.width).toBeLessThanOrEqual(b.x + b.width);
        expect(n.position.y + n.size.height).toBeLessThanOrEqual(b.y + b.height);
      }
      expect(m.getNode('Warehouse')!.position.x + 1).toBeGreaterThan(b.x + b.width); // outside the zone
    });

    it('%%grafloria:at pins a zone’s frame too', () => {
      const hp = d.getGroup('hp')!;
      expect(hp.getOuterBounds()).toEqual({ x: 380, y: 36, width: 566, height: 138 });
    });
  });

  describe('%%grafloria:at — exact positions', () => {
    it('pins a node to x,y and sizes it WxH, over whatever the automatic placement chose', () => {
      const c = d.getNode('customer')!;
      expect([c.position.x, c.position.y, c.size.width, c.size.height]).toEqual([20, 78, 150, 292]);
      const note = d.getNode('note')!;
      expect([note.position.x, note.position.y]).toEqual([186, 421]);
    });
  });

  describe('%%grafloria:edge — anchors, label placement, bends', () => {
    const link = (s: string, t: string) => d.getLinks().find((l) => l.sourceNodeId === s && l.targetNodeId === t)!;

    it('from:/to: pin the ends to a point along a side', () => {
      const l = link('customer', 'page');
      expect(l.sourcePortId).toBe('customer__right@36');
      expect(l.targetPortId).toBe('page__left@36');
      expect(d.getNode('customer')!.getPort('customer__right@36')).toBeDefined();
    });

    it('`* *` sets a default for every edge; a later directive for one edge overrides it', () => {
      expect(link('page', 'wallets').getMetadata('labelPlacement')).toBe('above');
      expect(link('customer', 'api').getMetadata('labelPlacement')).toBe('below');
    });

    it('via: gives the bends — manual waypoints the router keeps', () => {
      const l = link('api', 'wallets');
      expect(l.getMetadata('hasManualWaypoints')).toBe(true);
      const p = l.points.map((q) => [q.x, q.y]);
      expect(p).toContainEqual([580, 204]);
      expect(p).toContainEqual([850, 204]);
    });

    it('linkStyle default interpolate stepBefore draws EVERY line with right angles (Mermaid\'s own words) — a moved box gets an elbow, not a diagonal', () => {
      for (const l of d.getLinks()) expect(l.pathType).toBe('orthogonal');
    });

    it('linkStyle <n> interpolate … reaches that one line only', () => {
      const m = imp('flowchart LR\n  a --> b\n  b --> c\n  linkStyle 1 interpolate stepBefore');
      expect(m.getLinks().map((l) => l.pathType === 'orthogonal')).toEqual([false, true]);
    });

    it('the arrowhead takes the linkStyle stroke — a green line has a green head', () => {
      const head = link('customer', 'page').style.arrowHead as { color?: string } | undefined;
      if (head && typeof head === 'object' && 'color' in head) expect(head.color).toBe('#1a7f37');
    });

    it('classDef rx rounds a box', () => {
      expect(d.getNode('page')!.style.borderRadius).toBe(4);
    });

    it('font-size sets the size: 13 px names from classDef, 11 px line labels from linkStyle', () => {
      expect(d.getNode('customer')!.style.fontSize).toBe(13);
      expect(d.getNode('fake')!.style.fontSize).toBe(13);
      expect(link('customer', 'page').labels[0].style?.fontSize).toBe(11);
      expect(link('page', 'wallets').labels[0].style?.fontSize).toBe(11);
      expect(link('customer', 'api').labels[0].style?.fontSize).toBe(11);
    });

    it('linkStyle stroke-width:1.5px draws the hairline an AI diagram uses', () => {
      for (const [s, t] of [['customer', 'page'], ['page', 'wallets'], ['api', 'wallets'], ['customer', 'fake']]) {
        expect(link(s, t).style.strokeWidth).toBe(1.5);
      }
    });

    it('linkStyle colour and weight reach the LABEL, stroke reaches the line; -.-> stays dashed', () => {
      const good = link('customer', 'page');
      expect(good.style.stroke).toBe('#1a7f37');
      expect(good.labels[0].style?.color).toBe('#1a7f37');
      expect(good.labels[0].style?.fontWeight).toBe('bold');
      expect(good.labels[0].style?.background).toBe('none'); // placed above: no box
      const bad = link('customer', 'fake');
      expect(bad.style.stroke).toBe('#cf222e');
      expect(bad.style.strokeDasharray).toBeTruthy();
    });
  });

  it('the visible body is still Mermaid: every Grafloria-only word lives in a %% comment', () => {
    for (const line of HEALTHPAY_MERMAID.split('\n')) {
      if (/grafloria/i.test(line)) expect(line.trim().startsWith('%%')).toBe(true);
    }
  });
});

describe('…and the look ROUND-TRIPS through readable Mermaid (export, then import)', () => {
  const d = imp(HEALTHPAY_MERMAID);
  const body = exportDiagramText(d, { lossless: false, positions: true });
  const back = imp(body);
  const link = (m: typeof d, s: string, t: string) => m.getLinks().find((l) => l.sourceNodeId === s && l.targetNodeId === t)!;

  it('the exported body is Mermaid: every Grafloria-only word sits in a %% comment', () => {
    for (const line of body.split('\n')) if (/grafloria/i.test(line)) expect(line.trim().startsWith('%%')).toBe(true);
    expect(body).toContain('subgraph hp');
  });

  it('names, subtitles (the monospace one too) and the text note survive', () => {
    expect(back.getNode('customer')!.getLabel()).toBe('Customer');
    expect(back.getNode('customer')!.getMetadata('sublabel')).toBe('phone or browser');
    expect(back.getNode('api')!.getMetadata('sublabel')).toEqual({ text: 'sherkety-erp-api', fontFamily: 'mono' });
    expect((back.getNode('note')!.getMetadata('shape') as { type?: string }).type).toBe('text');
    expect(back.getNode('note')!.style.color).toBe('#cf222e');
    expect(back.getNode('customer')!.style.shadow).toBe(false);
  });

  it('zones survive: members, frame style, caption placement, pinned frame', () => {
    const hp = back.getGroup('hp')!;
    expect([...hp.members].sort()).toEqual(['page', 'wallets']);
    expect(hp.getMetadata('frameStyle')).toEqual(expect.objectContaining({ fill: '#e9f2f3', strokeDasharray: '5 4', color: '#2a7a86' }));
    expect(back.getGroup('ours')!.getMetadata('frameStyle')).toEqual(expect.objectContaining({ labelPlacement: 'bottom-left' }));
    expect(hp.getOuterBounds()).toEqual({ x: 380, y: 36, width: 566, height: 138 });
  });

  it('positions and sizes survive (positions: true)', () => {
    const c = back.getNode('customer')!;
    expect([c.position.x, c.position.y, c.size.width, c.size.height]).toEqual([20, 78, 150, 292]);
  });

  it('anchors, label placement, bends, line and label colours survive', () => {
    const good = link(back, 'customer', 'page');
    expect(good.sourcePortId).toBe('customer__right@36');
    expect(good.getMetadata('labelPlacement')).toBe('above');
    expect(good.style.stroke).toBe('#1a7f37');
    expect(good.labels[0].style?.color).toBe('#1a7f37');
    expect(link(back, 'customer', 'api').getMetadata('labelPlacement')).toBe('below');
    expect(link(back, 'customer', 'api').getLabel()).toBe('card typed as a\n"bank account" (H1)');
    const elbow = link(back, 'api', 'wallets');
    expect(elbow.pathType).toBe('orthogonal');
    expect(elbow.points.map((q) => [q.x, q.y])).toContainEqual([580, 204]);
  });

  it('a plain diagram exports exactly as before: no subgraph, no positions, no new directives', () => {
    const plain = exportDiagramText(imp('flowchart LR\n  a --> b'), { lossless: false });
    expect(plain).not.toContain('subgraph');
    expect(plain).not.toContain('%%grafloria');
  });
});

describe("the lossless sidecar keeps a hand-bent line's bends", () => {
  it('waypoints survive an export and re-import (routed points are still dropped)', () => {
    const d = imp(HEALTHPAY_MERMAID);
    const back = imp(exportDiagramText(d));
    const elbow = back.getLinks().find((l) => l.sourceNodeId === 'api' && l.targetNodeId === 'wallets')!;
    expect(elbow.getMetadata('hasManualWaypoints')).toBe(true);
    expect(elbow.points.map((q) => [q.x, q.y])).toContainEqual([850, 204]);
    const routed = back.getLinks().find((l) => l.sourceNodeId === 'page' && l.targetNodeId === 'wallets')!;
    expect(routed.points).toEqual([]);
  });
});

