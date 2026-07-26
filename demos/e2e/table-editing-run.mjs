// Table-editing gate — every inline-editing case, driven with real gestures and
// captured as a screenshot per case.
//
// These behaviours all LOOKED fine at the model level and were broken in the
// browser: a dropped master rendered as an empty group, a double-click on a
// type opened the NAME editor anchored to the wrong cell, and deleting the row
// you were editing left a stray input floating over the canvas. Model-level
// assertions cannot see any of that, so this drives the real DOM and writes a
// PNG for each case next to the run.
//
//     node demos/e2e/table-editing-run.mjs [--shots <dir>]

import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, extname } from 'path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const shotsArg = process.argv.indexOf('--shots');
const SHOTS = shotsArg > -1 ? process.argv[shotsArg + 1] : join(here, 'out', 'table-editing');
mkdirSync(SHOTS, { recursive: true });

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };
const server = createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  try {
    const body = readFileSync(join(root, url === '/' ? 'index.html' : url));
    res.writeHead(200, { 'Content-Type': MIME[extname(url)] ?? 'application/octet-stream' }).end(body);
  } catch { res.writeHead(404).end('not found'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;

const results = [];
const check = (name, ok, detail) => { results.push({ name, ok, detail }); };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1500, height: 900 }, deviceScaleFactor: 2 });
await ctx.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => false }));
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 140)));

await page.goto(`${origin}/diagrams/visio-editor.html`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__demoReady === true, { timeout: 30000 });

const shot = async (name) => { await page.locator('#vs-canvas').screenshot({ path: join(SHOTS, `${name}.png`) }); };

/** Run one case in the page; returns whatever the body returns. */
const inPage = (fn, arg) => page.evaluate(fn, arg);

// ── 1. the dropped master is a REAL card, not a silhouette ──────────────────
{
  const r = await inPage(async () => {
    const c = window.__demoCtx, m = c.diagram;
    const n = m.getNode(c.seededTable);
    return {
      isCard: !!n?.getMetadata('kitEntity'),
      rows: document.querySelectorAll('#vs-canvas .axk-row').length,
      head: document.querySelector('#vs-canvas .axk-entity-head')?.textContent ?? '',
    };
  });
  check('CARD', r.isCard && r.rows >= 2, `card=${r.isCard} rows=${r.rows} head="${r.head}"`);
  await shot('01-card');
}

// ── 2. double-click the NAME cell edits the name, anchored to that cell ─────
{
  const r = await inPage(async () => {
    const cell = document.querySelector('#vs-canvas .axk-col');
    const box = (el) => { const b = el.getBoundingClientRect(); return { x: Math.round(b.x), w: Math.round(b.width) }; };
    const cellBox = box(cell);
    cell.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 250));
    const input = document.querySelector('.axk-edit-input');
    return { opened: !!input, value: input?.value, cellBox, inputBox: input ? box(input) : null };
  });
  const aligned = r.inputBox && Math.abs(r.inputBox.x - r.cellBox.x) <= 4;
  check('NAME-EDIT', r.opened && aligned, `value="${r.value}" cell=${JSON.stringify(r.cellBox)} input=${JSON.stringify(r.inputBox)}`);
  await shot('02-name-editor');
  await inPage(() => document.querySelector('.axk-edit-input')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
}

// ── 3. double-click the TYPE cell edits the TYPE, anchored to the type cell ─
{
  const r = await inPage(async () => {
    const cell = document.querySelector('#vs-canvas .axk-ty');
    const box = (el) => { const b = el.getBoundingClientRect(); return { x: Math.round(b.x), w: Math.round(b.width) }; };
    const cellBox = box(cell);
    cell.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 250));
    const input = document.querySelector('.axk-edit-input');
    const list = input?.getAttribute('list');
    const opts = list ? [...document.querySelectorAll(`#${list} option`)].map((o) => o.value) : [];
    const card = document.querySelector('#vs-canvas .axk-entity');
    return { opened: !!input, value: input?.value, cellBox, inputBox: input ? box(input) : null, opts,
      cardBox: card ? box(card) : null };
  });
  // The type editor is WIDER than its cell (a 23px "uuid" cell cannot hold a
  // usable combobox), so it is not left-aligned to the cell — it must simply
  // COVER the cell it is editing, and stay inside the card (checked below).
  const covers = r.inputBox && r.inputBox.x <= r.cellBox.x + 2
    && (r.inputBox.x + r.inputBox.w) >= (r.cellBox.x + r.cellBox.w) - 2;
  check('TYPE-EDIT', r.opened && covers, `value="${r.value}" cell=${JSON.stringify(r.cellBox)} input=${JSON.stringify(r.inputBox)}`);
  // the combobox must offer real suggestions, and the ones already in use first
  check('TYPE-SUGGESTIONS', r.opts.length >= 10 && r.opts.includes('varchar'), `${r.opts.length} options, first=${r.opts.slice(0, 3).join(',')}`);
  // …and it must stay INSIDE the card. Widening a right-hand cell used to push
  // the editor past the table border and over the canvas.
  check('TYPE-WITHIN-CARD',
    r.cardBox && r.inputBox && r.inputBox.x >= r.cardBox.x - 1 && (r.inputBox.x + r.inputBox.w) <= (r.cardBox.x + r.cardBox.w) + 1,
    `card=${JSON.stringify(r.cardBox)} input=${JSON.stringify(r.inputBox)}`);
  await shot('03-type-combobox');
}

// ── 4. committing the type writes through to the model ─────────────────────
{
  const r = await inPage(async () => {
    const input = document.querySelector('.axk-edit-input');
    input.value = 'timestamptz';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await new Promise((r) => setTimeout(r, 300));
    const c = window.__demoCtx;
    return {
      left: document.querySelectorAll('.axk-edit-input').length,
      cols: c.diagram.getNode(c.seededTable).getMetadata('kitEntity').columns.map((x) => `${x.name}:${x.type}`),
    };
  });
  check('TYPE-COMMIT', r.left === 0 && r.cols.some((c) => c.endsWith(':timestamptz')), `left=${r.left} cols=${r.cols.join(' ')}`);
  await shot('04-type-committed');
}

// ── 5. Escape abandons without writing ─────────────────────────────────────
{
  const r = await inPage(async () => {
    const c = window.__demoCtx;
    const before = c.diagram.getNode(c.seededTable).getMetadata('kitEntity').columns.map((x) => x.name);
    document.querySelector('#vs-canvas .axk-col').dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 220));
    const input = document.querySelector('.axk-edit-input');
    input.value = 'SHOULD_NOT_STICK';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await new Promise((r) => setTimeout(r, 250));
    return { left: document.querySelectorAll('.axk-edit-input').length, before,
      after: c.diagram.getNode(c.seededTable).getMetadata('kitEntity').columns.map((x) => x.name) };
  });
  check('ESCAPE', r.left === 0 && r.after.join() === r.before.join(), `left=${r.left} ${r.before.join()} → ${r.after.join()}`);
  await shot('05-escape');
}

// ── 6. deleting the row you are EDITING must not strand the input ──────────
{
  const r = await inPage(async () => {
    const c = window.__demoCtx;
    document.querySelector('#vs-canvas .axk-col').dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 220));
    const opened = !!document.querySelector('.axk-edit-input');
    const del = document.querySelector('#vs-canvas .axk-row .axk-col-del');
    for (const t of ['mousedown', 'mouseup', 'click']) del.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 350));
    return { opened, left: document.querySelectorAll('.axk-edit-input').length,
      cols: c.diagram.getNode(c.seededTable).getMetadata('kitEntity').columns.length };
  });
  check('DELETE-WHILE-EDITING', r.opened && r.left === 0, `opened=${r.opened} strayInputs=${r.left} colsLeft=${r.cols}`);
  await shot('06-delete-while-editing');
}

// ── 7. a NEW column's empty type cell is still clickable ───────────────────
{
  const r = await inPage(async () => {
    const c = window.__demoCtx;
    document.querySelector('#vs-canvas .axk-entity-add').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 350));
    const rows = document.querySelectorAll('#vs-canvas .axk-row');
    const ty = rows[rows.length - 1]?.querySelector('.axk-ty');
    const w = ty ? Math.round(ty.getBoundingClientRect().width) : 0;
    ty?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 250));
    const input = document.querySelector('.axk-edit-input');
    const opened = !!input;
    if (input) { input.value = 'int'; input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); }
    await new Promise((r) => setTimeout(r, 300));
    return { emptyCellWidth: w, opened,
      cols: c.diagram.getNode(c.seededTable).getMetadata('kitEntity').columns.map((x) => `${x.name}:${x.type}`) };
  });
  check('NEW-COLUMN-TYPE', r.emptyCellWidth > 20 && r.opened && r.cols.some((c) => c.endsWith(':int')),
    `emptyTypeCellWidth=${r.emptyCellWidth} opened=${r.opened} cols=${r.cols.join(' ')}`);
  await shot('07-new-column-type');
}

// ── 8. keyboard: Tab walks name → type ─────────────────────────────────────
{
  const r = await inPage(async () => {
    document.querySelector('#vs-canvas .axk-col').dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 220));
    const first = document.querySelector('.axk-edit-input');
    const startedOnName = first?.getAttribute('list') === null;
    first?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 350));
    const next = document.querySelector('.axk-edit-input');
    return { startedOnName, movedToType: !!next?.getAttribute('list'), open: !!next };
  });
  check('KEYBOARD-TAB', r.startedOnName && r.movedToType,
    `startedOnName=${r.startedOnName} movedToType=${r.movedToType} stillOpen=${r.open}`);
  await shot('08-keyboard-tab');
  await inPage(() => document.querySelector('.axk-edit-input')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
}

// ── 9. deleting while editing, with the browser's REAL blur ordering ───────
{
  const r = await inPage(async () => {
    const c = window.__demoCtx;
    const before = c.diagram.getNode(c.seededTable).getMetadata('kitEntity').columns.map((x) => x.name);
    const nameCell = document.querySelector('#vs-canvas .axk-col');
    nameCell.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 250));
    const input = document.querySelector('.axk-edit-input');
    input.value = 'RENAMED_MIDWAY';           // a pending edit that must NOT land
    const del = document.querySelector('#vs-canvas .axk-row .axk-col-del');
    // real ordering: mousedown → blur → mouseup → click
    del.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    input.dispatchEvent(new FocusEvent('blur'));
    del.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
    del.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 400));
    const after = c.diagram.getNode(c.seededTable).getMetadata('kitEntity').columns.map((x) => x.name);
    return { before, after, stray: document.querySelectorAll('.axk-edit-input').length };
  });
  const renamedLeak = r.after.includes('RENAMED_MIDWAY');
  check('DELETE-DURING-EDIT-REALBLUR', r.stray === 0 && !renamedLeak && r.after.length === r.before.length - 1,
    `stray=${r.stray} ${r.before.join()} → ${r.after.join()}`);
  await shot('09-delete-during-edit');
}

// ── 10. the container really CARRIES its members ───────────────────────────
{
  const r = await inPage(async () => {
    const c = window.__demoCtx, m = c.diagram;
    const g = m.getGroups().find((x) => x.name === 'Fulfilment');
    const members = [...(g?.members ?? [])];
    const before = { x: m.getNode('pick').position.x, y: m.getNode('pick').position.y };
    return { members, before, hasBoth: members.includes('pick') && members.includes('ship') };
  });
  check('CONTAINER-MEMBERSHIP', r.hasBoth, `members=[${r.members.join(',')}]`);
  await shot('07-container');
}

await browser.close();
server.close();

const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? '✓' : '✗'} ${r.name.padEnd(22)} ${r.detail}`);
if (pageErrors.length) console.log(`\npage errors: ${pageErrors.slice(0, 3).join(' | ')}`);
console.log(`\ntable-editing: ${results.length - failed.length}/${results.length} cases pass · shots → ${SHOTS}`);
if (failed.length || pageErrors.length) {
  console.log('\nAN EDIT THAT MISBEHAVES UNDER A REAL GESTURE is a bug no model assertion can see. This is the gate.');
  process.exit(1);
}
