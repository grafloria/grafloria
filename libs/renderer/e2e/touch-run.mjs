// Touch & mobile gesture harness — wave 9, card 2.
//
//   node libs/renderer/e2e/touch-run.mjs
//
// Drives REAL touch input at the REAL createDiagram() pipeline in headless
// Chromium (`hasTouch: true`), using CDP `Input.dispatchTouchEvent` so that
// MULTI-touch — the pinch — is genuine: two independently-moving touch points in
// one event, which `page.touchscreen` cannot express (it taps with one finger).
//
// WHY NOT JSDOM. This suite exists because a jsdom "touch test" proves nothing:
//   - jsdom implements NO PointerEvent at all, so the entire pipeline under test
//     (pointerdown/move/up, pointerType, setPointerCapture) does not exist there;
//   - jsdom does not implement `touch-action`, so the single most important line
//     in the feature — `touch-action: none`, without which the browser silently
//     eats the gesture and stops delivering moves — is invisible to it;
//   - jsdom will happily accept a synthetic touch sequence a real browser would
//     never emit, so a green jsdom suite is compatible with a canvas that cannot
//     be panned by a human being.
//
// THE CONTROL. Assertions that can only go green are worthless, so this run
// includes a control: it re-enables the browser's native touch handling by
// setting `touch-action: auto` on the container, repeats the pan gesture, and
// asserts the canvas DOES NOT pan. If that control ever comes back "panned", the
// harness is not really at the mercy of touch-action and its verdicts mean
// nothing — so the run FAILS.
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..', '..', '..');
mkdirSync(join(here, 'out'), { recursive: true });

await build({
  entryPoints: [join(here, 'touch-harness.ts')],
  bundle: true,
  format: 'iife',
  outfile: join(here, 'touch-bundle.js'),
  platform: 'browser',
  target: 'es2020',
  alias: {
    '@grafloria/engine': join(repo, 'libs/engine/src/index.ts'),
    '@grafloria/renderer': join(repo, 'libs/renderer/src/index.ts'),
    'fs/promises': join(here, 'node-stubs.ts'),
    path: join(here, 'node-stubs.ts'),
  },
  tsconfigRaw: {
    compilerOptions: {
      experimentalDecorators: true,
      emitDecoratorMetadata: false,
      useDefineForClassFields: false,
    },
  },
  logLevel: 'warning',
});

const browser = await chromium.launch();
// hasTouch: the browser reports a touchscreen and will DELIVER pointerType:'touch'.
const context = await browser.newContext({
  viewport: { width: 1200, height: 900 },
  hasTouch: true,
  isMobile: false,
});
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));

await page.goto('file://' + join(here, 'touch-index.html'));
await page.waitForFunction(() => window.__DONE__ === true, null, { timeout: 60000 });

// --- CDP: genuine multi-touch --------------------------------------------------
const cdp = await context.newCDPSession(page);

const touchPoints = (pts) => pts.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y), id: p.id }));

async function touchStart(pts) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: touchPoints(pts) });
}
async function touchMove(pts) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: touchPoints(pts) });
}
async function touchEnd() {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

const state = () => page.evaluate(() => window.__touch.state());
const reset = async () => {
  await page.evaluate(() => window.__touch.reset());
  await page.waitForTimeout(30);
};
const nodeCenter = (id) => page.evaluate((n) => window.__touch.nodeCenterClient(n), id);

const EXPECT = [];
const expectThat = (name, pass, detail = '') => EXPECT.push({ name, pass: !!pass, detail });

/** Drag one finger along a straight line in `steps` real touchMove events. */
async function oneFingerDrag(from, to, steps = 12, holdMs = 0) {
  await touchStart([{ ...from, id: 1 }]);
  if (holdMs) await page.waitForTimeout(holdMs);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    await touchMove([{ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t, id: 1 }]);
  }
  await touchEnd();
  await page.waitForTimeout(40);
}

/** Two fingers moving apart/together about a fixed centre — a real pinch. */
async function pinch(center, startGap, endGap, steps = 14) {
  const at = (gap) => [
    { x: center.x - gap / 2, y: center.y, id: 1 },
    { x: center.x + gap / 2, y: center.y, id: 2 },
  ];
  await touchStart(at(startGap));
  for (let i = 1; i <= steps; i++) {
    const gap = startGap + (endGap - startGap) * (i / steps);
    await touchMove(at(gap));
  }
  await touchEnd();
  await page.waitForTimeout(40);
}

// =============================================================================
// 0. touch-action — the line the whole feature stands on
// =============================================================================
{
  const ta = await page.evaluate(() => window.__touch.touchAction());
  expectThat(
    'card2: the binder sets touch-action:none on the container (without it the browser eats every gesture)',
    ta === 'none',
    `computed touch-action = ${ta}`
  );
}

// =============================================================================
// 1. One-finger pan
// =============================================================================
{
  await reset();
  const before = await state();
  // Start on EMPTY canvas (bottom-right of the stage, away from both nodes).
  await oneFingerDrag({ x: 850, y: 620 }, { x: 650, y: 470 });
  const after = await state();

  const dx = after.viewport.x - before.viewport.x;
  const dy = after.viewport.y - before.viewport.y;
  // Dragged up-left ⇒ camera moves right/down in world space.
  expectThat(
    'card2: ONE-FINGER PAN moves the camera (and the model is untouched)',
    Math.abs(dx - 200) < 30 && Math.abs(dy - 150) < 30,
    `viewport moved by (${dx.toFixed(1)}, ${dy.toFixed(1)}), expected ~(200, 150)`
  );
  expectThat(
    'card2: a pan does NOT move any node',
    after.a.x === before.a.x && after.a.y === before.a.y,
    `node A ${JSON.stringify(before.a)} -> ${JSON.stringify(after.a)}`
  );
}

// =============================================================================
// 2. Tap to select
// =============================================================================
{
  await reset();
  const centerA = await nodeCenter('A');
  await touchStart([{ ...centerA, id: 1 }]);
  await page.waitForTimeout(60); // a tap: short, still
  await touchEnd();
  await page.waitForTimeout(40);

  const s = await state();
  expectThat(
    'card2: TAP selects the node under the finger',
    s.selected.includes('A'),
    `selected = [${s.selected.join(',')}]`
  );
  expectThat(
    'card2: tap emits node:click + selection:change',
    s.events.includes('node:click') && s.events.includes('selection:change'),
    `events = ${s.events.join(',')}`
  );
}

// Tap on empty canvas clears the selection.
{
  const before = await state();
  await touchStart([{ x: 880, y: 640, id: 1 }]);
  await page.waitForTimeout(60);
  await touchEnd();
  await page.waitForTimeout(40);
  const s = await state();
  expectThat(
    'card2: TAP on empty canvas clears the selection',
    before.selected.length > 0 && s.selected.length === 0,
    `${before.selected.length} selected -> ${s.selected.length}`
  );
}

// =============================================================================
// 3. One-finger node drag
// =============================================================================
{
  await reset();
  const centerA = await nodeCenter('A');
  const before = await state();
  await oneFingerDrag(centerA, { x: centerA.x + 180, y: centerA.y + 90 });
  const after = await state();

  const dx = after.a.x - before.a.x;
  const dy = after.a.y - before.a.y;
  expectThat(
    'card2: ONE-FINGER DRAG on a node moves that node',
    Math.abs(dx - 180) < 30 && Math.abs(dy - 90) < 30,
    `node A moved (${dx.toFixed(1)}, ${dy.toFixed(1)}), expected ~(180, 90)`
  );
  expectThat(
    'card2: dragging a node does NOT also pan the camera',
    Math.abs(after.viewport.x - before.viewport.x) < 2,
    `viewport.x ${before.viewport.x} -> ${after.viewport.x}`
  );
}

// =============================================================================
// 3.5 wave12/node-resize — RESIZE MUST WORK WITH A FINGER.
//
// A resize handle appears once a node is selected (tap already proven). Then a
// ONE-FINGER drag STARTING ON the SE corner handle must GROW the node — not pan,
// not drag it — through the real touch pipeline. If the touch controller has no
// resize branch (the state this wave fixes), the finger drags the node instead
// and its SIZE never changes, so this goes red.
// =============================================================================
{
  await reset();
  // Select A with a tap so its handles exist.
  const centerA = await nodeCenter('A');
  await touchStart([{ ...centerA, id: 1 }]);
  await page.waitForTimeout(60);
  await touchEnd();
  await page.waitForTimeout(40);

  const sizeBefore = await page.evaluate(() => window.__touch.nodeSize('A'));
  const posBefore = (await state()).a;
  const se = await page.evaluate(() => window.__touch.nodeHandleClient('A', 1, 1));

  // Drag the SE corner +120 right / +70 down.
  await oneFingerDrag({ x: se.x, y: se.y }, { x: se.x + 120, y: se.y + 70 }, 14);

  const sizeAfter = await page.evaluate(() => window.__touch.nodeSize('A'));
  const posAfter = (await state()).a;

  expectThat(
    'wave12/node-resize: a ONE-FINGER drag on the SE handle GROWS the node',
    sizeAfter.width - sizeBefore.width > 80 && sizeAfter.height - sizeBefore.height > 40,
    `size ${sizeBefore.width}x${sizeBefore.height} -> ${sizeAfter.width}x${sizeAfter.height} (expected ~+120/+70)`
  );
  expectThat(
    'wave12/node-resize: resizing does NOT move the anchored NW corner, and does NOT pan',
    Math.abs(posAfter.x - posBefore.x) < 2 && Math.abs(posAfter.y - posBefore.y) < 2,
    `node A ${JSON.stringify(posBefore)} -> ${JSON.stringify(posAfter)}`
  );
}

// =============================================================================
// 4. Two-finger pinch zoom (REAL multi-touch, via CDP)
// =============================================================================
{
  await reset();
  const before = await state();
  await pinch({ x: 500, y: 350 }, 120, 320); // spread → zoom IN
  const zoomedIn = await state();

  expectThat(
    'card2: PINCH OUT zooms in (two real touch points, dispatched together)',
    zoomedIn.zoom > before.zoom * 1.6,
    `zoom ${before.zoom.toFixed(3)} -> ${zoomedIn.zoom.toFixed(3)} (finger gap 120 -> 320 ⇒ expect ~2.67x)`
  );

  await pinch({ x: 500, y: 350 }, 320, 120); // pinch → zoom OUT
  const zoomedOut = await state();
  expectThat(
    'card2: PINCH IN zooms back out',
    zoomedOut.zoom < zoomedIn.zoom * 0.7,
    `zoom ${zoomedIn.zoom.toFixed(3)} -> ${zoomedOut.zoom.toFixed(3)}`
  );

  expectThat(
    'card2: a pinch never mutates the model (zoom is camera-only)',
    zoomedOut.a.x === before.a.x && zoomedOut.a.y === before.a.y,
    `node A ${JSON.stringify(before.a)} -> ${JSON.stringify(zoomedOut.a)}`
  );
}

// Pinch is anchored between the fingers: the world point under the pinch centre
// must stay put. That is the difference between a pinch and a zoom button.
{
  await reset();
  const anchor = { x: 500, y: 350 };
  const worldBefore = await page.evaluate(
    (p) => window.__touch.clientToWorld(p.x, p.y),
    anchor
  );
  await pinch(anchor, 140, 300);
  const worldAfter = await page.evaluate(
    (p) => window.__touch.clientToWorld(p.x, p.y),
    anchor
  );

  const drift = Math.hypot(worldAfter.x - worldBefore.x, worldAfter.y - worldBefore.y);
  expectThat(
    'card2: PINCH IS ANCHORED — the world point between the fingers stays under them',
    drift < 8,
    `world under the pinch centre drifted ${drift.toFixed(2)}px ` +
      `[(${worldBefore.x.toFixed(1)}, ${worldBefore.y.toFixed(1)}) -> (${worldAfter.x.toFixed(1)}, ${worldAfter.y.toFixed(1)})]`
  );
}

// =============================================================================
// 5. Two-finger pan
// =============================================================================
{
  await reset();
  const before = await state();
  const pair = (cx, cy) => [
    { x: cx - 60, y: cy, id: 1 },
    { x: cx + 60, y: cy, id: 2 },
  ];
  await touchStart(pair(500, 350));
  for (let i = 1; i <= 12; i++) {
    await touchMove(pair(500 - i * 10, 350 - i * 5)); // constant gap ⇒ pure pan
  }
  await touchEnd();
  await page.waitForTimeout(40);
  const after = await state();

  const dx = after.viewport.x - before.viewport.x;
  expectThat(
    'card2: TWO-FINGER PAN (constant gap) pans without zooming',
    dx > 80 && Math.abs(after.zoom - before.zoom) < 0.06,
    `viewport.x +${dx.toFixed(1)}, zoom ${before.zoom.toFixed(3)} -> ${after.zoom.toFixed(3)}`
  );
}

// =============================================================================
// 6. Long-press → context menu
// =============================================================================
{
  await reset();
  const centerB = await nodeCenter('B');
  await touchStart([{ ...centerB, id: 1 }]);
  await page.waitForTimeout(700); // > 500ms longPressMs, finger still
  const during = await state();
  await touchEnd();
  await page.waitForTimeout(40);

  expectThat(
    'card2: LONG-PRESS (500ms, stationary) emits a contextmenu event',
    during.events.includes('contextmenu'),
    `events = ${during.events.join(',')}`
  );
  expectThat(
    'card2: the contextmenu payload names the NODE under the finger (not just "somewhere")',
    during.lastContextMenu?.source === 'touch' && during.lastContextMenu?.nodeId === 'B',
    `payload = ${JSON.stringify(during.lastContextMenu)}`
  );
}

// A long-press that MOVES is a drag, not a menu.
{
  await reset();
  const centerA = await nodeCenter('A');
  await oneFingerDrag(centerA, { x: centerA.x + 150, y: centerA.y }, 12, 0);
  const s = await state();
  expectThat(
    'card2: a MOVING finger does not fire the long-press menu',
    !s.events.includes('contextmenu'),
    `events = ${s.events.join(',')}`
  );
}

// =============================================================================
// 7. Touch-sized hit targets
// =============================================================================
{
  await reset();
  // Slop is applied for the duration of a touch gesture. Press and hold, read it.
  await touchStart([{ x: 850, y: 620, id: 1 }]);
  await page.waitForTimeout(30);
  const during = await state();
  await touchEnd();
  await page.waitForTimeout(40);
  const after = await state();

  expectThat(
    'card2: TOUCH HIT SLOP is applied during a touch gesture (ports/handles become finger-sized)',
    during.hitSlop >= 15.9,
    `hitSlop during touch = ${during.hitSlop} world units @ zoom 1 (16 CSS px)`
  );
  expectThat(
    'card2: hit slop is CLEARED when the gesture ends (a mouse keeps pixel precision)',
    after.hitSlop === 0,
    `hitSlop after = ${after.hitSlop}`
  );
}

// Drag-to-connect, port -> port, landing OFF-CENTRE on both ends so that the
// touch slop is what makes the gesture possible at all.
//
// The offset is deliberate and calibrated: a mouse hit radius here is
// portDefaultRadius*hoverScale + 2 ≈ 10px, so a finger landing ~12.8px from the
// port centre MISSES with mouse precision and HITS only because touch adds 16px
// of slop. If someone deletes setHitSlop(), this assertion goes red — which is
// the only reason it is worth writing.
{
  await reset();
  const before = await state();
  const portA = await page.evaluate(() => window.__touch.portClient('A', 'right'));
  const portB = await page.evaluate(() => window.__touch.portClient('B', 'left'));

  await oneFingerDrag(
    { x: portA.x + 10, y: portA.y + 8 },  // 12.8px off the source port
    { x: portB.x - 9, y: portB.y + 7 },   // 11.4px off the target port
    16
  );
  const after = await state();

  expectThat(
    'card2: DRAG-TO-CONNECT works from a port only reachable via the TOUCH SLOP (12.8px off-centre; a mouse would miss)',
    after.links > before.links,
    `links ${before.links} -> ${after.links}`
  );
}

// =============================================================================
// 8. Read-only / presentation mode (card 7) — under TOUCH
// =============================================================================
{
  await reset();
  await page.evaluate(() => window.__touch.setReadonly(true));

  const before = await state();
  expectThat('card7: setMode(PRESENTATION) locks the document', before.readonly === true, '');

  // Try to drag a node with a finger.
  const centerA = await nodeCenter('A');
  await oneFingerDrag(centerA, { x: centerA.x + 200, y: centerA.y + 120 });
  const afterDrag = await state();
  expectThat(
    'card7: in read-only, a touch drag on a node does NOT move it',
    afterDrag.a.x === before.a.x && afterDrag.a.y === before.a.y,
    `node A ${JSON.stringify(before.a)} -> ${JSON.stringify(afterDrag.a)}`
  );

  // Try to draw a connection from a port.
  const port = await page.evaluate(() => window.__touch.portClient('A'));
  const centerB = await nodeCenter('B');
  await oneFingerDrag({ x: port.x, y: port.y }, centerB, 16);
  const afterConnect = await state();
  expectThat(
    'card7: in read-only, drag-to-connect creates NO link',
    afterConnect.links === before.links,
    `links ${before.links} -> ${afterConnect.links}`
  );

  // ...but PAN and ZOOM must still work. That is the whole point of the mode.
  const beforePan = await state();
  await oneFingerDrag({ x: 850, y: 620 }, { x: 700, y: 500 });
  const afterPan = await state();
  expectThat(
    'card7: in read-only, ONE-FINGER PAN still works',
    Math.abs(afterPan.viewport.x - beforePan.viewport.x) > 100,
    `viewport.x ${beforePan.viewport.x.toFixed(1)} -> ${afterPan.viewport.x.toFixed(1)}`
  );

  await pinch({ x: 500, y: 350 }, 120, 300);
  const afterZoom = await state();
  expectThat(
    'card7: in read-only, PINCH-ZOOM still works',
    afterZoom.zoom > afterPan.zoom * 1.5,
    `zoom ${afterPan.zoom.toFixed(3)} -> ${afterZoom.zoom.toFixed(3)}`
  );

  // Tap-to-select must still work: a locked diagram must remain readable, and the
  // a11y layer depends on selection state.
  //
  // Restore the camera first. The pan+zoom above pushed node A off the visible
  // stage, so a tap aimed at it would land outside the container and never reach
  // the binder at all. reset() must run UNLOCKED because it repositions the nodes
  // and read-only refuses that — which is itself the lock working correctly.
  await page.evaluate(() => window.__touch.setReadonly(false));
  await reset();
  await page.evaluate(() => window.__touch.setReadonly(true));
  const centerA2 = await nodeCenter('A');
  await touchStart([{ ...centerA2, id: 1 }]);
  await page.waitForTimeout(60);
  await touchEnd();
  await page.waitForTimeout(40);
  const afterTap = await state();
  expectThat(
    'card7: in read-only, TAP-TO-SELECT still works (viewing is not editing)',
    afterTap.selected.includes('A'),
    `selected = [${afterTap.selected.join(',')}]`
  );

  await page.evaluate(() => window.__touch.setReadonly(false));
}

// =============================================================================
// 8.5 wave10/whiteboard — DRAWING MUST WORK WITH A FINGER.
//
// The whiteboard draw tool goes through the tool registry, and touch had to be taught to give
// a registered tool first refusal just like the mouse ladder does — otherwise ink would be a
// mouse-only feature. Flip the tool on, draw a curve with ONE finger through real touch
// events, and assert a STROKE ENTITY now exists in the model (a consequence, not "a path
// appeared"), simplified from the many touchMove samples.
// =============================================================================
{
  await reset();
  const before = await page.evaluate(() => window.__touch.strokeCount());
  await page.evaluate(() => window.__touch.enableDraw());

  // A curved drag: 24 touchMove samples the tool must simplify down at commit.
  await touchStart([{ x: 200, y: 200, id: 1 }]);
  for (let i = 1; i <= 24; i++) {
    await touchMove([{ x: 200 + i * 12, y: 200 + Math.round(Math.sin(i / 3) * 30), id: 1 }]);
  }
  await touchEnd();
  await page.waitForTimeout(40);

  const after = await page.evaluate(() => window.__touch.strokeCount());
  const pts = await page.evaluate(() => window.__touch.lastStrokePointCount());
  expectThat(
    'wave10/whiteboard: a ONE-FINGER drag with the draw tool commits a STROKE to the model',
    after === before + 1,
    `strokes ${before} -> ${after}`
  );
  expectThat(
    'wave10/whiteboard: the committed finger-stroke is SIMPLIFIED (fewer points than the 25 samples)',
    pts > 1 && pts < 25,
    `committed ${pts} points from 25 samples`
  );

  await page.evaluate(() => window.__touch.disableDraw());

  // …and with the tool OFF again, one finger PANS — proving the tool truly released the
  // gesture and did not leave touch drawing-locked.
  const panBefore = await state();
  await oneFingerDrag({ x: 850, y: 620 }, { x: 700, y: 500 });
  const panAfter = await state();
  expectThat(
    'wave10/whiteboard: with the draw tool OFF, one finger pans again (the tool released touch)',
    Math.abs(panAfter.viewport.x - panBefore.viewport.x) > 50,
    `viewport.x ${panBefore.viewport.x.toFixed(1)} -> ${panAfter.viewport.x.toFixed(1)}`
  );
}

// =============================================================================
// 9. THE CONTROL — prove this harness is actually at the mercy of touch-action.
//
// Put touch-action back to `auto` and repeat the pan. The browser must now claim
// the gesture for native scrolling and our pan must NOT happen. If it pans
// anyway, then touch-action was never load-bearing here, the harness cannot see
// the failure it exists to prevent, and every verdict above is untrustworthy.
// =============================================================================
{
  await reset();
  await page.evaluate(() => {
    document.getElementById('stage').style.touchAction = 'auto';
  });
  const before = await state();
  await oneFingerDrag({ x: 850, y: 620 }, { x: 650, y: 470 });
  const after = await state();
  const moved = Math.abs(after.viewport.x - before.viewport.x);

  expectThat(
    'CONTROL: with touch-action:auto the browser steals the gesture and the canvas does NOT pan',
    moved < 20,
    moved < 20
      ? `canvas stayed put (Δ${moved.toFixed(1)}px) — touch-action is genuinely load-bearing`
      : `canvas panned ${moved.toFixed(1)}px ANYWAY — the control is blind; this harness cannot prove touch-action matters`
  );

  await page.evaluate(() => {
    document.getElementById('stage').style.touchAction = 'none';
  });
}

// =============================================================================
// report
// =============================================================================
const passed = EXPECT.filter((e) => e.pass).length;
for (const e of EXPECT) {
  console.log(`${e.pass ? '  ok  ' : '  FAIL'} ${e.name}${e.detail ? `\n         ${e.detail}` : ''}`);
}
console.log(`\ntouch expectations: ${passed}/${EXPECT.length} passed`);
console.log(`page errors: ${pageErrors.length}`);
for (const e of pageErrors) console.log('  ' + e);

await browser.close();
process.exit(passed === EXPECT.length && pageErrors.length === 0 ? 0 : 1);
