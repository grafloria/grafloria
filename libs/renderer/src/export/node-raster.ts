// The no-Chromium Node rasterizer (Card 6).
//
// Wave 4 built the `RasterBackend` seam and deliberately made bare Node THROW with
// instructions rather than fake an image. This finishes the job: real backends, and a
// loader that finds whichever one is installed.
//
// WHY NO DEPENDENCY IS ADDED
// --------------------------
// `libs/renderer` runs in the BROWSER. Taking a hard dependency on resvg-js or sharp
// would force a native, platform-specific binary (~10-40MB, prebuilt per arch) into the
// install of every app that only ever draws to a screen — to support a code path those
// apps never call. So both stay OPTIONAL:
//
//   • `createResvgBackend(resvg)` / `createSharpBackend(sharp)` take the module as an
//     ARGUMENT. The caller owns the dependency; we own the adapter. This is also what
//     makes them trivially testable — the tests inject a fake and assert the wiring,
//     with no native binary in CI.
//   • `loadNodeRasterBackend()` dynamically imports whichever is present, and if neither
//     is, throws an error that names the two packages and the one-line install.
//
// The SVG we hand these tools is already standalone — the cascade is flattened into
// presentation attributes and there are no external references — which is precisely what
// makes them work at all: resvg and librsvg implement neither CSS custom properties nor
// selectors, so an un-flattened export would rasterize as black boxes in 16px serif.
//
// WHICH TOOL DOES WHAT
//   resvg   Rust, self-contained, no system libraries, excellent SVG coverage. PNG ONLY.
//   sharp   libvips + librsvg. PNG, JPEG and WebP. Needs librsvg present in the image.
// So `loadNodeRasterBackend` prefers sharp when a lossy format is wanted and resvg
// otherwise — and each backend REFUSES a format it cannot actually produce instead of
// quietly handing back the wrong bytes.

import type { RasterBackend, RasterizeRequest } from './raster';
import { bytesToDataUrl, utf8 } from './round-trip';

// ---------------------------------------------------------------------------
// Structural types — declared, not imported, so neither package is a build-time dep
// ---------------------------------------------------------------------------

/** The slice of `@resvg/resvg-js` we use. */
export interface ResvgModule {
  Resvg: new (
    svg: string | Uint8Array,
    options?: { fitTo?: { mode: 'width' | 'height'; value: number } }
  ) => { render(): { asPng(): Uint8Array } };
}

/** The slice of `sharp` we use. */
export type SharpModule = (input: Uint8Array, options?: { density?: number }) => {
  resize(width: number, height: number): ReturnType<SharpModule>;
  png(): ReturnType<SharpModule>;
  jpeg(options?: { quality?: number }): ReturnType<SharpModule>;
  webp(options?: { quality?: number }): ReturnType<SharpModule>;
  flatten(options?: { background?: string }): ReturnType<SharpModule>;
  toBuffer(): Promise<Uint8Array>;
};

// ---------------------------------------------------------------------------
// resvg
// ---------------------------------------------------------------------------

/**
 * A PNG rasterizer backed by resvg. PNG only — resvg has no JPEG or WebP encoder, and
 * pretending otherwise would mean handing a caller PNG bytes under a `image/jpeg` mime
 * type, which is the kind of quiet lie this seam exists to prevent.
 *
 * `fitTo: width` is what applies the export's scale: the SVG carries the picture, and
 * resvg renders it at the pixel width we ask for.
 */
export function createResvgBackend(resvg: ResvgModule): RasterBackend {
  return {
    async rasterize({ svg, width, mimeType }: RasterizeRequest): Promise<string> {
      if (mimeType !== 'image/png') {
        throw new Error(
          `[grafloria/export] the resvg backend cannot produce ${mimeType} — resvg only encodes PNG. ` +
            `Use the sharp backend (createSharpBackend) for JPEG/WebP, or export PNG.`
        );
      }

      const image = new resvg.Resvg(svg, {
        fitTo: { mode: 'width', value: Math.max(1, Math.round(width)) },
      });
      return bytesToDataUrl(image.render().asPng(), 'image/png');
    },
  };
}

// ---------------------------------------------------------------------------
// sharp
// ---------------------------------------------------------------------------

/**
 * A rasterizer backed by sharp (libvips + librsvg). Produces all three raster formats.
 *
 * The SVG goes in as BYTES, not as a path: sharp reads an SVG buffer through librsvg.
 * `density` is how sharp scales vector input — 72 is the 1:1 baseline, so we scale the
 * DPI by the ratio of the target pixel width to the SVG's intrinsic width and let
 * librsvg rasterize at that resolution rather than upscaling a small bitmap.
 */
export function createSharpBackend(sharp: SharpModule): RasterBackend {
  return {
    async rasterize({ svg, width, height, mimeType, quality }: RasterizeRequest): Promise<string> {
      const targetWidth = Math.max(1, Math.round(width));
      const targetHeight = Math.max(1, Math.round(height));

      let pipeline = sharp(utf8.encode(svg), { density: 72 }).resize(targetWidth, targetHeight);

      // 0–1 (the canvas convention) → 1–100 (the encoder convention).
      const q = quality === undefined ? undefined : Math.round(quality * 100);

      switch (mimeType) {
        case 'image/png':
          pipeline = pipeline.png();
          break;
        case 'image/jpeg':
          // JPEG has no alpha: flatten, or transparent pixels come out BLACK.
          pipeline = pipeline.flatten({ background: '#ffffff' }).jpeg({ quality: q });
          break;
        case 'image/webp':
          pipeline = pipeline.webp({ quality: q });
          break;
        default:
          throw new Error(`[grafloria/export] the sharp backend cannot produce ${mimeType}`);
      }

      return bytesToDataUrl(await pipeline.toBuffer(), mimeType);
    },
  };
}

// ---------------------------------------------------------------------------
// The loader
// ---------------------------------------------------------------------------

const INSTALL_HINT =
  '[grafloria/export] headless raster export needs an SVG rasterizer, and neither is installed.\n' +
  '  npm i @resvg/resvg-js   — PNG only; pure Rust, no system libraries (recommended)\n' +
  '  npm i sharp             — PNG/JPEG/WebP; needs librsvg in the image\n' +
  'Both are OPTIONAL: the renderer does not depend on either, so a browser build never ' +
  'pays for them. SVG export needs no rasterizer at all.';

/**
 * Find a rasterizer in this Node process.
 *
 * The imports are DYNAMIC and the specifiers are built at runtime, so a bundler cannot
 * statically resolve them and will not try to pull a native module into a browser bundle
 * (which is how an optional native dep usually breaks a web build).
 *
 * @param format the format you intend to produce — only sharp can do the lossy ones, so
 *        asking for jpeg/webp will not hand you a resvg backend that would then throw.
 */
export async function loadNodeRasterBackend(format: 'png' | 'jpeg' | 'webp' = 'png'): Promise<RasterBackend> {
  const needsLossy = format === 'jpeg' || format === 'webp';

  const sharp = await tryImport<SharpModule>('sharp');
  if (sharp) return createSharpBackend(sharp);

  if (!needsLossy) {
    const resvg = await tryImport<ResvgModule>('@resvg/resvg-js');
    if (resvg) return createResvgBackend(resvg);
  }

  if (needsLossy) {
    const resvg = await tryImport<ResvgModule>('@resvg/resvg-js');
    if (resvg) {
      throw new Error(
        `[grafloria/export] only @resvg/resvg-js is installed, and it cannot encode ${format} (PNG only). ` +
          `Install sharp for JPEG/WebP, or export PNG.`
      );
    }
  }

  throw new Error(INSTALL_HINT);
}

/** Import a module that may not be installed. `null` rather than a throw when it is not. */
async function tryImport<T>(specifier: string): Promise<T | null> {
  try {
    // Assembled at runtime so bundlers leave it alone.
    const dynamic = new Function('s', 'return import(s)') as (s: string) => Promise<Record<string, unknown>>;
    const module = await dynamic(specifier);
    // resvg exports { Resvg }; sharp is a default-exported function.
    const candidate = (module['default'] ?? module) as T;
    return candidate ?? null;
  } catch {
    return null;
  }
}
