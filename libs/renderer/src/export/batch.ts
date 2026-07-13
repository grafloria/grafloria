// Batch / server export (Card 6).
//
// The whole pipeline as a framework-agnostic function: persisted documents in, exported
// artifacts out, in plain Node, with no browser and no Chromium. This is what a
// thumbnail worker, a nightly "render every diagram in the workspace" job, or a
// `POST /export` endpoint actually calls.
//
// It leans on a property the renderer already had and wave 4 proved: `render()` is pure
// VNode production with no DOM, and the serializer turns that tree into a file. So the
// SAME code that draws the live canvas draws the server's PNG — there is no second
// rendering path to drift.
//
// THREE THINGS A BATCH MUST GET RIGHT, and does here:
//
//  1. ONE BAD DOCUMENT DOES NOT KILL THE RUN. A batch of 500 diagrams where #237 has a
//     corrupt link must return 499 artifacts and one error, not throw on the way past
//     #237 and lose the work. Failures are per-job values, not exceptions.
//  2. BOUNDED CONCURRENCY. Rasterizing is memory-hungry (a 4000×4000 RGBA buffer is
//     64MB); firing 500 at once is how a worker gets OOM-killed. Default 4.
//  3. NO LEAKS. Every job builds an engine + renderer and disposes them, whatever
//     happens — otherwise a long-running worker's listeners accumulate until it dies.

import { DiagramEngine, DiagramSerializer } from '@grafloria/engine';
import type { DiagramDocumentEnvelope, SerializedDiagramData } from '@grafloria/engine';
import { SVGRenderer } from '../svg/svg-renderer';
import type { ExportFormat, ExportOptions, SVGRendererConfig } from '../types/renderer.interface';
import type { Theme } from '../types/theme.types';

/** A document to export: the engine's envelope, or the flat serialized form. */
export type BatchDocument = SerializedDiagramData | DiagramDocumentEnvelope;

export interface BatchJob {
  /** Echoed back on the result, so a caller can correlate without relying on order. */
  id: string;
  document: BatchDocument;
  /** Default `'svg'` — the only format that needs no rasterizer at all. */
  format?: ExportFormat;
  /** Merged over the batch-wide options. */
  options?: ExportOptions;
}

export interface BatchResult {
  id: string;
  format: ExportFormat;
  /** The artifact: an SVG string, or a `data:` URL for a raster. Absent when `error` is set. */
  output?: string;
  /** Fidelity caveats (foreignObject, unresolved theme vars, a clamped size). */
  warnings: string[];
  /** Set when THIS job failed. The rest of the batch still ran. */
  error?: Error;
}

export interface BatchOptions {
  /** Applied to every job; a job's own `options` win. */
  options?: ExportOptions;
  /** Theme for every job. */
  theme?: Theme;
  /** Renderer config for every job. */
  rendererConfig?: SVGRendererConfig;
  /**
   * How many jobs run at once. Default 4.
   *
   * Not unbounded: a rasterized 4000×4000 RGBA frame is ~64MB, so a few hundred in
   * flight is an OOM, not a speedup.
   */
  concurrency?: number;
  /** Called as each job settles — for a progress bar or a log line. */
  onProgress?: (done: number, total: number, result: BatchResult) => void;
}

/**
 * Export many documents. Never throws for a job-level failure — a failed job comes back
 * with `error` set and the batch keeps going.
 *
 * Results are returned IN INPUT ORDER regardless of the order they finish in, because a
 * caller zipping results back onto its own list should not have to think about the pool.
 */
export async function exportBatch(jobs: BatchJob[], options: BatchOptions = {}): Promise<BatchResult[]> {
  const results = new Array<BatchResult>(jobs.length);
  const concurrency = Math.max(1, options.concurrency ?? 4);

  let cursor = 0;
  let done = 0;

  const worker = async (): Promise<void> => {
    for (;;) {
      const index = cursor++;
      if (index >= jobs.length) return;

      const result = await runJob(jobs[index], options);
      results[index] = result;
      options.onProgress?.(++done, jobs.length, result);
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, worker));
  return results;
}

/** One document → one artifact. Every failure is caught and returned, not thrown. */
async function runJob(job: BatchJob, batch: BatchOptions): Promise<BatchResult> {
  const format = job.format ?? 'svg';
  let engine: DiagramEngine | undefined;
  let renderer: SVGRenderer | undefined;

  try {
    const diagram = new DiagramSerializer().deserialize(job.document as never);

    engine = new DiagramEngine();
    engine.setDiagram(diagram);

    renderer = new SVGRenderer(engine, batch.rendererConfig ?? {});
    if (batch.theme) renderer.setTheme(batch.theme);

    const merged: ExportOptions = { ...batch.options, ...job.options };

    // Take the warnings from the SVG pass — `IRenderer.export` returns a bare string and
    // has nowhere to put them, and silently dropping "your foreignObject is not in this
    // file" is exactly the kind of quiet fidelity loss a server batch must not do.
    const warnings = renderer.exportSvgString(merged).warnings;
    const output = await renderer.export(format, merged);

    return { id: job.id, format, output, warnings };
  } catch (cause) {
    return {
      id: job.id,
      format,
      warnings: [],
      error: cause instanceof Error ? cause : new Error(String(cause)),
    };
  } finally {
    // Whatever happened: give the listeners back. A worker that leaks one engine per
    // document dies a few thousand documents in.
    renderer?.dispose();
    engine?.destroy();
  }
}
