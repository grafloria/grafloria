// EXTERNAL-URL PANEL-NODE IMAGES REACH THE PDF — the tree pass.
//
// THE GAP (named by a0ddecfac's own report)
// -----------------------------------------
// That commit fetched external image URLs held by WIDGET captures. But a PANEL-type
// diagram node (`metadata.panel.image.href`, `panel.icon.href` — an ERD avatar, a logo)
// emits `<image href="https://…">` inside the renderer's OWN VNode tree, built by the
// synchronous export path — the async fetch pass never saw it. External panel images
// still missed the PDF, and the exported SVG was not self-contained.
//
// THE SEAM
// --------
// `await export(…)` now enumerates the tree's external image URLs up front (the renderer
// renders the same tree the export will serialize — cached, cheap) and fetches them
// through the SAME three tiers as widget URLs, in ONE deduplicated pass. The resolved
// map rides down `ExportOptions.resolvedAssets` and the sync export substitutes it with
// the PURE `inlineAssets` — so `exportSvgString()` / `exportPdf()` stay synchronous and
// network-free, exactly as their specs assert.
//
// WHAT EVERY TEST HERE HAS TO SURVIVE: "the file contains data:image/png" is a weak
// tooth when any OTHER fixture image could contribute it — so every fixture holds
// exactly ONE image, referenced by URL only, on a PANEL node (not a widget) unless the
// test is explicitly about the widget+tree dedupe.

import { createDiagram } from './create-diagram';
import type { DiagramInstance } from './create-diagram';
import type { NodeModel } from '@grafloria/engine';
import type { AssetFetcher } from '../export/assets';
import { deflateSync } from 'zlib';

const WIDTH = 800;
const HEIGHT = 600;

function makeContainer(): HTMLElement {
  const el = document.createElement('div');
  el.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: WIDTH, height: HEIGHT, right: WIDTH, bottom: HEIGHT }) as DOMRect;
  document.body.appendChild(el);
  return el;
}

const box = (el: { isConnected: boolean }, w: number, h: number) => () =>
  (el.isConnected
    ? { left: 0, top: 0, width: w, height: h, right: w, bottom: h }
    : { left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 }) as DOMRect;

/** A PANEL node — the renderer itself paints `<image href>` for it. NOT a widget. */
const P = (id: string, href: string) => ({
  id,
  position: { x: 0, y: 0 },
  size: { width: 220, height: 140 },
  metadata: { panel: { header: { text: id }, image: { href } } },
});

/** A widget node, for the dedupe test only. */
const W = (id: string) => ({
  id,
  position: { x: 400, y: 0 },
  size: { width: 200, height: 120 },
  custom: true,
});

// -- a REAL (strict-parser-approved) PNG ------------------------------------------------
function pngChunk(type: string, data: number[] | Uint8Array): number[] {
  const body = Array.from(data);
  const out = [
    (body.length >>> 24) & 0xff,
    (body.length >>> 16) & 0xff,
    (body.length >>> 8) & 0xff,
    body.length & 0xff,
  ];
  for (const c of type) out.push(c.charCodeAt(0));
  out.push(...body, 0, 0, 0, 0);
  return out;
}

/** 2×2 opaque RGB PNG as raw bytes — what a fetch of the CDN asset returns. */
function pngBytes(): Uint8Array {
  const ihdr = [0, 0, 0, 2, 0, 0, 0, 2, 8, 2, 0, 0, 0];
  const scanlines = [0, 255, 0, 0, 0, 255, 0, 0, 0, 0, 255, 255, 255, 255];
  return Uint8Array.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ...pngChunk('IHDR', ihdr),
    ...pngChunk('IDAT', deflateSync(Uint8Array.from(scanlines))),
    ...pngChunk('IEND', []),
  ]);
}

const URL_IMG = 'https://cdn.example.test/avatar.png';

describe('external-URL PANEL-node images — the tree pass of `await export(…)`', () => {
  let container: HTMLElement;
  let diagram: DiagramInstance | undefined;
  const globals = globalThis as { fetch?: unknown };
  const realFetch = globals.fetch;

  const respond = (bytes: Uint8Array, mimeType = 'image/png') => ({
    ok: true,
    status: 200,
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    headers: { get: (name: string) => (name.toLowerCase() === 'content-type' ? mimeType : null) },
  });

  beforeEach(() => {
    container = makeContainer();
  });

  afterEach(() => {
    diagram?.dispose();
    diagram = undefined;
    container.remove();
    if (realFetch === undefined) delete globals.fetch;
    else globals.fetch = realFetch;
  });

  // =========================================================================
  // The tree pass itself
  // =========================================================================

  it('the sync export keeps the URL and NEVER fetches; the awaited export embeds the bytes', async () => {
    const fetched: string[] = [];
    globals.fetch = async (url: string) => {
      fetched.push(String(url));
      return respond(pngBytes());
    };
    diagram = createDiagram(container, { nodes: [P('erd', URL_IMG)] });

    // THE CONTROL — synchronous by contract, cannot fetch, keeps the reference.
    const sync = diagram.exportSvgString();
    expect(sync.svg).toContain(`href="${URL_IMG}"`);
    expect(fetched).toEqual([]); // the sync path must never touch the network

    const seen: string[] = [];
    const svg = await diagram.export('svg', { onWarnings: (w) => seen.push(...w) });

    expect(fetched).toEqual([URL_IMG]);
    expect(svg).not.toContain(URL_IMG); // the URL is GONE …
    expect(svg).toContain('href="data:image/png;base64,'); // … its bytes are IN the file
    expect(seen.filter((w) => /image/i.test(w))).toEqual([]); // nothing left to warn about
  });

  it('the PDF embeds the panel image as a real XObject — the fixture has no widget at all', async () => {
    globals.fetch = async () => respond(pngBytes());
    diagram = createDiagram(container, { nodes: [P('erd', URL_IMG)] });

    const seen: string[] = [];
    const href = await diagram.export('pdf', { onWarnings: (w) => seen.push(...w) });

    expect(href.startsWith('data:application/pdf;base64,')).toBe(true);
    const pdf = Buffer.from(href.split(',')[1], 'base64').toString('latin1');
    // The ONLY image anywhere in this board is the panel one — an XObject can have no
    // other source than the tree pass's fetch.
    expect(pdf).toContain('/Subtype /Image');
    expect(pdf).toMatch(/\/Im\d+ Do/);
    expect(seen.filter((w) => /image/i.test(w))).toEqual([]);
  });

  it('a panel ICON href is inlined too (the second tree emitter in panel.ts)', async () => {
    globals.fetch = async () => respond(pngBytes());
    diagram = createDiagram(container, {
      nodes: [
        {
          id: 'ic',
          position: { x: 0, y: 0 },
          size: { width: 200, height: 100 },
          metadata: { panel: { icon: { href: URL_IMG } } },
        },
      ],
    });

    const svg = await diagram.export('svg');
    expect(svg).not.toContain(URL_IMG);
    expect(svg).toContain('href="data:image/png;base64,');
  });

  // =========================================================================
  // Dedupe across BOTH kinds — one fetch per URL, tree and widget together
  // =========================================================================

  it('a URL referenced by BOTH a panel node and a widget is fetched exactly ONCE', async () => {
    const fetched: string[] = [];
    globals.fetch = async (url: string) => {
      fetched.push(String(url));
      return respond(pngBytes());
    };
    diagram = createDiagram(container, {
      nodes: [P('erd', URL_IMG), W('logo')],
      renderCustomNode: (_node: NodeModel, el: HTMLElement) => {
        const img = el.ownerDocument.createElement('img');
        img.setAttribute('src', URL_IMG);
        el.appendChild(img);
        el.getBoundingClientRect = box(el, 200, 120);
        img.getBoundingClientRect = box(img, 200, 120);
      },
    });

    const svg = await diagram.export('svg');

    expect(fetched).toEqual([URL_IMG]); // once — not once per kind
    expect(svg).not.toContain(URL_IMG); // and BOTH references were substituted
    expect(svg).toContain('href="data:image/png;base64,');
  });

  // =========================================================================
  // The tiers apply to tree images exactly as they do to widget images
  // =========================================================================

  it('a CORS-refused panel image falls back to ExportOptions.assetFetcher', async () => {
    globals.fetch = async () => {
      throw new TypeError('Failed to fetch');
    };
    const asked: string[] = [];
    const assetFetcher: AssetFetcher = async (url) => {
      asked.push(url);
      return { data: pngBytes(), mimeType: 'image/png' };
    };
    diagram = createDiagram(container, { nodes: [P('erd', URL_IMG)] });

    const svg = await diagram.export('svg', { assetFetcher });

    expect(asked).toEqual([URL_IMG]);
    expect(svg).not.toContain(URL_IMG);
    expect(svg).toContain('href="data:image/png;base64,');
  });

  it('every tier failing: the URL stays, and the residue warning names it and BOTH escape hatches', async () => {
    globals.fetch = async () => {
      throw new TypeError('Failed to fetch');
    };
    diagram = createDiagram(container, { nodes: [P('erd', URL_IMG)] });

    const seen: string[] = [];
    const svg = await diagram.export('svg', { onWarnings: (w) => seen.push(...w) });

    expect(svg).toContain(`href="${URL_IMG}"`); // broken-but-visible beats silently blanked
    const image = seen.filter((w) => /image/i.test(w)).join(' ');
    expect(image).toContain(URL_IMG); // names the URL that failed
    expect(image).toMatch(/CORS/);
    expect(image).toMatch(/assetFetcher/);
  });

  it('a board whose panel images are all data: URIs never constructs a fetch', async () => {
    const fetchSpy = jest.fn();
    globals.fetch = fetchSpy;
    const dataUri =
      'data:image/png;base64,' + Buffer.from(pngBytes()).toString('base64');
    diagram = createDiagram(container, { nodes: [P('erd', dataUri)] });

    await diagram.export('svg');

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // =========================================================================
  // The pre-resolved map — the seam itself, usable synchronously
  // =========================================================================

  it('ExportOptions.resolvedAssets substitutes SYNCHRONOUSLY in exportSvgString — zero network', () => {
    const fetchSpy = jest.fn();
    globals.fetch = fetchSpy;
    diagram = createDiagram(container, { nodes: [P('erd', URL_IMG)] });

    const dataUri = 'data:image/png;base64,' + Buffer.from(pngBytes()).toString('base64');
    const result = diagram.exportSvgString({
      resolvedAssets: new Map([[URL_IMG, dataUri]]),
    });

    expect(result.svg).not.toContain(URL_IMG);
    expect(result.svg).toContain('href="data:image/png;base64,');
    expect(fetchSpy).not.toHaveBeenCalled(); // pure substitution — sync stays network-free
  });

  it('ExportOptions.resolvedAssets reaches the sync PDF path too — the XObject appears', () => {
    diagram = createDiagram(container, { nodes: [P('erd', URL_IMG)] });

    const dataUri = 'data:image/png;base64,' + Buffer.from(pngBytes()).toString('base64');
    const result = diagram.exportPdf({ resolvedAssets: new Map([[URL_IMG, dataUri]]) });

    const pdf = Buffer.from(result.pdf).toString('latin1');
    expect(pdf).toContain('/Subtype /Image');
    expect(pdf).toMatch(/\/Im\d+ Do/);
  });

  it('a caller-supplied resolvedAssets entry is honoured by the async export and NOT re-fetched', async () => {
    const fetched: string[] = [];
    globals.fetch = async (url: string) => {
      fetched.push(String(url));
      return respond(pngBytes());
    };
    diagram = createDiagram(container, { nodes: [P('erd', URL_IMG)] });

    const dataUri = 'data:image/png;base64,' + Buffer.from(pngBytes()).toString('base64');
    const svg = await diagram.export('svg', {
      resolvedAssets: new Map([[URL_IMG, dataUri]]),
    });

    expect(fetched).toEqual([]); // the caller already had the bytes — trust them
    expect(svg).not.toContain(URL_IMG);
    expect(svg).toContain('href="data:image/png;base64,');
  });

  // =========================================================================
  // Determinism
  // =========================================================================

  it('with an injected fetcher and no environment fetch, two panel exports are byte-identical', async () => {
    delete globals.fetch;
    const assetFetcher: AssetFetcher = async () => ({ data: pngBytes(), mimeType: 'image/png' });
    diagram = createDiagram(container, { nodes: [P('erd', URL_IMG)] });

    const a = await diagram.export('svg', { assetFetcher });
    const b = await diagram.export('svg', { assetFetcher });

    expect(a).toContain('href="data:image/png;base64,');
    expect(a).toBe(b);
  });
});
