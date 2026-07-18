/**
 * Scrollable-card gate — proves wheel-over-card DELEGATION end to end with a
 * real mouse wheel, in a real browser, through the real bundle.
 *
 * Why a live gate when the renderer has unit specs: the first version of this
 * feature was unit-green and completely dead in the browser — card content is
 * `pointer-events: none`, so the wheel's target is SVG and the original
 * HTML-ancestor walk never ran. Only a real wheel over the real DOM catches
 * that class of bug (same lesson as DEAD-BUTTON).
 *
 * Contract (matching every design tool with scrollable cards):
 *   1. a fixed-height kit card with more rows than fit is scrollable;
 *   2. a plain wheel over it scrolls the CARD, not the canvas;
 *   3. the scroll clamps at the range end;
 *   4. CONTAINMENT: at the end, one more wheel does NOT pan the canvas — the
 *      card absorbs it (reaching the bottom must never jump the whole diagram);
 *   5. ctrl/⌘-wheel over the card zooms the canvas, never scrolls the card.
 *
 * Run: node demos/e2e/scroll-run.mjs   (needs the demo server on :4321)
 */
import { chromium } from 'playwright';

const checks = [];
const check = (name, ok, detail) => {
  checks.push(ok);
  console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`);
};

const b = await chromium.launch({ args: ['--disable-blink-features=AutomationControlled'] });
const p = await b.newPage({ viewport: { width: 1200, height: 800 } });
const pageErrors = [];
p.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 160)));
await p.goto('http://127.0.0.1:4321/e2e/scroll-harness.html');
await p.waitForFunction(() => window.__harnessReady === true, { timeout: 20000 });
await p.waitForTimeout(300);

const state = () => p.evaluate(() => window.harness.state());

console.log('--- scrollable kit card: wheel delegation contract ---');

const s0 = await state();
check('fixed-height card is scrollable (max > 0)', s0.max > 100, `max=${s0.max}`);
check('boots unscrolled, canvas at origin', s0.scrollTop === 0 && s0.panX === 0 && s0.panY === 0);

const pos = await p.evaluate(() => {
  const r = document.querySelector('.axk-entity-body').getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + 60 };
});
await p.mouse.move(pos.x, pos.y);
await p.mouse.wheel(0, 240);
await p.waitForTimeout(150);
const s1 = await state();
check('plain wheel scrolls the CARD', s1.scrollTop === 240, `scrollTop=${s1.scrollTop}`);
check('...and does NOT pan the canvas', s1.panX === 0 && s1.panY === 0, `pan=${s1.panX},${s1.panY}`);

await p.mouse.wheel(0, 6000);
await p.waitForTimeout(150);
const s2 = await state();
check('scroll clamps at range end', s2.scrollTop === s2.max, `scrollTop=${s2.scrollTop} max=${s2.max}`);
check('...still no pan while clamping', s2.panX === 0 && s2.panY === 0, `pan=${s2.panX},${s2.panY}`);

await p.mouse.wheel(0, 240);
await p.waitForTimeout(150);
const s3 = await state();
check('CONTAINMENT: at range end the canvas does NOT pan', s3.panX === 0 && s3.panY === 0, `pan=${s3.panX},${s3.panY}`);
check('...and the card stays at its clamped end', s3.scrollTop === s3.max, `scrollTop=${s3.scrollTop}`);

// Fresh page (the takeover pan moved the card off-screen), then prove
// pinch-zoom always belongs to the canvas even over scrollable content.
await p.reload();
await p.waitForFunction(() => window.__harnessReady === true, { timeout: 20000 });
await p.waitForTimeout(300);
const before = await p.evaluate(() => {
  const vb = window.harness.api.viewport.getViewBox();
  const body = document.querySelector('.axk-entity-body');
  body.scrollTop = 100;
  const r = body.getBoundingClientRect();
  return { vb: JSON.stringify(vb), scrollTop: body.scrollTop, x: r.x + r.width / 2, y: r.y + 40 };
});
await p.mouse.move(before.x, before.y);
await p.keyboard.down('Control');
await p.mouse.wheel(0, -240);
await p.keyboard.up('Control');
await p.waitForTimeout(150);
const after = await p.evaluate(() => ({
  vb: JSON.stringify(window.harness.api.viewport.getViewBox()),
  scrollTop: Math.round(document.querySelector('.axk-entity-body').scrollTop),
}));
check('ctrl-wheel over the card ZOOMS the canvas', after.vb !== before.vb);
check('...and never scrolls the card', after.scrollTop === before.scrollTop, `scrollTop ${before.scrollTop}->${after.scrollTop}`);

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await b.close();
const failed = checks.filter((c) => !c).length;
console.log(failed === 0 ? `\nscroll gate: ${checks.length}/${checks.length} checks pass` : `\nscroll gate: ${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
