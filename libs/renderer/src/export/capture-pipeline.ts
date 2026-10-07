// THE ASYNC EXPORT PIPELINE — custom-node capture + external-image inlining — as
// functions any canvas can run over ITS OWN custom-node hosts.
//
// WHY THIS IS NOT INSIDE `createDiagram` ANY MORE
// -----------------------------------------------
// `SVGRenderer.export()` only serializes the VNode tree. A custom (HTML-layer) node is an
// empty `<g>` in that tree — its content lives in a host element that is a SIBLING of the
// SVG — and an external `<img src="https://…">` is a URL the renderer never fetches. The
// pipeline that closes both gaps used to be closures inside `createDiagram`, which meant
// only the JS canvas could run it: a framework canvas that renders its custom nodes itself
// (the Angular canvas renders `ng-template grafloriaNode` in its own HTML layer) called
// `renderer.export()` directly and exported blank widgets and bare URLs.
//
// So the pipeline is here, and the ONLY thing a canvas supplies is a
// {@link CustomNodeHostSource}: "here are my nodes, and here is the element each custom
// one painted into" — plus, optionally, how to mount a host that is not in the document,
// and what its painter said about itself. Everything else (scope, the serialized async
// capture, the image fetch and the warning ledger) is one implementation for every canvas.

import type { NodeModel } from '@grafloria/engine';
import type { Rectangle } from '../types/geometry.types';
import type { ExportFormat, ExportOptions } from '../types/renderer.interface';
import type { VNode } from '../types/vnode.types';
import type { SvgExportResult } from './svg-export';
import type { PdfExportResult } from './pdf/pdf-export';
import type { CustomNodeCapture } from './custom-nodes';
import { captureCustomNodeHost, stripResolvedImageWarnings } from './capture-host';
import { collectAssetUrls, fetchAssetsTiered, inlineAssets } from './assets';

/**
 * Where a canvas's custom nodes are painted — the one thing the pipeline cannot know.
 *
 * Only `getNodes` and `getHost` are required. The optional members exist for a canvas
 * that culls hosts or runs async painters (the JS canvas); a framework canvas whose hosts
 * are always in the document leaves them out.
 */
export interface CustomNodeHostSource {
  /** Every node, in MODEL order — captures come out in this order, so exports are stable. */
  getNodes(): readonly NodeModel[];
  /** The element this node's content is painted into, if it has one right now. */
  getHost(nodeId: string): HTMLElement | null | undefined;
  /**
   * Whether this node's widget can be in an export at all. Default:
   * `metadata.useHTMLLayer` is set. (The JS canvas also refuses an explicitly frozen
   * node, which the render pass of the same export omits.)
   */
  isExportable?(node: NodeModel): boolean;
  /** The world rect the capture is placed at. Default: `node.position` + `node.size`. */
  bounds?(node: NodeModel): Rectangle;
  /**
   * Make sure the hosts of these (in-scope) nodes exist and are laid out, and return
   * the undo. Called before every read. Default: nothing to mount.
   */
  materialize?(nodes: readonly NodeModel[]): () => void;
  /** A promise for a host whose painter has not finished — the async path waits for it. */
  pendingPaint?(nodeId: string): Promise<void> | undefined;
  /** A per-node caveat (a painter that threw, or is still painting), led into the capture's warning. */
  paintWarning?(nodeId: string, waited: boolean, timeoutMs: number): string | undefined;
  /** Hold these hosts in the document while an async capture waits; returns the release. */
  pin?(nodeIds: readonly string[]): () => void;
}

/** Default bound on waiting for an async painter. See ExportOptions.customNodeTimeout. */
export const DEFAULT_CUSTOM_NODE_TIMEOUT = 5000;

/** World bounds of a node — the rect both the culler and the capture work in. */
export const nodeWorldBounds = (node: NodeModel): Rectangle => ({
  x: node.position.x,
  y: node.position.y,
  width: node.size?.width ?? 0,
  height: node.size?.height ?? 0,
});

/**
 * Which nodes this export will actually contain.
 *
 * Materializing is the expensive half — it runs a painter — so it is bounded by the
 * export's own scope rather than mounting a 300-widget board to capture the three
 * widgets `includeIds` asked for. The predicates mirror what the renderer resolves
 * `ids` to (`SVGRenderer.selectedIds` reads exactly this `state.selected`), so what is
 * mounted and what survives `filterCaptures` are the same set.
 */
export function exportScopeFilter(exportOptions?: ExportOptions): (node: NodeModel) => boolean {
  if (exportOptions?.scope === 'selection') return (node) => node.state?.selected === true;
  if (exportOptions?.includeIds === undefined) return () => true;
  const ids = new Set(exportOptions.includeIds);
  return (node) => ids.has(node.id);
}

/** The custom nodes an export with this scope will contain. */
function exportableNodes(
  source: CustomNodeHostSource,
  needed: (node: NodeModel) => boolean
): NodeModel[] {
  const exportable = source.isExportable ?? ((node: NodeModel) => !!node.getMetadata('useHTMLLayer'));
  return source.getNodes().filter((node) => exportable(node) && needed(node));
}

/** The DOM read, shared by both capture paths so they cannot disagree about a host. */
function readHosts(
  source: CustomNodeHostSource,
  waited: boolean,
  timeoutMs: number
): CustomNodeCapture[] {
  const bounds = source.bounds ?? nodeWorldBounds;
  const captures: CustomNodeCapture[] = [];
  // Model order, not mount order: two runs of the same board must not differ in byte order.
  for (const node of source.getNodes()) {
    const host = source.getHost(node.id);
    if (!host) continue;
    const capture = captureCustomNodeHost(node.id, bounds(node), host);
    // A still-painting caveat is the CAUSE and leads; the capture's own fidelity caveats
    // (an image that PDF cannot draw, an inset shadow that was skipped) follow it.
    const paint = source.paintWarning?.(node.id, waited, timeoutMs);
    const warning = [paint, capture.warning].filter(Boolean).join(' ');
    captures.push(warning ? { ...capture, warning } : capture);
  }
  return captures;
}

/**
 * THE SYNCHRONOUS CAPTURE — materialize → read → restore, with no suspension point.
 *
 * The DOM read happens HERE, once, and produces plain data — `exportSvg` stays pure,
 * DOM-free and deterministic. A painter that defers its paint has not drawn anything by
 * the time this looks; `paintWarning` says so rather than exporting a silent blank.
 */
export function captureCustomNodes(
  source: CustomNodeHostSource,
  needed: (node: NodeModel) => boolean = () => true
): CustomNodeCapture[] {
  const restore = source.materialize?.(exportableNodes(source, needed));
  try {
    return readHosts(source, false, 0);
  } finally {
    // `finally`: a capture that threw must not leave a board's worth of hosts mounted.
    restore?.();
  }
}

/** Wait for every tracked paint, or for the deadline — whichever comes first. */
async function settle(waits: Promise<void>[], timeoutMs: number): Promise<void> {
  if (!(timeoutMs > 0)) return; // 0 (or nonsense) means "do not wait"; still reported
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, timeoutMs);
  });
  try {
    // A source's pending promises must never reject (the JS canvas wraps them), so this
    // races two resolutions. A rejecting painter is recorded by the source, not propagated.
    await Promise.race([Promise.all(waits), deadline]);
  } finally {
    // Without this a fast export still holds the event loop open for the full deadline.
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * THE ASYNC CAPTURE — the same boundary, allowed to wait for a painter that said it was
 * not finished.
 *
 * THE SIGNAL IS THE PROMISE (`pendingPaint`), and nothing else — never a fixed sleep.
 * `timeoutMs` is a safety net: on expiry the export takes the host as it stands and
 * `paintWarning(…, waited = true)` reports it. If nothing in scope is pending, this runs
 * materialize → read → restore with no suspension point at all, i.e. the identical
 * sequence {@link captureCustomNodes} performs, so an all-sync board exports the same
 * bytes through both paths.
 */
export async function captureCustomNodesAsync(
  source: CustomNodeHostSource,
  needed: (node: NodeModel) => boolean,
  timeoutMs: number
): Promise<CustomNodeCapture[]> {
  const inScope = exportableNodes(source, needed);
  const release = source.pin?.(inScope.map((node) => node.id));
  try {
    const restore = source.materialize?.(inScope);
    try {
      // Only NOW is the pending set knowable: materializing runs first mounts, and a
      // first mount is exactly where a painter announces that it is async.
      const waits = inScope
        .map((node) => source.pendingPaint?.(node.id))
        .filter((p): p is Promise<void> => p !== undefined);

      if (waits.length === 0) return readHosts(source, false, timeoutMs); // ← atomic
      await settle(waits, timeoutMs);
      return readHosts(source, true, timeoutMs);
    } finally {
      restore?.();
    }
  } finally {
    release?.();
  }
}

/** The two capture entry points a canvas exposes, bound to its host source. */
export interface CustomNodeCapturer {
  /** Synchronous: add `customNodes` captured now. A caller's own `customNodes` wins. */
  withCustomNodes(exportOptions?: ExportOptions): ExportOptions;
  /** Async: wait for pending painters (bounded), then capture. A caller's own `customNodes` wins. */
  withCustomNodesAsync(exportOptions?: ExportOptions): Promise<ExportOptions>;
}

/**
 * Bind the capture to one canvas's hosts.
 *
 * ONE async capture at a time per canvas: two exports in flight would otherwise
 * interleave their materialize/restore pairs — the first's restore tearing down a host
 * the second is still waiting to read.
 */
export function createCustomNodeCapturer(source: CustomNodeHostSource): CustomNodeCapturer {
  let captureQueue: Promise<unknown> = Promise.resolve();
  const serializeCapture = <T>(run: () => Promise<T>): Promise<T> => {
    const result = captureQueue.then(run, run);
    captureQueue = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  };

  return {
    withCustomNodes(exportOptions) {
      // `customNodes: []` means "export the diagram without its widgets".
      if (exportOptions?.customNodes !== undefined) return exportOptions;
      const customNodes = captureCustomNodes(source, exportScopeFilter(exportOptions));
      if (customNodes.length === 0) return exportOptions ?? {};
      return { ...exportOptions, customNodes };
    },

    async withCustomNodesAsync(exportOptions) {
      // The caller's own captures win, and short-circuit the wait entirely.
      if (exportOptions?.customNodes !== undefined) return exportOptions;
      const customNodes = await serializeCapture(() =>
        captureCustomNodesAsync(
          source,
          exportScopeFilter(exportOptions),
          exportOptions?.customNodeTimeout ?? DEFAULT_CUSTOM_NODE_TIMEOUT
        )
      );
      if (customNodes.length === 0) return exportOptions ?? {};
      return { ...exportOptions, customNodes };
    },
  };
}

/** What image inlining needs from the renderer: the URLs its own tree references. */
export interface ExportImageUrlSource {
  collectExportImageUrls(options?: ExportOptions): string[];
}

/**
 * EXTERNAL-URL IMAGES → embedded bytes, for the async export only.
 *
 * A widget's `<img src="https://…">` captures as `<image href="https://…">`, which an
 * SVG renders online and a PDF cannot draw at all. The export runs in a browser, which
 * can usually fetch that URL itself — so every external reference is fetched and swapped
 * for a `data:` URI, three tiers (see `fetchAssetsTiered`): environment fetch, then
 * `ExportOptions.assetFetcher`, then the accurate warning.
 *
 * TWO KINDS OF IMAGE, ONE PASS. Widget captures (`exportOptions.customNodes`) are
 * substituted here directly. A panel image painted by the RENDERER'S OWN tree is built
 * inside the synchronous export, so the renderer enumerates those URLs up front
 * (`collectExportImageUrls`), the fetch covers the UNION (one fetch per URL), and the
 * resolved map rides down `ExportOptions.resolvedAssets`. A URL the caller pre-resolved
 * is trusted, never fetched.
 *
 * THE WARNING LEDGER IS RECONCILED, both ways: a capture whose images were all embedded
 * loses its capture-time "EXTERNAL URL" caveat; a URL every tier failed on keeps the
 * reference and gains a warning naming the URL and the reason — a tree image's failure
 * goes to `onWarnings`.
 *
 * Run it AFTER the custom-node capture, so the captured images are in the options.
 */
export async function withInlinedImages(
  renderer: ExportImageUrlSource,
  exportOptions: ExportOptions
): Promise<ExportOptions> {
  const captures = exportOptions.customNodes ?? [];

  // The union — widget-capture URLs first, then the renderer's tree — deduplicated in a
  // STABLE order for determinism. One URL, one fetch.
  const roots = new Map<CustomNodeCapture, VNode>();
  const urls: string[] = [];
  const seen = new Set<string>();
  const add = (found: readonly string[]): void => {
    for (const url of found) {
      if (!seen.has(url)) {
        seen.add(url);
        urls.push(url);
      }
    }
  };
  for (const capture of captures) {
    if (!capture.content || capture.content.length === 0) continue;
    const root: VNode = { type: 'g', props: {}, children: [...capture.content] };
    const found = collectAssetUrls(root);
    if (found.length === 0) continue;
    roots.set(capture, root);
    add(found);
  }
  const treeUrls = renderer.collectExportImageUrls(exportOptions);
  add(treeUrls);

  if (urls.length === 0) return exportOptions; // nothing external — identical options out

  // A URL the caller already resolved is bytes we hold — never fetch it again.
  const preResolved = exportOptions.resolvedAssets;
  const toFetch = preResolved ? urls.filter((url) => !preResolved.has(url)) : urls;

  const { byUrl, failures } =
    toFetch.length > 0
      ? await fetchAssetsTiered(toFetch, {
          fetcher: exportOptions.assetFetcher,
          maxBytes: exportOptions.assetMaxBytes,
          timeoutMs: exportOptions.assetTimeout,
        })
      : { byUrl: new Map<string, string>(), failures: new Map<string, string>() };
  if (preResolved) {
    for (const [url, uri] of preResolved) byUrl.set(url, uri);
  }

  const customNodes = captures.map((capture): CustomNodeCapture => {
    const root = roots.get(capture);
    if (!root) return capture;

    const inlined = inlineAssets(root, byUrl);
    const remaining = collectAssetUrls(inlined);

    let warning = capture.warning;
    if (remaining.length === 0) {
      // Every external image is now bytes in the file — the capture-time caveat
      // (written for the sync paths, which cannot fetch) is no longer true here.
      warning = stripResolvedImageWarnings(warning);
    } else {
      const residue = remaining
        .map(
          (url) =>
            `widget image "${url}" could not be embedded: ${failures.get(url) ?? 'unknown failure'}. ` +
            'The reference is left in the file (an SVG still renders it online); it will be ' +
            'MISSING from a PDF export.'
        )
        .join(' ');
      warning = [warning, residue].filter(Boolean).join(' ');
    }

    return { ...capture, content: inlined.children ?? [], warning };
  });

  const out: ExportOptions = { ...exportOptions };
  if (exportOptions.customNodes !== undefined) out.customNodes = customNodes;
  // The resolved map rides DOWN the same options object: the sync export applies it to
  // the renderer's tree with the pure `inlineAssets`.
  if (byUrl.size > 0) out.resolvedAssets = byUrl;

  // A TREE image's failure has no capture to carry its warning, so it goes to the
  // export's own fidelity channel.
  const treeResidue = treeUrls
    .filter((url) => !byUrl.has(url))
    .map(
      (url) =>
        `diagram image "${url}" could not be embedded: ${failures.get(url) ?? 'unknown failure'}. ` +
        'The reference is left in the file (an SVG still renders it online); it will be ' +
        'MISSING from a PDF export.'
    );
  if (treeResidue.length > 0) {
    const original = exportOptions.onWarnings;
    out.onWarnings = (warnings) => original?.([...warnings, ...treeResidue]);
  }

  return out;
}

/** What the full pipeline needs from the renderer. */
export interface PipelineRenderer extends ExportImageUrlSource {
  export(format?: ExportFormat, options?: ExportOptions): Promise<string>;
  exportSvgString(options?: ExportOptions): SvgExportResult;
  exportPdf(options?: ExportOptions): PdfExportResult;
}

/** A canvas's three export entry points, with its custom nodes in them. */
export interface ExportPipeline {
  /**
   * The full async pipeline: wait for async painters (bounded by `customNodeTimeout`),
   * capture every in-scope custom node, fetch and embed external images, then export.
   */
  export(format?: ExportFormat, options?: ExportOptions): Promise<string>;
  /** Synchronous SVG: custom nodes captured as they stand now; no fetch (only `resolvedAssets`). */
  exportSvgString(options?: ExportOptions): SvgExportResult;
  /** Synchronous vector PDF: custom nodes captured as they stand now; no fetch. */
  exportPdf(options?: ExportOptions): PdfExportResult;
}

/** Bind the whole pipeline to one renderer and one canvas's custom-node hosts. */
export function createExportPipeline(
  renderer: PipelineRenderer,
  source: CustomNodeHostSource
): ExportPipeline {
  const capturer = createCustomNodeCapturer(source);
  return {
    export: async (format, options) =>
      renderer.export(
        format,
        await withInlinedImages(renderer, await capturer.withCustomNodesAsync(options))
      ),
    exportSvgString: (options) => renderer.exportSvgString(capturer.withCustomNodes(options)),
    exportPdf: (options) => renderer.exportPdf(capturer.withCustomNodes(options)),
  };
}
