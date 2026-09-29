/**
 * Mermaid flowchart shapes drawn as the shapes they are.
 *
 * The transformer's table predates the renderer's shape registry and
 * approximated: a database `[( )]` became an ELLIPSE, a stadium `([ ])` an
 * ellipse, a subroutine `[[ ]]` a rounded rect, both trapezoids plain rects. The
 * registry draws all of them (cylinder, stadium, subroutine, trapezoid,
 * trapezoid-bottom). Found as a flat oval "DB" spanning a block-beta grid.
 */
import { importDiagramText } from '../../serialization/TextFormat';

const shapeOf = (line: string) => {
  const d = importDiagramText(`flowchart LR\n  ${line}`).diagram;
  return (d.getNodes()[0]!.getMetadata('shape') as { type?: string }).type;
};

describe('flowchart shapes map to the registry shapes that draw them', () => {
  it('[( )] is a database cylinder', () => expect(shapeOf('a[(Orders DB)]')).toBe('cylinder'));
  it('([ ]) is a stadium', () => expect(shapeOf('a([Start])')).toBe('stadium'));
  it('[[ ]] is a subroutine', () => expect(shapeOf('a[[Call it]]')).toBe('subroutine'));
  it('[/ \\] is a trapezoid, [\\ /] the inverted one', () => {
    expect(shapeOf('a[/Wide bottom\\]')).toBe('trapezoid');
    expect(shapeOf('a[\\Wide top/]')).toBe('trapezoid-bottom');
  });
  it('[/ /] and [\\ \\] are parallelograms (and v11 lean-r / lean-l)', () => {
    expect(shapeOf('a[/In or out/]')).toBe('parallelogram');
    expect(shapeOf('a[\\Lean left\\]')).toBe('parallelogram-top');
    expect(shapeOf('a@{ shape: lean-r, label: "x" }')).toBe('parallelogram');
    expect(shapeOf('a@{ shape: lean-l, label: "x" }')).toBe('parallelogram-top');
  });

  it('each slash shape writes back with its own brackets', async () => {
    const { exportDiagramText } = await import('../../serialization/TextFormat');
    for (const line of ['a[/In or out/]', 'a[\\Lean left\\]', 'a[/Wide bottom\\]', 'a[\\Wide top/]']) {
      const out = exportDiagramText(importDiagramText(`flowchart LR\n  ${line}`).diagram, { lossless: false });
      expect(out).toContain(line);
    }
  });

  it('the others are unchanged', () => {
    expect(shapeOf('a[Box]')).toBe('rect');
    expect(shapeOf('a{Choice}')).toBe('diamond');
    expect(shapeOf('a((Dot))')).toBe('circle');
    expect(shapeOf('a{{Prep}}')).toBe('hexagon');
  });
});
