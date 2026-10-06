import { generateBaseStyleSheet } from './theme-css';

// The shared stylesheet is inlined into exported and server-rendered SVG, where it is
// parsed as XML. A `<` or `&` anywhere in it — even inside a CSS comment — opens a tag
// or an entity: the file stops being valid XML and the browser swallows every rule
// after it (the server-render guide's previews came out as black boxes).
describe('base stylesheet', () => {
  const css = generateBaseStyleSheet();

  it('is safe to inline into SVG as XML text', () => {
    expect(css).not.toMatch(/[<&]/);
    expect(css).not.toContain(']]>');
  });

  it('ships no developer comments beyond its one header', () => {
    const comments = css.match(/\/\*[\s\S]*?\*\//g) ?? [];
    expect(comments).toHaveLength(1);
    expect(comments[0]).toMatch(/^\/\* Grafloria Renderer/);
  });

  it('still carries the structural rules', () => {
    expect(css).toContain('svg.grafloria-diagram text');
    expect(css).toContain('user-select: none');
  });
});
