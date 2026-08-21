// Inject per-demo SEO metadata into every demo page: description (from the
// defineDemo blurb), canonical, and OG/twitter tags with the demo's own
// thumbnail as the social image. Idempotent — a page already carrying the
// block is rewritten in place. Source of truth is demos/; sync to docs after.
import { readdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('../demos', import.meta.url).pathname;
const SITE = 'https://grafloria.com';

const clip = (s, n = 158) => {
  s = s.replace(/\s+/g, ' ').trim();
  if (s.length <= n) return s;
  const cut = s.slice(0, n);
  const dot = cut.lastIndexOf('. ');
  return (dot > 60 ? cut.slice(0, dot + 1) : cut.slice(0, cut.lastIndexOf(' ')) + '…');
};

const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

let done = 0, noBlurb = 0;
for (const cat of readdirSync(ROOT)) {
  const dir = join(ROOT, cat);
  if (!statSync(dir).isDirectory() || ['shell', 'e2e'].includes(cat)) continue;
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.html')) continue;
    const p = join(dir, f);
    let s = readFileSync(p, 'utf8');
    const title = (s.match(/<title>([^<]+)<\/title>/) ?? [])[1] ?? 'Grafloria demo';
    // blurb: '...'-quoted with \' escapes
    const bm = s.match(/blurb:\s*'((?:[^'\\]|\\.)*)'/);
    const blurb = bm ? bm[1].replace(/\\'/g, "'").replace(/\\n/g, ' ').replace(/`/g, '') : null;
    if (!bm) noBlurb++;
    const desc = clip(blurb ?? `${title.replace(' — Grafloria', '')} — a live, editable Grafloria diagram demo. MIT licensed; view source is the tutorial.`);
    const slug = f.replace(/\.html$/, '');
    const url = `${SITE}/demos/${cat}/${f}`;
    const thumb = existsSync(join(ROOT, '..', 'docs', 'demos', 'thumbs', cat, `${slug}.png`))
      ? `${SITE}/demos/thumbs/${cat}/${slug}.png`
      : `${SITE}/og-image.png`;
    const block = `<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${url}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${thumb}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${thumb}">`;
    // replace an existing injected block, else insert after <title>
    if (s.includes('name="description"')) {
      s = s.replace(/<meta name="description"[\s\S]*?<meta name="twitter:image"[^>]*>\n?/, block + '\n');
    } else {
      s = s.replace(/(<\/title>)/, `$1\n${block}`);
    }
    writeFileSync(p, s);
    done++;
  }
}
console.log(`injected: ${done} demo pages (${noBlurb} without blurb used fallback description)`);
