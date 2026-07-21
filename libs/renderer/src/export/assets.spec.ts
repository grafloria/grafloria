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
  fetchAssetsTiered,
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

// ---------------------------------------------------------------------------
// fetchAssetsTiered — the CLIENT-SIDE three-tier fetch behind `await export(…)`.
//
// Tier 1 is the environment's own fetch (same-origin, or a server that allows CORS —
// most public CDNs). Tier 2 is the caller's AssetFetcher (their proxy) when tier 1
// is refused. Tier 3 is honesty: a recorded failure that names both escape hatches.
// ---------------------------------------------------------------------------

describe('fetchAssetsTiered — browser fetch, caller fetcher, honest residue', () => {
  const globals = globalThis as { fetch?: unknown };
  const realDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'fetch');

  // This realm pins `fetch` as read-only, so plain assignment throws — defineProperty
  // is the stub seam, and the original descriptor (or its absence) is restored after.
  const setFetch = (impl: unknown): void => {
    Object.defineProperty(globalThis, 'fetch', { value: impl, configurable: true, writable: true });
  };
  const clearFetch = (): void => {
    setFetch(undefined);
    delete globals.fetch;
  };
  afterEach(() => {
    if (realDescriptor === undefined) clearFetch();
    else Object.defineProperty(globalThis, 'fetch', realDescriptor);
  });

  /** A minimal Response-shaped success for the tier-1 stub. */
  const respond = (bytes: Uint8Array, mimeType = 'image/png') => ({
    ok: true,
    status: 200,
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    headers: { get: (name: string) => (name.toLowerCase() === 'content-type' ? mimeType : null) },
  });

  it('tier 1: inlines an image the environment fetch can reach', async () => {
    const calls: string[] = [];
    setFetch(async (url: string) => {
      calls.push(url);
      return respond(PNG_BYTES);
    });

    const { byUrl, failures } = await fetchAssetsTiered(['https://cdn.example/logo.png']);

    expect(calls).toEqual(['https://cdn.example/logo.png']);
    expect(byUrl.get('https://cdn.example/logo.png')).toMatch(/^data:image\/png;base64,/);
    expect(failures.size).toBe(0);
  });

  it('tier 2: a CORS-refused fetch falls back to the caller fetcher', async () => {
    // fetch() REJECTS on a CORS failure — that rejection is the tier boundary.
    setFetch(async () => {
      throw new TypeError('Failed to fetch');
    });
    const asked: string[] = [];
    const fetcher: AssetFetcher = async (url) => {
      asked.push(url);
      return { data: PNG_BYTES, mimeType: 'image/png' };
    };

    const { byUrl, failures } = await fetchAssetsTiered(['https://blocked.example/a.png'], { fetcher });

    expect(asked).toEqual(['https://blocked.example/a.png']);
    expect(byUrl.get('https://blocked.example/a.png')).toMatch(/^data:image\/png;base64,/);
    expect(failures.size).toBe(0);
  });

  it('tier 3: with no fetcher, the failure names BOTH escape hatches — CORS and assetFetcher', async () => {
    setFetch(async () => {
      throw new TypeError('Failed to fetch');
    });

    const { byUrl, failures } = await fetchAssetsTiered(['https://blocked.example/a.png']);

    expect(byUrl.size).toBe(0);
    const reason = failures.get('https://blocked.example/a.png') ?? '';
    expect(reason).toMatch(/CORS/);
    expect(reason).toMatch(/assetFetcher/);
  });

  it('the size cap is TERMINAL: oversized bytes are refused and the fetcher is not asked for the same file', async () => {
    setFetch(async () => respond(new Uint8Array(64)));
    const fetcher = jest.fn();

    const { byUrl, failures } = await fetchAssetsTiered(['https://cdn.example/big.png'], {
      fetcher: fetcher as unknown as AssetFetcher,
      maxBytes: 16,
    });

    expect(byUrl.size).toBe(0);
    expect(failures.get('https://cdn.example/big.png')).toMatch(/64 bytes.*16-byte cap/);
    expect(fetcher).not.toHaveBeenCalled(); // a proxy returns the SAME bytes — nothing to gain
  });

  it('the size cap binds the caller fetcher too', async () => {
    clearFetch(); // no tier 1 in this environment
    const fetcher: AssetFetcher = async () => ({ data: new Uint8Array(64), mimeType: 'image/png' });

    const { byUrl, failures } = await fetchAssetsTiered(['https://x/a.png'], { fetcher, maxBytes: 16 });

    expect(byUrl.size).toBe(0);
    expect(failures.get('https://x/a.png')).toMatch(/64 bytes.*16-byte cap/);
  });

  it('a fetch that never settles is BOUNDED by timeoutMs — one dead URL cannot hang an export', async () => {
    setFetch(() => new Promise(() => undefined)); // hangs forever

    const started = Date.now();
    const { byUrl, failures } = await fetchAssetsTiered(['https://dead.example/x.png'], { timeoutMs: 25 });

    expect(Date.now() - started).toBeLessThan(2000);
    expect(byUrl.size).toBe(0);
    expect(failures.get('https://dead.example/x.png')).toMatch(/25ms/);
  });

  it('fetches one URL exactly once, however many times it is referenced', async () => {
    const calls: string[] = [];
    setFetch(async (url: string) => {
      calls.push(url);
      return respond(PNG_BYTES);
    });

    await fetchAssetsTiered(['https://a/1.png', 'https://a/1.png', 'https://a/1.png']);

    expect(calls).toEqual(['https://a/1.png']);
  });

  it('sniffs the real image type when the server says octet-stream — the data: URI must not lie', async () => {
    setFetch(async () => respond(PNG_BYTES, 'application/octet-stream'));

    const { byUrl } = await fetchAssetsTiered(['https://cdn.example/logo.png']);

    expect(byUrl.get('https://cdn.example/logo.png')).toMatch(/^data:image\/png;base64,/);
  });

  it('leaves no deadline timer pending once the fetch settles', async () => {
    setFetch(async () => respond(PNG_BYTES));

    const live = new Set<unknown>();
    const realSetTimeout = globalThis.setTimeout;
    const realClearTimeout = globalThis.clearTimeout;
    globalThis.setTimeout = ((fn: never, ms: never, ...rest: never[]) => {
      const id = realSetTimeout(fn, ms, ...rest);
      live.add(id);
      return id;
    }) as typeof globalThis.setTimeout;
    globalThis.clearTimeout = ((id: never) => {
      live.delete(id);
      return realClearTimeout(id);
    }) as typeof globalThis.clearTimeout;

    try {
      await fetchAssetsTiered(['https://cdn.example/logo.png']);
      expect(live.size).toBe(0);
    } finally {
      globalThis.setTimeout = realSetTimeout;
      globalThis.clearTimeout = realClearTimeout;
    }
  });
});
