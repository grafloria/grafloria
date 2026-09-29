// RICH LABELS — how a Mermaid label says "a name over a subtitle".
//
// The diagrams AI tools draw put a bold name over a smaller, muted line in every
// box ("Our API" / "sherkety-erp-api"). Mermaid has three ways to write that and
// real Mermaid renders all three:
//
//   ["<b>Our API</b><br/>sherkety-erp-api"]        HTML labels (the default)
//   ["**Our API**<br/>sherkety-erp-api"]           markdown bold + a break
//   ["`**Our API**                                 a markdown string: a real
//     sherkety-erp-api`"]                           newline breaks the line
//
// A label whose FIRST line is bold, followed by more lines, is a name and a
// subtitle (`node.metadata.sublabel`); a subtitle written as <code>…</code> or
// `…` is a monospace one. Anything else keeps its words, with <br/> as a real
// line break, tags and markdown markers removed, and #quot;-style entities
// decoded.

/** What a Mermaid label means: its text, and — for a box — an optional subtitle. */
export interface RichLabel {
  text: string;
  sublabel?: string | { text: string; fontFamily: 'mono' };
}

const NAMED: Record<string, string> = { quot: '"', amp: '&', lt: '<', gt: '>', apos: "'", nbsp: ' ' };

/** `#quot;` (Mermaid's own), `&quot;` / `&#39;` / `&#x27;` (HTML), `#35;` (Mermaid numeric). */
export function decodeLabelEntities(s: string): string {
  return s
    .replace(/[#&]#?x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/[#&]#?(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/[#&]([a-z]+);/gi, (m, n) => NAMED[n.toLowerCase()] ?? m);
}

const BOLD = /^(?:\*\*(.+)\*\*|__(.+)__|<b>(.+)<\/b>|<strong>(.+)<\/strong>)$/i;
const CODE = /^(?:<code>(.+)<\/code>|`(.+)`)$/i;

/** Remove markdown emphasis markers and HTML tags, keeping the words. */
function plain(s: string): string {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/(^|[^*])\*(?!\s)([^*]+?)\*(?!\*)/g, '$1$2')
    .replace(/`([^`]+)`/g, '$1');
}

/**
 * Read a Mermaid label. `splitTitle` (for boxes, not for lines or zones) turns a
 * bold first line over more lines into `{ text: name, sublabel }`.
 */
export function readMermaidLabel(raw: string, splitTitle: boolean): RichLabel {
  let s = raw.trim();
  // A markdown string: "`…`" — the backticks are the string's own quotes.
  if (s.length >= 2 && s.startsWith('`') && s.endsWith('`')) s = s.slice(1, -1);
  s = s.replace(/<br\s*\/?>/gi, '\n');
  const lines = decodeLabelEntities(s)
    .split('\n')
    .map((l) => l.trim())
    .filter((l, i, all) => l !== '' || (i > 0 && i < all.length - 1));
  if (splitTitle && lines.length >= 2) {
    const b = BOLD.exec(lines[0]);
    if (b) {
      const title = plain(b[1] ?? b[2] ?? b[3] ?? b[4] ?? '');
      const rest = lines.slice(1);
      const code = rest.length === 1 ? CODE.exec(rest[0]) : null;
      if (code) return { text: title, sublabel: { text: plain(code[1] ?? code[2] ?? ''), fontFamily: 'mono' } };
      return { text: title, sublabel: rest.map(plain).join('\n') };
    }
  }
  return { text: lines.map(plain).join('\n') };
}
