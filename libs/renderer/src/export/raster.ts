// PNG / JPEG / WebP: rasterizing the standalone SVG.
//
// BE HONEST ABOUT THE BOUNDARY. Turning SVG into pixels requires an SVG ENGINE.
// A browser has one (that is what `<img src="data:image/svg+xml,…">` + `canvas`
// borrows); bare Node does not, and shipping one (resvg / skia / a headless
// Chromium) would be a heavyweight dependency this library does not get to make
// on its users' behalf.
//
// So rasterization is a SEAM, not a hard-coded implementation:
//
//   • {@link createDomRasterBackend} — zero-dependency, works wherever there is a
//     canvas: the browser main thread, and a worker (via OffscreenCanvas). This is
//     what `renderer.export('png')` uses by default in a browser.
//   • {@link RasterBackend} — implement it with resvg-js / sharp / puppeteer in a
//     Node service and pass it as `options.rasterBackend`. ~10 lines, and the SVG
//     it receives is already standalone (styles inlined, no external refs), which
//     is precisely what makes those rasterizers work at all.
//
// In plain Node with no backend, `export('png')` THROWS with that instruction —
// it does not silently return a broken or empty image.

/** What a rasterizer is asked to produce. */
export interface RasterizeRequest {
  /** A standalone SVG document (styles inlined, no external references). */
  svg: string;
  /** Target pixel width (already scaled). */
  width: number;
  /** Target pixel height (already scaled). */
  height: number;
  /** `image/png` | `image/jpeg` | `image/webp`. */
  mimeType: string;
  /** 0–1, for the lossy formats. */
  quality?: number;
}

/** Pluggable rasterizer. Returns a `data:` URL. */
export interface RasterBackend {
  rasterize(request: RasterizeRequest): Promise<string>;
}

const MIME_BY_FORMAT: Record<string, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};

/** `'png'` → `'image/png'`. Throws for a format that is not a raster format. */
export function mimeTypeForFormat(format: string): string {
  const mime = MIME_BY_FORMAT[format];
  if (!mime) throw new Error(`[grafloria/export] "${format}" is not a raster format`);
  return mime;
}

/**
 * SVG string → `data:image/svg+xml` URL.
 *
 * `encodeURIComponent`, NOT base64: `btoa` throws on any non-Latin-1 character,
 * so a diagram with a non-ASCII label (or the renderer's own '…' ellipsis, or the
 * 📌 lock indicator) would blow up the PNG path.
 */
export function svgToDataUri(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** Is there a canvas we can draw into? (browser main thread or worker) */
export function canRasterizeInThisEnvironment(): boolean {
  const g = globalThis as any;
  return typeof g.Image === 'function' && (typeof g.OffscreenCanvas === 'function' || typeof g.document !== 'undefined');
}

/**
 * The zero-dependency browser backend: draw the SVG into a canvas and read the
 * pixels back out.
 *
 * Prefers `OffscreenCanvas` when present (so it works in a worker, off the main
 * thread) and falls back to a detached `<canvas>`.
 */
export function createDomRasterBackend(): RasterBackend {
  return {
    async rasterize({ svg, width, height, mimeType, quality }: RasterizeRequest): Promise<string> {
      const g = globalThis as any;
      if (!canRasterizeInThisEnvironment()) {
        throw new Error(
          '[grafloria/export] no canvas in this environment. Pass options.rasterBackend ' +
            '(e.g. resvg-js / sharp / puppeteer) to rasterize outside a browser.'
        );
      }

      const image: HTMLImageElement = new g.Image();
      image.width = width;
      image.height = height;

      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error('[grafloria/export] the browser failed to decode the exported SVG'));
        image.src = svgToDataUri(svg);
      });

      const pixelWidth = Math.max(1, Math.round(width));
      const pixelHeight = Math.max(1, Math.round(height));

      if (typeof g.OffscreenCanvas === 'function') {
        const canvas = new g.OffscreenCanvas(pixelWidth, pixelHeight);
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('[grafloria/export] OffscreenCanvas 2d context unavailable');
        ctx.drawImage(image, 0, 0, pixelWidth, pixelHeight);
        const blob = await canvas.convertToBlob({ type: mimeType, quality });
        return await blobToDataUrl(blob);
      }

      const canvas = g.document.createElement('canvas') as HTMLCanvasElement;
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('[grafloria/export] canvas 2d context unavailable');
      ctx.drawImage(image, 0, 0, pixelWidth, pixelHeight);
      return canvas.toDataURL(mimeType, quality);
    },
  };
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return `data:${blob.type};base64,${(globalThis as any).btoa(binary)}`;
}

/**
 * The backend an export will actually use: the caller's, else the browser one,
 * else a hard failure that tells you exactly what to do.
 */
export function resolveRasterBackend(explicit?: RasterBackend): RasterBackend {
  if (explicit) return explicit;
  if (canRasterizeInThisEnvironment()) return createDomRasterBackend();
  throw new Error(
    '[grafloria/export] raster export needs an SVG rasterizer. There is none in this environment ' +
      '(no canvas). Either export("svg") — which is fully headless — or pass options.rasterBackend ' +
      'backed by resvg-js / sharp / puppeteer.'
  );
}
