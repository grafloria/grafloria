/**
 * Shared line pre-pass for the Mermaid graph-family parsers (ER, class, state).
 *
 * Every Mermaid body carries the same non-content furniture: `---` YAML
 * frontmatter, `%%{init: …}%%` config directives, `%%` comments (own-line and
 * trailing) and the type header itself. Stripping it in ONE place is what keeps
 * the three parsers honest about the rest — a directive we do not understand
 * must be SKIPPED, never turned into an entity (gap-analysis §5, invariant #1).
 */
/** A `%%`-comment stripper that does not eat `%%` inside a quoted string. */
function stripTrailingComment(raw) {
    let inQuote = false;
    for (let i = 0; i < raw.length; i++) {
        const ch = raw[i];
        if (ch === '"')
            inQuote = !inQuote;
        if (!inQuote && ch === '%' && raw[i + 1] === '%')
            return raw.slice(0, i);
    }
    return raw;
}
/**
 * Content lines of a Mermaid body: frontmatter, init directives, comments and
 * blank lines removed. The header line (`erDiagram`, `classDiagram`, …) is
 * dropped when `header` matches its first word, case-insensitively.
 */
export function significantLines(text, header) {
    const headers = (Array.isArray(header) ? header : [header]).map((h) => h.toLowerCase());
    const out = [];
    let inFrontmatter = false;
    let headerSeen = false;
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const raw = lines[i];
        const trimmedRaw = raw.trim();
        if (trimmedRaw === '---') {
            // Only the LEADING `---` block is frontmatter; a stray one later is not.
            if (!headerSeen)
                inFrontmatter = !inFrontmatter;
            continue;
        }
        if (inFrontmatter)
            continue;
        const text2 = stripTrailingComment(raw).trim();
        if (!text2)
            continue;
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
export function unquote(token) {
    const t = token.trim();
    if (t.length >= 2 && t.startsWith('"') && t.endsWith('"'))
        return t.slice(1, -1);
    return t;
}
/** Quote a Mermaid label when it is not a bare word (spaces, punctuation, empty). */
export function quoteIfNeeded(label) {
    return /^[A-Za-z0-9_-]+$/.test(label) ? label : `"${label.replace(/"/g, "'")}"`;
}
//# sourceMappingURL=lines.js.map