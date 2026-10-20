// A Mermaid import rendered on a SERVER — importDiagramText, then
// renderToStaticSVG, no canvas — as a publish-time renderer does it.
//
// Without a canvas the import cannot measure its words. Sized by the 0.6 em
// estimate, a short label of capitals got a box too narrow for it, and its clip
// cut the real text: "MRQ" drew as "MRC", "NumOn" as "lumOr" (Atloria's re-check
// of round two). DejaVu Sans, the face a Linux browser falls back to, runs up to
// 12.5% wider than the engine's per-glyph estimate ("WWW"); every label's clip
// here holds at least that.
import { importDiagramText, exportDiagramText, glyphTextWidth, runDeterministic, type DiagramModel } from '@grafloria/engine';
import { renderToStaticSVG } from './render-to-static';
import { LIGHT_THEME } from '../themes';

const WIDEST_FACE = 1.125; // DejaVu Sans ÷ the per-glyph estimate, its widest word

function serverSvg(diagram: DiagramModel): string {
  // The model's own nodes and lines, as a server holding an import passes them
  // (renderToStaticSVG adopts model instances; its types name the plain specs).
  return renderToStaticSVG({
    nodes: diagram.getNodes() as never,
    edges: diagram.getLinks() as never,
    groups: diagram.getGroups() as never,
    theme: LIGHT_THEME,
    width: 1200,
    height: 800,
    fitView: true,
    lod: 'document',
  }).svg;
}

/** Each node label's text and the width of the clip rect it is drawn in. */
function clippedLabels(svg: string): Array<{ text: string; clip: number }> {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  return Array.from(doc.querySelectorAll('text.diagram-label')).map((t) => {
    const id = t.getAttribute('clip-path')?.match(/#([^)]+)/)?.[1];
    const rect = id ? doc.getElementById(id)?.querySelector('rect') : null;
    return { text: (t.textContent ?? '').trim(), clip: Number(rect?.getAttribute('width') ?? Infinity) };
  });
}

describe('a Mermaid import rendered on a server (no canvas)', () => {
  it.each([
    ['states named in capitals', 'stateDiagram-v2\n  [*] --> MRQ\n  MRQ --> RFQ\n  RFQ --> NumOn\n  NumOn --> NumOff\n  NumOff --> CapsOn'],
    ['a decision and short words in round shapes', 'flowchart TD\n  A{Check} -->|yes| B((Done))\n  A -->|no| C[Open]\n  C --> D(Removed)'],
  ])('%s: no label is cut by its box', (_name, src) => {
    const labels = runDeterministic(() => clippedLabels(serverSvg(importDiagramText(src).diagram)));
    expect(labels.length).toBeGreaterThan(0);
    for (const { text, clip } of labels) {
      expect(text).not.toContain('…');
      const needs = glyphTextWidth(text, { size: 16 }) * WIDEST_FACE;
      expect({ text, holds: clip >= needs }).toEqual({ text, holds: true });
    }
  });

  it('a diagram measured in a page and saved draws whole on a server: no "Awaiting…"', () => {
    const src = 'stateDiagram-v2\n  [*] --> Awaiting: submit\n  state "Awaiting approval" as Awaiting\n  Awaiting --> Rejected: reject\n  state "Rejected by the owner" as Rejected';
    // The page measured its words (a stand-in canvas: the glyph widths, 4% wide).
    const measureText = (text: string, font: { size: number }) => glyphTextWidth(text, font) * 1.04;
    const saved = exportDiagramText(importDiagramText(src, { measureText }).diagram, { lossless: true });
    const labels = runDeterministic(() => clippedLabels(serverSvg(importDiagramText(saved).diagram)));
    expect(labels.map((l) => l.text)).toEqual(expect.arrayContaining(['Awaiting approval', 'Rejected by the owner']));
    for (const { text } of labels) expect(text).not.toContain('…');
  });

  it('…and a measured label that wraps draws on a server the very lines its box was sized for', () => {
    // An estimate re-wrapping it packed one word more than the box held (a
    // reader's create-l-g fence clipped "Choose a scope and stage view").
    const src = 'stateDiagram-v2\n  [*] --> Scope\n  state "Choose a scope and stage view for the whole letter of guarantee" as Scope';
    // A page whose face is narrower than the glyph estimate: re-wrapped by that
    // estimate, the lines would not be the ones the box was sized for.
    const measureText = (text: string, font: { size: number }) => glyphTextWidth(text, font) * 0.85;
    const measured = importDiagramText(src, { measureText }).diagram;
    const lines = measured.getNode('Scope')!.getMetadata('labelMeasured') as string[];
    expect(lines.length).toBeGreaterThan(1);
    const saved = exportDiagramText(measured, { lossless: true });
    const svg = runDeterministic(() => serverSvg(importDiagramText(saved).diagram));
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
    const label = Array.from(doc.querySelectorAll('text.diagram-label')).find((t) => (t.textContent ?? '').startsWith('Choose'))!;
    expect(Array.from(label.querySelectorAll('tspan')).map((t) => t.textContent)).toEqual(lines);
  });
});

/** Each node label's DRAWN lines (its tspans, or its one line) and its clip width. */
function drawnLines(svg: string): Array<{ lines: string[]; clip: number }> {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  return Array.from(doc.querySelectorAll('text.diagram-label')).map((t) => {
    const id = t.getAttribute('clip-path')?.match(/#([^)]+)/)?.[1];
    const rect = id ? doc.getElementById(id)?.querySelector('rect') : null;
    const spans = Array.from(t.querySelectorAll('tspan')).map((s) => s.textContent ?? '');
    return { lines: spans.length ? spans : [(t.textContent ?? '').trim()], clip: Number(rect?.getAttribute('width') ?? Infinity) };
  });
}

describe('a server render: wrapped labels heavy in capitals and wide letters', () => {
  // The box was sized line by line for any UI face; the renderer re-wrapped it by
  // the narrower 0.6 em estimate, packed one word more per line than the box
  // held, and the clip cut both ends: "PAYMENT RECEIVED AND VERIFIED" drew as
  // "AYMENT RECEIVED ANC" (Atloria's round-three probe).
  it.each([
    ['flowchart', 'flowchart LR\n  A[WAITING FOR WAREHOUSE MANAGER] --> B[REQUEST FOR QUOTATION RFQ SENT]\n  B --> C[MMMMMMMM WWWWWWWW]\n  C --> D([QQQQ MMMM])\n  D --> E[Maximum Wait Window Was Missed]'],
    ['state diagram', 'stateDiagram-v2\n  state "ORDER CONFIRMED BY CUSTOMER" as Confirmed\n  state "PAYMENT RECEIVED AND VERIFIED" as Paid\n  [*] --> Confirmed\n  Confirmed --> Paid\n  Paid --> [*]'],
  ])('%s: every drawn line fits its box as the widest face draws it', (_name, src) => {
    const d = importDiagramText(src).diagram;
    // Every box the import sized keeps its lines, measured or not.
    for (const n of d.getNodes()) if (String(n.getLabel?.() ?? '').trim() && !String(n.type).startsWith('state:start')) {
      expect({ id: n.id, lines: Array.isArray(n.getMetadata('labelMeasured')) }).toEqual({ id: n.id, lines: true });
    }
    const labels = runDeterministic(() => drawnLines(serverSvg(d)));
    expect(labels.length).toBeGreaterThan(0);
    for (const { lines, clip } of labels) {
      for (const line of lines) {
        expect(line).not.toContain('…');
        const needs = glyphTextWidth(line, { size: 16 }) * WIDEST_FACE;
        expect({ line, holds: clip >= needs }).toEqual({ line, holds: true });
      }
    }
  });
});

describe("a server render: an imported label rides its own curve", () => {
  // Labels were placed along the drawn basis curve but drawn along the points
  // between its bends: a fan's outer labels sat beside their curves (13 px).
  it('every label chip of a fan touches its own drawn line', () => {
    const svg = runDeterministic(() =>
      serverSvg(
        importDiagramText(`flowchart LR
          Offer -->|Valid Offer| Valid[Valid offer]
          Offer -->|Alternative Offer| Alternative[Alternative offer]
          Offer -->|Revision| Revision
          Offer -->|Rejected Offer| Rejected[Rejected offer]
          Offer -->|Cancel RFQ| Cancelled[Cancelled RFQ]
          Offer -->|Regretted To Offer| Regretted[Regretted offer]`).diagram
      )
    );
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
    const groups = Array.from(doc.querySelectorAll('g.link-group')).filter((g) => g.querySelector('g.link-label-group'));
    expect(groups.length).toBe(6);
    for (const g of groups) {
      const line = drawnPath(g.querySelector('path.diagram-link')!.getAttribute('d') ?? '');
      const lab = g.querySelector('g.link-label-group')!;
      const [tx, ty] = (lab.getAttribute('transform') ?? '').match(/-?[\d.]+/g)!.map(Number);
      const r = lab.querySelector('rect')!;
      const box = { x: tx + Number(r.getAttribute('x')), y: ty + Number(r.getAttribute('y')), w: Number(r.getAttribute('width')), h: Number(r.getAttribute('height')) };
      const gap = Math.min(...line.map((p) => Math.hypot(Math.max(box.x - p.x, 0, p.x - box.x - box.w), Math.max(box.y - p.y, 0, p.y - box.y - box.h))));
      expect({ label: lab.textContent, onItsLine: gap <= 4 }).toEqual({ label: lab.textContent, onItsLine: true });
    }
  });
});

/** A drawn `d` (M, L, C) as points, each cubic sampled 16 times. */
function drawnPath(d: string): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [];
  for (const [, cmd, args] of d.matchAll(/([MLC])([^MLC]*)/g)) {
    const n = (args.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
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
        out.push({ x: u * u * u * p.x + 3 * u * u * t * ax + 3 * u * t * t * bx + t * t * t * x, y: u * u * u * p.y + 3 * u * u * t * ay + 3 * u * t * t * by + t * t * t * y });
      }
    }
  }
  return out;
}
