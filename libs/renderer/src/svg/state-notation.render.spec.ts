/**
 * State-diagram NOTATION, as drawn — the DOM a reader actually gets.
 *
 * Each block mounts a real Mermaid fence (`loadText`) into a read-only canvas
 * and checks the picture Mermaid draws for it:
 *   - a composite: its name in a caption band at the top, and the line inside it
 *     (`[*] --> Running`) VISIBLE — it used to run under the composite's opaque
 *     body (lines paint below nodes), and the name sat dead centre, under the
 *     children;
 *   - a note: a note box, joined by a dashed line with no arrowhead;
 *   - fork / join: a solid bar, no "fork_state" painted on it;
 *   - an end state: a bullseye (ring + dot), not a hollow circle;
 *   - a start state in the DARK theme: a dot you can see (it was #0f172a on a
 *     dark canvas);
 *   - classDef: the class's fill on the state.
 */
// Through the PUBLIC entry: it is what registers the notation shapes (the
// end state's bullseye is `final-node`), as it does for every real consumer.
import { createDiagram, type DiagramInstance } from '../index';
import { DARK_THEME, LIGHT_THEME } from '../themes';
import { contrastRatio, parseColor, toHex } from '../themes/contrast';
import { createClassStyleResolver } from '../export/style-flattener';
import type { Theme } from '../types/theme.types';

function makeContainer(): HTMLElement {
  const el = document.createElement('div');
  el.getBoundingClientRect = () => ({ left: 0, top: 0, x: 0, y: 0, width: 900, height: 900, right: 900, bottom: 900, toJSON: () => ({}) }) as DOMRect;
  document.body.appendChild(el);
  return el;
}

let container: HTMLElement;
let diagram: DiagramInstance | undefined;
beforeEach(() => (container = makeContainer()));
afterEach(() => {
  diagram?.dispose();
  diagram = undefined;
  container.remove();
});

function mount(text: string, theme: Theme = LIGHT_THEME): DiagramInstance {
  diagram = createDiagram(container, { readonly: true, theme, renderer: { qualityGovernor: false } });
  diagram.loadText(text);
  diagram.fitView(16);
  diagram.renderNow();
  return diagram;
}

const nodeGroup = (id: string) => container.querySelector(`[data-node-id="${id}"]`) as SVGGElement | null;
/** The node's BODY: its first `.diagram-node` element. */
const body = (id: string) => nodeGroup(id)?.querySelector('.diagram-node') as SVGElement | null;
const classes = (el: Element) => (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);
/** The fill a browser paints for an element: inline style, else the shipped stylesheet's rule for its classes. */
function paintedFill(el: SVGElement, theme: Theme): string | undefined {
  const inline = el.style.fill;
  if (inline) return inline;
  const attr = el.getAttribute('fill');
  const rule = createClassStyleResolver(theme)(classes(el))['fill'];
  return rule ?? attr ?? undefined;
}
const hex = (c: string | undefined) => (c && parseColor(c) ? toHex(parseColor(c)!) : c);

const COMPOSITE = 'stateDiagram-v2\n    [*] --> Active\n    state Active {\n      [*] --> Running\n      Running --> Paused: Pause\n      Paused --> Running: Resume\n    }\n    Active --> Closed: Close\n    Closed --> [*]';

describe('state-composite: caption bar + every inner transition visible', () => {
  it('the name "Active" is drawn in the top 22 px band of the composite, not at its centre', () => {
    mount(COMPOSITE);
    const group = nodeGroup('Active')!;
    const caption = Array.from(group.querySelectorAll('text')).find((t) => t.textContent === 'Active');
    expect(caption).toBeDefined();
    const y = Number(caption!.getAttribute('y'));
    expect(y).toBeGreaterThan(0);
    expect(y).toBeLessThan(22);
    // A band is drawn behind it, across the top.
    const band = group.querySelector('.gf-node-header');
    expect(band).not.toBeNull();
  });

  it('the composite body is see-through, so the inner `[*] --> Running` line is not painted over', () => {
    const d = mount(COMPOSITE);
    expect(paintedFill(body('Active')!, LIGHT_THEME)).toBe('none');

    const model = d.getModel();
    const inner = model.getLinks().find((l) => l.sourceNodeId === 'Active.__start__' && l.targetNodeId === 'Running')!;
    expect(inner).toBeDefined();
    // The line is in the DOM, with a real path…
    const path = container.querySelector(`[data-link-id="${inner.id}"] path.diagram-link`);
    expect(path?.getAttribute('d')).toMatch(/^M/);
    // …and no OPAQUE node body covers its middle (links paint under nodes).
    const pts = inner.points;
    const mid = { x: (pts[0].x + pts[pts.length - 1].x) / 2, y: (pts[0].y + pts[pts.length - 1].y) / 2 };
    for (const node of model.getNodes()) {
      if (node.id === inner.sourceNodeId || node.id === inner.targetNodeId) continue;
      const b = { x: node.position.x, y: node.position.y, width: node.size.width, height: node.size.height };
      if (mid.x < b.x || mid.x > b.x + b.width || mid.y < b.y || mid.y > b.y + b.height) continue;
      expect([node.id, paintedFill(body(node.id)!, LIGHT_THEME)]).toEqual([node.id, 'none']);
    }
  });

  it('every transition of the fence is drawn (6 lines)', () => {
    mount(COMPOSITE);
    expect(container.querySelectorAll('path.diagram-link')).toHaveLength(6);
  });
});

describe('state-notes: a note box joined by a dashed line', () => {
  const NOTES = 'stateDiagram-v2\n    Draft --> Sent: Send\n    note right of Draft : Editable until sent\n    note left of Sent\n      Locked for editing\n    end note';

  it('each note is drawn as a note box carrying ALL of its text (no ellipsis)', () => {
    mount(NOTES);
    // A wrapped label is one <tspan> per line: join the lines with spaces.
    const words = (t: Element) =>
      (t.children.length ? Array.from(t.children).map((c) => c.textContent) : [t.textContent]).join(' ').replace(/\s+/g, ' ').trim();
    const texts = Array.from(container.querySelectorAll('[data-node-id^="__note"] text')).map(words);
    expect(texts).toEqual(expect.arrayContaining(['Editable until sent', 'Locked for editing']));
    expect(texts.join(' ')).not.toContain('…');
    for (const id of ['__note1__', '__note2__']) expect(body(id)!.tagName.toLowerCase()).toBe('path'); // the folded-corner note shape
  });

  it('…joined to its state by a dashed line with no arrowhead', () => {
    const d = mount(NOTES);
    const links = d.getModel().getLinks().filter((l) => l.getMetadata('noteLink') === true);
    expect(links).toHaveLength(2);
    for (const link of links) {
      const group = container.querySelector(`[data-link-id="${link.id}"]`)!;
      const path = group.querySelector('path.diagram-link') as SVGPathElement;
      const dash = path.getAttribute('stroke-dasharray') ?? path.style.strokeDasharray;
      expect(dash).toBeTruthy();
      expect(group.querySelectorAll('[class~="arrow"]')).toHaveLength(0);
    }
    // The real transition keeps its arrowhead.
    const send = d.getModel().getLinks().find((l) => !l.getMetadata('noteLink'))!;
    expect(container.querySelectorAll(`[data-link-id="${send.id}"] [class~="arrow"]`)).toHaveLength(1);
  });
});

describe('state-fork-join: a solid bar, no id painted', () => {
  const FORK = 'stateDiagram-v2\n    state fork_state <<fork>>\n    [*] --> fork_state\n    fork_state --> Pack\n    fork_state --> Invoice\n    state join_state <<join>>\n    Pack --> join_state\n    Invoice --> join_state\n    join_state --> Ship';

  for (const theme of [LIGHT_THEME, DARK_THEME]) {
    it(`${theme.name}: fork_state and join_state are 70×8 ink bars with no text`, () => {
      mount(FORK, theme);
      for (const id of ['fork_state', 'join_state']) {
        expect(nodeGroup(id)!.querySelectorAll('text')).toHaveLength(0);
        const bar = body(id)!;
        expect(bar.tagName.toLowerCase()).toBe('rect');
        expect(Number(bar.getAttribute('width'))).toBe(70);
        expect(Number(bar.getAttribute('height'))).toBe(8);
        // Solid, in the theme's ink — readable against the canvas.
        const fill = hex(paintedFill(bar, theme));
        expect(contrastRatio(fill!, theme.colors.background.default)).toBeGreaterThanOrEqual(3);
      }
      expect(container.textContent).not.toContain('fork_state');
    });
  }
});

describe('end state: a bullseye; start state: visible in the dark theme', () => {
  const FENCE = 'stateDiagram-v2\n    [*] --> Draft\n    Draft --> [*]';

  it('X --> [*] draws a ring AND a dot (three sub-paths: outer ring, its hole, the dot)', () => {
    mount(FENCE);
    const end = body('__end__')!;
    expect(end.tagName.toLowerCase()).toBe('path');
    expect((end.getAttribute('d') ?? '').match(/M/g)).toHaveLength(3);
    expect(paintedFill(end, LIGHT_THEME)).not.toBe('none');
  });

  for (const theme of [DARK_THEME, LIGHT_THEME]) {
    it(`${theme.name}: the start dot's fill contrasts with the canvas at >= 3:1`, () => {
      mount(FENCE, theme);
      const fill = hex(paintedFill(body('__start__')!, theme));
      expect(fill).toBeDefined();
      expect(contrastRatio(fill!, theme.colors.background.default)).toBeGreaterThanOrEqual(3);
    });
  }
});

describe('state-classdef: the class paints the state', () => {
  it('`classDef bad fill:#fdd,stroke:#c00` + `Rejected:::bad` → Rejected is filled #fdd, edged #c00', () => {
    mount('stateDiagram-v2\n    classDef bad fill:#fdd,stroke:#c00\n    [*] --> Draft\n    Draft --> Rejected:::bad: Reject');
    const rejected = body('Rejected')!;
    expect(hex(paintedFill(rejected, LIGHT_THEME))).toBe('#ffdddd');
    expect(hex(rejected.style.stroke)).toBe('#cc0000');
    // Draft is untouched (theme paint).
    expect(body('Draft')!.style.fill).toBe('');
  });
});
