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
export function inlineAssets(root: VNode, byUrl: Map<string, string>): VNode {
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
