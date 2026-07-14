// Wave 9 (Collaboration) — Card 5: REAL CROSS-TAB MULTIPLAYER, IN A REAL BROWSER.
//
// =============================================================================
// WHY THIS EXISTS WHEN THE JEST SUITE IS ALREADY GREEN
// =============================================================================
//
// The engine tests prove convergence over a hostile channel. The renderer tests prove a real
// drag in one jsdom pane lands in another. Both are real. Neither is a BROWSER.
//
// This is: TWO ACTUAL TABS, in one Chromium, on one real HTTP origin, talking over the
// browser's own BroadcastChannel — the same primitive a user gets when they open the same
// document twice. Nothing here is stubbed. No fixture, no fake transport, no in-process hub.
// Playwright moves a real mouse across tab 1; the assertions are read out of tab 2.
//
// It proves the four things that cannot be proven anywhere else:
//
//   1. A REAL DRAG in one tab moves the node in the other tab's MODEL and DOM.
//   2. A tab opened LATE is caught up by the tab already there — the channel has NO history,
//      so anti-entropy is the only reason a second tab ever sees the document at all.
//   3. A REAL MOUSE puts a REAL CURSOR, with the right name and the right world position, in
//      the other tab — and never once in the op log.
//   4. RECONNECT: close the channel, edit on BOTH sides, reopen, converge.
//
// =============================================================================
// WHY AN HTTP SERVER AND NOT file://
// =============================================================================
// BroadcastChannel is scoped to an ORIGIN, and Chromium gives every `file://` document an
// OPAQUE origin — so two file:// tabs are two different origins and the channel silently
// delivers nothing. The test would fail for a reason that has nothing to do with the code.
// Twelve lines of `http.createServer` buys a real origin, and with it a real channel.

import { build } from 'esbuild';
import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, resolve, extname } from 'path';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..', '..', '..');
const outDir = join(here, 'out');
mkdirSync(outDir, { recursive: true });

await build({
  entryPoints: [join(here, 'sync-harness.ts')],
  bundle: true,
  format: 'iife',
  outfile: join(here, 'sync-bundle.js'),
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

// ---- a real origin ----------------------------------------------------------
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = createServer((req, res) => {
  const file = join(here, (req.url ?? '/').split('?')[0] === '/' ? '/sync-index.html' : req.url);
  try {
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'text/plain' });
    res.end(readFileSync(file));
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
});
await new Promise((r) => server.listen(0, r));
const origin = `http://localhost:${server.address().port}`;

// ---- expectations -----------------------------------------------------------
const EXPECT = [];
const expectThat = (name, pass, detail = '') => EXPECT.push({ name, pass: !!pass, detail });

const browser = await chromium.launch();
// ONE context = one browsing session = one origin partition. Two tabs in it share a
// BroadcastChannel, exactly as two tabs of a real app do. (Two separate CONTEXTS would be
// two separate storage partitions and would NOT share the channel — worth knowing before
// you spend an afternoon on it.)
const context = await browser.newContext({ viewport: { width: 1000, height: 700 } });

const pageErrors = [];
const tabA = await context.newPage();
const tabB = await context.newPage();
for (const [name, page] of [['A', tabA], ['B', tabB]]) {
  page.on('pageerror', (e) => pageErrors.push(`tab${name}: ${String(e)}`));
}

const settle = async (ms = 250) => new Promise((r) => setTimeout(r, ms));

// =============================================================================
// 1. Tab A opens the document.
// =============================================================================
await tabA.goto(origin);
await tabA.waitForFunction(() => typeof window.__mount === 'function');
await tabA.evaluate(() => window.__mount('ana', 'Ana Silva', true));
await tabA.waitForFunction(() => window.__READY__ === true);
await settle();

const aSeeded = await tabA.evaluate(() => window.__state());
expectThat(
  'tab A seeded the document',
  aSeeded.nodes.length === 2,
  `nodes=${aSeeded.nodes.map((n) => n.id).join(',')}`
);

// =============================================================================
// 2. Tab B opens SECOND — and must be caught up by tab A.
//    The channel has no history. B missed everything. Anti-entropy is the ONLY way it ever
//    sees the document, which is why `hello` carries a frontier.
// =============================================================================
await tabB.goto(origin);
await tabB.waitForFunction(() => typeof window.__mount === 'function');
await tabB.evaluate(() => window.__mount('bo', 'Bo', false));
await tabB.waitForFunction(() => window.__READY__ === true);
await settle(600);

const bCaughtUp = await tabB.evaluate(() => window.__state());
expectThat(
  'a tab opened LATE is caught up by the tab already there (BroadcastChannel has no history)',
  bCaughtUp.nodes.length === 2 &&
    bCaughtUp.nodes.some((n) => n.id === 'alpha') &&
    bCaughtUp.nodes.some((n) => n.id === 'beta'),
  `tabB nodes=${JSON.stringify(bCaughtUp.nodes)}`
);
expectThat(
  'the caught-up tab has the right POSITIONS, not just the right ids',
  bCaughtUp.nodes.find((n) => n.id === 'alpha')?.x === 120 &&
    bCaughtUp.nodes.find((n) => n.id === 'beta')?.x === 480,
  JSON.stringify(bCaughtUp.nodes)
);

// =============================================================================
// 3. A REAL MOUSE DRAG in tab A. Real pointer events, real hit-test, real interaction stack,
//    real op capture, real batching, real BroadcastChannel, real remote Replica.
// =============================================================================
await tabA.bringToFront();
const nodeBox = await tabA.locator('[data-node-id="alpha"]').first().boundingBox();
expectThat('the node is really in tab A’s DOM to be grabbed', !!nodeBox, JSON.stringify(nodeBox));

const startX = nodeBox.x + nodeBox.width / 2;
const startY = nodeBox.y + nodeBox.height / 2;

await tabA.mouse.move(startX, startY);
await tabA.mouse.down();
for (let i = 1; i <= 12; i++) {
  await tabA.mouse.move(startX + i * 20, startY + i * 10);
  await tabA.waitForTimeout(16); // a real drag, at roughly frame cadence
}
await tabA.mouse.up();
await settle(500);

const aAfterDrag = await tabA.evaluate(() => window.__state());
const bAfterDrag = await tabB.evaluate(() => window.__state());

const aAlpha = aAfterDrag.nodes.find((n) => n.id === 'alpha');
const bAlpha = bAfterDrag.nodes.find((n) => n.id === 'alpha');

expectThat(
  'the drag actually moved the node in tab A',
  aAlpha.x > 120 + 100,
  `alpha moved to (${aAlpha.x}, ${aAlpha.y}) from (120, 120)`
);
expectThat(
  'THE HEADLINE: a real mouse drag in tab A moves the node in TAB B — over a real browser channel',
  bAlpha.x === aAlpha.x && bAlpha.y === aAlpha.y,
  `tabA=(${aAlpha.x},${aAlpha.y}) tabB=(${bAlpha.x},${bAlpha.y})`
);

// The node's FINAL position, not its first. A coalescer that kept the FIRST write per
// register would leave tab B's node a few pixels into the drag and never move it again —
// converged, silent, and wrong.
expectThat(
  'batching kept the LAST write of the drag, not the first (the node did not freeze mid-drag)',
  bAlpha.x > 120 + 100,
  `tabB alpha.x=${bAlpha.x} (would be ~124 if coalescing kept the first write)`
);

// …and tab B's DOM really repainted, not just its model.
const bDomX = await tabB.evaluate(() => {
  const el = document.querySelector('[data-node-id="alpha"]');
  return el ? el.getBoundingClientRect().x : -1;
});
expectThat('…and tab B REPAINTED — the node moved in its DOM, not just its model', bDomX > 100, `x=${bDomX}`);

// =============================================================================
// 4. LIVE CURSORS. A real mouse in tab A → a real cursor element in tab B.
// =============================================================================
await tabA.mouse.move(600, 400);
await settle(400);

const bCursors = await tabB.evaluate(() => window.__state());
const anaCursor = bCursors.cursors.find((c) => c.actor === 'ana');

expectThat(
  'a REAL mouse in tab A puts a REAL cursor in tab B',
  !!anaCursor && anaCursor.visible,
  JSON.stringify(bCursors.cursors)
);
expectThat(
  'the remote cursor carries the peer’s NAME',
  anaCursor?.label === 'Ana Silva',
  `label=${anaCursor?.label}`
);
expectThat(
  'the remote cursor is positioned (a transform was actually written)',
  !!anaCursor?.transform && anaCursor.transform.startsWith('translate('),
  `transform=${anaCursor?.transform}`
);
expectThat('tab B knows exactly one peer', bCursors.peers === 1, `peers=${bCursors.peers}`);

// =============================================================================
// 5. THE CONTAINMENT. A cursor is not a document edit, and a cursor does not repaint a
//    diagram. Both asserted in a real browser, where the frame gate is real.
//
//    THE MOUSE IS MOVED OVER EMPTY CANVAS, DELIBERATELY, AND THAT MATTERS.
//
//    Moving it over a NODE also fires this assertion — and it FAILS, for a reason that has
//    nothing to do with presence: `OpCapture` emits a document op for `state.hovered`, so a
//    mouse merely PASSING OVER a node writes to the shared document. That is a real bug (see
//    section 5b, which pins it), it lives in `collab/capture.ts` which this card does not
//    own, and it would silently mask the property being tested here.
//
//    So the cursor sweep is confined to empty canvas, where the ONLY thing crossing the wire
//    is awareness — which is exactly the claim: awareness costs the document nothing and
//    costs the renderer nothing.
// =============================================================================
const paintedBefore = (await tabB.evaluate(() => window.__state())).painted;
const logBefore = (await tabB.evaluate(() => window.__state())).logLength;

// y = 560 is below both nodes (they sit at world y=120 and y=300, 70 tall) — empty canvas.
for (let i = 0; i < 40; i++) {
  await tabA.mouse.move(120 + i * 15, 560);
  await tabA.waitForTimeout(12);
}
await settle(400);

const bAfterCursors = await tabB.evaluate(() => window.__state());

expectThat(
  'FORTY remote cursor moves added NOTHING to the op log — awareness never enters the document',
  bAfterCursors.logLength === logBefore,
  `before=${logBefore} after=${bAfterCursors.logLength}`
);
expectThat(
  'FORTY remote cursor moves did not repaint the diagram — the frame gate stayed shut',
  bAfterCursors.painted === paintedBefore,
  `painted before=${paintedBefore} after=${bAfterCursors.painted}`
);
expectThat(
  '…and the cursor DID move (or the two assertions above are vacuous)',
  bAfterCursors.cursors.find((c) => c.actor === 'ana')?.transform !== anaCursor?.transform,
  `was=${anaCursor?.transform} now=${bAfterCursors.cursors.find((c) => c.actor === 'ana')?.transform}`
);

// =============================================================================
// 5b. THE EPHEMERAL-STATE LEAK — a REAL BUG this harness found, pinned so it cannot be
//     quietly forgotten. NOT FIXED HERE: it lives in `collab/capture.ts`, which belongs to
//     wave9/crdt.
//
//     `state` holds BOTH durable document facts (visible, locked, expanded) and PER-VIEWER
//     ephemera (hovered, selected, focused), and `OpCapture` syncs the whole object. So
//     moving the mouse across a node writes two permanent ops into an append-only document
//     history — and the peer APPLIES them, so a node lights up on my screen because your
//     mouse is over it.
//
//     The fix is three lines, next to the `DERIVED` set that already exists in that file for
//     exactly this reason (`points` is excluded because it is derived; `hovered` should be
//     excluded because it is per-viewer). Presence already carries hover and selection on the
//     awareness channel, correctly — the op is not doing a job that would otherwise go
//     undone, it is doing damage.
// =============================================================================
const logBeforeHover = (await tabB.evaluate(() => window.__state())).logLength;

const alphaBox = await tabA.locator('[data-node-id="alpha"]').first().boundingBox();
await tabA.mouse.move(alphaBox.x + alphaBox.width / 2, alphaBox.y + alphaBox.height / 2);
await tabA.waitForTimeout(80);
await tabA.mouse.move(10, 590); // …and off it again
await settle(400);

const bAfterHover = await tabB.evaluate(() => window.__state());
expectThat(
  'HOVERING a node in tab A writes NOTHING to the shared document (fixed at merge, capture.ts)',
  bAfterHover.logLength === logBeforeHover,
  `log went ${logBeforeHover} → ${bAfterHover.logLength} from a real mouse crossing a real node. ` +
    `It must not move: a user moving a pointer is not editing a document, and an append-only ` +
    `history must not fill with hover events that outlive the session. NOTE this assertion was ` +
    `INVERTED at merge — it was written to characterise the defect, and now guards the fix. It ` +
    `took two real browser tabs to find: jsdom does not hover, and every unit test in the ` +
    `codebase was blind to it.`
);

// =============================================================================
// 6. RECONNECT. Tab B drops off the channel, BOTH tabs edit, tab B comes back.
// =============================================================================
await tabB.evaluate(() => window.__offline());
await settle(100);

await tabA.evaluate(() => window.__add('made-while-b-was-away', 700, 100));
await tabB.evaluate(() => window.__add('made-by-b-offline', 100, 500));
await settle(300);

const aDuring = await tabA.evaluate(() => window.__state());
const bDuring = await tabB.evaluate(() => window.__state());
expectThat(
  'while B is offline the two tabs really have DIVERGED (or the reconnect proves nothing)',
  !aDuring.nodes.some((n) => n.id === 'made-by-b-offline') &&
    !bDuring.nodes.some((n) => n.id === 'made-while-b-was-away'),
  `A=${aDuring.nodes.map((n) => n.id)} B=${bDuring.nodes.map((n) => n.id)}`
);

await tabB.evaluate(() => window.__online());
await settle(800);

const aFinal = await tabA.evaluate(() => window.__state());
const bFinal = await tabB.evaluate(() => window.__state());

const ids = (s) => s.nodes.map((n) => n.id).sort().join(',');
expectThat(
  'RECONNECT: both tabs edited while apart, and on reconnect they CONVERGE',
  ids(aFinal) === ids(bFinal) &&
    ids(aFinal) === 'alpha,beta,made-by-b-offline,made-while-b-was-away',
  `A=[${ids(aFinal)}] B=[${ids(bFinal)}]`
);

const same = (id) => {
  const a = aFinal.nodes.find((n) => n.id === id);
  const b = bFinal.nodes.find((n) => n.id === id);
  return a && b && a.x === b.x && a.y === b.y;
};
expectThat(
  '…and every node agrees on its POSITION, not merely its existence',
  aFinal.nodes.every((n) => same(n.id)),
  JSON.stringify({ a: aFinal.nodes, b: bFinal.nodes })
);

// ---- report -----------------------------------------------------------------
writeFileSync(join(outDir, 'sync-expectations.json'), JSON.stringify(EXPECT, null, 2));
writeFileSync(join(outDir, 'sync-page-errors.json'), JSON.stringify(pageErrors, null, 2));

await tabA.screenshot({ path: join(outDir, 'sync-tab-a.png') });
await tabB.screenshot({ path: join(outDir, 'sync-tab-b.png') });

const failed = EXPECT.filter((e) => !e.pass);
for (const e of failed) console.log(`EXPECTATION FAILED: ${e.name}${e.detail ? ` — ${e.detail}` : ''}`);
console.log(`cross-tab expectations: ${EXPECT.length - failed.length}/${EXPECT.length} passed`);
console.log('page errors:', pageErrors.length);
for (const e of pageErrors) console.log('  ', e);

await browser.close();
server.close();
process.exit(failed.length || pageErrors.length ? 1 : 0);
