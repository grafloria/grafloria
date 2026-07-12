// Node label engine tests (Wave-2 nodes & shapes, Card 2).
//
// The link-agnostic text-block core (wrap / multi-line / ellipsis / shape-fit)
// is exercised directly, then end-to-end through the real SVGRenderer to prove
// a long node label wraps to <tspan>s, ellipsis-truncates past the inner rect,
// and is clipped to a per-node <clipPath>.

import { renderTextBlock, wrapText, estimateTextWidth } from './text-block';
import { SVGRenderer } from './svg-renderer';
import { DiagramEngine, NodeModel } from '@grafloria/engine';

describe('text-block engine (Card 2)', () => {
  describe('wrapText', () => {
    it('word-wraps to the width heuristic (length * fontSize * 0.6)', () => {
      const lines = wrapText('alpha beta gamma delta', 60, 10);
      expect(lines.length).toBeGreaterThan(1);
      // each kept line fits (roughly) inside maxWidth
      for (const l of lines) expect(estimateTextWidth(l, 10)).toBeLessThanOrEqual(60 + 1e-9);
    });

    it('honors hard newlines and keeps a single line when unbounded', () => {
      expect(wrapText('a\nb\nc', undefined, 12)).toEqual(['a', 'b', 'c']);
      expect(wrapText('one long unbroken phrase here', Infinity, 12)).toEqual([
        'one long unbroken phrase here',
      ]);
    });

    it('keeps an over-wide single word whole (clipped, not broken)', () => {
      expect(wrapText('supercalifragilistic', 40, 12)).toEqual(['supercalifragilistic']);
    });
  });

  describe('renderTextBlock', () => {
    it('single line → a <text> with textContent (no tspans) + baseline', () => {
      const v = renderTextBlock({ text: 'Hi', x: 5, y: 6, maxWidth: 200, fontSize: 12 });
      expect(v.type).toBe('text');
      expect(v.props.textContent).toBe('Hi');
      expect(v.props['dominantBaseline']).toBe('middle');
      expect(v.props.x).toBe(5);
      expect(v.props.y).toBe(6);
      expect(v.children).toBeUndefined();
    });

    it('multi-line → one <tspan> per line with dy line spacing', () => {
      const v = renderTextBlock({
        text: 'alpha beta gamma delta epsilon zeta',
        x: 0,
        y: 0,
        maxWidth: 60,
        fontSize: 10,
        valign: 'middle',
      });
      expect(v.children!.length).toBeGreaterThan(1);
      // middle valign → first line offset up; later lines step by lineHeight (12)
      expect(v.children![0].props['dy']).toBeLessThan(0);
      expect(v.children![1].props['dy']).toBe(12);
      expect(v.props.textContent).toBeUndefined();
    });

    it('ellipsis-truncates when lines exceed maxLines', () => {
      const v = renderTextBlock({
        text: 'alpha beta gamma delta epsilon',
        x: 0,
        y: 0,
        maxWidth: 60,
        fontSize: 10,
        maxLines: 2,
      });
      expect(v.children!.length).toBe(2);
      const last = v.children![1].props.textContent as string;
      expect(last.endsWith('…')).toBe(true);
    });

    it('applies a clip-path and emits/omits fontSize on request', () => {
      const clipped = renderTextBlock({ text: 'x', x: 0, y: 0, clipId: 'c1' });
      expect(clipped.props['clipPath']).toBe('url(#c1)');

      const cssMode = renderTextBlock({
        text: 'x',
        x: 0,
        y: 0,
        emitFontSize: false,
        className: 'diagram-label',
      });
      expect(cssMode.props.fontSize).toBeUndefined();
      expect(cssMode.props.className).toBe('diagram-label');
    });

    it('valign maps to dominant-baseline for single lines', () => {
      expect(renderTextBlock({ text: 'a', x: 0, y: 0, valign: 'top' }).props['dominantBaseline']).toBe(
        'hanging'
      );
      expect(
        renderTextBlock({ text: 'a', x: 0, y: 0, valign: 'bottom' }).props['dominantBaseline']
      ).toBe('baseline');
    });
  });

  describe('node labels through the real SVGRenderer', () => {
    let engine: DiagramEngine;
    let diagram: any;
    let renderer: SVGRenderer;

    beforeEach(() => {
      engine = new DiagramEngine();
      diagram = engine.createDiagram('T')!;
      renderer = new SVGRenderer(engine);
    });
    afterEach(() => renderer.dispose());

    it('wraps a long label to tspans, ellipsis-truncates, and clips to the inner rect', () => {
      const node = new NodeModel({
        type: 'n',
        position: { x: 0, y: 0 },
        size: { width: 120, height: 100 },
      });
      node.setMetadata('label', Array(30).fill('word').join(' '));
      diagram.addNode(node);

      const group = findByKey(renderer.render({ x: 0, y: 0, width: 800, height: 600 }, 1.0), `node-${node.id}`);

      // A per-node clipPath sized to the inner rect (rect default pad = 8).
      const clip = group.children.find((c: any) => c.type === 'clipPath');
      expect(clip).toBeDefined();
      expect(clip.props['id']).toBe(`node-clip-${node.id}`);
      expect(clip.children[0].props).toMatchObject({ x: 8, y: 8, width: 104, height: 84 });

      // The label text is clipped, wrapped to multiple tspans, last one ellipsized.
      const text = group.children.find((c: any) => c.type === 'text');
      expect(text.props['clipPath']).toBe(`url(#node-clip-${node.id})`);
      expect(text.children.length).toBeGreaterThan(1);
      const last = text.children[text.children.length - 1].props.textContent as string;
      expect(last.endsWith('…')).toBe(true);
    });

    it('keeps a short label as a single-line textContent (no tspans)', () => {
      const node = new NodeModel({
        type: 'n',
        position: { x: 0, y: 0 },
        size: { width: 160, height: 80 },
      });
      node.setMetadata('label', 'OK');
      diagram.addNode(node);

      const group = findByKey(renderer.render({ x: 0, y: 0, width: 800, height: 600 }, 1.0), `node-${node.id}`);
      const text = group.children.find((c: any) => c.type === 'text');
      expect(text.props.textContent).toBe('OK');
      expect(text.children).toBeUndefined();
    });

    it('fits the label to a diamond via its narrower inner rect', () => {
      const node = new NodeModel({
        type: 'd',
        position: { x: 0, y: 0 },
        size: { width: 120, height: 120 },
      });
      node.setMetadata('shape', { type: 'diamond' });
      node.setMetadata('label', Array(20).fill('x').join(' '));
      diagram.addNode(node);

      const group = findByKey(renderer.render({ x: 0, y: 0, width: 800, height: 600 }, 1.0), `node-${node.id}`);
      // diamond inner rect = 0.5·w centered → clip width 60, x 30 (vs 104 for a rect)
      const clip = group.children.find((c: any) => c.type === 'clipPath');
      expect(clip.children[0].props).toMatchObject({ x: 30, y: 30, width: 60, height: 60 });
    });
  });
});

function findByKey(vnode: any, key: string): any {
  if (!vnode) return undefined;
  if (vnode.key === key) return vnode;
  if (Array.isArray(vnode.children)) {
    for (const child of vnode.children) {
      const found = findByKey(child, key);
      if (found) return found;
    }
  }
  return undefined;
}
