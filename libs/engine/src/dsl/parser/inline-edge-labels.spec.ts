/**
 * Mermaid's OTHER edge-label spelling: the text between the dashes.
 *
 *   A -- writes --> B      A -- "writes, twice" --> B      A -- text --- B
 *   A -. note .-> B        A == big ==> B
 *
 * Grafloria only knew `A -->|label| B`. `A -- writes --> B` became a NODE named
 * "writes" with two lines through it; the quoted and `==` forms dropped the edge
 * entirely. Found importing block-beta, whose docs use this form — but it is a
 * flowchart bug, so it is fixed in the flowchart grammar.
 */
import { importDiagramText } from '../../serialization/TextFormat';

const edges = (body: string) => {
  const d = importDiagramText(`flowchart LR\n  ${body}`).diagram;
  return {
    nodes: d.getNodes().map((n) => n.id).sort(),
    links: d.getLinks().map((l) => `${l.sourceNodeId}->${l.targetNodeId}|${l.getLabel() ?? ''}|${l.getMetadata('dslLinkType')}`),
  };
};

describe('text between the dashes is the edge label', () => {
  it('A -- writes --> B', () => {
    expect(edges('a -- writes --> c')).toEqual({ nodes: ['a', 'c'], links: ['a->c|writes|arrow'] });
  });

  it('a quoted label keeps its punctuation: A -- "writes, twice" --> B', () => {
    expect(edges('a -- "writes, twice" --> c').links).toEqual(['a->c|writes, twice|arrow']);
  });

  it('several words: A -- sends the link --> B', () => {
    expect(edges('a -- sends the link --> c').links).toEqual(['a->c|sends the link|arrow']);
  });

  it('the closing link decides the type: A -- text --- B is a plain line', () => {
    expect(edges('a -- text --- c').links).toEqual(['a->c|text|line']);
  });

  it('dotted: A -. note .-> B', () => {
    expect(edges('a -. note .-> c').links).toEqual(['a->c|note|dotted-arrow']);
  });

  it('thick: A == big ==> B', () => {
    expect(edges('a == big ==> c').links).toEqual(['a->c|big|thick-arrow']);
  });

  it('in a chain: A -- x --> B -- y --> C', () => {
    expect(edges('a -- x --> b -- y --> c').links).toEqual(['a->b|x|arrow', 'b->c|y|arrow']);
  });

  it('the other spellings are unchanged', () => {
    expect(edges('a --- b').links).toEqual(['a->b||line']);
    expect(edges('a -->|pipe| b').links).toEqual(['a->b|pipe|arrow']);
    expect(edges('a -.-> b').links).toEqual(['a->b||dotted-arrow']);
    expect(edges('a ==> b').links).toEqual(['a->b||thick-arrow']);
  });
});
