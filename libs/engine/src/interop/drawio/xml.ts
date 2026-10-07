// A tiny, dependency-free XML reader for the mxGraph subset — .drawio import.
//
// WHY HAND-ROLLED: the engine is headless. It runs in Node, in workers and in
// browsers, and the serialization layer's contract is NO DOM — `DOMParser` does
// not exist in Node without a heavyweight dependency (jsdom / linkedom), and
// pulling one in for the handful of constructs a .drawio file actually uses
// would put a DOM back into the one package that promises not to have one.
//
// WHAT IT COVERS — exactly the shapes mxGraph emits, specced in xml.spec.ts:
//   - elements, nested elements, self-closing tags
//   - double- and single-quoted attributes
//   - character data (needed: <diagram> carries its compressed payload as TEXT)
//   - the five named entities (&amp; &lt; &gt; &quot; &#39;/&apos;) plus
//     numeric character references (&#65; &#x41;) — draw.io HTML labels lean on
//     numeric refs heavily
//   - `<?...?>` declarations, `<!--...-->` comments, `<!DOCTYPE...>`, CDATA
//
// WHAT IT DOES NOT COVER, deliberately: namespaces, DTD internals, processing
// of conditional sections. None appear in mxGraph output; a file that needs
// them fails loudly with an XmlParseError naming the offset, never silently.

/** One parsed element. `text` is the concatenated character data DIRECTLY inside it. */
export interface XmlElement {
  tag: string;
  attrs: Record<string, string>;
  children: XmlElement[];
  text: string;
}

/** Malformed input — carries the byte offset so a caller can name the spot. */
export class XmlParseError extends Error {
  constructor(message: string, public readonly offset: number) {
    super(`${message} (at offset ${offset})`);
    this.name = 'XmlParseError';
  }
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  // Not XML, but draw.io labels are HTML fragments and &nbsp; is everywhere in
  // them. Decoding it to a plain space here keeps the HTML-strip step simple.
  nbsp: ' ',
};

/**
 * Decode entity references. Unknown named entities are LEFT VERBATIM rather
 * than dropped — a label reading "AT&amp;T &copy;" should degrade to
 * "AT&T &copy;", not lose characters silently.
 */
export function decodeXmlEntities(s: string): string {
  if (s.indexOf('&') === -1) return s;
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (whole, body: string) => {
    if (body[0] === '#') {
      const hex = body[1] === 'x' || body[1] === 'X';
      const code = parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isFinite(code) && code >= 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : whole;
    }
    return NAMED_ENTITIES[body] ?? whole;
  });
}

const isNameChar = (c: string): boolean => /[^\s/=<>'"]/.test(c);

/**
 * Parse an XML document and return its single root element.
 *
 * The cursor-based scan below is intentionally boring: one pass, one position,
 * every unexpected byte throws with its offset. mxGraph documents are small
 * (kilobytes), so clarity beats throughput here.
 */
export function parseXml(source: string): XmlElement {
  let pos = 0;
  const len = source.length;

  const fail = (msg: string): never => {
    throw new XmlParseError(msg, pos);
  };

  const skipWs = (): void => {
    while (pos < len && /\s/.test(source[pos])) pos++;
  };

  /** Skip <?...?>, <!--...-->, <!DOCTYPE...> at the prolog / between elements. Returns true if something was skipped. */
  const skipNonElement = (): boolean => {
    if (source.startsWith('<?', pos)) {
      const end = source.indexOf('?>', pos);
      if (end === -1) fail('unterminated <?...?> declaration');
      pos = end + 2;
      return true;
    }
    if (source.startsWith('<!--', pos)) {
      const end = source.indexOf('-->', pos);
      if (end === -1) fail('unterminated comment');
      pos = end + 3;
      return true;
    }
    // <!DOCTYPE ...> — mxGraph never emits one, but a hand-exported file might
    // carry it. No internal-subset support: a '[' means brackets we refuse.
    if (source.startsWith('<!', pos) && !source.startsWith('<![CDATA[', pos)) {
      const end = source.indexOf('>', pos);
      if (end === -1) fail('unterminated <!...> declaration');
      if (source.slice(pos, end).includes('[')) fail('DOCTYPE internal subsets are not supported');
      pos = end + 1;
      return true;
    }
    return false;
  };

  const readName = (): string => {
    const start = pos;
    while (pos < len && isNameChar(source[pos])) pos++;
    if (pos === start) fail('expected a name');
    return source.slice(start, pos);
  };

  const readAttrs = (): Record<string, string> => {
    const attrs: Record<string, string> = {};
    for (;;) {
      skipWs();
      const c = source[pos];
      if (c === '>' || c === '/' || c === undefined) return attrs;
      const name = readName();
      skipWs();
      if (source[pos] !== '=') fail(`attribute "${name}" has no value`);
      pos++; // '='
      skipWs();
      const quote = source[pos];
      if (quote !== '"' && quote !== "'") fail(`attribute "${name}" value is not quoted`);
      pos++;
      const end = source.indexOf(quote, pos);
      if (end === -1) fail(`unterminated value for attribute "${name}"`);
      attrs[name] = decodeXmlEntities(source.slice(pos, end));
      pos = end + 1;
    }
  };

  /** Parse one element; the cursor sits ON its '<'. */
  const readElement = (): XmlElement => {
    if (source[pos] !== '<') fail('expected "<"');
    pos++;
    const tag = readName();
    const attrs = readAttrs();
    const el: XmlElement = { tag, attrs, children: [], text: '' };

    if (source[pos] === '/') {
      pos++;
      if (source[pos] !== '>') fail(`self-closing <${tag}/> is not closed`);
      pos++;
      return el;
    }
    if (source[pos] !== '>') fail(`<${tag}> never closes its start tag`);
    pos++;

    // Content loop: children, text runs, CDATA — until </tag>.
    for (;;) {
      if (pos >= len) fail(`<${tag}> is never closed`);
      if (source[pos] === '<') {
        if (source.startsWith('</', pos)) {
          pos += 2;
          const closing = readName();
          if (closing !== tag) fail(`</${closing}> closes <${tag}>`);
          skipWs();
          if (source[pos] !== '>') fail(`</${closing}> is malformed`);
          pos++;
          el.text = el.text.trim();
          return el;
        }
        if (source.startsWith('<![CDATA[', pos)) {
          const end = source.indexOf(']]>', pos);
          if (end === -1) fail('unterminated CDATA section');
          el.text += source.slice(pos + 9, end); // verbatim — no entity decode
          pos = end + 3;
          continue;
        }
        if (skipNonElement()) continue;
        el.children.push(readElement());
      } else {
        const next = source.indexOf('<', pos);
        const stop = next === -1 ? len : next;
        el.text += decodeXmlEntities(source.slice(pos, stop));
        pos = stop;
      }
    }
  };

  // Prolog, root element, trailing junk check.
  skipWs();
  while (pos < len && skipNonElement()) skipWs();
  if (pos >= len || source[pos] !== '<') fail('no root element');
  const root = readElement();
  skipWs();
  while (pos < len && skipNonElement()) skipWs();
  if (pos < len) fail('content after the root element');
  return root;
}
