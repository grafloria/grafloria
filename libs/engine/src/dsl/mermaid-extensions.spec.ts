/**
 * Mermaid extension channel — Phase 2 (docs/MERMAID-GAP-ANALYSIS.md §5).
 *
 * Two tiers, one governing rule:
 *   Tier 1 — Mermaid-NATIVE directives (style / classDef / class / ::: /
 *            linkStyle / click). Visible in the body, renders in any Mermaid tool.
 *   Tier 2 — `%%grafloria:` comment directives for Grafloria-only features (node status,
 *            edge animation) with NO Mermaid analog. Hidden in comments Mermaid
 *            ignores, so the visible body stays valid Mermaid.
 *
 * These were SKIPPED in Phase 0 (never garbage) — Phase 2 wires them to the model
 * and round-trips them through the generator. The "valid Mermaid body" invariant
 * is proven separately by the browser oracle (e2e/mermaid-oracle-run.mjs).
 */
import { importDiagramText, exportDiagramText } from '../serialization/TextFormat';
import { DSL } from './DSL';

const imp = (t: string) => importDiagramText(t).diagram;
const roundTrip = (d: ReturnType<typeof imp>) => {
  // Export the BODY (no sidecar), re-import via the text path — proves the
  // generator emits what the parser reads.
  const body = exportDiagramText(d, { lossless: false });
  return { body, back: importDiagramText(body).diagram };
};

describe('Mermaid extensions — Tier 1: native styling directives', () => {
  it('style <id> fill/stroke → node.style (with # hex colours)', () => {
    const d = imp('flowchart LR\n  a --> b\n  style a fill:#f9f,stroke:#333,stroke-width:2');
    const a = d.getNode('a')!;
    expect(a.style.fill).toBe('#f9f');
    expect(a.style.stroke).toBe('#333');
    expect(a.style.strokeWidth).toBe(2);
  });

  it('classDef + class applies the class properties to the node', () => {
    const d = imp('flowchart LR\n  a --> b\n  classDef hot fill:#f00,stroke:#900\n  class a hot');
    expect(d.getNode('a')!.style.fill).toBe('#f00');
    expect(d.getNode('a')!.style.stroke).toBe('#900');
    // b is untouched.
    expect(d.getNode('b')!.style.fill).toBeUndefined();
  });

  it('class can target several ids at once', () => {
    const d = imp('flowchart LR\n  a --> b\n  classDef hot fill:#f00\n  class a,b hot');
    expect(d.getNode('a')!.style.fill).toBe('#f00');
    expect(d.getNode('b')!.style.fill).toBe('#f00');
  });

  it(':::class inline shorthand applies a classDef to that node', () => {
    const d = imp('flowchart LR\n  a:::hot --> b\n  classDef hot fill:#0f0');
    expect(d.getNode('a')!.style.fill).toBe('#0f0');
  });

  it('classDef defined AFTER the class reference still resolves', () => {
    const d = imp('flowchart LR\n  a --> b\n  class a hot\n  classDef hot fill:#abc');
    expect(d.getNode('a')!.style.fill).toBe('#abc');
  });

  it('linkStyle <index> → that link’s style', () => {
    const d = imp('flowchart LR\n  a --> b\n  b --> c\n  linkStyle 0 stroke:#ff3,stroke-width:4');
    const first = d.getLinks()[0];
    expect(first.style.stroke).toBe('#ff3');
    expect(first.style.strokeWidth).toBe(4);
  });

  it('click <id> "url" → node href metadata (no garbage node)', () => {
    const d = imp('flowchart LR\n  a --> b\n  click a "https://example.com" "tip"');
    expect(d.getNode('a')!.getMetadata('href')).toBe('https://example.com');
    expect(d.getNodes().map((n) => n.id).sort()).toEqual(['a', 'b']);
  });

  it('ROUND-TRIP: node styles survive export→import through the body', () => {
    const d = imp('flowchart LR\n  a --> b\n  style a fill:#f9f,stroke:#333');
    const { body, back } = roundTrip(d);
    expect(body).toContain('style a');
    expect(back.getNode('a')!.style.fill).toBe('#f9f');
    expect(back.getNode('a')!.style.stroke).toBe('#333');
  });
});

describe('Mermaid extensions — Tier 2: the %%grafloria: channel', () => {
  it('%%grafloria:node <id> status → node.state.status (Grafloria-only, no Mermaid analog)', () => {
    const d = imp('flowchart LR\n  a --> b\n  %%grafloria:node a status:running');
    expect(d.getNode('a')!.state.status).toBe('running');
  });

  it('%%grafloria:edge <source> <target> animation → link.style.animation', () => {
    const d = imp('flowchart LR\n  a --> b\n  %%grafloria:edge a b animation:marching-ants');
    const link = d.getLinks().find((l) => l.sourceNodeId === 'a' && l.targetNodeId === 'b')!;
    expect((link.style as { animation?: { type?: string } }).animation?.type).toBe('marching-ants');
  });

  it('a %%grafloria directive never spawns a node and never breaks the base parse', () => {
    const d = imp('flowchart LR\n  a --> b --> c\n  %%grafloria:node b status:error');
    expect(d.getNodes().map((n) => n.id).sort()).toEqual(['a', 'b', 'c']);
    expect(d.getNode('b')!.state.status).toBe('error');
  });

  it('ROUND-TRIP: status + animation survive export→import via the comment channel', () => {
    const d = imp('flowchart LR\n  a --> b\n  %%grafloria:node a status:completed\n  %%grafloria:edge a b animation:flow');
    const { body, back } = roundTrip(d);
    expect(body).toContain('%%grafloria:node a status:completed');
    expect(body).toContain('%%grafloria:edge a b animation:flow');
    expect(back.getNode('a')!.state.status).toBe('completed');
    const link = back.getLinks().find((l) => l.sourceNodeId === 'a' && l.targetNodeId === 'b')!;
    expect((link.style as { animation?: { type?: string } }).animation?.type).toBe('flow');
  });

  it('the VISIBLE body (grafloria comments stripped) is pure Mermaid — no grafloria tokens leak', () => {
    const d = imp('flowchart LR\n  a --> b\n  style a fill:#f9f\n  %%grafloria:node a status:running');
    const body = exportDiagramText(d, { lossless: false });
    const visible = body
      .split('\n')
      .filter((l) => !l.trimStart().startsWith('%%grafloria:'))
      .join('\n');
    // Nothing Grafloria-specific survives in the part a Mermaid renderer reads.
    expect(visible).not.toContain('grafloria');
    expect(visible).not.toContain('status:');
    // …and the base structure is still there.
    expect(visible).toContain('a');
    expect(visible).toContain('style a');
  });
});
