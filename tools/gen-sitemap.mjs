// Generate docs/sitemap.xml from what is actually served: every directory
// index under docs/ plus every demo page. lastmod comes from git history so
// crawlers see real change dates. Rerun after adding pages; CI-free by design.
import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { execSync } from 'node:child_process';

const DOCS = new URL('../docs', import.meta.url).pathname;
const SITE = 'https://grafloria.com';
const SKIP_DIRS = new Set(['shell', 'thumbs', 'shots', 'assets']);

const lastmod = (p) => {
  try {
    const out = execSync(`git log -1 --format=%cs -- "${p}"`, { cwd: DOCS + '/..', encoding: 'utf8' }).trim();
    return out || null;
  } catch { return null; }
};

const urls = [];
const add = (rel, priority) => {
  const loc = rel === 'index.html' ? `${SITE}/` :
    rel.endsWith('/index.html') ? `${SITE}/${rel.slice(0, -'index.html'.length)}` :
    `${SITE}/${rel}`;
  const lm = lastmod(join('docs', rel));
  urls.push({ loc, priority, lm });
};

const walk = (dir) => {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (SKIP_DIRS.has(e)) continue;
      walk(p);
    } else if (e.endsWith('.html')) {
      const rel = relative(DOCS, p);
      // priorities: home 1.0 · top sections 0.9 · learn 0.8 · demo pages 0.6
      const pr = rel === 'index.html' ? '1.0'
        : /^(react|angular|vue|javascript|mermaid|compare|demos|demos-\w+)\/index\.html$/.test(rel) ? '0.9'
        : rel.startsWith('learn/') ? '0.8'
        : '0.6';
      add(rel, pr);
    }
  }
};
walk(DOCS);
urls.sort((a, b) => b.priority.localeCompare(a.priority) || a.loc.localeCompare(b.loc));

const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  urls.map((u) => `  <url><loc>${u.loc}</loc>${u.lm ? `<lastmod>${u.lm}</lastmod>` : ''}<priority>${u.priority}</priority></url>`).join('\n') +
  `\n</urlset>\n`;
writeFileSync(join(DOCS, 'sitemap.xml'), xml);
console.log(`sitemap: ${urls.length} urls`);
