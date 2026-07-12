import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const here = dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1560, height: 860 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));

await page.goto('http://localhost:4600');
await page.waitForFunction(() => window.__PLAYGROUND_READY__ === true);
await page.check('#smartPorts');
await page.waitForTimeout(300);

// move A to the canvas centre first, then orbit B around it (all positions
// must stay inside the 1160x640 viewport or the node gets culled)
const positions = [
  ['E', 920, 300], ['NE', 860, 120], ['N', 590, 60], ['NW', 320, 100],
  ['W', 260, 300], ['SW', 320, 480], ['S', 590, 520], ['SE', 860, 470],
];

async function dragNodeByLabel(label, wx, wy) {
  const from = await page.evaluate((lbl) => {
    const svg = document.getElementById('diagram-svg');
    const g = [...svg.querySelectorAll('[data-vnode-key^="node-"]')].find(n => n.textContent?.includes(lbl));
    const r = g.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, label);
  const to = await page.evaluate(([wx, wy]) => {
    const svg = document.getElementById('diagram-svg');
    const m = svg.getScreenCTM();
    return { x: (wx + 60) * m.a + m.e, y: (wy + 28) * m.d + m.f };
  }, [wx, wy]);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(150);
}
await dragNodeByLabel('A', 540, 272);

// two passes: ports SHOWN (smart snaps to the closest visible port) and
// ports HIDDEN (attachment floats along the edge)
for (const [mode, suffix] of [['shown', 'ports'], ['hidden', 'float']]) {
  if (mode === 'shown') await page.check('#showPorts');
  else await page.uncheck('#showPorts');
  await page.waitForTimeout(200);
  for (const [name, x, y] of positions) {
    await dragNodeByLabel('B', x, y);
    await page.locator('#canvas').screenshot({ path: join(here, 'out', `smart-${suffix}-${name}.png`) });
  }
}
console.log('pageErrors:', errors.length, errors.slice(0, 3));
await browser.close();
