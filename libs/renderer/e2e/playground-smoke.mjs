import { spawn } from 'child_process';
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const here = dirname(fileURLToPath(import.meta.url));
const server = spawn('node', [join(here, 'playground.mjs')], { stdio: 'pipe' });
await new Promise(r => setTimeout(r, 1500));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 800 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));

await page.goto('http://localhost:4600');
await page.waitForFunction(() => window.__PLAYGROUND_READY__ === true, null, { timeout: 15000 });
await page.screenshot({ path: join(here, 'out', 'pg-1-basics.png') });

// scenario: crossings + toggle jumps off/on + style bridge
await page.selectOption('#scenario', 'crossings');
await page.waitForTimeout(200);
await page.screenshot({ path: join(here, 'out', 'pg-2-crossings.png') });

// drag node D to the right (near the other vertical link)
const d = await page.locator('[data-vnode-key^="node-"]:has(text)').all();
// drag by coordinates: find node D label position via evaluate
const box = await page.evaluate(() => {
  const svg = document.getElementById('diagram-svg');
  const nodes = [...svg.querySelectorAll('[data-vnode-key^="node-"]')];
  const target = nodes.find(n => n.textContent?.includes('C'));
  const r = target.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
await page.mouse.move(box.x, box.y);
await page.mouse.down();
await page.mouse.move(box.x + 180, box.y, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(200);
await page.screenshot({ path: join(here, 'out', 'pg-3-dragged.png') });

// waypoints scenario: select link, dblclick to add waypoint, check handle exists
await page.selectOption('#scenario', 'waypoints');
await page.waitForTimeout(200);
const linkPos = await page.evaluate(() => {
  const p = document.querySelector('[data-vnode-key^="link-"] path');
  const len = p.getTotalLength();
  const mid = p.getPointAtLength(len / 2);
  const svg = document.getElementById('diagram-svg');
  const m = svg.getScreenCTM();
  return { x: mid.x * m.a + m.e, y: mid.y * m.d + m.f };
});
await page.mouse.click(linkPos.x, linkPos.y);          // select
await page.mouse.dblclick(linkPos.x, linkPos.y);       // add waypoint
await page.waitForTimeout(200);
const handles = await page.locator('.pg-waypoint').count();
await page.screenshot({ path: join(here, 'out', 'pg-4-waypoint.png') });

// dark theme + arrow zoo
await page.selectOption('#scenario', 'zoo');
await page.check('#theme');
await page.waitForTimeout(300);
await page.screenshot({ path: join(here, 'out', 'pg-5-zoo-dark.png') });

console.log('waypointHandles:', handles, 'pageErrors:', errors.length, errors.slice(0, 2));
await browser.close();
server.kill();
process.exit(errors.length ? 1 : 0);
