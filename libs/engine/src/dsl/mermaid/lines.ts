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
 * The accessibility directive starting at `lines[i]`, if there is one: `accTitle: …`,
 * `accDescr: …`, or the block `accDescr { … }`, which may span lines to its `}`.
 * Every Mermaid type takes them, and they are diagram METADATA — read as content, a
 * state diagram drew a state called "Lifecycle" for `accTitle: Lifecycle`.
 */
function accessibilityAt(
  lines: string[],
  i: number
): { key: 'accTitle' | 'accDescr'; value: string; last: number } | null {
  const first = stripTrailingComment(lines[i]).trim();
  const single = /^(accTitle|accDescr)\s*:\s*(.*)$/.exec(first);
  if (single) return { key: single[1] as 'accTitle' | 'accDescr', value: single[2].trim(), last: i };
  const block = /^accDescr\s*\{(.*)$/.exec(first);
  if (!block) return null;
  // Mermaid reads to the first `}`, across lines, and drops each line's indent.
  let body = block[1];
  let last = i;
  while (!body.includes('}') && last + 1 < lines.length) body += '\n' + lines[++last];
  const inner = body.includes('}') ? body.slice(0, body.indexOf('}')) : body;
  return { key: 'accDescr', value: inner.trim().replace(/\n\s+/g, '\n'), last };
}

/** Where a LEADING `---` frontmatter block sits: its opening and closing line indices. */
function frontmatterSpan(lines: string[]): { open: number; close: number } | null {
  const open = lines.findIndex((l) => l.trim() !== '');
  if (open < 0 || lines[open].trim() !== '---') return null;
  for (let j = open + 1; j < lines.length; j++) if (lines[j].trim() === '---') return { open, close: j };
  return null;
}

/**
 * The text with its leading `---` frontmatter block blanked out, line for line —
 * so a grammar that does not read YAML never sees it, and every error still names
 * the line it has in the original text.
 */
export function blankFrontmatter(text: string): string {
  const lines = text.split('\n');
  const span = frontmatterSpan(lines.map((l) => l.replace(/\r$/, '')));
  if (!span) return text;
  for (let j = span.open; j <= span.close; j++) lines[j] = '';
  return lines.join('\n');
}

/** The diagram-level metadata Mermaid text can carry, in any diagram type. */
export interface MermaidDiagramMetadata {
  /** Frontmatter `title:` — Mermaid draws it over the diagram. */
  title?: string;
  /** `accTitle: …` — the accessible name. */
  accTitle?: string;
  /** `accDescr: …` or `accDescr { … }` — the accessible description. */
  accDescr?: string;
}

/** A YAML scalar as written: `"double"` (JSON escapes), `'single'` (`''` is a quote), or plain. */
function yamlScalar(raw: string): string {
  const v = raw.trim();
  if (v.startsWith('"')) {
    try {
      return JSON.parse(v) as string;
    } catch {
      return v.replace(/^"|"$/g, '');
    }
  }
  if (v.startsWith("'")) return v.replace(/^'|'$/g, '').replace(/''/g, "'");
  return v.replace(/\s+#.*$/, '');
}

/**
 * Read the frontmatter `title` and the `accTitle` / `accDescr` directives of a
 * Mermaid body (any type). The last directive of each kind wins, as in Mermaid.
 */
export function readDiagramMetadata(text: string): MermaidDiagramMetadata {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const meta: MermaidDiagramMetadata = {};
  const span = frontmatterSpan(lines);
  if (span) {
    for (let j = span.open + 1; j < span.close; j++) {
      const title = /^title\s*:\s*(.*)$/.exec(lines[j]);
      if (title) meta.title = yamlScalar(title[1]);
    }
  }
  for (let i = span ? span.close + 1 : 0; i < lines.length; i++) {
    const acc = accessibilityAt(lines, i);
    if (!acc) continue;
    meta[acc.key] = acc.value;
    i = acc.last;
  }
  return meta;
}

/**
 * Content lines of a Mermaid body: frontmatter, init directives, comments,
 * `accTitle` / `accDescr` (metadata — see readDiagramMetadata) and blank lines
 * removed. The header line (`erDiagram`, `classDiagram`, …) is dropped when
 * `header` matches its first word, case-insensitively.
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
    const acc = accessibilityAt(lines, i);
    if (acc) {
      i = acc.last;
      continue;
    }
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
