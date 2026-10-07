// THE WHOLE SITE, AS A READER GETS IT — every page loaded in a real browser.
//
// The gallery gate proves each demo's feature; this proves every PAGE of the
// site works for someone who opens it: the landing pages, the guides, the
// comparisons, the blog, the demo gallery. A page that answers 200 can still be
// broken — a script that throws, a file the host does not serve (Pages' Jekyll
// silently dropped `_layout-lib.js` and seven demos were blank for two months),
// a live example stuck on "loading…", a link to a page that is not there.
//
//   node demos/e2e/site-run.mjs                                   # the live site, https://grafloria.com
//   node demos/e2e/site-run.mjs --origin http://127.0.0.1:8741    # any other copy (e.g. docs/ served locally)
//
// For every page in the sitemap, and every same-site page a page links to:
//   - no uncaught error, no console error
//   - every file it asks for arrives (same site or CDN; a 4xx/5xx or a failed request fails the page)
//   - scrolled to the bottom (lazy examples mount on sight), nothing left saying loading/rendering
//   - every same-site link leads somewhere that answers 200, and its #fragment exists there
// Hash routes of the framework demo apps are the variant gate's job, not this one's.

import { chromium } from 'playwright';

const argv = process.argv.slice(2);
const oi = argv.indexOf('--origin');
const ORIGIN = (oi >= 0 ? argv[oi + 1] : 'https://grafloria.com').replace(/\/$/, '');
const host = new URL(ORIGIN).host;
const CONCURRENCY = 4;

const sitemap = await (await fetch(`${ORIGIN}/sitemap.xml`)).text();
const seeds = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace('https://grafloria.com', ORIGIN));
if (!seeds.length) throw new Error(`no pages in ${ORIGIN}/sitemap.xml`);

/** A same-site page URL, normalised: no query, no fragment. */
const pageKey = (u) => { const x = new URL(u); x.hash = ''; x.search = ''; return x.href; };
const isPage = (u) => { const p = new URL(u).pathname; return p.endsWith('/') || p.endsWith('.html'); };

const queue = [...new Set(seeds.map(pageKey))];
const seen = new Set(queue);
const results = new Map(); // page → { problems: string[], links: Set<string>, ids: Set<string> }
const links = new Map();   // linked URL (with fragment) → the pages that link to it

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });

async function check(url) {
  const page = await context.newPage();
  const problems = [];
  const bad = (m) => { if (!problems.includes(m)) problems.push(m); };
  page.on('pageerror', (e) => bad(`uncaught error: ${String(e).split('\n')[0].slice(0, 200)}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) bad(`console error: ${m.text().split('\n')[0].slice(0, 200)}`); });
  page.on('response', (r) => { if (r.status() >= 400) bad(`${r.status()} ${r.url()}`); });
  page.on('requestfailed', (r) => {
    const why = r.failure()?.errorText ?? '';
    // an aborted request is a navigation away or a cancelled media range, not a missing file
    if (!/ERR_ABORTED|NS_BINDING_ABORTED/.test(why)) bad(`request failed: ${r.url()} ${why}`);
  });
  try {
    const res = await page.goto(url, { waitUntil: 'load', timeout: 45000 });
    if (!res || res.status() >= 400) bad(`the page itself answered ${res?.status() ?? 'nothing'}`);
    // scroll it all into view: examples mount when they are seen
    const h = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y < h; y += 700) { await page.evaluate((y) => window.scrollTo(0, y), y); await page.waitForTimeout(120); }
    await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => undefined);
    await page.waitForTimeout(1500);
    const found = await page.evaluate(() => {
      // seen by a reader: laid out, and neither it nor any ancestor hidden or fully transparent
      const visible = (el) => {
        const r = el.getBoundingClientRect();
        if (!(r.width > 0 && r.height > 0)) return false;
        for (let e = el; e; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false; }
        return true;
      };
      // a live example that never finished booting still shows its placeholder
      const stuck = [...document.querySelectorAll('body *')]
        .filter((el) => el.children.length === 0 && /^\s*(loading|rendering)\s*(…|\.\.\.)\s*$/i.test(el.textContent ?? '') && visible(el));
      // mark them, so the ones still showing can be given a fair chance below
      stuck.forEach((el, i) => el.setAttribute('data-site-run-stuck', String(i)));
      return {
        stuck: stuck.slice(0, 3).map((el, i) => i),
        links: [...document.querySelectorAll('a[href]')].map((a) => a.href),
        ids: [...document.querySelectorAll('[id], a[name]')].map((e) => e.id || e.getAttribute('name')),
      };
    });
    // A placeholder still showing gets a fair chance: in view, six seconds to finish.
    for (const i of found.stuck) {
      const sel = `[data-site-run-stuck="${i}"]`;
      await page.locator(sel).scrollIntoViewIfNeeded().catch(() => undefined);
      const gone = await page.waitForFunction((sel) => {
        const el = document.querySelector(sel);
        if (!el) return true;
        const r = el.getBoundingClientRect();
        if (!(r.width > 0 && r.height > 0)) return true;
        for (let e = el; e; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return true; }
        return !/^\s*(loading|rendering)/i.test(el.textContent ?? '');
      }, sel, { timeout: 6000 }).then(() => true).catch(() => false);
      if (!gone) bad(`a live example never finished loading: ${await page.$eval(sel, (el) => `${el.tagName.toLowerCase()}${el.className ? '.' + String(el.className).split(' ')[0] : ''} "${el.textContent.trim()}"`).catch(() => sel)}`);
    }
    return { problems, links: found.links, ids: found.ids };
  } catch (e) {
    bad(`could not load: ${String(e.message ?? e).split('\n')[0]}`);
    return { problems, links: [], ids: [] };
  } finally {
    await page.close();
  }
}

async function worker() {
  while (queue.length) {
    const url = queue.shift();
    const r = await check(url);
    results.set(url, { problems: r.problems, ids: new Set(r.ids) });
    for (const l of r.links) {
      let u;
      try { u = new URL(l); } catch { continue; }
      if (u.host !== host || !/^https?:$/.test(u.protocol)) continue;
      if (u.hash.startsWith('#/')) continue; // a framework app's hash route
      if (!links.has(u.href)) links.set(u.href, new Set());
      links.get(u.href).add(url);
      const k = pageKey(u.href);
      if (isPage(k) && !seen.has(k)) { seen.add(k); queue.push(k); }
    }
    process.stdout.write('.');
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
console.log('');

// every same-site link: its target answers 200, and its #fragment is on that page
const statusOf = new Map();
for (const href of links.keys()) {
  const k = pageKey(href);
  if (statusOf.has(k) || results.has(k)) continue;
  const res = await fetch(k, { method: 'GET', redirect: 'follow' }).catch(() => null);
  statusOf.set(k, res ? res.status : 0);
}
const brokenLinks = [];
for (const [href, from] of links) {
  const k = pageKey(href);
  const r = results.get(k);
  const status = r ? (r.problems.some((p) => /the page itself answered/.test(p)) ? 404 : 200) : statusOf.get(k);
  const frag = decodeURIComponent(new URL(href).hash.slice(1));
  const where = [...from].slice(0, 2).map((f) => f.replace(ORIGIN, '')).join(', ');
  if (status !== 200) brokenLinks.push(`${href.replace(ORIGIN, '')} answers ${status} — linked from ${where}`);
  else if (frag && r && !r.ids.has(frag)) brokenLinks.push(`${href.replace(ORIGIN, '')} — no #${frag} on that page — linked from ${where}`);
}

await browser.close();

const failing = [...results].filter(([, r]) => r.problems.length);
for (const [url, r] of failing) {
  console.log(`✗ ${url.replace(ORIGIN, '') || '/'}`);
  for (const p of r.problems) console.log(`    ${p}`);
}
for (const b of brokenLinks) console.log(`✗ link ${b}`);
console.log(`\nsite: ${results.size - failing.length}/${results.size} pages load clean · ${links.size} links checked, ${brokenLinks.length} broken · ${ORIGIN}`);
process.exit(failing.length || brokenLinks.length ? 1 : 0);
