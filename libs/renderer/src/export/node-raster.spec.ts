// Card 6 — the headless Node rasterizer and the batch pipeline.
//
// The backends are tested with INJECTED fakes rather than the real native modules: that
// is the point of taking the module as an argument. It keeps resvg/sharp optional (a
// browser build must never pull a 40MB native binary for a code path it cannot call) and
// it means CI proves the ADAPTER — the scale maths, the format refusals, the alpha
// flattening — without a platform-specific install.

import { DiagramEngine, DiagramModel, DiagramSerializer, NodeModel } from '@grafloria/engine';
import {
  createResvgBackend,
  createSharpBackend,
  loadNodeRasterBackend,
  type ResvgModule,
  type SharpModule,
} from './node-raster';
import { exportBatch, type BatchJob } from './batch';
import { base64ToBytes, extractModel } from './round-trip';
import { DARK_THEME } from '../themes';

const PNG_BYTES = base64ToBytes(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
);

describe('createResvgBackend', () => {
  const fakeResvg = () => {
    const seen: { svg?: string; fitTo?: unknown } = {};
    const module: ResvgModule = {
      Resvg: class {
        constructor(svg: string | Uint8Array, options?: { fitTo?: unknown }) {
          seen.svg = String(svg);
          seen.fitTo = options?.fitTo;
        }
        render() {
          return { asPng: () => PNG_BYTES };
        }
      } as unknown as ResvgModule['Resvg'],
    };
    return { module, seen };
  };

  it('rasterizes a PNG and returns a data: URL', async () => {
    const { module } = fakeResvg();
    const url = await createResvgBackend(module).rasterize({
      svg: '<svg/>',
      width: 100,
      height: 50,
      mimeType: 'image/png',
    });
    expect(url.startsWith('data:image/png;base64,')).toBe(true);
  });

  it('applies the export scale through fitTo.width (resvg renders AT the pixel size)', async () => {
    const { module, seen } = fakeResvg();
    await createResvgBackend(module).rasterize({
      svg: '<svg/>',
      width: 300,
      height: 150,
      mimeType: 'image/png',
    });
    expect(seen.fitTo).toEqual({ mode: 'width', value: 300 });
  });

  it('REFUSES JPEG instead of handing back PNG bytes under a jpeg mime type', async () => {
    const { module } = fakeResvg();
    await expect(
      createResvgBackend(module).rasterize({ svg: '<svg/>', width: 1, height: 1, mimeType: 'image/jpeg' })
    ).rejects.toThrow(/only encodes PNG/);
  });
});

describe('createSharpBackend', () => {
  const fakeSharp = () => {
    const calls: string[] = [];
    let flattenBg: string | undefined;
    let quality: number | undefined;
    let resized: [number, number] | undefined;

    const pipeline: any = {
      resize: (w: number, h: number) => {
        resized = [w, h];
        calls.push('resize');
        return pipeline;
      },
      png: () => {
        calls.push('png');
        return pipeline;
      },
      jpeg: (o?: { quality?: number }) => {
        quality = o?.quality;
        calls.push('jpeg');
        return pipeline;
      },
      webp: (o?: { quality?: number }) => {
        quality = o?.quality;
        calls.push('webp');
        return pipeline;
      },
      flatten: (o?: { background?: string }) => {
        flattenBg = o?.background;
        calls.push('flatten');
        return pipeline;
      },
      toBuffer: async () => PNG_BYTES,
    };

    const module = ((input: Uint8Array) => {
      calls.push(`input:${input.length}b`);
      return pipeline;
    }) as unknown as SharpModule;

    return { module, calls, get flattenBg() { return flattenBg; }, get quality() { return quality; }, get resized() { return resized; } };
  };

  it('produces PNG', async () => {
    const fake = fakeSharp();
    const url = await createSharpBackend(fake.module).rasterize({
      svg: '<svg/>',
      width: 10,
      height: 20,
      mimeType: 'image/png',
    });
    expect(fake.calls).toContain('png');
    expect(fake.resized).toEqual([10, 20]);
    expect(url.startsWith('data:image/png;base64,')).toBe(true);
  });

  it('FLATTENS for JPEG — an un-flattened transparent SVG encodes BLACK', async () => {
    const fake = fakeSharp();
    await createSharpBackend(fake.module).rasterize({
      svg: '<svg/>',
      width: 10,
      height: 10,
      mimeType: 'image/jpeg',
      quality: 0.8,
    });
    expect(fake.calls).toContain('flatten');
    expect(fake.flattenBg).toBe('#ffffff');
  });

  it('converts quality 0–1 (the canvas convention) to 1–100 (the encoder convention)', async () => {
    const fake = fakeSharp();
    await createSharpBackend(fake.module).rasterize({
      svg: '<svg/>',
      width: 1,
      height: 1,
      mimeType: 'image/jpeg',
      quality: 0.8,
    });
    // 0.8 must become 80, not stay 0.8 (which every encoder reads as "worst possible").
    expect(fake.quality).toBe(80);
  });

  it('produces WebP', async () => {
    const fake = fakeSharp();
    await createSharpBackend(fake.module).rasterize({
      svg: '<svg/>',
      width: 1,
      height: 1,
      mimeType: 'image/webp',
      quality: 0.5,
    });
    expect(fake.calls).toContain('webp');
    expect(fake.quality).toBe(50);
  });

  it('feeds sharp the SVG as UTF-8 BYTES (librsvg reads a buffer, not a string)', async () => {
    const fake = fakeSharp();
    await createSharpBackend(fake.module).rasterize({
      svg: '<svg>é</svg>',
      width: 1,
      height: 1,
      mimeType: 'image/png',
    });
    // 'é' is two bytes in UTF-8, so the buffer is longer than the string.
    expect(fake.calls[0]).toBe('input:13b');
  });
});

describe('loadNodeRasterBackend', () => {
  it('throws an error that names BOTH packages and the install line when neither is present', async () => {
    // Neither sharp nor @resvg/resvg-js is a dependency of this repo — that is the point.
    await expect(loadNodeRasterBackend('png')).rejects.toThrow(/@resvg\/resvg-js[\s\S]*sharp/);
  });

  it('says SVG export needs no rasterizer at all', async () => {
    await expect(loadNodeRasterBackend()).rejects.toThrow(/SVG export needs no rasterizer/);
  });
});

// ---------------------------------------------------------------------------
// Batch
// ---------------------------------------------------------------------------

describe('exportBatch — the server pipeline', () => {
  function document(id: string, x = 0): ReturnType<DiagramSerializer['serialize']> {
    const engine = new DiagramEngine();
    const diagram = engine.createDiagram(id)!;
    diagram.addNode(
      new NodeModel({ id: `${id}-n`, type: 'basic', position: { x, y: 0 }, size: { width: 100, height: 50 } })
    );
    const serialized = new DiagramSerializer().serialize(diagram);
    engine.destroy();
    return serialized;
  }

  it('exports many documents to SVG in plain Node — no browser, no rasterizer', async () => {
    const jobs: BatchJob[] = [
      { id: 'a', document: document('a') },
      { id: 'b', document: document('b', 500) },
    ];

    const results = await exportBatch(jobs);

    expect(results).toHaveLength(2);
    expect(results.every(r => r.error === undefined)).toBe(true);
    expect(results[0].output).toContain('<svg xmlns=');
    expect(results[1].output).toContain('<svg xmlns=');
  });

  it('returns results IN INPUT ORDER even though the pool finishes them out of order', async () => {
    const jobs: BatchJob[] = Array.from({ length: 12 }, (_, i) => ({
      id: `job-${i}`,
      document: document(`d${i}`, i * 10),
    }));

    const results = await exportBatch(jobs, { concurrency: 5 });
    expect(results.map(r => r.id)).toEqual(jobs.map(j => j.id));
  });

  it('ONE BAD DOCUMENT DOES NOT KILL THE RUN — the rest still come back', async () => {
    const jobs: BatchJob[] = [
      { id: 'good-1', document: document('a') },
      { id: 'corrupt', document: { nodes: 'not-an-array' } as never },
      { id: 'good-2', document: document('b') },
    ];

    const results = await exportBatch(jobs);

    expect(results.map(r => r.id)).toEqual(['good-1', 'corrupt', 'good-2']);
    expect(results[0].output).toBeDefined();
    expect(results[1].error).toBeInstanceOf(Error);
    expect(results[1].output).toBeUndefined();
    expect(results[2].output).toBeDefined();
  });

  it('reports progress as jobs settle', async () => {
    const seen: number[] = [];
    await exportBatch(
      Array.from({ length: 5 }, (_, i) => ({ id: `${i}`, document: document(`d${i}`) })),
      { concurrency: 2, onProgress: done => seen.push(done) }
    );
    expect(seen).toEqual([1, 2, 3, 4, 5]);
  });

  it('honours a batch-wide theme, and a per-job option override', async () => {
    const results = await exportBatch(
      [
        { id: 'dark', document: document('a') },
        { id: 'dark-with-bg', document: document('b'), options: { backgroundColor: '#123456' } },
      ],
      { theme: DARK_THEME }
    );

    expect(results[0].output).toContain(DARK_THEME.colors.node.default.fill);
    expect(results[1].output).toContain('#123456');
  });

  it('surfaces the fidelity warnings the string-only export signature has nowhere to put', async () => {
    const results = await exportBatch([{ id: 'a', document: document('a'), options: { maxSize: 10 } }]);
    expect(results[0].warnings.join(' ')).toContain('exceeds the 10px cap');
  });

  it('rasterizes through an injected backend — the whole point of the seam', async () => {
    const results = await exportBatch([{ id: 'a', document: document('a') }], {
      options: { rasterBackend: { rasterize: async () => 'data:image/png;base64,OK' } },
      // format is per-job
    });
    expect(results[0].output).toContain('<svg'); // default format is svg

    const raster = await exportBatch([{ id: 'a', document: document('a'), format: 'png' }], {
      options: { rasterBackend: { rasterize: async () => 'data:image/png;base64,OK' } },
    });
    expect(raster[0].output).toBe('data:image/png;base64,OK');
  });

  it('a batch export can carry the model too — server-rendered artifacts stay editable', async () => {
    const results = await exportBatch([
      {
        id: 'a',
        document: document('a'),
        options: { embedModel: true, embedModelCreatedAt: '2026-01-01T00:00:00.000Z' },
      },
    ]);
    expect(extractModel(results[0].output!)).not.toBeNull();
  });

  it('an empty batch is an empty result, not a crash', async () => {
    expect(await exportBatch([])).toEqual([]);
  });
});
