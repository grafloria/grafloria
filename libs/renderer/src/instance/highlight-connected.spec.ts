/**
 * HIGHLIGHT THE LINES OF THE SELECTED NODE (renderer 0.4.7).
 *
 * The look of a flow editor like Google's Opal: select a node and the lines that
 * touch it come forward in the page's ink while every other line fades back. A
 * line of the selection that runs ACROSS another node is lifted above the cards
 * and drawn dashed, so it cannot be mistaken for a connection to that node
 * (renderer 0.4.8 — 0.4.7 dashed every outgoing line, a misreading of the
 * reference: its one dashed line was the one crossing a card). Opt-in (`highlightConnected`), because a
 * diagram that did not ask for it must not change its picture when a node is
 * clicked. It is VIEW state derived from the selection each frame: nothing is
 * written to the model, so it creates no undo step and never syncs to a peer.
 */
import { createDiagram } from './create-diagram';
import type { DiagramInstance } from './create-diagram';
import type { NodeSpec } from './model-input';
import { DARK_THEME } from '../themes';

const WIDTH = 1400;
const HEIGHT = 900;

function makeContainer(): HTMLElement {
  const el = document.createElement('div');
  el.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: WIDTH, height: HEIGHT, right: WIDTH, bottom: HEIGHT }) as DOMRect;
  document.body.appendChild(el);
  return el;
}

// The screenshot's graph: two inputs and a research step feed two generators;
// both generators feed the video; the video feeds the campaign.
const box = (id: string, x: number, y: number): NodeSpec => ({ id, position: { x, y }, size: { width: 160, height: 60 }, label: id });
const NODES: NodeSpec[] = [
  box('name', 40, 300),
  box('audience', 40, 620),
  box('research', 320, 100),
  box('adtext', 620, 300),
  box('videodesc', 620, 620),
  box('video', 900, 300),
  box('campaign', 1180, 300),
];
const EDGES = [
  { id: 'name-research', source: 'name', target: 'research' },
  { id: 'name-adtext', source: 'name', target: 'adtext' },
  { id: 'name-videodesc', source: 'name', target: 'videodesc' },
  { id: 'research-adtext', source: 'research', target: 'adtext' },
  { id: 'research-videodesc', source: 'research', target: 'videodesc' },
  { id: 'audience-adtext', source: 'audience', target: 'adtext' },
  { id: 'audience-videodesc', source: 'audience', target: 'videodesc' },
  { id: 'adtext-video', source: 'adtext', target: 'video' },
  { id: 'videodesc-video', source: 'videodesc', target: 'video' },
  { id: 'video-campaign', source: 'video', target: 'campaign' },
];
const ALL = EDGES.map((e) => e.id);

describe('highlightConnected — the selected node brings its lines forward', () => {
  let container: HTMLElement;
  let diagram: DiagramInstance | undefined;

  beforeEach(() => {
    container = makeContainer();
  });
  afterEach(() => {
    diagram?.dispose();
    diagram = undefined;
    container.remove();
  });

  const group = (id: string) => container.querySelector(`[data-link-id="${id}"]`) as SVGGElement | null;
  const role = (id: string) => group(id)?.getAttribute('data-connected') ?? null;
  const path = (id: string) => group(id)?.querySelector('path.diagram-link') as SVGPathElement | null;
  const roles = () => Object.fromEntries(ALL.map((id) => [id, role(id)]));
  const select = (...ids: string[]) => {
    const model = diagram!.getModel();
    model.clearSelection();
    for (const id of ids) model.addToSelection(model.getNode(id)!);
    diagram!.renderNow();
  };

  it('is OFF by default: selecting a node changes no line', () => {
    diagram = createDiagram(container, { nodes: NODES, edges: EDGES });
    select('adtext');
    expect(Object.values(roles()).every((r) => r === null)).toBe(true);
    expect(group('video-campaign')!.style.opacity).toBe('');
  });

  it('on, with nothing selected: every line is as it was', () => {
    diagram = createDiagram(container, { nodes: NODES, edges: EDGES, highlightConnected: true });
    diagram.renderNow();
    expect(Object.values(roles()).every((r) => r === null)).toBe(true);
  });

  it('selecting a node: its incoming lines are "in", its outgoing "out", every other line is dimmed', () => {
    diagram = createDiagram(container, { nodes: NODES, edges: EDGES, highlightConnected: true });
    select('adtext');
    expect(roles()).toEqual({
      'name-research': 'dim',
      'name-adtext': 'in',
      'name-videodesc': 'dim',
      'research-adtext': 'in',
      'research-videodesc': 'dim',
      'audience-adtext': 'in',
      'audience-videodesc': 'dim',
      'adtext-video': 'out',
      'videodesc-video': 'dim',
      'video-campaign': 'dim',
    });
  });

  it('paints them: the page ink and a heavier stroke, in AND out solid, the rest faded', () => {
    diagram = createDiagram(container, { nodes: NODES, edges: EDGES, highlightConnected: true });
    select('adtext');
    const ink = '#111827'; // the light theme's primary text colour
    const inStyle = path('name-adtext')!.getAttribute('style') ?? '';
    expect(inStyle).toContain(`stroke: ${ink}`);
    expect(inStyle).toContain('stroke-width: 2.5');
    expect(inStyle).not.toContain('stroke-dasharray');
    const outStyle = path('adtext-video')!.getAttribute('style') ?? '';
    expect(outStyle).toContain(`stroke: ${ink}`);
    expect(outStyle).not.toContain('stroke-dasharray'); // nothing crosses it: solid
    // Dimmed on the GROUP, so its arrowhead and label fade with it.
    expect(group('video-campaign')!.style.opacity).toBe('0.4');
    expect(group('name-adtext')!.style.opacity).toBe('');
    // Hooks for a host's own CSS.
    expect(group('name-adtext')!.getAttribute('class')).toContain('link-connected');
    expect(group('video-campaign')!.getAttribute('class')).toContain('link-dimmed');
  });

  it('follows the selection: a new selection recomputes every line (no cached picture survives)', () => {
    diagram = createDiagram(container, { nodes: NODES, edges: EDGES, highlightConnected: true });
    select('adtext');
    expect(role('name-adtext')).toBe('in');
    select('campaign');
    expect(role('video-campaign')).toBe('in');
    expect(role('name-adtext')).toBe('dim');
    expect(path('name-adtext')!.getAttribute('style') ?? '').not.toContain('stroke: #111827');
    diagram.getModel().clearSelection();
    diagram.renderNow();
    expect(Object.values(roles()).every((r) => r === null)).toBe(true);
    expect(group('name-adtext')!.style.opacity).toBe('');
  });

  it('several selected nodes: the union; a line between two of them is "both"', () => {
    diagram = createDiagram(container, { nodes: NODES, edges: EDGES, highlightConnected: true });
    select('adtext', 'video');
    expect(role('adtext-video')).toBe('both');
    expect(role('videodesc-video')).toBe('in');
    expect(role('video-campaign')).toBe('out');
    expect(role('name-adtext')).toBe('in');
    expect(role('name-videodesc')).toBe('dim');
  });

  it('depth: Infinity traces the whole path upstream and downstream', () => {
    diagram = createDiagram(container, { nodes: NODES, edges: EDGES, highlightConnected: { depth: Infinity } });
    select('adtext');
    expect(roles()).toEqual({
      'name-research': 'in', // research feeds adtext, name feeds research
      'name-adtext': 'in',
      'name-videodesc': 'dim',
      'research-adtext': 'in',
      'research-videodesc': 'dim',
      'audience-adtext': 'in',
      'audience-videodesc': 'dim',
      'adtext-video': 'out',
      'videodesc-video': 'dim', // it feeds the video, but the video is not upstream of adtext
      'video-campaign': 'out',
    });
  });

  it('options: a colour, dashed outgoing lines as a direction cue, and no dimming', () => {
    diagram = createDiagram(container, {
      nodes: NODES,
      edges: EDGES,
      highlightConnected: { stroke: '#dc2626', outgoing: 'dashed', dimOpacity: 1 },
    });
    select('adtext');
    expect(path('adtext-video')!.getAttribute('style') ?? '').toContain('stroke: #dc2626');
    expect(path('adtext-video')!.getAttribute('style') ?? '').toMatch(/stroke-dasharray: \d/);
    expect(path('name-adtext')!.getAttribute('style') ?? '').not.toContain('stroke-dasharray');
    expect(group('video-campaign')!.style.opacity).toBe('');
  });

  it('switched at runtime, both ways, and through the renderer config the framework wrappers forward', () => {
    diagram = createDiagram(container, { nodes: NODES, edges: EDGES, renderer: { highlightConnected: true } });
    select('adtext');
    expect(role('adtext-video')).toBe('out');
    diagram.setHighlightConnected(false);
    diagram.renderNow();
    expect(Object.values(roles()).every((r) => r === null)).toBe(true);
    expect(diagram.getHighlightConnected()).toBe(false);
    diagram.setHighlightConnected({ depth: Infinity });
    diagram.renderNow();
    expect(role('video-campaign')).toBe('out');
    expect(diagram.getHighlightConnected()).toEqual({ depth: Infinity });
  });

  it('the ink is the theme\'s: a swap to dark repaints the highlighted lines light', () => {
    diagram = createDiagram(container, { nodes: NODES, edges: EDGES, highlightConnected: true });
    select('adtext');
    expect(path('name-adtext')!.getAttribute('style') ?? '').toContain('stroke: #111827');
    diagram.setTheme(DARK_THEME);
    diagram.renderNow();
    expect(path('name-adtext')!.getAttribute('style') ?? '').toContain('stroke: #f9fafb'); // the dark theme's primary text
    expect(role('name-adtext')).toBe('in');
  });

  it('a selected LINK keeps its own selection look', () => {
    diagram = createDiagram(container, { nodes: NODES, edges: EDGES, highlightConnected: true });
    select('adtext');
    diagram.getModel().getLink('adtext-video')!.setState('selected');
    diagram.renderNow();
    expect(role('adtext-video')).toBe('out');
    expect(path('adtext-video')!.getAttribute('style') ?? '').toContain('stroke: #2563eb'); // the theme's selected link
  });

  describe('a line that runs ACROSS another node is lifted above the cards and drawn dashed', () => {
    // a → c, with b dragged across it — the reference's "Generate Ad Text → Generate Ad Campaign"
    // straight through "Generate Video". At rest Grafloria's router detours a line AROUND a card, so a
    // line crosses one while a card is dragged over it (motion-stable routing keeps the chord until the
    // first still frame) or when no detour is found.
    const NODES4: NodeSpec[] = [box('a', 0, 300), box('b', 400, 520), box('c', 800, 300), box('d', 400, 800)];
    const EDGES4 = [
      { id: 'a-c', source: 'a', target: 'c' },
      { id: 'a-d', source: 'a', target: 'd' },
    ];
    const overlay = () => container.querySelector('.grafloria-html-layer .grafloria-line-overlay') as HTMLElement | null;
    const overlayPaths = () => Array.from(overlay()?.querySelectorAll('path.grafloria-line-overlay-path') ?? []);
    /** Drag b up onto the a → c line, one frame per step, and stop ON it (b is still "in motion"). */
    const dragOntoLine = () => {
      const b = diagram!.getModel().getNode('b')!;
      for (const y of [460, 400, 340, 300]) {
        b.setPosition(400, y);
        diagram!.renderNow();
      }
    };
    /** The first still frame — the one the renderer schedules itself to settle the route. */
    const settle = async () => {
      await Promise.resolve();
      diagram!.renderNow();
      diagram!.renderNow();
    };

    it('at rest the router takes the line AROUND a card: nothing crosses, nothing is lifted', () => {
      diagram = createDiagram(container, { nodes: [box('a', 0, 300), box('b', 400, 300), box('c', 800, 300)], edges: EDGES4.slice(0, 1), highlightConnected: true });
      select('a');
      expect(role('a-c')).toBe('out');
      expect(group('a-c')!.getAttribute('data-crossing')).toBeNull();
      expect(path('a-c')!.getAttribute('style') ?? '').not.toContain('stroke-dasharray');
      expect(overlayPaths()).toHaveLength(0);
    });

    it('a line BENT BY HAND across a card is lifted at rest — the reference exactly', () => {
      // the router takes lines around cards on its own; a line the user bent across one stays where it was put
      diagram = createDiagram(container, {
        nodes: [box('a', 0, 300), box('b', 400, 300), box('c', 800, 300)],
        edges: [{ id: 'a-c', source: 'a', target: 'c', points: [{ x: 160, y: 330 }, { x: 480, y: 330 }, { x: 800, y: 330 }], metadata: { hasManualWaypoints: true } }],
        highlightConnected: true,
      });
      select('a');
      expect(group('a-c')!.getAttribute('data-crossing')).toBe('true');
      expect(path('a-c')!.getAttribute('style') ?? '').toMatch(/stroke-dasharray: \d/);
      expect(overlayPaths()).toHaveLength(1);
      diagram.getModel().clearSelection();
      diagram.renderNow();
      expect(group('a-c')!.getAttribute('data-crossing')).toBeNull(); // not a line of the selection now
      expect(path('a-c')!.getAttribute('style') ?? '').not.toContain('stroke-dasharray');
    });

    it('a card dragged over a line of the selection: the line is dashed, marked, and drawn again ON TOP in the HTML layer', () => {
      diagram = createDiagram(container, { nodes: NODES4, edges: EDGES4, highlightConnected: true });
      select('a');
      expect(group('a-c')!.getAttribute('data-crossing')).toBeNull();
      dragOntoLine();
      expect(group('a-c')!.getAttribute('class')).toContain('link-crossing');
      expect(group('a-c')!.getAttribute('data-crossing')).toBe('true');
      expect(path('a-c')!.getAttribute('style') ?? '').toMatch(/stroke-dasharray: \d/);
      expect(group('a-d')!.getAttribute('data-crossing')).toBeNull(); // a → d crosses nothing: solid, not lifted
      expect(path('a-d')!.getAttribute('style') ?? '').not.toContain('stroke-dasharray');
      const o = overlay();
      expect(o).not.toBeNull();
      expect(o!.parentElement!.classList.contains('grafloria-html-layer')).toBe(true);
      expect(o!.getAttribute('aria-hidden')).toBe('true');
      expect(o!.style.pointerEvents).toBe('none');
      const lifted = overlayPaths();
      expect(lifted).toHaveLength(1);
      expect(lifted[0].getAttribute('d')).toBe(path('a-c')!.getAttribute('d')); // the same line, above every card
      expect(lifted[0].getAttribute('style') ?? '').toMatch(/stroke-dasharray: \d/);
      expect(lifted[0].getAttribute('fill')).toBe('none');
    });

    it('when the card stops, the router takes the line around it: solid again, the lift gone (no stale cached picture)', async () => {
      diagram = createDiagram(container, { nodes: NODES4, edges: EDGES4, highlightConnected: true });
      select('a');
      dragOntoLine();
      expect(group('a-c')!.getAttribute('data-crossing')).toBe('true');
      await settle();
      expect(group('a-c')!.getAttribute('data-crossing')).toBeNull();
      expect(path('a-c')!.getAttribute('style') ?? '').not.toContain('stroke-dasharray');
      expect(overlayPaths()).toHaveLength(0);
    });

    it('only lines of the selection are lifted: a faded line under a dragged card stays under it', () => {
      diagram = createDiagram(container, { nodes: NODES4, edges: EDGES4, highlightConnected: true });
      select('d');
      dragOntoLine();
      expect(role('a-c')).toBe('dim');
      expect(group('a-c')!.getAttribute('data-crossing')).toBeNull();
      expect(overlayPaths()).toHaveLength(0);
    });

    it('nothing selected, or the option off: no lift and no overlay', () => {
      diagram = createDiagram(container, { nodes: NODES4, edges: EDGES4, highlightConnected: true });
      select('a');
      dragOntoLine();
      expect(overlayPaths()).toHaveLength(1);
      diagram.getModel().clearSelection();
      diagram.renderNow();
      expect(overlayPaths()).toHaveLength(0);
      diagram.setHighlightConnected(false);
      diagram.renderNow();
      expect(overlay()).toBeNull();
    });
  });

  it('is never written to the model: no undo step, and an export draws the diagram, not the highlight', async () => {
    diagram = createDiagram(container, { nodes: NODES, edges: EDGES, highlightConnected: true });
    const undoBefore = diagram.getEngine().commandManager.canUndo();
    select('adtext');
    expect(diagram.getEngine().commandManager.canUndo()).toBe(undoBefore);
    expect(diagram.getModel().getLink('name-adtext')!.state).toBe('default');
    const svg = await diagram.export('svg');
    expect(svg).not.toContain('data-connected');
    expect(svg).not.toContain('link-dimmed');
    // …and the screen still shows it afterwards.
    diagram.renderNow();
    expect(role('name-adtext')).toBe('in');
  });
});
