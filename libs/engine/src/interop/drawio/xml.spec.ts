// The tiny XML reader is specced DIRECTLY — it is the foundation the whole
// .drawio importer stands on, and a reader that silently mis-nests or drops an
// attribute would corrupt every import above it while the importer's own specs
// stayed green (they'd assert against the same wrong tree).

import { parseXml, decodeXmlEntities, XmlParseError } from './xml';

describe('parseXml — the mxGraph subset', () => {
  it('parses elements, attributes and nesting', () => {
    const root = parseXml(
      '<mxGraphModel dx="800" grid="1"><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel>'
    );
    expect(root.tag).toBe('mxGraphModel');
    expect(root.attrs).toEqual({ dx: '800', grid: '1' });
    expect(root.children).toHaveLength(1);
    const inner = root.children[0];
    expect(inner.tag).toBe('root');
    expect(inner.children.map((c) => c.attrs['id'])).toEqual(['0', '1']);
    expect(inner.children[1].attrs['parent']).toBe('0');
  });

  it('parses self-closing tags with and without attributes', () => {
    const root = parseXml('<a><b/><c x="1" /></a>');
    expect(root.children.map((c) => c.tag)).toEqual(['b', 'c']);
    expect(root.children[1].attrs['x']).toBe('1');
  });

  it('parses single-quoted attributes and values containing the other quote', () => {
    const root = parseXml(`<cell style='fillColor="red"' value="it's fine"/>`);
    expect(root.attrs['style']).toBe('fillColor="red"');
    expect(root.attrs['value']).toBe("it's fine");
  });

  it('captures character data — the <diagram> compressed payload rides as text', () => {
    const root = parseXml('<mxfile><diagram id="p1" name="Page-1">  aGVsbG8=  </diagram></mxfile>');
    expect(root.children[0].text).toBe('aGVsbG8=');
  });

  it('decodes the named entities in attribute values', () => {
    const root = parseXml('<c value="A &amp; B &lt;i&gt; &quot;q&quot; &#39;s&#39;"/>');
    expect(root.attrs['value']).toBe('A & B <i> "q" \'s\'');
  });

  it('decodes numeric character references, decimal and hex', () => {
    expect(decodeXmlEntities('&#65;&#x42;&#x2192;')).toBe('AB→');
  });

  it('leaves unknown named entities verbatim instead of dropping characters', () => {
    expect(decodeXmlEntities('AT&amp;T &copy;')).toBe('AT&T &copy;');
  });

  it('skips the XML declaration, comments and DOCTYPE', () => {
    const root = parseXml(
      '<?xml version="1.0" encoding="UTF-8"?>\n<!-- saved by draw.io -->\n<!DOCTYPE mxfile>\n<mxfile><!-- inner --><diagram>x</diagram></mxfile>'
    );
    expect(root.tag).toBe('mxfile');
    expect(root.children).toHaveLength(1);
  });

  it('reads CDATA verbatim (no entity decoding inside)', () => {
    const root = parseXml('<d><![CDATA[a < b & c]]></d>');
    expect(root.text).toBe('a < b & c');
  });

  it('throws XmlParseError, never returns garbage, on malformed input', () => {
    const bad = [
      '',
      'not xml at all',
      '<open>',
      '<a><b></a></b>',
      '<a attr=unquoted/>',
      '<a>text</a><b/>', // two roots
      '<a x="never closed/>',
    ];
    for (const s of bad) {
      expect(() => parseXml(s)).toThrow(XmlParseError);
    }
  });

  it('names the byte offset in the error, so a caller can point at the spot', () => {
    try {
      parseXml('<a><b></c></a>');
      fail('should have thrown');
    } catch (e) {
      expect((e as XmlParseError).message).toMatch(/offset \d+/);
      expect((e as XmlParseError).offset).toBeGreaterThan(0);
    }
  });
});
