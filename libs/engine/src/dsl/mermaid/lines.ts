/**
 * Shared line pre-pass for the Mermaid graph-family parsers (ER, class, state).
 *
 * Every Mermaid body carries the same non-content furniture: `---` YAML
 * frontmatter, `%%{init: …}%%` config directives, `%%` comments (own-line and
 * trailing) and the type header itself. Stripping it in ONE place is what keeps
 * the three parsers honest about the rest — a directive we do not understand
 * must be SKIPPED, never turned into an entity (gap-analysis §5, invariant #1).
 */

export interface SignificantLine {
  /** The line with comments and surrounding whitespace removed. */
  text: string;
  /** 1-based line number in the original text (for diagnostics). */
  line: number;
}

/** A `%%`-comment stripper that does not eat `%%` inside a quoted string. */
function stripTrailingComment(raw: string): string {
  let inQuote = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === '"') inQuote = !inQuote;
    if (!inQuote && ch === '%' && raw[i + 1] === '%') return raw.slice(0, i);
  }
  return raw;
}

/**
 * Content lines of a Mermaid body: frontmatter, init directives, comments and
 * blank lines removed. The header line (`erDiagram`, `classDiagram`, …) is
 * dropped when `header` matches its first word, case-insensitively.
 */
export function significantLines(text: string, header: string | string[]): SignificantLine[] {
  const headers = (Array.isArray(header) ? header : [header]).map((h) => h.toLowerCase());
  const out: SignificantLine[] = [];
  let inFrontmatter = false;
  let headerSeen = false;
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmedRaw = raw.trim();
    if (trimmedRaw === '---') {
      // Only the LEADING `---` block is frontmatter; a stray one later is not.
      if (!headerSeen) inFrontmatter = !inFrontmatter;
      continue;
    }
    if (inFrontmatter) continue;
    const text2 = stripTrailingComment(raw).trim();
    if (!text2) continue;
    if (!headerSeen) {
      const first = text2.split(/[\s:]/)[0].toLowerCase();
      if (headers.includes(first)) {
        headerSeen = true;
        continue;
      }
    }
    out.push({ text: text2, line: i + 1 });
  }
  return out;
}

/** Unwrap a `"quoted"` token; returns the raw token otherwise. */
export function unquote(token: string): string {
  const t = token.trim();
  if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) return t.slice(1, -1);
  return t;
}

/** Quote a Mermaid label when it is not a bare word (spaces, punctuation, empty). */
export function quoteIfNeeded(label: string): string {
  return /^[A-Za-z0-9_-]+$/.test(label) ? label : `"${label.replace(/"/g, "'")}"`;
}
