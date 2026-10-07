// THE EXTRACTED EXPORT PIPELINE — run over a host source that is NOT `createDiagram`.
//
// The point of the extraction is that a canvas which paints its custom nodes itself
// (the Angular canvas's HTML layer) gets the same capture + image inlining the JS canvas
// has. So these specs drive the pipeline with a bare SVGRenderer and a hand-made host
// map — no createDiagram anywhere — and check each contract the JS canvas relied on:
// scope, model order, materialize/restore, waiting for a pending paint, pinning, and
// external images arriving as data: URIs.

import { DiagramEngine, NodeModel } from '@grafloria/engine';
import { SVGRenderer } from '../svg/svg-renderer';
import {
  captureCustomNodes,
  captureCustomNodesAsync,
  createCustomNodeCapturer,
  createExportPipeline,
  exportScopeFilter,
  withInlinedImages,
  type CustomNodeHostSource,
} from './capture-pipeline';
import type { CustomNodeCapture } from './custom-nodes';
import type { AssetFetcher } from './assets';

const URL_IMG = 'https://cdn.example.test/card.png';
// 1×1 transparent PNG — what the "CDN" serves.
const PNG_1x1 = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYGD4DwABBAEAwS2OUAAAAABJRU5ErkJggg==',
    'base64'
  )
);
const fetcher: AssetFetcher = async () => ({ data: PNG_1x1, mimeType: 'image/png' });

const rect = (w: number, h: number) => () =>
  ({ left: 0, top: 0, width: w, height: h, right: w, bottom: h, x: 0, y: 0 }) as DOMRect;

/** A host the way any canvas paints one: a div with a laid-out box, holding an <img>. */
function paintHost(id: string, withImage = true): HTMLElement {
  const host = document.createElement('div');
  host.setAttribute('data-node-id', id);
  host.style.background = 'rgb(255, 0, 0)';
  host.getBoundingClientRect = rect(160, 80);
  if (withImage) {
    const img = document.createElement('img');
    img.setAttribute('src', URL_IMG);
    img.getBoundingClientRect = rect(160, 80);
    host.appendChild(img);
  }
  document.body.appendChild(host);
  return host;
}

function customNode(id: string, x = 0): NodeModel {
  const node = new NodeModel({ id, position: { x, y: 0 }, size: { width: 160, height: 80 } } as never);
  node.setMetadata('useHTMLLayer', true);
  return node;
}

describe('capture-pipeline — the export pipeline over any canvas’s hosts', () => {
  let engine: DiagramEngine;
  let renderer: SVGRenderer;
  let hosts: Map<string, HTMLElement>;
  let source: CustomNodeHostSource;

  beforeEach(() => {
    engine = new DiagramEngine();
    const diagram = engine.createDiagram('t')!;
    diagram.addNode(customNode('b', 200));
    diagram.addNode(customNode('a', 0));
    const plain = new NodeModel({ id: 'plain', position: { x: 400, y: 0 }, size: { width: 80, height: 40 } } as never);
    diagram.addNode(plain);
    renderer = new SVGRenderer(engine);
    hosts = new Map([
      ['a', paintHost('a')],
      ['b', paintHost('b', false)],
    ]);
    source = {
      getNodes: () => engine.getDiagram()!.getNodes(),
      getHost: (id) => hosts.get(id),
    };
  });

  afterEach(() => {
    renderer.dispose();
    for (const host of hosts.values()) host.remove();
  });

  it('captures every custom host, in MODEL order, at the node’s world rect', () => {
    const captures = captureCustomNodes(source);
    expect(captures.map((c) => c.id)).toEqual(['b', 'a']); // model order, not map order
    expect(captures.every((c) => c.fidelity === 'vector')).toBe(true);
    expect(captures[0].rect).toEqual({ x: 200, y: 0, width: 160, height: 80 });
  });

  it('an element marked data-grafloria-export="ignore" stays out of the capture', () => {
    const chrome = document.createElement('div');
    chrome.setAttribute('data-grafloria-export', 'ignore');
    chrome.style.background = 'rgb(1, 2, 3)';
    chrome.getBoundingClientRect = rect(8, 8);
    hosts.get('b')!.appendChild(chrome);
    expect(JSON.stringify(captureCustomNodes(source))).not.toContain('rgb(1, 2, 3)');

    chrome.removeAttribute('data-grafloria-export'); // control: unmarked, it IS captured
    expect(JSON.stringify(captureCustomNodes(source))).toContain('rgb(1, 2, 3)');
  });

  it('materializes only the in-scope exportable nodes, and always restores', () => {
    const asked: string[][] = [];
    let restored = 0;
    const scoped: CustomNodeHostSource = {
      ...source,
      materialize: (nodes) => {
        asked.push(nodes.map((n) => n.id));
        return () => restored++;
      },
    };
    captureCustomNodes(scoped, exportScopeFilter({ includeIds: ['a', 'plain'] }));
    expect(asked).toEqual([['a']]); // 'plain' is not a custom node; 'b' is out of scope
    expect(restored).toBe(1);
  });

  it('the async capture waits for a pending paint, pinned, then reads what it drew', async () => {
    let resolvePaint!: () => void;
    const paint = new Promise<void>((r) => (resolvePaint = r));
    const log: string[] = [];
    const late = hosts.get('b')!;
    const asyncSource: CustomNodeHostSource = {
      ...source,
      pendingPaint: (id) => (id === 'b' ? paint : undefined),
      pin: (ids) => {
        log.push(`pin ${ids.join(',')}`);
        return () => log.push('release');
      },
      materialize: () => {
        log.push('materialize');
        return () => log.push('restore');
      },
    };

    const pending = captureCustomNodesAsync(asyncSource, () => true, 5000);
    // The painter finishes AFTER the export started: its text only exists now.
    late.appendChild(document.createTextNode('LATE-PAINT'));
    resolvePaint();
    const captures = await pending;

    expect(log).toEqual(['pin b,a', 'materialize', 'restore', 'release']);
    expect(JSON.stringify(captures.find((c) => c.id === 'b'))).toContain('LATE-PAINT');
  });

  it('a painter that never settles is reported (waited=true) at the deadline, not hung on', async () => {
    const asyncSource: CustomNodeHostSource = {
      ...source,
      pendingPaint: (id) => (id === 'a' ? new Promise<void>(() => undefined) : undefined),
      paintWarning: (id, waited, ms) => (id === 'a' ? `${id} waited=${waited} ${ms}ms` : undefined),
    };
    const captures = await captureCustomNodesAsync(asyncSource, () => true, 20);
    expect(captures.find((c) => c.id === 'a')!.warning).toContain('a waited=true 20ms');
  });

  it('a caller’s own customNodes always win, through both entry points', async () => {
    const capturer = createCustomNodeCapturer(source);
    const mine: CustomNodeCapture[] = [];
    expect(capturer.withCustomNodes({ customNodes: mine }).customNodes).toBe(mine);
    expect((await capturer.withCustomNodesAsync({ customNodes: mine })).customNodes).toBe(mine);
  });

  it('withInlinedImages swaps a captured widget image URL for its data: URI', async () => {
    const options = createCustomNodeCapturer(source).withCustomNodes({});
    expect(JSON.stringify(options.customNodes)).toContain(URL_IMG);

    const inlined = await withInlinedImages(renderer, { ...options, assetFetcher: fetcher });
    const json = JSON.stringify(inlined.customNodes);
    expect(json).not.toContain(URL_IMG);
    expect(json).toContain('data:image/png;base64,');
    expect(inlined.resolvedAssets?.get(URL_IMG)).toMatch(/^data:image\/png;base64,/);
  });

  it('createExportPipeline: export() embeds the widget and its image; the sync SVG captures, never fetches', async () => {
    const globals = globalThis as { fetch?: unknown };
    const realFetch = globals.fetch;
    const fetched: string[] = [];
    globals.fetch = async (url: string) => {
      fetched.push(String(url));
      throw new TypeError('Failed to fetch'); // CORS refusal → tier 2 (assetFetcher)
    };
    try {
      const pipeline = createExportPipeline(renderer, source);

      const sync = pipeline.exportSvgString();
      expect(fetched).toEqual([]);
      expect(sync.svg).toContain(`href="${URL_IMG}"`); // captured, not fetched
      expect(sync.svg).toContain('rgb(255, 0, 0)'); // the host's box is in the file

      const svg = await pipeline.export('svg', { assetFetcher: fetcher });
      expect(svg).not.toContain(URL_IMG);
      expect(svg).toContain('href="data:image/png;base64,');
      expect(svg).toContain('rgb(255, 0, 0)');

      // CONTROL: the bare renderer — what the Angular canvas used to call — has neither.
      const bare = await renderer.export('svg', { assetFetcher: fetcher });
      expect(bare).not.toContain('data:image/png');
      expect(bare).not.toContain('rgb(255, 0, 0)');
    } finally {
      if (realFetch === undefined) delete globals.fetch;
      else globals.fetch = realFetch;
    }
  });
});
