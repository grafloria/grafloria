/**
 * HIGHLIGHT THE LINES OF THE SELECTED NODE (renderer 0.4.7).
 *
 * The look of a flow editor like Google's Opal: select a node and the lines that
 * touch it come forward — incoming solid, outgoing dashed, both in the page's ink
 * — while every other line fades back. Opt-in (`highlightConnected`), because a
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

  it('paints them: the page ink and a heavier stroke, outgoing dashed, the rest faded', () => {
    diagram = createDiagram(container, { nodes: NODES, edges: EDGES, highlightConnected: true });
    select('adtext');
    const ink = '#111827'; // the light theme's primary text colour
    const inStyle = path('name-adtext')!.getAttribute('style') ?? '';
    expect(inStyle).toContain(`stroke: ${ink}`);
    expect(inStyle).toContain('stroke-width: 2.5');
    expect(inStyle).not.toContain('stroke-dasharray');
    const outStyle = path('adtext-video')!.getAttribute('style') ?? '';
    expect(outStyle).toContain(`stroke: ${ink}`);
    expect(outStyle).toMatch(/stroke-dasharray: \d/);
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

  it('options: a colour, solid outgoing lines, and no dimming', () => {
    diagram = createDiagram(container, {
      nodes: NODES,
      edges: EDGES,
      highlightConnected: { stroke: '#dc2626', outgoing: 'solid', dimOpacity: 1 },
    });
    select('adtext');
    expect(path('adtext-video')!.getAttribute('style') ?? '').toContain('stroke: #dc2626');
    expect(path('adtext-video')!.getAttribute('style') ?? '').not.toContain('stroke-dasharray');
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
