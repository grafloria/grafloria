// EXTERNAL-URL WIDGET IMAGES REACH THE PDF — client-side, three tiers.
//
// THE GAP
// -------
// A widget holding `<img src="https://cdn/…">` captured as `<image href="https://cdn/…">`
// and the PDF writer (correctly) refused it: a PDF cannot fetch a URL. But `export()` is
// async and RUNS IN A BROWSER — the export itself can fetch the bytes and hand the writer
// the data: URI it already embeds (b2854b0a1). So:
//
//   tier 1  the environment's own fetch — same-origin, or a server that allows CORS
//   tier 2  ExportOptions.assetFetcher — the embedding app's proxy, when CORS refuses
//   tier 3  the residue: the accurate warning, now naming both escape hatches
//
// WHAT EVERY TEST HERE HAS TO SURVIVE
// -----------------------------------
// "the file contains data:image/png" is a weak tooth when any OTHER fixture image could
// contribute it — so every fixture here has exactly ONE image, referenced by URL only,
// and the assertions check that THE URL is gone and ITS bytes arrived. The sync export
// taken at the same moment is the control: it must keep the URL and the warning.

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

const W = (id: string) => ({
  id,
  position: { x: 0, y: 0 },
  size: { width: 200, height: 120 },
  custom: true,
});

// -- a REAL (strict-parser-approved) PNG, the same builder the PDF specs trust --------
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

const URL_IMG = 'https://cdn.example.test/logo.png';

describe('external-URL widget images — `await export(…)` fetches and embeds them', () => {
  let container: HTMLElement;
  let diagram: DiagramInstance | undefined;
  const globals = globalThis as { fetch?: unknown };
  const realFetch = globals.fetch;

  /** The widget: exactly one <img>, referenced by URL — the only possible image source. */
  const imgPainter = (src: string) => (_node: NodeModel, el: HTMLElement) => {
    const img = el.ownerDocument.createElement('img');
    img.setAttribute('src', src);
    el.appendChild(img);
    el.getBoundingClientRect = box(el, 200, 120);
    img.getBoundingClientRect = box(img, 200, 120);
  };

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
  // TIER 1 — the environment's own fetch
  // =========================================================================

  it('the sync export keeps the URL and warns; the awaited export embeds the bytes and does not', async () => {
    const fetched: string[] = [];
    globals.fetch = async (url: string) => {
      fetched.push(String(url));
      return respond(pngBytes());
    };
    diagram = createDiagram(container, { nodes: [W('logo')], renderCustomNode: imgPainter(URL_IMG) });

    // THE CONTROL — synchronous by contract, cannot fetch, says so.
    const sync = diagram.exportSvgString();
    expect(sync.svg).toContain(`href="${URL_IMG}"`);
    expect(sync.warnings.some((w) => /EXTERNAL URL/.test(w))).toBe(true);
    expect(fetched).toEqual([]); // the sync path must never touch the network

    const seen: string[] = [];
    const svg = await diagram.export('svg', { onWarnings: (w) => seen.push(...w) });

    expect(fetched).toEqual([URL_IMG]);
    expect(svg).not.toContain(URL_IMG); // the URL is GONE …
    expect(svg).toContain('href="data:image/png;base64,'); // … its bytes are IN the file
    expect(seen.filter((w) => /image/i.test(w))).toEqual([]); // and nothing left to warn about
  });

  it('the PDF path embeds the fetched image as a real XObject', async () => {
    globals.fetch = async () => respond(pngBytes());
    diagram = createDiagram(container, { nodes: [W('logo')], renderCustomNode: imgPainter(URL_IMG) });

    const seen: string[] = [];
    const href = await diagram.export('pdf', { onWarnings: (w) => seen.push(...w) });

    expect(href.startsWith('data:application/pdf;base64,')).toBe(true);
    const pdf = Buffer.from(href.split(',')[1], 'base64').toString('latin1');
    // The ONLY image in the fixture is the URL one — an XObject can have no other source.
    expect(pdf).toContain('/Subtype /Image');
    expect(pdf).toMatch(/\/Im\d+ Do/);
    expect(seen.filter((w) => /image/i.test(w))).toEqual([]);
  });

  // =========================================================================
  // TIER 2 — the caller's assetFetcher when CORS refuses
  // =========================================================================

  it('a CORS-refused fetch falls back to ExportOptions.assetFetcher', async () => {
    globals.fetch = async () => {
      throw new TypeError('Failed to fetch'); // what a browser CORS refusal looks like
    };
    const asked: string[] = [];
    const assetFetcher: AssetFetcher = async (url) => {
      asked.push(url);
      return { data: pngBytes(), mimeType: 'image/png' };
    };
    diagram = createDiagram(container, { nodes: [W('logo')], renderCustomNode: imgPainter(URL_IMG) });

    const seen: string[] = [];
    const svg = await diagram.export('svg', { assetFetcher, onWarnings: (w) => seen.push(...w) });

    expect(asked).toEqual([URL_IMG]);
    expect(svg).not.toContain(URL_IMG);
    expect(svg).toContain('href="data:image/png;base64,');
    expect(seen.filter((w) => /image/i.test(w))).toEqual([]);
  });

  // =========================================================================
  // TIER 3 — the residue keeps the accurate warning, now with the escape hatches
  // =========================================================================

  it('no CORS and no fetcher: the URL stays, and the warning names BOTH escape hatches', async () => {
    globals.fetch = async () => {
      throw new TypeError('Failed to fetch');
    };
    diagram = createDiagram(container, { nodes: [W('logo')], renderCustomNode: imgPainter(URL_IMG) });

    const seen: string[] = [];
    const svg = await diagram.export('svg', { onWarnings: (w) => seen.push(...w) });

    expect(svg).toContain(`href="${URL_IMG}"`); // broken-but-visible beats silently blanked
    const image = seen.filter((w) => /image/i.test(w)).join(' ');
    expect(image).toContain(URL_IMG); // names the URL that failed
    expect(image).toMatch(/CORS/);
    expect(image).toMatch(/assetFetcher/);
  });

  it('an oversized image is refused by the cap and reported, not embedded', async () => {
    globals.fetch = async () => respond(new Uint8Array(4096));
    diagram = createDiagram(container, { nodes: [W('logo')], renderCustomNode: imgPainter(URL_IMG) });

    const seen: string[] = [];
    const svg = await diagram.export('svg', {
      assetMaxBytes: 1024,
      onWarnings: (w) => seen.push(...w),
    });

    expect(svg).toContain(`href="${URL_IMG}"`);
    expect(seen.join(' ')).toMatch(/4096 bytes.*1024-byte cap/);
  });

  it('a widget whose image failed still exports the rest of the board', async () => {
    globals.fetch = async (url: string) => {
      if (String(url).includes('dead')) throw new TypeError('Failed to fetch');
      return respond(pngBytes());
    };
    diagram = createDiagram(container, {
      nodes: [
        { ...W('ok'), position: { x: 0, y: 0 } },
        { ...W('broken'), id: 'broken', position: { x: 300, y: 0 } },
      ],
      renderCustomNode: (node: NodeModel, el: HTMLElement) =>
        imgPainter(node.id === 'broken' ? 'https://cdn.example.test/dead.png' : URL_IMG)(node, el),
    });

    const svg = await diagram.export('svg');

    expect(svg).toContain('href="data:image/png;base64,'); // the good one embedded …
    expect(svg).toContain('https://cdn.example.test/dead.png'); // … the dead one left visible
  });

  // =========================================================================
  // DETERMINISM — inject the fetcher, get identical bytes
  // =========================================================================

  it('with an injected fetcher and no environment fetch, two exports are byte-identical', async () => {
    delete globals.fetch;
    const assetFetcher: AssetFetcher = async () => ({ data: pngBytes(), mimeType: 'image/png' });
    diagram = createDiagram(container, { nodes: [W('logo')], renderCustomNode: imgPainter(URL_IMG) });

    const a = await diagram.export('svg', { assetFetcher });
    const b = await diagram.export('svg', { assetFetcher });

    expect(a).toContain('href="data:image/png;base64,');
    expect(a).toBe(b);
  });

  it('a board with NO external images never constructs a fetch at all', async () => {
    const fetchSpy = jest.fn();
    globals.fetch = fetchSpy;
    diagram = createDiagram(container, {
      nodes: [W('plain')],
      renderCustomNode: (_node: NodeModel, el: HTMLElement) => {
        const inner = el.ownerDocument.createElement('div');
        inner.textContent = 'no images here';
        el.appendChild(inner);
        el.getBoundingClientRect = box(el, 200, 120);
        inner.getBoundingClientRect = box(inner, 200, 40);
      },
    });

    await diagram.export('svg');

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
