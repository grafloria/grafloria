// Self-contained asset inlining (Card 1): make the file carry its own fonts and images.
//
// WHAT WAS ALREADY TRUE, and what was not
// ---------------------------------------
// Wave 4 flattened the THEME — every `var(--grafloria-*)` is resolved into a concrete
// presentation attribute, so an exported SVG needs no stylesheet. That is most of
// "self-contained", and it is done.
//
// Two real external references survived it:
//
//  1. FONTS were DECLARED, never embedded. The file says `font-family: Inter, …` and then
//     depends on the machine that opens it to have Inter. On a machine that does not — a
//     rasterizer, a Windows box, an email client — every label reflows in a fallback face,
//     silently, and the picture is wrong in a way nobody notices until a customer prints it.
//     `embedFontCss` existed as a seam, but it made the CALLER produce the base64 @font-face
//     by hand. This builds it.
//
//  2. IMAGES. Panel nodes emit `<image href="https://…">` (an avatar, a logo, an ERD icon).
//     That is a live network reference: it 404s on a server with no egress, it leaks a
//     request to a third party every time the "self-contained" file is opened, and it simply
//     does not render inside an email client. Those get inlined as `data:` URIs.
//
// THE SHAPE: a PURE substitution, and an ASYNC fetch that feeds it.
// Fetching is I/O and cannot be pure, so it is kept strictly separate: `collectAssetUrls`
// and `inlineAssets` are pure functions over the tree (fully testable, no network), and
// `resolveAssets` is the thin async layer that goes and gets the bytes. A caller who already
// has the bytes never touches the network at all.
//
// NOT DONE, deliberately: font SUBSETTING. Cutting a font down to the glyphs a diagram
// actually uses needs a real font parser (a `glyf`/`loca`/`cmap` rewriter). Embedding a
// whole woff2 is ~15-100KB; subsetting would typically get that under 5KB. That is a real
// win and a real project, and it is not this card — the card asks for embedding.

import type { VNode } from '../types/vnode.types';
import { bytesToBase64 } from './round-trip';

// ---------------------------------------------------------------------------
// Fonts
// ---------------------------------------------------------------------------

export type FontFormat = 'woff2' | 'woff' | 'truetype' | 'opentype';

const FONT_MIME: Record<FontFormat, string> = {
  woff2: 'font/woff2',
  woff: 'font/woff',
  truetype: 'font/ttf',
  opentype: 'font/otf',
};

export interface FontSource {
  /** The family name the diagram's `font-family` refers to, e.g. `Inter`. */
  family: string;
  /** The font program's bytes. */
  data: Uint8Array;
  format?: FontFormat;
  /** e.g. `400`, `700`, `'bold'`. Default `'normal'`. */
  weight?: string | number;
  /** `'normal'` | `'italic'`. Default `'normal'`. */
  style?: string;
  /** Optional `unicode-range` descriptor. */
  unicodeRange?: string;
}

/** `woff2` from a `.woff2` URL, etc. Defaults to woff2 — by far the most common on the web. */
export function fontFormatFromUrl(url: string): FontFormat {
  const clean = url.split('?')[0].split('#')[0].toLowerCase();
  if (clean.endsWith('.woff')) return 'woff';
  if (clean.endsWith('.ttf')) return 'truetype';
  if (clean.endsWith('.otf')) return 'opentype';
  return 'woff2';
}

/**
 * Build the `@font-face` CSS that makes an export carry its own glyphs.
 *
 * PURE — bytes in, CSS out. Hand the result to `SvgExportOptions.embedFontCss` and the file
 * renders identically on a machine that has never heard of the typeface.
 *
 * The `format('…')` hint is not decoration: without it a renderer must sniff the bytes, and
 * some (notably older librsvg) simply decline and fall back.
 */
export function fontFaceCss(fonts: FontSource[]): string {
  return fonts
    .map(font => {
      const format = font.format ?? 'woff2';
      const mime = FONT_MIME[format];
      const base64 = bytesToBase64(font.data);

      const declarations = [
        `font-family: '${font.family.replace(/'/g, "\\'")}'`,
        `font-style: ${font.style ?? 'normal'}`,
        `font-weight: ${font.weight ?? 'normal'}`,
        `src: url(data:${mime};base64,${base64}) format('${format}')`,
      ];
      if (font.unicodeRange) declarations.push(`unicode-range: ${font.unicodeRange}`);

      return `@font-face{${declarations.join(';')}}`;
    })
    .join('\n');
}

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

/** The props an `<image>` can carry its source in. SVG 2 uses `href`; SVG 1.1 `xlink:href`. */
const IMAGE_HREF_PROPS = ['href', 'xlinkHref', 'xlink:href'];

/** Is this a reference that has to leave the document to resolve? */
export function isExternalUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value === '') return false;
  // Already inline, or an intra-document reference — nothing to fetch.
  if (value.startsWith('data:') || value.startsWith('#')) return false;
  return true;
}

/**
 * Every external asset URL the tree references. PURE.
 *
 * Deduplicated and returned in a STABLE order (first appearance), so a caller that fetches
 * them and re-inlines gets the same bytes for the same diagram every time — determinism runs
 * all the way through this module.
 */
export function collectAssetUrls(root: VNode): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();

  const visit = (vnode: VNode): void => {
    if (!vnode || typeof vnode !== 'object') return;

    const props = vnode.props ?? {};
    for (const key of IMAGE_HREF_PROPS) {
      const value = props[key];
      if (isExternalUrl(value) && !seen.has(value)) {
        seen.add(value);
        urls.push(value);
      }
    }

    for (const child of vnode.children ?? []) visit(child);
  };

  visit(root);
  return urls;
}

/**
 * Replace external asset URLs with the supplied `data:` URIs. PURE — returns a new tree.
 *
 * A URL with no entry in the map is LEFT ALONE rather than blanked: a broken-but-present
 * reference is debuggable, and an element silently stripped of its href is not. The async
 * layer reports those as warnings.
 */
export function inlineAssets(root: VNode, byUrl: ReadonlyMap<string, string>): VNode {
  const rewrite = (vnode: VNode): VNode => {
    if (!vnode || typeof vnode !== 'object') return vnode;

    let props = vnode.props;

    for (const key of IMAGE_HREF_PROPS) {
      const value = vnode.props?.[key];
      if (isExternalUrl(value)) {
        const inlined = byUrl.get(value);
        if (inlined) {
          // Copy on first change only — an untouched subtree keeps its identity.
          if (props === vnode.props) props = { ...vnode.props };
          props[key] = inlined;
        }
      }
    }

    const children = vnode.children?.map(rewrite);
    if (props === vnode.props && children === vnode.children) return vnode;
    return { ...vnode, props: props ?? {}, children };
  };

  return rewrite(root);
}

// ---------------------------------------------------------------------------
// The async layer
// ---------------------------------------------------------------------------

/** Fetch bytes for a URL. Injectable — so tests never touch the network. */
export type AssetFetcher = (url: string) => Promise<{ data: Uint8Array; mimeType: string }>;

export interface ResolveAssetsOptions {
  /** How to get the bytes. Defaults to `fetch` when the environment has one. */
  fetcher?: AssetFetcher;
  /** Cap on one asset's size, in bytes. Default 5MB — a data: URI is ~33% bigger than the file. */
  maxBytes?: number;
}

export interface ResolveAssetsResult {
  tree: VNode;
  /** How many external references were replaced. */
  inlined: number;
  warnings: string[];
}

/**
 * Fetch every external asset the tree references and inline it as a `data:` URI.
 *
 * A FAILED ASSET IS A WARNING, NOT A THROW. One 404 avatar must not lose you the export of a
 * 200-node diagram — the reference is left as-is (still broken, but visible and debuggable)
 * and the caller is told. That is the same rule the batch exporter follows.
 */
export async function resolveAssets(root: VNode, options: ResolveAssetsOptions = {}): Promise<ResolveAssetsResult> {
  const urls = collectAssetUrls(root);
  const warnings: string[] = [];

  if (urls.length === 0) return { tree: root, inlined: 0, warnings };

  const fetcher = options.fetcher ?? defaultFetcher();
  if (!fetcher) {
    warnings.push(
      `[grafloria/export] ${urls.length} external image reference(s) could not be inlined: this environment ` +
        `has no fetch. Pass options.fetcher. The exported file is NOT self-contained — it will try to ` +
        `load those URLs when opened.`
    );
    return { tree: root, inlined: 0, warnings };
  }

  const maxBytes = options.maxBytes ?? 5 * 1024 * 1024;
  const byUrl = new Map<string, string>();

  const results = await Promise.all(
    urls.map(async url => {
      try {
        const { data, mimeType } = await fetcher(url);
        if (data.length > maxBytes) {
          return { url, error: `asset is ${data.length} bytes, over the ${maxBytes}-byte cap` };
        }
        return { url, dataUri: `data:${mimeType};base64,${bytesToBase64(data)}` };
      } catch (cause) {
        return { url, error: (cause as Error).message };
      }
    })
  );

  for (const result of results) {
    if ('dataUri' in result && result.dataUri) {
      byUrl.set(result.url, result.dataUri);
    } else {
      warnings.push(
        `could not inline "${result.url}" (${(result as { error: string }).error}) — the reference is left ` +
          `in the file, so the export is not fully self-contained.`
      );
    }
  }

  return { tree: inlineAssets(root, byUrl), inlined: byUrl.size, warnings };
}

// ---------------------------------------------------------------------------
// The TIERED fetch — what `await export(…)` runs for external image URLs.
//
// This library is CLIENT-SIDE: the export runs in a browser, and a browser can often
// fetch the very URL a PDF cannot. Three tiers, in order:
//
//   1. the environment's own fetch — same-origin assets always; cross-origin whenever
//      the image's server allows CORS (most public CDNs do). `fetch()` REJECTS on a
//      CORS refusal, and that rejection is the tier boundary. `no-cors` mode is
//      deliberately NOT used: an opaque response's bytes are unreadable, which would
//      trade an honest warning for a silently empty image.
//   2. the caller's {@link AssetFetcher} — the embedding app's proxy, service worker,
//      or cache. Consulted only when tier 1 failed.
//   3. honesty — a recorded failure that names both escape hatches (enable CORS on the
//      image's server, or pass an assetFetcher). Never a throw: one dead logo must not
//      lose the export of a whole board.
//
// BOUNDED twice, because an export is often a print job someone is waiting on:
//   - `timeoutMs` (default 5s, the same figure as customNodeTimeout) caps the wait per
//     URL — a dead host cannot hang the export;
//   - `maxBytes` (default 5MB, shared with resolveAssets) caps the payload — a data:
//     URI inflates ~33%, and the cap is TERMINAL: a proxy would return the same bytes,
//     so tier 2 is not consulted for an oversized file.
// ---------------------------------------------------------------------------

export interface TieredFetchOptions {
  /** Tier 2: consulted only when the environment's own fetch fails. */
  fetcher?: AssetFetcher;
  /** Cap on one asset's size, in bytes. Default 5MB. TERMINAL — no tier retries it. */
  maxBytes?: number;
  /** Bound on fetching ONE URL, per tier, in milliseconds. Default 5000. */
  timeoutMs?: number;
}

export interface TieredFetchResult {
  /** URL → `data:` URI, for every asset some tier could produce. */
  byUrl: Map<string, string>;
  /** URL → why EVERY tier failed — ready to surface as a warning. */
  failures: Map<string, string>;
}

const DEFAULT_ASSET_MAX_BYTES = 5 * 1024 * 1024;
const DEFAULT_ASSET_TIMEOUT = 5000;

/**
 * Fetch every URL through the tiers above. Deduplicated: a URL is fetched once no
 * matter how many elements reference it. Resolves when the last URL settles; never
 * rejects.
 */
export async function fetchAssetsTiered(
  urls: readonly string[],
  options: TieredFetchOptions = {}
): Promise<TieredFetchResult> {
  const byUrl = new Map<string, string>();
  const failures = new Map<string, string>();
  const unique = [...new Set(urls)];
  if (unique.length === 0) return { byUrl, failures };

  const maxBytes = options.maxBytes ?? DEFAULT_ASSET_MAX_BYTES;
  const timeoutMs = options.timeoutMs ?? DEFAULT_ASSET_TIMEOUT;
  const browser = defaultFetcher();

  await Promise.all(
    unique.map(async url => {
      // -- tier 1: the environment's own fetch --------------------------------
      let tier1Error: string;
      if (browser) {
        try {
          const asset = await bounded(browser(url), timeoutMs);
          if (asset.data.length > maxBytes) {
            failures.set(url, overCap(asset.data.length, maxBytes));
            return; // terminal — a proxy returns the same bytes
          }
          byUrl.set(url, toDataUri(asset));
          return;
        } catch (cause) {
          tier1Error = errorMessage(cause);
        }
      } else {
        tier1Error = 'this environment has no fetch';
      }

      // -- tier 2: the caller's fetcher ---------------------------------------
      if (options.fetcher) {
        try {
          const asset = await bounded(options.fetcher(url), timeoutMs);
          if (asset.data.length > maxBytes) {
            failures.set(url, overCap(asset.data.length, maxBytes));
            return;
          }
          byUrl.set(url, toDataUri(asset));
          return;
        } catch (cause) {
          failures.set(
            url,
            `fetch failed (${tier1Error}) and the assetFetcher also failed (${errorMessage(cause)})`
          );
          return;
        }
      }

      // -- tier 3: honesty ----------------------------------------------------
      failures.set(
        url,
        `fetch failed (${tier1Error}), which usually means the image's server does not allow ` +
          `CORS — enable CORS on that server, or pass ExportOptions.assetFetcher to fetch it ` +
          `through your own proxy`
      );
    })
  );

  return { byUrl, failures };
}

/** Race a fetch against a deadline; always clears the timer so a fast export exits fast. */
async function bounded<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  if (!(timeoutMs > 0) || !Number.isFinite(timeoutMs)) return work;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${timeoutMs}ms`)), timeoutMs);
  });
  try {
    return await Promise.race([work, deadline]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

const overCap = (size: number, cap: number): string =>
  `asset is ${size} bytes, over the ${cap}-byte cap`;

const errorMessage = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

/**
 * Bytes → `data:` URI, trusting the MAGIC BYTES over the server's content-type. A CDN
 * that serves a PNG as `application/octet-stream` is common, and a data: URI that lies
 * about its media type makes the PDF writer (which trusts the URI) refuse a perfectly
 * good image.
 */
function toDataUri(asset: { data: Uint8Array; mimeType: string }): string {
  const sniffed = sniffImageMime(asset.data) ?? asset.mimeType;
  return `data:${sniffed};base64,${bytesToBase64(asset.data)}`;
}

/** PNG / JPEG / GIF / WebP signatures — the formats an export can actually carry. */
function sniffImageMime(data: Uint8Array): string | null {
  if (data.length > 8 && data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47)
    return 'image/png';
  if (data.length > 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'image/jpeg';
  if (data.length > 6 && data[0] === 0x47 && data[1] === 0x49 && data[2] === 0x46) return 'image/gif';
  if (
    data.length > 12 &&
    data[0] === 0x52 && data[1] === 0x49 && data[2] === 0x46 && data[3] === 0x46 &&
    data[8] === 0x57 && data[9] === 0x45 && data[10] === 0x42 && data[11] === 0x50
  )
    return 'image/webp';
  return null;
}

/** `fetch` if this environment has one. */
function defaultFetcher(): AssetFetcher | null {
  const fetchImpl = (globalThis as { fetch?: typeof fetch }).fetch;
  if (typeof fetchImpl !== 'function') return null;

  return async (url: string) => {
    const response = await fetchImpl(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const buffer = await response.arrayBuffer();
    return {
      data: new Uint8Array(buffer),
      // Strip any `; charset=…` — a data: URI's media type must not carry one here.
      mimeType: (response.headers.get('content-type') ?? 'application/octet-stream').split(';')[0].trim(),
    };
  };
}

/**
 * Fetch a font and turn it into a {@link FontSource}, ready for {@link fontFaceCss}.
 */
export async function fetchFont(
  url: string,
  descriptor: Omit<FontSource, 'data' | 'format'> & { format?: FontFormat },
  options: ResolveAssetsOptions = {}
): Promise<FontSource> {
  const fetcher = options.fetcher ?? defaultFetcher();
  if (!fetcher) {
    throw new Error('[grafloria/export] fetchFont needs a fetch implementation — pass options.fetcher.');
  }

  const { data } = await fetcher(url);
  return { ...descriptor, data, format: descriptor.format ?? fontFormatFromUrl(url) };
}
