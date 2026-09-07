// The house-style OG card for a blog post (1200×630): logo, "engineering blog", title, tag pills.
//   node tools/blog-og.mjs "<title>" "tag1,tag2" docs/blog/<slug>/og.png
import { chromium } from 'playwright';
import { readFileSync } from 'fs';
const [,, title, tagsCsv, out, sub = "engineering blog"] = process.argv;
const svg = readFileSync(new URL('../docs/favicon.svg', import.meta.url), 'utf8');
const tags = tagsCsv.split(',').map((t) => `<span class="pill">${t.trim()}</span>`).join('');
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; }
  body { font-family: -apple-system, "Inter", "Segoe UI", system-ui, sans-serif; color: #1f2432; position: relative;
    background: linear-gradient(135deg, #f8f9fe 0%, #eef0fb 100%); }
  .dots { position: absolute; inset: 0; background-image: radial-gradient(circle, rgba(59,82,217,.18) 1.4px, transparent 1.8px); background-size: 34px 34px; background-position: 17px 17px; }
  .blob { position: absolute; right: -180px; bottom: -220px; width: 560px; height: 560px; border-radius: 50%; background: radial-gradient(circle at 40% 40%, #dfe3fb, #e9ecfb 70%); }
  .brand { position: absolute; left: 72px; top: 64px; display: flex; align-items: center; gap: 14px; }
  .logo { width: 46px; height: 46px; border-radius: 12px; background: #3b52d9; display: flex; align-items: center; justify-content: center; }
  .logo svg { width: 28px; height: 28px; } .logo svg * { fill: #fff !important; stroke: #fff; }
  .name { font-size: 30px; font-weight: 800; letter-spacing: -0.5px; }
  .sub { font-size: 21px; color: #4c5670; font-weight: 500; }
  h1 { position: absolute; left: 72px; right: 72px; top: 246px; margin: 0; font-size: 60px; line-height: 1.12; font-weight: 800; letter-spacing: -1.6px; text-wrap: balance; }
  h1.long { font-size: 52px; top: 232px; }
  .pills { position: absolute; left: 72px; bottom: 64px; display: flex; gap: 14px; }
  .pill { background: #3b52d9; color: #fff; font-size: 22px; font-weight: 700; padding: 8px 22px; border-radius: 999px; }
</style></head><body><div class="dots"></div><div class="blob"></div>
<div class="brand"><div class="logo">${svg.replace('<svg', '<svg fill="#fff"')}</div><span class="name">grafloria</span><span class="sub">· ${sub}</span></div>
<h1 class="${title.length > 52 ? 'long' : ''}">${title}</h1><div class="pills">${tags}</div></body></html>`;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html); await page.waitForTimeout(300);
await page.screenshot({ path: out });
await browser.close(); console.log('og written', out);
