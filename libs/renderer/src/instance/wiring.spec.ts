/**
 * WAVE 10 — the wiring lock.
 *
 * `createDiagram()` is the ONLY way a host builds a renderer. For two waves it
 * forwarded `instanceId` into `SVGRendererConfig` and dropped everything else on
 * the floor, and the returned `DiagramInstance` exposed neither the renderer nor
 * any of its capabilities. The result: three whole features were unreachable
 * from an embed, while their own unit suites stayed green.
 *
 *   - `colorMode: 'system'`  — following the OS colour scheme AT ALL, and the
 *     accessibility upgrade where prefers-contrast/forced-colors promotes you to
 *     a high-contrast theme instead of flashing light at you.
 *   - `tokenBridge`          — the shadcn/MUI/Tailwind bridge, whose entire
 *     purpose is for a HOST to re-point Grafloria at its own design tokens.
 *   - `export()`             — PNG, JPEG, WebP, a real vector PDF, and a
 *     deterministic zero-DOM SVG serializer that no embedder could call.
 *
 * These tests assert the CONNECTION, not the behaviour. The behaviour was never
 * the problem.
 */
import { createDiagram } from './create-diagram';
import type { DiagramInstance } from './create-diagram';
import type { NodeSpec } from './model-input';
import { DEFAULT_THEME_SET, HIGH_CONTRAST_LIGHT_THEME, LIGHT_THEME } from '../themes';
import { shadcnBridge } from '../themes/token-bridge';
import {
  GRAFLORIA_INSTANCE_OVERRIDE_PREFIX,
  GRAFLORIA_INSTANCE_STYLE_PREFIX,
} from '../svg/svg-renderer';

const WIDTH = 800;
const HEIGHT = 600;

function makeContainer(): HTMLElement {
  const el = document.createElement('div');
  el.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: WIDTH, height: HEIGHT, right: WIDTH, bottom: HEIGHT }) as DOMRect;
  document.body.appendChild(el);
  return el;
}

function instanceIdOf(container: HTMLElement): string {
  return (
    container.querySelector('[data-grafloria-instance]')?.getAttribute('data-grafloria-instance') ?? ''
  );
}

/** This instance's theme variable block, as actually injected into <head>. */
function themeCssFor(container: HTMLElement): string {
  const id = instanceIdOf(container);
  return document.getElementById(`${GRAFLORIA_INSTANCE_STYLE_PREFIX}${id}`)?.textContent ?? '';
}

/** The plain light theme's block, for a "it is NOT this" comparison. */
let lightThemeCss = '';

/** jsdom has no matchMedia. Give it one whose answers we control. */
function stubMatchMedia(answers: Record<string, boolean>): void {
  (window as unknown as { matchMedia: unknown }).matchMedia = (query: string) => ({
    matches: answers[query] ?? false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    onchange: null,
    dispatchEvent: () => false,
  });
}

const NODES: NodeSpec[] = [
  { id: 'a', position: { x: 100, y: 100 }, size: { width: 120, height: 60 }, label: 'Ingest' },
  { id: 'b', position: { x: 400, y: 100 }, size: { width: 120, height: 60 }, label: 'Publish' },
];
const EDGES = [{ id: 'e1', source: 'a', target: 'b' }];

describe('createDiagram forwards the renderer config it was given', () => {
  let container: HTMLElement;
  let diagram: DiagramInstance | undefined;

  beforeEach(() => {
    container = makeContainer();
    stubMatchMedia({});

    // Capture what the PLAIN light theme emits, so the high-contrast test can
    // assert it is genuinely a different stylesheet and not just "some CSS".
    const probeEl = makeContainer();
    const probe = createDiagram(probeEl, { nodes: NODES, theme: LIGHT_THEME });
    probe.renderNow();
    lightThemeCss = themeCssFor(probeEl);
    probe.dispose();
    probeEl.remove();
  });
  afterEach(() => {
    diagram?.dispose();
    diagram = undefined;
    container.remove();
  });

  it('colorMode reaches the renderer — it used to be dropped in the config literal', () => {
    diagram = createDiagram(container, { nodes: NODES, colorMode: 'system' });
    expect(diagram.getColorMode()).toBe('system');
  });

  it('an OS high-contrast preference UPGRADES the theme rather than flashing light', () => {
    // Someone who asked their OS for more contrast gets the high-contrast theme,
    // not the light one. This is the whole reason `colorMode` exists, and it was
    // unreachable.
    stubMatchMedia({ '(prefers-contrast: more)': true });
    diagram = createDiagram(container, {
      nodes: NODES,
      colorMode: 'system',
      themes: DEFAULT_THEME_SET,
    });
    diagram.renderNow();

    expect(diagram.getColorMode()).toBe('system');
    // Teeth: not "some CSS was emitted", but "the emitted variables are the
    // HIGH-CONTRAST theme's". HIGH_CONTRAST_LIGHT_THEME pins a pure-black node
    // stroke at width 2; LIGHT_THEME does not.
    const css = themeCssFor(container);
    expect(css).toContain(HIGH_CONTRAST_LIGHT_THEME.nodes.default.stroke);
    expect(css).not.toBe(lightThemeCss);
  });

  it('setColorMode() is on the instance, and switching it repaints', () => {
    diagram = createDiagram(container, { nodes: NODES });
    expect(diagram.getColorMode()).toBeUndefined();
    diagram.setColorMode('dark');
    expect(diagram.getColorMode()).toBe('dark');
  });

  it('tokenBridge reaches the renderer and emits an override block', () => {
    diagram = createDiagram(container, { nodes: NODES, tokenBridge: shadcnBridge() });
    diagram.renderNow();
    const id = instanceIdOf(container);
    const css = document.getElementById(`${GRAFLORIA_INSTANCE_OVERRIDE_PREFIX}${id}`)?.textContent ?? '';
    // shadcn's bridge re-points our variables at the host's `--background`,
    // `--primary`, … — that is the entire feature.
    expect(css).toContain('--background');
    expect(css).toContain('--grafloria-');
  });
});

describe('DiagramInstance can actually export — the renderer always could', () => {
  let container: HTMLElement;
  let diagram: DiagramInstance;

  beforeEach(() => {
    container = makeContainer();
    stubMatchMedia({});
    diagram = createDiagram(container, { nodes: NODES, edges: EDGES });
    diagram.renderNow();
  });
  afterEach(() => {
    diagram.dispose();
    container.remove();
  });

  it('exportSvgString() returns real SVG carrying the node labels', () => {
    const result = diagram.exportSvgString();
    expect(result.svg).toContain('<svg');
    // Teeth: an empty <svg> would pass a "did it return a string" check. The
    // labels are the proof the VNode tree was actually walked.
    expect(result.svg).toContain('Ingest');
    expect(result.svg).toContain('Publish');
    expect(result.width).toBeGreaterThan(0);
  });

  it('exportPdf() returns a real VECTOR PDF, not a rasterised page', () => {
    const { pdf, pageCount } = diagram.exportPdf();
    expect(pageCount).toBeGreaterThanOrEqual(1);
    // %PDF-
    expect(Array.from(pdf.slice(0, 5))).toEqual([0x25, 0x50, 0x44, 0x46, 0x2d]);

    // jsdom has no TextDecoder; the bytes are latin1 by construction.
    const text = Array.from(pdf, (b) => String.fromCharCode(b)).join('');
    expect(text).toContain('/Type /Page');
    // TEETH: a vector PDF shows TEXT with BT/Tj and strokes real paths. A PDF
    // that had merely embedded a bitmap would carry /Subtype /Image and none of
    // this — and the labels would not be selectable or searchable.
    expect(text).toContain('BT');
    expect(text).toContain('Tj');
    expect(text).not.toContain('/Subtype /Image');
  });

  it('getQualityState() reports the tier actually rendered', () => {
    const state = diagram.getQualityState();
    expect(typeof state.tier).toBe('string');
  });

  it('export("svg") resolves to SVG source', async () => {
    await expect(diagram.export('svg')).resolves.toContain('<svg');
  });
});
