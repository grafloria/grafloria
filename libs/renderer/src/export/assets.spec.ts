// Card 1 — self-contained assets.
//
// The theme cascade was already flattened in wave 4. What was still reaching out of the
// file: FONTS (declared, never embedded) and IMAGES (panel nodes emit a live
// `<image href="https://…">`). Both are closed here.

import { DiagramEngine, DiagramModel, NodeModel } from '@grafloria/engine';
import { SVGRenderer } from '../svg/svg-renderer';
import type { VNode } from '../types/vnode.types';
import {
  collectAssetUrls,
  fetchFont,
  fontFaceCss,
  fontFormatFromUrl,
  inlineAssets,
  isExternalUrl,
  resolveAssets,
  type AssetFetcher,
} from './assets';
import { base64ToBytes } from './round-trip';

const FONT_BYTES = new Uint8Array([0x77, 0x4f, 0x46, 0x32, 0x00, 0x01]); // 'wOF2' + noise
const PNG_BYTES = base64ToBytes('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==');

const image = (href: string): VNode => ({ type: 'image', props: { x: 0, y: 0, width: 10, height: 10, href } } as VNode);
const tree = (children: VNode[]): VNode => ({ type: 'svg', props: {}, children } as VNode);

describe('fontFaceCss — fonts become part of the file', () => {
  it('emits an @font-face with a base64 data: URI src', () => {
    const css = fontFaceCss([{ family: 'Inter', data: FONT_BYTES, format: 'woff2', weight: 400 }]);

    expect(css).toContain("font-family: 'Inter'");
    expect(css).toContain('font-weight: 400');
    expect(css).toContain('src: url(data:font/woff2;base64,');
    expect(css).toContain("format('woff2')");
  });

  it('carries the FORMAT hint — without it some renderers (older librsvg) decline and fall back', () => {
    expect(fontFaceCss([{ family: 'X', data: FONT_BYTES, format: 'truetype' }])).toContain("format('truetype')");
    expect(fontFaceCss([{ family: 'X', data: FONT_BYTES, format: 'truetype' }])).toContain('data:font/ttf;base64,');
  });

  it('defaults weight/style, and honours italic + unicode-range', () => {
    const css = fontFaceCss([
      { family: 'Inter', data: FONT_BYTES, style: 'italic', weight: 700, unicodeRange: 'U+0000-00FF' },
    ]);
    expect(css).toContain('font-style: italic');
    expect(css).toContain('font-weight: 700');
    expect(css).toContain('unicode-range: U+0000-00FF');
  });

  it('emits one rule per face, so a family can ship regular AND bold', () => {
    const css = fontFaceCss([
      { family: 'Inter', data: FONT_BYTES, weight: 400 },
      { family: 'Inter', data: FONT_BYTES, weight: 700 },
    ]);
    expect(css.match(/@font-face/g)).toHaveLength(2);
  });

  it('escapes a quote in the family name rather than breaking the rule', () => {
    expect(fontFaceCss([{ family: "Bob's Font", data: FONT_BYTES }])).toContain("font-family: 'Bob\\'s Font'");
  });

  it('fontFormatFromUrl reads the extension, ignoring query strings', () => {
    expect(fontFormatFromUrl('https://x/inter.woff2?v=3')).toBe('woff2');
    expect(fontFormatFromUrl('https://x/inter.woff')).toBe('woff');
    expect(fontFormatFromUrl('https://x/inter.ttf')).toBe('truetype');
    expect(fontFormatFromUrl('https://x/inter.otf')).toBe('opentype');
    expect(fontFormatFromUrl('https://x/inter')).toBe('woff2'); // the web default
  });
});

describe('isExternalUrl', () => {
  it('a data: URI and an intra-document ref are NOT external — nothing to fetch', () => {
    expect(isExternalUrl('data:image/png;base64,AAA')).toBe(false);
    expect(isExternalUrl('#gradient')).toBe(false);
    expect(isExternalUrl('')).toBe(false);
    expect(isExternalUrl(undefined)).toBe(false);
  });

  it('http(s) and relative paths are', () => {
    expect(isExternalUrl('https://cdn.example.com/logo.png')).toBe(true);
    expect(isExternalUrl('/assets/logo.png')).toBe(true);
  });
});

describe('collectAssetUrls', () => {
  it('finds every external image reference, deduped, in stable order', () => {
    const diagram = tree([image('https://a/1.png'), image('https://b/2.png'), image('https://a/1.png')]);
    expect(collectAssetUrls(diagram)).toEqual(['https://a/1.png', 'https://b/2.png']);
  });

  it('reads the SVG 1.1 xlink:href spelling too', () => {
    const legacy = { type: 'image', props: { 'xlink:href': 'https://a/1.png' } } as VNode;
    expect(collectAssetUrls(tree([legacy]))).toEqual(['https://a/1.png']);
  });

  it('skips references that are already inline', () => {
    expect(collectAssetUrls(tree([image('data:image/png;base64,AAA')]))).toEqual([]);
  });
});

describe('inlineAssets — pure substitution', () => {
  it('swaps the URL for the data: URI', () => {
    const out = inlineAssets(tree([image('https://a/1.png')]), new Map([['https://a/1.png', 'data:image/png;base64,XX']]));
    expect(out.children![0].props['href']).toBe('data:image/png;base64,XX');
  });

  it('LEAVES an unresolved URL alone — a broken-but-visible ref beats a silently blanked one', () => {
    const out = inlineAssets(tree([image('https://a/1.png')]), new Map());
    expect(out.children![0].props['href']).toBe('https://a/1.png');
  });

  it('does not mutate the input tree', () => {
    const input = tree([image('https://a/1.png')]);
    inlineAssets(input, new Map([['https://a/1.png', 'data:x']]));
    expect(input.children![0].props['href']).toBe('https://a/1.png');
  });
});

describe('resolveAssets — the async layer', () => {
  const fetcher: AssetFetcher = async (url: string) => {
    if (url.includes('404')) throw new Error('HTTP 404');
    return { data: PNG_BYTES, mimeType: 'image/png' };
  };

  it('inlines every image it can fetch', async () => {
    const result = await resolveAssets(tree([image('https://a/1.png')]), { fetcher });

    expect(result.inlined).toBe(1);
    expect(String(result.tree.children![0].props['href']).startsWith('data:image/png;base64,')).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  it('ONE 404 DOES NOT LOSE THE EXPORT — it warns and leaves the reference', async () => {
    const result = await resolveAssets(tree([image('https://a/ok.png'), image('https://a/404.png')]), { fetcher });

    expect(result.inlined).toBe(1);
    expect(result.warnings.join(' ')).toContain('could not inline');
    expect(result.warnings.join(' ')).toContain('not fully self-contained');
    // The good one still got inlined.
    expect(String(result.tree.children![0].props['href']).startsWith('data:')).toBe(true);
    // …and the bad one is still visible, not blanked.
    expect(result.tree.children![1].props['href']).toBe('https://a/404.png');
  });

  it('refuses an asset over the size cap', async () => {
    const result = await resolveAssets(tree([image('https://a/1.png')]), { fetcher, maxBytes: 1 });
    expect(result.inlined).toBe(0);
    expect(result.warnings.join(' ')).toContain('over the 1-byte cap');
  });

  it('a tree with no assets does no work and returns the SAME tree', async () => {
    const input = tree([{ type: 'rect', props: {} } as VNode]);
    const result = await resolveAssets(input, { fetcher });
    expect(result.tree).toBe(input);
    expect(result.inlined).toBe(0);
  });

  it('says so when the environment has no fetch, instead of silently shipping a non-self-contained file', async () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'fetch');
    Object.defineProperty(globalThis, 'fetch', { value: undefined, configurable: true });

    try {
      const result = await resolveAssets(tree([image('https://a/1.png')]));
      expect(result.inlined).toBe(0);
      expect(result.warnings.join(' ')).toContain('has no fetch');
      expect(result.warnings.join(' ')).toContain('NOT self-contained');
    } finally {
      if (original) Object.defineProperty(globalThis, 'fetch', original);
    }
  });
});

describe('fetchFont', () => {
  it('builds a FontSource, inferring the format from the URL', async () => {
    const fetcher: AssetFetcher = async () => ({ data: FONT_BYTES, mimeType: 'font/woff2' });
    const font = await fetchFont('https://x/inter.woff2', { family: 'Inter', weight: 400 }, { fetcher });

    expect(font.family).toBe('Inter');
    expect(font.format).toBe('woff2');
    expect(Array.from(font.data)).toEqual(Array.from(FONT_BYTES));
    expect(fontFaceCss([font])).toContain('data:font/woff2;base64,');
  });
});

// ---------------------------------------------------------------------------
// End to end, through the real renderer
// ---------------------------------------------------------------------------

describe('a truly self-contained export', () => {
  let engine: DiagramEngine;
  let diagram: DiagramModel;
  let renderer: SVGRenderer;

  beforeEach(() => {
    engine = new DiagramEngine();
    diagram = engine.createDiagram('Assets')!;
    renderer = new SVGRenderer(engine, {});
  });

  afterEach(() => {
    renderer?.dispose();
    engine.destroy();
  });

  it('embedFonts puts a real @font-face, CDATA-wrapped, in the exported <defs>', async () => {
    diagram.addNode(
      new NodeModel({ id: 'a', type: 'basic', position: { x: 0, y: 0 }, size: { width: 100, height: 50 } })
    );

    const svg = await renderer.export('svg', {
      embedFonts: [{ family: 'Inter', data: FONT_BYTES, format: 'woff2', weight: 400 }],
    });

    expect(svg).toContain('<defs><style type="text/css"><![CDATA[');
    expect(svg).toContain("font-family: 'Inter'");
    expect(svg).toContain('src: url(data:font/woff2;base64,');
  });

  it('embedFonts and the raw embedFontCss seam BOTH apply — neither silently wins', async () => {
    diagram.addNode(
      new NodeModel({ id: 'a', type: 'basic', position: { x: 0, y: 0 }, size: { width: 100, height: 50 } })
    );

    const svg = await renderer.export('svg', {
      embedFonts: [{ family: 'Inter', data: FONT_BYTES }],
      embedFontCss: '.custom{fill:red}',
    });

    expect(svg).toContain("font-family: 'Inter'");
    expect(svg).toContain('.custom{fill:red}');
  });

  it('REAL PANEL NODE: its <image href="https://…"> is a live network reference, and gets inlined', async () => {
    // Panel nodes (wave 5) genuinely emit <image href>. That is a request leaked to a third
    // party every time the "self-contained" file is opened, and a hole in an email client.
    const node = new NodeModel({ id: 'p', type: 'basic', position: { x: 0, y: 0 }, size: { width: 200, height: 120 } });
    node.setMetadata('panel', { image: { href: 'https://cdn.example.com/logo.png', height: 40 } });
    diagram.addNode(node);

    const raw = renderer.render({ x: -50, y: -50, width: 400, height: 300 }, 1);
    const urls = collectAssetUrls(raw);
    expect(urls).toContain('https://cdn.example.com/logo.png');

    const resolved = await resolveAssets(raw, {
      fetcher: async () => ({ data: PNG_BYTES, mimeType: 'image/png' }),
    });

    expect(resolved.inlined).toBe(1);
    expect(collectAssetUrls(resolved.tree)).toEqual([]); // nothing external left
  });
});
