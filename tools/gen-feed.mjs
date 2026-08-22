// Generate docs/blog/feed.xml (RSS 2.0) from each post's BlogPosting JSON-LD —
// the posts are the source of truth, so the feed can't drift from the pages.
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const BLOG = new URL('../docs/blog', import.meta.url).pathname;
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const items = [];
for (const slug of readdirSync(BLOG)) {
  const p = join(BLOG, slug, 'index.html');
  try { statSync(p); } catch { continue; }
  const s = readFileSync(p, 'utf8');
  const m = s.match(/<script type="application\/ld\+json">(.*?)<\/script>/s);
  if (!m) continue;
  const ld = JSON.parse(m[1]);
  if (ld['@type'] !== 'BlogPosting') continue;
  items.push({
    title: ld.headline,
    desc: ld.description,
    url: ld.url,
    date: new Date(ld.datePublished + 'T12:00:00Z'),
    tags: (ld.keywords ?? '').split(', ').filter(Boolean),
  });
}
items.sort((a, b) => b.date - a.date);

const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>The Grafloria blog</title>
  <link>https://grafloria.com/blog/</link>
  <atom:link href="https://grafloria.com/blog/feed.xml" rel="self" type="application/rss+xml"/>
  <description>Honest write-ups of diagram and dashboard problems developers actually hit, and engine deep-dives with the real numbers.</description>
  <language>en</language>
  <lastBuildDate>${items[0]?.date.toUTCString() ?? new Date().toUTCString()}</lastBuildDate>
${items.map((i) => `  <item>
    <title>${esc(i.title)}</title>
    <link>${i.url}</link>
    <guid isPermaLink="true">${i.url}</guid>
    <pubDate>${i.date.toUTCString()}</pubDate>
    <description>${esc(i.desc)}</description>
${i.tags.map((t) => `    <category>${esc(t)}</category>`).join('\n')}
  </item>`).join('\n')}
</channel>
</rss>
`;
writeFileSync(join(BLOG, 'feed.xml'), rss);
console.log(`feed.xml: ${items.length} items`);
