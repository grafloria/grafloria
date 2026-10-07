/**
 * LINES FOLLOW THEIR BOXES — what the AI-style demo got wrong the moment a box
 * was dragged (it was only ever LOOKED at, never moved).
 *
 * 1. A line with hand-set bends stayed where it was drawn, both ends hanging in
 *    the air: its "did anything move?" signature was built from its own stored
 *    points, which only its render refreshes — and the render was skipped
 *    because the signature had not changed. Now the ends re-attach and the
 *    bend next to a moved end slides so the run stays square.
 * 2. A text note (words, no box) was a routing obstacle: a line detoured round
 *    an invisible rectangle.
 * 3. A label placed above/below a bent line sat at the middle of its LENGTH —
 *    a corner, often. It rides the middle of the longest straight run.
 */
import { createDiagram } from './create-diagram';
import type { DiagramInstance } from './create-diagram';
import type { EdgeSpec, NodeSpec } from './model-input';

function makeContainer(): HTMLElement {
  const el = document.createElement('div');
  el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 600, right: 1000, bottom: 600 }) as DOMRect;
  document.body.appendChild(el);
  return el;
}

const box = (id: string, x: number, y: number, w = 210, h = 72): NodeSpec => ({ id, position: { x, y }, size: { width: w, height: h }, label: id });

describe('lines follow their boxes', () => {
  let container: HTMLElement;
  let diagram: DiagramInstance | undefined;
  beforeEach(() => (container = makeContainer()));
  afterEach(() => {
    diagram?.dispose();
    diagram = undefined;
    container.remove();
  });

  const make = (nodes: NodeSpec[], edges: EdgeSpec[]) => {
    diagram = createDiagram(container, { nodes, edges });
    diagram.renderNow();
  };
  const pts = (id: string) => diagram!.getModel().getLink(id)!.points.map((p) => [Math.round(p.x), Math.round(p.y)]);
  const pathStart = (id: string) => {
    const d = container.querySelector(`[data-link-id="${id}"] path`)!.getAttribute('d') ?? '';
    const m = /M\s*([-\d.]+)[ ,]+([-\d.]+)/.exec(d)!;
    return [Math.round(Number(m[1])), Math.round(Number(m[2]))];
  };
  const move = (id: string, x: number, y: number) => {
    diagram!.getModel().getNode(id)!.setPosition(x, y);
    diagram!.renderNow();
  };

  describe('a line with hand-set bends', () => {
    const ELBOW: EdgeSpec = { id: 'up', source: 'api', target: 'wallets', sourceHandle: 'top@170', targetHandle: 'bottom@138', type: 'orthogonal', waypoints: [{ x: 580, y: 204 }, { x: 850, y: 204 }] };
    const NODES = [box('api', 410, 264), box('wallets', 712, 78)];

    it('re-attaches its start when the box it leaves moves — in the model AND on screen', () => {
      make(NODES, [ELBOW]);
      move('api', 370, 414); // top@170 → (540, 414)
      expect(pts('up')[0]).toEqual([540, 414]);
      expect(pathStart('up')).toEqual([540, 414]);
    });

    it('slides the bend next to the moved end so the first run stays square (it leaves the TOP, so it stays vertical)', () => {
      make(NODES, [ELBOW]);
      move('api', 370, 414);
      const p = pts('up');
      expect(p).toContainEqual([540, 204]); // was 580,204
      expect(p).toContainEqual([850, 204]); // the far bend is untouched
      expect(p[p.length - 1]).toEqual([850, 150]);
    });

    it('re-attaches its end when the box it enters moves, squaring the last run', () => {
      make(NODES, [ELBOW]);
      move('wallets', 752, 18); // bottom@138 → (890, 90)
      const p = pts('up');
      expect(p[0]).toEqual([580, 264]);
      expect(p[p.length - 1]).toEqual([890, 90]);
      expect(p).toContainEqual([890, 204]);
      expect(p).toContainEqual([580, 204]);
    });

    it('a run the author left SLANTED keeps its bend (the painter draws the jogs; only a square run is kept square)', () => {
      // the draw.io import's shape: the stored run from the box to the first bend is a diagonal
      make([box('check', 110, 240, 150, 50), box('pick', 300, 100, 120, 50)], [
        { id: 'yes', source: 'check', target: 'pick', sourceHandle: 'left', targetHandle: 'bottom', type: 'orthogonal', waypoints: [{ x: 60, y: 420 }, { x: 360, y: 420 }] },
      ]);
      move('check', 150, 270);
      expect(pts('yes')).toContainEqual([60, 420]); // not squared to the moved start
      expect(pts('yes')).toContainEqual([360, 420]);
    });

    it('a SHORT square end run is drawn as it is — not re-routed round the box to make a longer stub', () => {
      // a line from a box's bottom to a small dot 32 px below: bends in the 16 px gutter
      make([box('api', 0, 0, 120, 56), { ...box('j', 60, 88, 10, 10), label: '' }], [
        { id: 'short', source: 'api', target: 'j', sourceHandle: 'bottom@30', targetHandle: 'top@5', type: 'orthogonal', waypoints: [{ x: 30, y: 72 }, { x: 65, y: 72 }] },
      ]);
      const d = container.querySelector('[data-link-id="short"] path:not(.link-hit-area)')!.getAttribute('d') ?? '';
      const nums = (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
      const ys = nums.filter((_, i) => i % 2 === 1), xs = nums.filter((_, i) => i % 2 === 0);
      // it stays between the two boxes: never above the box it leaves, never past the dot it enters
      expect(Math.min(...ys)).toBeGreaterThanOrEqual(56 - 0.5);
      expect(Math.max(...ys)).toBeLessThanOrEqual(88 + 0.5);
      expect(Math.max(...xs)).toBeLessThanOrEqual(70 + 0.5);
    });

    it('keeps its bends where they were when nothing at its ends moved', () => {
      make(NODES, [ELBOW]);
      move('api', 410, 264); // same place
      expect(pts('up')).toEqual([[580, 264], [580, 204], [850, 204], [850, 150]]);
    });
  });

  describe('a text note is words, not a wall', () => {
    const EDGE: EdgeSpec = { id: 'e', source: 'a', target: 'b', sourceHandle: 'right', targetHandle: 'left', type: 'orthogonal' };
    const A = box('a', 0, 100, 100, 40);
    const B = box('b', 500, 100, 100, 40);

    it('a line runs straight past a note that sits across its path', () => {
      make([A, B, { ...box('note', 180, 100, 240, 30), shape: { type: 'text' } }], [EDGE]);
      const ys = new Set(pts('e').map(([, y]) => y));
      expect([...ys]).toEqual([120]);
    });

    it('…while a BOX in the same place still turns it aside (the router is on)', () => {
      make([A, B, box('wall', 180, 100, 240, 30)], [EDGE]);
      const ys = new Set(pts('e').map(([, y]) => y));
      expect(ys.size).toBeGreaterThan(1);
    });
  });

  describe('a label above or below a bent line', () => {
    // S right (100,20) → (300,20) → (300,200) → T left (320,200): runs of 200, 180, 20
    const S = box('s', 0, 0, 100, 40);
    const T = box('t', 320, 180, 100, 40);
    const bent = (extra: Partial<EdgeSpec>): EdgeSpec => ({ id: 'l', source: 's', target: 't', sourceHandle: 'right', targetHandle: 'left', type: 'direct', waypoints: [{ x: 300, y: 20 }, { x: 300, y: 200 }], label: 'sends the payment link', ...extra });
    const labelAt = () => {
      const g = container.querySelector('[data-link-id="l"] .link-label-group')!;
      const m = /translate\(\s*([-\d.]+)[ ,]+([-\d.]+)\s*\)/.exec(g.getAttribute('transform') ?? '')!;
      return { x: Number(m[1]), y: Number(m[2]) };
    };

    it('rides the middle of the longest straight run, not the corner half way along', () => {
      make([S, T], [bent({ labelPlacement: 'above' })]);
      const { x, y } = labelAt();
      expect(x).toBeCloseTo(200, 0);
      expect(y).toBeLessThan(20);
      expect(y).toBeGreaterThan(20 - 25);
    });

    it('prefers the longest HORIZONTAL run — words are written along a level line, not struck through by an upright one', () => {
      // S right (100,20) → (140,20) → (140,300) → T left (200,300): runs 40 (level), 280 (upright), 60 (level)
      const U = box('u', 200, 280, 100, 40);
      make([S, U], [{ id: 'l', source: 's', target: 'u', sourceHandle: 'right', targetHandle: 'left', type: 'direct', waypoints: [{ x: 140, y: 20 }, { x: 140, y: 300 }], label: 'saves keys', labelPlacement: 'above' }]);
      const { x, y } = labelAt();
      expect(x).toBeCloseTo(170, 0);
      expect(y).toBeLessThan(300);
    });

    it('on a line with no level run, the label clears the upright line by half its WIDTH', () => {
      const TOP = box('top', 400, 40, 100, 40);
      const BOT = box('bot', 400, 400, 100, 40);
      make([TOP, BOT], [{ id: 'l', source: 'top', target: 'bot', sourceHandle: 'bottom', targetHandle: 'top', type: 'direct', label: 'a long label on an upright line', labelPlacement: 'above', labelStyle: { fontSize: 12 } }]);
      const { x } = labelAt();
      // ~31 characters at 12 px is well over 120 px wide: its centre must sit > 60 px off the line (x 450)
      expect(x).toBeLessThan(450 - 60);
    });

    it('a label on a hand-bent right-angle line sits on the line AS DRAWN, not on its stored bends', () => {
      // stored: (100,20) → (400,400) is a diagonal; drawn: right-angle jogs to reach it
      const S2 = box('s', 0, 0, 100, 40);
      const T2 = box('t', 440, 380, 100, 40);
      make([S2, T2], [{ id: 'l', source: 's', target: 't', sourceHandle: 'right', targetHandle: 'left', type: 'orthogonal', waypoints: [{ x: 400, y: 400 }], label: 'drawn', labelStyle: { color: '#333' } }]);
      const d = container.querySelector('[data-link-id="l"] path:not(.link-hit-area)')!.getAttribute('d') ?? '';
      const nums = (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
      const drawn: Array<{ x: number; y: number }> = [];
      for (let i = 0; i + 1 < nums.length; i += 2) drawn.push({ x: nums[i], y: nums[i + 1] });
      const { x, y } = labelAt();
      let best = Infinity;
      for (let i = 0; i < drawn.length - 1; i++) {
        const a = drawn[i], b = drawn[i + 1];
        const dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy || 1;
        const u = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / L));
        best = Math.min(best, Math.hypot(a.x + u * dx - x, a.y + u * dy - y));
      }
      expect(best).toBeLessThan(3);
    });

    it('a label with no placement sits ON the bent line (half way along it), not in the open space of its chord', () => {
      make([S, T], [bent({})]);
      const { x, y } = labelAt();
      expect(x).toBeCloseTo(300, 0); // 200 along a 400 line: the first corner
      expect(y).toBeLessThan(30); // the chord's middle would be y ≈ 100
    });
  });
});
