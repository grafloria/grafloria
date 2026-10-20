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
});
