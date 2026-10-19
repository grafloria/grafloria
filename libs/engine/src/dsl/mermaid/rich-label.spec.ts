// P0-5c (Atloria brief 2026-10-19): text in angle brackets was DELETED from labels.
//
// `plain()` stripped every `<…>` — after `decodeLabelEntities` had already turned
// `&lt;` into `<` — so `Record<string, string>` drew "Record", `Context&lt;T&gt;`
// drew "Context" and `a < b > c` drew "a  c". Mermaid shows that text. Only the
// tags Mermaid's HTML labels understand are markup; entities decode AFTER the
// tags are gone, so an escaped `&lt;b&gt;` is the text "<b>", never bold.
import { readMermaidLabel } from './rich-label';
import { importDiagramText, exportDiagramText } from '../../serialization/TextFormat';

const text = (raw: string) => readMermaidLabel(raw, true).text;

describe('readMermaidLabel — angle brackets are text unless they are a label tag', () => {
  it.each([
    ['a generic type', 'params: Record<string, string>', 'params: Record<string, string>'],
    ['an escaped generic', 'Context&lt;T&gt;', 'Context<T>'],
    ['Mermaid #-entities', 'Type#lt;any#gt;[]', 'Type<any>[]'],
    ['comparison signs', 'a < b > c', 'a < b > c'],
    ['an arrow in prose', 'a -> b <- c', 'a -> b <- c'],
    ['an escaped tag stays text', 'use &lt;b&gt; for bold', 'use <b> for bold'],
    ['an unknown tag-like word', 'List<Order> or <Draft>', 'List<Order> or <Draft>'],
  ])('%s survives: %s', (_what, raw, expected) => {
    expect(text(raw)).toBe(expected);
  });

  it('the tags Mermaid labels understand are still markup (removed, words kept)', () => {
    expect(
      text('<b>bold</b> <strong>strong</strong> <i>i</i> <em>em</em> <u>u</u> <code>c</code> <span style="color:red">s</span> H<sub>2</sub>O x<sup>2</sup> <small>sm</small>')
    ).toBe('bold strong i em u c s H2O x2 sm');
  });

  it('<br> is still a line break; an escaped &lt;br&gt; is not', () => {
    expect(text('one<br/>two<br>three<BR />four')).toBe('one\ntwo\nthree\nfour');
    expect(text('one&lt;br/&gt;two')).toBe('one<br/>two');
  });

  it('a bold name over a subtitle still splits, and keeps its brackets', () => {
    expect(readMermaidLabel('<b>Repo&lt;T&gt;</b><br/>Map<K, V>', true)).toEqual({ text: 'Repo<T>', sublabel: 'Map<K, V>' });
    expect(readMermaidLabel('<b>Api</b><br/><code>get<T>()</code>', true)).toEqual({
      text: 'Api',
      sublabel: { text: 'get<T>()', fontFamily: 'mono' },
    });
  });
});

describe('Mermaid import — the brief fences draw every character', () => {
  const FENCE =
    'flowchart LR\n' +
    '  A[Request] --> B["params: Record<string, string>"]\n' +
    '  B --> C[Context&lt;T&gt;]\n' +
    '  C --> D["a < b > c"]\n' +
    '  D -->|"returns Promise<void>"| E[done]';

  it('node and edge labels keep their angle brackets', () => {
    const r = importDiagramText(FENCE);
    expect(r.errors).toEqual([]);
    const label = (id: string) => r.diagram.getNode(id)!.getLabel();
    expect(label('B')).toBe('params: Record<string, string>');
    expect(label('C')).toBe('Context<T>');
    expect(label('D')).toBe('a < b > c');
    expect(r.diagram.getLinks().find((l) => l.targetNodeId === 'E')!.getMetadata('label')).toBe('returns Promise<void>');
  });

  it('…and survive an export and a re-import (written as #lt; / #gt;, which Mermaid draws as < and >)', () => {
    const first = importDiagramText(FENCE + '\n  E --> F[use &lt;b&gt; for bold]').diagram;
    const body = exportDiagramText(first, { lossless: false });
    expect(body).not.toMatch(/<(?!br\/>)/);
    const back = importDiagramText(body);
    expect(back.errors).toEqual([]);
    for (const id of ['B', 'C', 'D', 'F']) expect(back.diagram.getNode(id)!.getLabel()).toBe(first.getNode(id)!.getLabel());
    expect(back.diagram.getNode('F')!.getLabel()).toBe('use <b> for bold');
    expect(back.diagram.getLinks().find((l) => l.targetNodeId === 'E')!.getMetadata('label')).toBe('returns Promise<void>');
  });
});
