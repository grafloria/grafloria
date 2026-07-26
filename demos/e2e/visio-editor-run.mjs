// Visio-editor gate — every Visio-grade behavior the flagship editor advertises,
// driven with REAL pointer/keyboard gestures and captured as a screenshot per case.
//
// The reason this runner exists: the editor's own gallery assert once proved
// drop-into-container by CALLING GroupMembershipService directly while the real
// drag was broken, and proved ports paint while dragging from one created
// nothing. A behavior proven only through a direct API call is not proven.
// Every case here starts from the pointer or the keyboard, exactly as a hand
// would, and asserts the MODEL consequence plus the painted DOM.
//
//     node demos/e2e/visio-editor-run.mjs [--shots <dir>]

import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, extname } from 'path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const shotsArg = process.argv.indexOf('--shots');
const SHOTS = shotsArg > -1 ? process.argv[shotsArg + 1] : join(here, 'out', 'visio-editor');
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
// 1680 wide ON PURPOSE: the demo hides #vs-panel at ≤1500px (the rails must not
// crush the canvas), and the original 1500px viewport meant this gate could
// never exercise the panel. At 1680 the panel is part of what the gate sees.
const ctx = await browser.newContext({ viewport: { width: 1680, height: 950 }, deviceScaleFactor: 2 });
await ctx.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => false }));
const pageErrors = [];
let page;

/**
 * A FRESH page per section. The original runner drove all cases on one shared
 * page with manual cleanup between them — the exact contamination pattern that
 * produced false audit results twice (an un-undoable command mid-history turned
 * every later "cleanup undo" into an error). Each numbered section now starts
 * from the demo's seeded scenario; only the checks WITHIN a section share state,
 * and they do so deliberately (drag-in → drag-out, connect → undo).
 */
const freshPage = async () => {
  if (page) await page.close();
  page = await ctx.newPage();
  page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 200)));
  await page.goto(`${origin}/diagrams/visio-editor.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__demoReady === true, { timeout: 30000 });
  await page.waitForTimeout(150);
};
await freshPage();

const shot = async (name) => { await page.locator('#vs-canvas').screenshot({ path: join(SHOTS, `${name}.png`) }); };
const inPage = (fn, arg) => page.evaluate(fn, arg);

/** World → viewport-relative client point of the live canvas. */
const client = (wx, wy) => inPage(([x, y]) => {
  const rect = document.getElementById('vs-canvas').getBoundingClientRect();
  const p = window.__demoCtx.instance.viewport.worldToClient(x, y, rect);
  return { x: p.x, y: p.y };
}, [wx, wy]);

/** Client point of a node's centre (world → client through the live camera). */
const nodeCentre = (id) => inPage((nid) => {
  const c = window.__demoCtx;
  const n = c.diagram.getNode(nid);
  const p = n.getWorldPosition ? n.getWorldPosition() : n.position;
  const rect = document.getElementById('vs-canvas').getBoundingClientRect();
  const q = c.instance.viewport.worldToClient(p.x + n.size.width / 2, p.y + n.size.height / 2, rect);
  return { x: q.x, y: q.y };
}, id);

const drag = async (from, to, steps = 12) => {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps);
  }
  await page.mouse.up();
  await page.waitForTimeout(120);
};

const raf2 = () => inPage(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
const undoKey = () => page.keyboard.press('Control+z');

// ── 1. COPY MUST NOT POISON THE UNDO STACK ──────────────────────────────────
// A real edit, then Ctrl+C, then Ctrl+Z: the undo must take back the EDIT, not
// throw "Cannot undo command: Copy" (the audit's stack-poisoning bug).
{
  const before = await inPage(() => {
    const n = window.__demoCtx.diagram.getNode('chk');
    return { x: n.position.x, y: n.position.y };
  });
  const c0 = await nodeCentre('chk');
  await drag(c0, { x: c0.x + 80, y: c0.y }, 8);           // the edit
  const moved = await inPage(() => window.__demoCtx.diagram.getNode('chk').position.x);
  await page.keyboard.press('Control+c');                  // the copy (non-mutating)
  await page.waitForTimeout(80);
  const errsBefore = pageErrors.length;
  await undoKey();                                         // must undo the DRAG
  await page.waitForTimeout(150);
  const after = await inPage(() => {
    const n = window.__demoCtx.diagram.getNode('chk');
    return { x: n.position.x, y: n.position.y };
  });
  const threw = pageErrors.length > errsBefore;
  check('COPY-UNDO-HISTORY',
    !threw && moved !== before.x && Math.abs(after.x - before.x) < 1 && Math.abs(after.y - before.y) < 1,
    `moved=${moved !== before.x} threw=${threw} pos ${moved}→${after.x} (want ${before.x})`);
  await shot('01-copy-undo');
}

// ── 2. A REAL DRAG INTO THE CONTAINER ADOPTS ────────────────────────────────
// Drag 'recv' by its body into the empty centre band of the Fulfilment frame
// (between pick and ship). Membership must change — the demo's old assert
// called the membership service directly and passed while this gesture failed.
{
  await freshPage();
  const start = await nodeCentre('recv');
  const dropAt = await client(420, 406);                    // frame centre, empty area
  await drag(start, dropAt);
  await raf2();
  const r = await inPage(() => {
    const c = window.__demoCtx;
    const g = c.diagram.getGroups().find((x) => x.name === 'Fulfilment');
    return { members: [...(g?.members ?? [])] };
  });
  check('DRAG-INTO-ADOPTS', r.members.includes('recv'), `members=[${r.members.join(',')}]`);
  await shot('02-drag-into-container');

  // …and dragging back OUT releases it (the reverse the audit saw working must
  // still work after the fix).
  const inC = await nodeCentre('recv');
  const outAt = await client(120, 148);
  await drag(inC, outAt);
  await raf2();
  const r2 = await inPage(() => {
    const g = window.__demoCtx.diagram.getGroups().find((x) => x.name === 'Fulfilment');
    return { members: [...(g?.members ?? [])] };
  });
  check('DRAG-OUT-RELEASES', !r2.members.includes('recv'), `members=[${r2.members.join(',')}]`);
}

// ── 3. DRAG FROM A PORT DRAWS A CONNECTOR, UNDOABLE AS ONE STEP ─────────────
// Hover recv so its ports paint, press ON the right-edge port, pull to ship's
// body, release: exactly one new link, and one Ctrl+Z removes it.
{
  await freshPage();
  const linksBefore = await inPage(() => window.__demoCtx.diagram.getLinks().length);
  const recvC = await nodeCentre('recv');
  await page.mouse.move(recvC.x, recvC.y);                  // hover → ports paint
  await page.waitForTimeout(150);
  const port = await inPage(() => {
    const c = window.__demoCtx;
    const n = c.diagram.getNode('recv');
    const p = n.getWorldPosition ? n.getWorldPosition() : n.position;
    const rect = document.getElementById('vs-canvas').getBoundingClientRect();
    const q = c.instance.viewport.worldToClient(p.x + n.size.width, p.y + n.size.height / 2, rect);
    return { x: q.x, y: q.y };
  });
  await page.mouse.move(port.x, port.y);                    // onto the port glyph
  await page.waitForTimeout(120);
  const shipC = await nodeCentre('ship');
  await drag(port, shipC);
  await raf2();
  const linksAfter = await inPage(() => window.__demoCtx.diagram.getLinks().length);
  check('PORT-DRAG-CONNECTS', linksAfter === linksBefore + 1, `links ${linksBefore}→${linksAfter}`);
  await shot('03-port-drag-connect');
  await undoKey();
  await page.waitForTimeout(150);
  const linksUndone = await inPage(() => window.__demoCtx.diagram.getLinks().length);
  check('PORT-DRAG-ONE-UNDO', linksUndone === linksBefore, `links after undo ${linksUndone} (want ${linksBefore})`);
}

// ── 4. MARQUEE: drag on empty canvas rubber-bands a selection ───────────────
// Box recv+chk from a clearly-empty start point; the band must PAINT mid-drag
// and the release must select exactly the enclosed pair.
{
  await freshPage();
  const box = await inPage(() => {
    const c = window.__demoCtx;
    const b = (id) => {
      const n = c.diagram.getNode(id);
      const p = n.getWorldPosition ? n.getWorldPosition() : n.position;
      return { x: p.x, y: p.y, r: p.x + n.size.width, b: p.y + n.size.height };
    };
    const r1 = b('recv'), r2 = b('chk');
    return {
      x1: Math.min(r1.x, r2.x) - 24, y1: Math.min(r1.y, r2.y) - 24,
      x2: Math.max(r1.r, r2.r) + 24, y2: Math.max(r1.b, r2.b) + 24,
    };
  });
  const a = await client(box.x1, box.y1);
  const b = await client(box.x2, box.y2);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(a.x + ((b.x - a.x) * i) / 10, a.y + ((b.y - a.y) * i) / 10);
  }
  await raf2();
  const mid = await inPage(() => {
    const band = document.querySelector('#vs-canvas .vs-marquee');
    const r = band?.getBoundingClientRect();
    return { painted: !!band, w: r ? Math.round(r.width) : 0, h: r ? Math.round(r.height) : 0 };
  });
  await shot('04-marquee-mid-drag');
  await page.mouse.up();
  await raf2();
  const sel = await inPage(() => window.__demoCtx.diagram.getSelectedNodes().map((n) => n.id).sort().join(','));
  const bandGone = await inPage(() => !document.querySelector('#vs-canvas .vs-marquee'));
  check('MARQUEE-SELECTS-2',
    mid.painted && mid.w > 60 && mid.h > 30 && sel === 'chk,recv' && bandGone,
    `band=${mid.painted} ${mid.w}x${mid.h} selected={${sel}} bandCleared=${bandGone}`);
  await shot('04-marquee-selected');
  await inPage(() => { window.__demoCtx.diagram.clearSelection(); window.__demoCtx.instance.renderNow(); });
}

// ── 5. ARROW-KEY NUDGE: 1 unit per press, ×10 with Shift, undoable ──────────
{
  await freshPage();
  const c = await nodeCentre('chk');
  await page.mouse.click(c.x, c.y);                        // select chk
  await page.waitForTimeout(80);
  const before = await inPage(() => ({ ...window.__demoCtx.diagram.getNode('chk').position }));
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(60);
  const fine = await inPage(() => window.__demoCtx.diagram.getNode('chk').position.x);
  await page.keyboard.press('Shift+ArrowDown');
  await page.waitForTimeout(60);
  const coarse = await inPage(() => window.__demoCtx.diagram.getNode('chk').position.y);
  check('NUDGE-FINE-AND-COARSE',
    fine === before.x + 1 && coarse === before.y + 10,
    `x ${before.x}→${fine} (want +1) · y ${before.y}→${coarse} (want +10)`);
  await shot('05-nudge');
  // Undo both nudges (they may have merged into fewer entries — undo until back).
  for (let i = 0; i < 4; i++) {
    const p = await inPage(() => ({ ...window.__demoCtx.diagram.getNode('chk').position }));
    if (p.x === before.x && p.y === before.y) break;
    await undoKey();
    await page.waitForTimeout(80);
  }
  const restored = await inPage(() => ({ ...window.__demoCtx.diagram.getNode('chk').position }));
  check('NUDGE-UNDOES', restored.x === before.x && restored.y === before.y,
    `restored to ${restored.x},${restored.y} (want ${before.x},${before.y})`);
  await inPage(() => { window.__demoCtx.diagram.clearSelection(); window.__demoCtx.instance.renderNow(); });
}

// ── 6. CTRL/CMD+D DUPLICATES — one step, one undo — and the toolbar twin ───
{
  await freshPage();
  const c = await nodeCentre('ship');
  await page.mouse.click(c.x, c.y);
  await page.waitForTimeout(80);
  const before = await inPage(() => window.__demoCtx.diagram.getNodes().length);
  await page.keyboard.press('Control+d');
  await page.waitForTimeout(150);
  const r = await inPage(() => {
    const c2 = window.__demoCtx;
    const src = c2.diagram.getNode('ship');
    const copy = c2.diagram.getNodes().find((n) => n.id !== 'ship' && n.getLabel?.() === src.getLabel?.()
      && Math.abs(n.position.x - src.position.x - 20) < 1 && Math.abs(n.position.y - src.position.y - 20) < 1);
    return { count: c2.diagram.getNodes().length, offsetCopy: !!copy };
  });
  check('CTRL-D-DUPLICATES', r.count === before + 1 && r.offsetCopy,
    `nodes ${before}→${r.count} offsetCopy=${r.offsetCopy}`);
  await shot('06-duplicate');
  await undoKey();
  await page.waitForTimeout(150);
  const undone = await inPage(() => window.__demoCtx.diagram.getNodes().length);
  check('CTRL-D-ONE-UNDO', undone === before, `nodes after undo ${undone} (want ${before})`);

  // The toolbar button drives the same command; it must be enabled with a
  // selection and actually duplicate.
  await page.mouse.click(c.x, c.y);
  await page.waitForTimeout(80);
  const btn = page.locator('#vs-bar button', { hasText: 'Duplicate' });
  const enabled = await btn.isEnabled();
  await btn.click();
  await page.waitForTimeout(150);
  const viaButton = await inPage(() => window.__demoCtx.diagram.getNodes().length);
  check('DUPLICATE-BUTTON', enabled && viaButton === before + 1,
    `enabled=${enabled} nodes ${before}→${viaButton}`);
  await undoKey();
  await page.waitForTimeout(150);
  await inPage(() => { window.__demoCtx.diagram.clearSelection(); window.__demoCtx.instance.renderNow(); });
}

// ── 7. F2 EDITS · TYPE-TO-REPLACE ───────────────────────────────────────────
// The editor input class is `grafloria-text-editor` (round-1 audit probes
// missed it with the wrong selector — keep this one).
{
  await freshPage();
  const c = await nodeCentre('pick');
  await page.mouse.click(c.x, c.y);
  await page.waitForTimeout(80);
  await page.keyboard.press('F2');
  await page.waitForTimeout(120);
  const f2 = await inPage(() => {
    const i = document.querySelector('.grafloria-text-editor');
    return { open: !!i, value: i?.value ?? '' };
  });
  await shot('07-f2-editor');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(80);
  check('F2-OPENS-EDITOR', f2.open && f2.value === 'Pick items', `open=${f2.open} value="${f2.value}"`);

  // Type-to-replace: with pick still selected, typing "Q" opens the editor
  // holding ONLY "Q"; Enter commits the replacement; one undo restores.
  await page.mouse.click(c.x, c.y);
  await page.waitForTimeout(80);
  await page.keyboard.press('Q');
  await page.waitForTimeout(120);
  const seeded = await inPage(() => document.querySelector('.grafloria-text-editor')?.value ?? null);
  await page.keyboard.type('A pass');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  const committed = await inPage(() => String(window.__demoCtx.diagram.getNode('pick').getLabel?.() ?? ''));
  check('TYPE-TO-REPLACE', seeded === 'Q' && committed === 'QA pass',
    `seeded="${seeded}" committed="${committed}"`);
  await shot('07-type-to-replace');
  await undoKey();
  await page.waitForTimeout(120);
  const restored = await inPage(() => String(window.__demoCtx.diagram.getNode('pick').getLabel?.() ?? ''));
  check('TYPE-TO-REPLACE-UNDOES', restored === 'Pick items', `label after undo "${restored}"`);

  // Guard: a Ctrl chord must NOT open the editor.
  await page.mouse.click(c.x, c.y);
  await page.waitForTimeout(80);
  await page.keyboard.press('Control+b');
  await page.waitForTimeout(120);
  const chord = await inPage(() => !!document.querySelector('.grafloria-text-editor'));
  check('CHORD-NO-EDITOR', !chord, `editor open after Ctrl+B: ${chord}`);
  await inPage(() => { window.__demoCtx.diagram.clearSelection(); window.__demoCtx.instance.renderNow(); });
}

// ── 8. CONTEXT MENU: node / edge / canvas, real right-clicks ────────────────
{
  await freshPage();
  // Node menu paints with the full entry set, Escape dismisses.
  const c = await nodeCentre('chk');
  await page.mouse.click(c.x, c.y, { button: 'right' });
  await page.waitForTimeout(120);
  const nodeMenu = await inPage(() => {
    const m = document.getElementById('vs-menu');
    return {
      open: !!m?.classList.contains('open'),
      entries: [...(m?.querySelectorAll('button') ?? [])].map((b) => b.textContent),
    };
  });
  await shot('08-context-menu-node');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(80);
  const escClosed = await inPage(() => !document.getElementById('vs-menu').classList.contains('open'));
  const want = ['Rename', 'Duplicate', 'Delete', 'Bring to front', 'Send to back'];
  check('CONTEXT-MENU-NODE',
    nodeMenu.open && want.every((e) => nodeMenu.entries.includes(e)) && escClosed,
    `open=${nodeMenu.open} entries=[${nodeMenu.entries.join('|')}] escCloses=${escClosed}`);

  // Its Delete really deletes — and one undo brings the node back.
  await page.mouse.click(c.x, c.y, { button: 'right' });
  await page.waitForTimeout(120);
  await page.locator('#vs-menu button', { hasText: 'Delete' }).click();
  await page.waitForTimeout(150);
  const deleted = await inPage(() => !window.__demoCtx.diagram.getNode('chk'));
  await undoKey();
  await page.waitForTimeout(150);
  const restoredNode = await inPage(() => !!window.__demoCtx.diagram.getNode('chk'));
  check('CONTEXT-DELETE-WORKS', deleted && restoredNode, `deleted=${deleted} undoRestores=${restoredNode}`);

  // Edge menu on the labelled edge: Rename label is ENABLED there.
  const edgePt = await client(415, 253);           // on the chk→pick path, off both nodes
  await page.mouse.click(edgePt.x, edgePt.y, { button: 'right' });
  await page.waitForTimeout(120);
  const edgeMenu = await inPage(() => {
    const m = document.getElementById('vs-menu');
    const rename = [...(m?.querySelectorAll('button') ?? [])].find((b) => /Rename label/.test(b.textContent));
    return { open: !!m?.classList.contains('open'), hasRename: !!rename, renameEnabled: rename ? !rename.disabled : false };
  });
  await page.keyboard.press('Escape');
  check('CONTEXT-MENU-EDGE', edgeMenu.open && edgeMenu.hasRename && edgeMenu.renameEnabled,
    `open=${edgeMenu.open} rename=${edgeMenu.hasRename} enabled=${edgeMenu.renameEnabled}`);

  // Canvas menu: Select all really selects everything; click-away dismisses.
  const empty = await client(600, 120);
  await page.mouse.click(empty.x, empty.y, { button: 'right' });
  await page.waitForTimeout(120);
  await page.locator('#vs-menu button', { hasText: 'Select all' }).click();
  await page.waitForTimeout(120);
  const all = await inPage(() => ({
    selected: window.__demoCtx.diagram.getSelectedNodes().length,
    total: window.__demoCtx.diagram.getNodes().length,
  }));
  check('CONTEXT-SELECT-ALL', all.selected === all.total && all.total >= 4,
    `${all.selected}/${all.total} selected`);
  await inPage(() => { window.__demoCtx.diagram.clearSelection(); window.__demoCtx.instance.renderNow(); });
}

// ── 10. EDGE LABEL DBLCLICK EDIT: the "in stock" label opens the editor ─────
{
  await freshPage();
  const at = await inPage(() => {
    const c = window.__demoCtx;
    const link = c.diagram.getLink('e2');
    const pts = link.points;
    const mid = pts[Math.floor(pts.length / 2)];       // where the display label paints
    const rect = document.getElementById('vs-canvas').getBoundingClientRect();
    return c.instance.viewport.worldToClient(mid.x, mid.y, rect);
  });
  await page.mouse.dblclick(at.x, at.y);
  await page.waitForTimeout(150);
  const opened = await inPage(() => {
    const i = document.querySelector('.grafloria-text-editor');
    return { open: !!i, value: i?.value ?? '' };
  });
  await shot('10-edge-label-editor');
  await inPage(() => document.querySelector('.grafloria-text-editor')?.select());
  await page.keyboard.type('restock');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  const committedLabel = await inPage(() => String(window.__demoCtx.diagram.getLink('e2').getLabel?.() ?? ''));
  check('EDGE-LABEL-DBLCLICK', opened.open && opened.value === 'in stock' && committedLabel === 'restock',
    `open=${opened.open} value="${opened.value}" committed="${committedLabel}"`);
  await shot('10-edge-label-committed');
  await undoKey();
  await page.waitForTimeout(120);
  const labelRestored = await inPage(() => String(window.__demoCtx.diagram.getLink('e2').getLabel?.() ?? ''));
  check('EDGE-LABEL-UNDOES', labelRestored === 'in stock', `label after undo "${labelRestored}"`);
}

// ── 9. PALETTE DRAG GHOST: a preview follows the cursor; the drop still works ─
// HTML5 DnD synthesized with a real DataTransfer (headless Chromium's mouse
// cannot produce native DnD) — the same event stream the browser dispatches.
{
  await freshPage();
  const mid = await inPage(() => {
    const rect = document.getElementById('vs-canvas').getBoundingClientRect();
    return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + 120) };
  });
  const started = await inPage(([mx, my]) => {
    const item = document.querySelector('#vs-rail .gf-stencil-item');
    const dt = new DataTransfer();
    window.__vsDt = dt;
    const opts = (x, y) => ({ bubbles: true, cancelable: true, dataTransfer: dt, clientX: x, clientY: y });
    const r = item.getBoundingClientRect();
    item.dispatchEvent(new DragEvent('dragstart', opts(r.left + 10, r.top + 10)));
    document.dispatchEvent(new DragEvent('dragover', opts(mx, my)));
    document.getElementById('vs-canvas').dispatchEvent(new DragEvent('dragover', opts(mx, my)));
    const ghost = document.querySelector('.gf-stencil-ghost');
    const g = ghost?.getBoundingClientRect();
    return {
      ghost: !!ghost,
      text: ghost?.textContent ?? '',
      atCursor: g ? Math.abs((g.left + g.width / 2) - mx) < 8 && Math.abs((g.top + g.height / 2) - my) < 8 : false,
      opacity: ghost ? Number(getComputedStyle(ghost).opacity) : 1,
    };
  }, [mid.x, mid.y]);
  await shot('09-palette-ghost-mid-drag');
  const dropped = await inPage(([mx, my]) => {
    const dt = window.__vsDt;
    const before = window.__demoCtx.diagram.getNodes().length;
    const opts = { bubbles: true, cancelable: true, dataTransfer: dt, clientX: mx, clientY: my };
    document.getElementById('vs-canvas').dispatchEvent(new DragEvent('drop', opts));
    document.querySelector('#vs-rail .gf-stencil-item').dispatchEvent(new DragEvent('dragend', opts));
    return new Promise((resolve) => setTimeout(() => {
      window.__demoCtx.instance.renderNow();
      resolve({
        added: window.__demoCtx.diagram.getNodes().length === before + 1,
        ghostGone: !document.querySelector('.gf-stencil-ghost'),
      });
    }, 200));
  }, [mid.x, mid.y]);
  check('PALETTE-GHOST',
    started.ghost && started.atCursor && started.opacity < 0.9 && started.text.length > 0
      && dropped.added && dropped.ghostGone,
    `ghost=${started.ghost} atCursor=${started.atCursor} opacity=${started.opacity} "${started.text}" dropAdds=${dropped.added} cleared=${dropped.ghostGone}`);
  await shot('09-palette-after-drop');
  await undoKey();      // take the dropped master back out of the scenario
  await page.waitForTimeout(120);
}

// ── 11. TOOLBAR: Redo synced to canRedo; the new aligns; Distribute vertical ─
{
  await freshPage();
  // Stage: marquee recv+chk (2 nodes) then Bottom-align them via the button.
  const box = await inPage(() => {
    const c = window.__demoCtx;
    const b = (id) => {
      const n = c.diagram.getNode(id);
      return { x: n.position.x, y: n.position.y, r: n.position.x + n.size.width, b: n.position.y + n.size.height };
    };
    const r1 = b('recv'), r2 = b('chk');
    return { x1: Math.min(r1.x, r2.x) - 24, y1: Math.min(r1.y, r2.y) - 24, x2: Math.max(r1.r, r2.r) + 24, y2: Math.max(r1.b, r2.b) + 24 };
  });
  // Stagger chk so a bottom-align has something to do.
  await inPage(() => {
    const n = window.__demoCtx.diagram.getNode('chk');
    n.setPosition(n.position.x, n.position.y + 14);
    window.__demoCtx.instance.renderNow();
  });
  const a = await client(box.x1, box.y1);
  const b = await client(box.x2, box.y2 + 20);
  await drag(a, b, 8);
  const bottomBtn = page.locator('#vs-bar button', { hasText: 'Bottom' });
  await bottomBtn.click();
  await page.waitForTimeout(150);
  const bottoms = await inPage(() => ['recv', 'chk'].map((id) => {
    const n = window.__demoCtx.diagram.getNode(id);
    return n.position.y + n.size.height;
  }));
  check('ALIGN-BOTTOM', Math.abs(bottoms[0] - bottoms[1]) < 0.5, `bottoms=${bottoms.join(',')}`);

  // Redo button: disabled before an undo, enabled after, and it re-applies.
  const redoBtn = page.locator('#vs-bar button', { hasText: 'Redo' });
  const redoBefore = await redoBtn.isEnabled();
  await page.locator('#vs-bar button', { hasText: 'Undo' }).click();
  await page.waitForTimeout(150);
  const redoAfterUndo = await redoBtn.isEnabled();
  await redoBtn.click();
  await page.waitForTimeout(150);
  const bottomsRedone = await inPage(() => ['recv', 'chk'].map((id) => {
    const n = window.__demoCtx.diagram.getNode(id);
    return n.position.y + n.size.height;
  }));
  check('REDO-BUTTON-SYNCED',
    !redoBefore && redoAfterUndo && Math.abs(bottomsRedone[0] - bottomsRedone[1]) < 0.5,
    `enabledBefore=${redoBefore} enabledAfterUndo=${redoAfterUndo} bottoms=${bottomsRedone.join(',')}`);
  await shot('11-toolbar-redo');

  // Distribute vertical over three nodes: equal gaps in y.
  await inPage(() => {
    const c = window.__demoCtx, m = c.diagram;
    m.clearSelection();
    for (const id of ['recv', 'chk', 'pick']) m.addToSelection(m.getNode(id));
    c.instance.renderNow();
    c.syncBar();
  });
  const distV = page.locator('#vs-bar button', { hasText: '↕ Distribute' });
  const distEnabled = await distV.isEnabled();
  await distV.click();
  await page.waitForTimeout(150);
  const gaps = await inPage(() => {
    const m = window.__demoCtx.diagram;
    const boxes = ['recv', 'chk', 'pick']
      .map((id) => m.getNode(id))
      .map((n) => ({ top: n.position.y, bottom: n.position.y + n.size.height }))
      .sort((p, q) => p.top - q.top);
    return [boxes[1].top - boxes[0].bottom, boxes[2].top - boxes[1].bottom];
  });
  check('DISTRIBUTE-VERTICAL', distEnabled && Math.abs(gaps[0] - gaps[1]) < 0.5,
    `enabled=${distEnabled} gaps=${gaps.map((g) => Math.round(g)).join(',')}`);
  await shot('11-distribute-vertical');
}

// ── 12. SHAPE-DATA PANEL + THE HEADER BAND ──────────────────────────────────
// Two closures from the audit: (a) the panel was invisible at the old 1500px
// viewport, so CI never exercised it — this case edits a column THROUGH it;
// (b) the card's header band sits under the top PORT, whose press used to
// swallow the click as an aborted connect — a header click must select.
{
  await freshPage();
  const tid = await inPage(async () => {
    // (190,430): the same free spot the demo's own assert drops its table at —
    // below 'Order received', clear of the Fulfilment frame. 700,150 rendered
    // HALF OFF the canvas at this viewport (the visible panel narrows the
    // canvas), and a header click landing outside #vs-canvas never reaches the
    // binder at all — the screenshot showed the card clipped at the edge.
    const id = await window.__demoCtx.palette.place('erd-entity', { x: 190, y: 430 });
    window.__demoCtx.instance.renderNow();
    return id;
  });
  await raf2();
  // The card's ports are minted after a paint; give the fresh card a real beat
  // (matching the hand-probe that established the expected behavior).
  await page.waitForTimeout(400);

  // (b) click the header band dead-centre — the audit's dead zone. Hover FIRST,
  // like a hand does: the port arms on mousemove and the sub-threshold release
  // must still select the node.
  const head = await inPage(() => {
    const r = document.querySelector('.axk-entity-head').getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + 4 };
  });
  await page.mouse.move(head.x, head.y);
  await page.waitForTimeout(200);
  await page.mouse.down();
  await page.waitForTimeout(80);
  await page.mouse.up();
  await page.waitForTimeout(250);
  const sel = await inPage((id) =>
    window.__demoCtx.diagram.getSelectedNodes().map((n) => n.id).includes(id), tid);
  const panel = await inPage(() => {
    const p = document.getElementById('vs-panel');
    return {
      visible: !!p && getComputedStyle(p).display !== 'none',
      table: /Table/i.test(p?.textContent ?? ''),
    };
  });
  check('HEADER-BAND-SELECTS', sel && panel.visible && panel.table,
    `selected=${sel} panelVisible=${panel.visible} tableSection=${panel.table}`);
  await shot('12-header-band-select');

  // (a) click a column row, rename it through the PANEL's own input.
  const row = await inPage(() => {
    const r = document.querySelector('.axk-row .axk-col').getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.click(row.x, row.y);
  await raf2();
  await page.waitForTimeout(250);
  const nameInput = await inPage(() => {
    // The panel nests the column block INSIDE the table's fields, so there are
    // two Name rows: the table's ("Entity") first, then the selected column's
    // ("id") in the nested block. The LAST Name input is the column's — taking
    // the first renamed the whole table.
    const named = [...document.querySelectorAll('#vs-panel .gf-sd-row')].filter((r) =>
      /^name$/i.test(r.querySelector('.gf-sd-label')?.textContent?.trim() ?? '') &&
      r.querySelector('input.gf-sd-input'));
    const input = named.at(-1)?.querySelector('input.gf-sd-input');
    if (!input || named.length < 2) return null;   // 2 Name rows = the column section is open
    const b = input.getBoundingClientRect();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2, value: input.value };
  });
  check('PANEL-COLUMN-SECTION', !!nameInput, nameInput ? `column "${nameInput.value}"` : 'no column Name input in the panel');
  if (nameInput) {
    await page.mouse.click(nameInput.x, nameInput.y, { clickCount: 3 }); // select-all in the field
    await page.keyboard.type('renamed_via_panel');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    const cols = await inPage((id) =>
      window.__demoCtx.diagram.getNode(id).getMetadata('kitEntity').columns.map((c) => c.name), tid);
    check('PANEL-EDITS-COLUMN', cols.includes('renamed_via_panel'), `columns=[${cols.join(',')}]`);
    await shot('12-panel-column-rename');
  }
}

// ── 13. GRID TOGGLE: ink by default, gone on toggle, back on re-toggle ──────
// The grid is the Background plugin's SVG pattern layer under the diagram; its
// "ink" is the pattern geometry plus a computed display that actually paints.
{
  await freshPage();
  const gridState = () => inPage(() => {
    const svg = document.querySelector('#vs-canvas .grafloria-background-layer svg.grafloria-background');
    const pattern = svg?.querySelector('pattern');
    const btn = [...document.querySelectorAll('#vs-bar button')].find((b) => /Grid/.test(b.textContent));
    return {
      painted: !!svg && getComputedStyle(svg).display !== 'none',
      geometry: (pattern?.childNodes.length ?? 0) > 0,
      pressed: btn?.getAttribute('aria-pressed'),
    };
  });
  const s0 = await gridState();
  await shot('13-grid-on');
  const gridBtn = page.locator('#vs-bar button', { hasText: 'Grid' });
  await gridBtn.click();
  await raf2();
  const s1 = await gridState();
  await shot('13-grid-off');
  await gridBtn.click();
  await raf2();
  const s2 = await gridState();
  check('GRID-TOGGLE',
    s0.painted && s0.geometry && s0.pressed === 'true'
      && !s1.painted && s1.pressed === 'false'
      && s2.painted && s2.pressed === 'true',
    `default={painted:${s0.painted},geom:${s0.geometry}} off={painted:${s1.painted}} back={painted:${s2.painted}}`);
}

// ── 14. ZOOM CONTROLS: + raises the zoom, % tracks it, click-% resets ───────
{
  await freshPage();
  const zoomOf = () => inPage(() => window.__demoCtx.instance.viewport.getZoom());
  const pctOf = () => inPage(() => document.getElementById('vs-zoom-pct').textContent);
  const z0 = await zoomOf();
  await page.locator('#vs-zoom button[title^="Zoom in"]').click();
  await raf2();
  const z1 = await zoomOf();
  const p1 = await pctOf();
  await shot('14-zoomed-in');
  await page.locator('#vs-zoom-pct').click();
  await raf2();
  const z2 = await zoomOf();
  const p2 = await pctOf();
  check('ZOOM-CONTROLS',
    z0 === 1 && z1 > z0 && p1 === `${Math.round(z1 * 100)}%` && z2 === 1 && p2 === '100%',
    `zoom 1→${z1} (label "${p1}") reset→${z2} (label "${p2}")`);
  await shot('14-zoom-reset');

  // The chords drive the same camera: Ctrl+= in, Ctrl+- out, Ctrl+0 reset.
  await page.keyboard.press('Control+=');
  await raf2();
  const zIn = await zoomOf();
  await page.keyboard.press('Control+-');
  await page.keyboard.press('Control+-');
  await raf2();
  const zOut = await zoomOf();
  await page.keyboard.press('Control+0');
  await raf2();
  const zReset = await zoomOf();
  check('ZOOM-KEYS', zIn > 1 && zOut < zIn && zReset === 1,
    `Ctrl+= →${zIn.toFixed(2)} Ctrl+- ×2 →${zOut.toFixed(2)} Ctrl+0 →${zReset}`);
}

// ── 15. FIT VIEW: scatter a node far out, fit — everything inside the rect ──
{
  await freshPage();
  const farId = await inPage(async () => {
    const id = await window.__demoCtx.palette.place('flowchart-process', { x: 2400, y: 1700 });
    window.__demoCtx.instance.renderNow();
    return id;
  });
  await raf2();
  await page.locator('#vs-zoom button[title^="Fit"]').click();
  await page.waitForTimeout(250);
  const r = await inPage((fid) => {
    const c = window.__demoCtx;
    const rect = document.getElementById('vs-canvas').getBoundingClientRect();
    const inside = (id) => {
      const n = c.diagram.getNode(id);
      const p = n.getWorldPosition ? n.getWorldPosition() : n.position;
      const a = c.instance.viewport.worldToClient(p.x, p.y, rect);
      const b = c.instance.viewport.worldToClient(p.x + n.size.width, p.y + n.size.height, rect);
      return a.x >= rect.left - 1 && a.y >= rect.top - 1 && b.x <= rect.right + 1 && b.y <= rect.bottom + 1;
    };
    return { recv: inside('recv'), far: inside(fid), zoom: c.instance.viewport.getZoom() };
  }, farId);
  check('FIT-VIEW', r.recv && r.far && r.zoom < 1,
    `recvInside=${r.recv} farInside=${r.far} zoom=${r.zoom.toFixed(2)}`);
  await shot('15-fit-view');
}

// ── 16. MINIMAP: painted, mirrors the scene, gains a rect per added node ────
{
  await freshPage();
  const mini0 = await inPage(() => ({
    present: !!document.querySelector('#vs-canvas .grafloria-minimap'),
    rects: document.querySelectorAll('#vs-canvas .grafloria-minimap rect[data-node-id]').length,
    camera: !!document.querySelector('#vs-canvas .grafloria-minimap .grafloria-minimap-viewport'),
    nodes: window.__demoCtx.diagram.getNodes().length,
  }));
  await inPage(async () => {
    await window.__demoCtx.palette.place('flowchart-process', { x: 640, y: 640 });
    window.__demoCtx.instance.renderNow();
  });
  await raf2();
  const rects1 = await inPage(() => document.querySelectorAll('#vs-canvas .grafloria-minimap rect[data-node-id]').length);
  check('MINIMAP-PRESENT',
    mini0.present && mini0.camera && mini0.rects === mini0.nodes && rects1 === mini0.rects + 1,
    `present=${mini0.present} camera=${mini0.camera} rects ${mini0.rects}/${mini0.nodes} nodes, after add ${rects1}`);
  await shot('16-minimap');

  // Its toggle tucks it away.
  await page.locator('#vs-bar button', { hasText: 'Minimap' }).click();
  await raf2();
  const hidden = await inPage(() => {
    const el = document.querySelector('#vs-canvas .grafloria-minimap');
    return !el || getComputedStyle(el).display === 'none';
  });
  check('MINIMAP-TOGGLE', hidden, `hidden after toggle: ${hidden}`);
}

// ── 17. GROUP / UNGROUP: marquee → Ctrl+G → frame-drag → Ctrl+Shift+G ───────
// The whole story with real gestures, then the undo ladder proves each step
// entered history as exactly ONE entry.
{
  await freshPage();
  const a = await client(96, 96);
  const b = await client(514, 200);
  await drag(a, b, 10);
  const sel = await inPage(() => window.__demoCtx.diagram.getSelectedNodes().map((n) => n.id).sort().join(','));
  const groupsBefore = await inPage(() => window.__demoCtx.diagram.getGroups().length);
  await page.keyboard.press('Control+g');
  await page.waitForTimeout(250);
  const g1 = await inPage(() => {
    const gs = window.__demoCtx.diagram.getGroups();
    const g = gs.find((x) => x.name === 'Group');
    return { count: gs.length, members: [...(g?.members ?? [])].sort().join(',') };
  });
  check('CTRL-G-GROUPS', sel === 'chk,recv' && g1.count === groupsBefore + 1 && g1.members === 'chk,recv',
    `selected={${sel}} groups ${groupsBefore}→${g1.count} members={${g1.members}}`);
  await shot('17-grouped');

  // Drag the group's FRAME (an empty spot inside it, between the members and
  // OFF the recv→chk connector) — both members must ride along.
  const before = await inPage(() => ['recv', 'chk'].map((id) => ({ ...window.__demoCtx.diagram.getNode(id).position })));
  await drag(await client(300, 126), await client(360, 186), 10);
  const after = await inPage(() => ['recv', 'chk'].map((id) => ({ ...window.__demoCtx.diagram.getNode(id).position })));
  const dx = after[0].x - before[0].x, dy = after[0].y - before[0].y;
  const together = after[1].x - before[1].x === dx && after[1].y - before[1].y === dy;
  check('GROUP-FRAME-DRAGS-BOTH', (dx !== 0 || dy !== 0) && together,
    `delta recv=(${dx},${dy}) chk=(${after[1].x - before[1].x},${after[1].y - before[1].y})`);
  await shot('17-group-dragged');

  // Ungroup with a member selected: the group dissolves, the nodes stay.
  const recvC = await nodeCentre('recv');
  await page.mouse.click(recvC.x, recvC.y);
  await page.waitForTimeout(120);
  await page.keyboard.press('Control+Shift+G');
  await page.waitForTimeout(250);
  const g2 = await inPage(() => ({
    count: window.__demoCtx.diagram.getGroups().length,
    intact: ['recv', 'chk'].every((id) => !!window.__demoCtx.diagram.getNode(id)),
  }));
  check('CTRL-SHIFT-G-UNGROUPS', g2.count === groupsBefore && g2.intact,
    `groups=${g2.count} (want ${groupsBefore}) nodesIntact=${g2.intact}`);
  await shot('17-ungrouped');

  // The undo ladder — 1: the group is back (ungroup was one entry); 2: the
  // members are back at their pre-drag spots (the frame drag was one entry);
  // 3: the group is gone (the grouping was one entry).
  const rung = async () => {
    await undoKey();
    await page.waitForTimeout(200);
    return inPage(() => ({
      groups: window.__demoCtx.diagram.getGroups().length,
      recv: { ...window.__demoCtx.diagram.getNode('recv').position },
    }));
  };
  const u1 = await rung();
  const u2 = await rung();
  const u3 = await rung();
  check('GROUP-UNDO-LADDER',
    u1.groups === groupsBefore + 1
      && u2.groups === groupsBefore + 1 && u2.recv.x === before[0].x && u2.recv.y === before[0].y
      && u3.groups === groupsBefore,
    `undo1 groups=${u1.groups} · undo2 recv=(${u2.recv.x},${u2.recv.y}) want (${before[0].x},${before[0].y}) · undo3 groups=${u3.groups}`);
}

// ── 18. EDGE CASES: Escape mid-marquee · marquee under zoom · Ctrl+G with 1 ─
{
  await freshPage();

  // (a) Escape mid-marquee: the band vanishes, the release selects nothing.
  const a = await client(96, 96);
  const b = await client(514, 200);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) {
    await page.mouse.move(a.x + ((b.x - a.x) * i) / 6, a.y + ((b.y - a.y) * i) / 6);
  }
  await raf2();
  const bandMid = await inPage(() => !!document.querySelector('#vs-canvas .vs-marquee'));
  await shot('18-escape-mid-marquee');
  await page.keyboard.press('Escape');
  await raf2();
  const bandGone = await inPage(() => !document.querySelector('#vs-canvas .vs-marquee'));
  await page.mouse.up();
  await raf2();
  const selAfter = await inPage(() => window.__demoCtx.diagram.getSelectedNodes().length);
  check('ESCAPE-CANCELS-MARQUEE', bandMid && bandGone && selAfter === 0,
    `bandMid=${bandMid} bandAfterEsc=${!bandGone ? 'STILL THERE' : 'gone'} selected=${selAfter}`);

  // (b) Zoom via the controls, then marquee: the world↔client mapping under
  // zoom ≠ 1 must still select exactly the enclosed pair.
  await page.locator('#vs-zoom button[title^="Zoom in"]').click();
  await raf2();
  const zoom = await inPage(() => window.__demoCtx.instance.viewport.getZoom());
  const za = await client(96, 96);
  const zb = await client(514, 200);
  await drag(za, zb, 10);
  const zSel = await inPage(() => window.__demoCtx.diagram.getSelectedNodes().map((n) => n.id).sort().join(','));
  check('MARQUEE-UNDER-ZOOM', zoom > 1 && zSel === 'chk,recv', `zoom=${zoom.toFixed(2)} selected={${zSel}}`);
  await shot('18-marquee-under-zoom');

  // (c) Ctrl+G with ONE node selected: the button is disabled, the chord a no-op.
  await inPage(() => { window.__demoCtx.diagram.clearSelection(); window.__demoCtx.instance.renderNow(); window.__demoCtx.syncBar(); });
  const c1 = await nodeCentre('pick');
  await page.mouse.click(c1.x, c1.y);
  await page.waitForTimeout(120);
  const btnDisabled = await page.locator('#vs-bar button', { hasText: '⊞ Group' }).isDisabled();
  const groupsBefore = await inPage(() => window.__demoCtx.diagram.getGroups().length);
  await page.keyboard.press('Control+g');
  await page.waitForTimeout(200);
  const groupsAfter = await inPage(() => window.__demoCtx.diagram.getGroups().length);
  check('GROUP-NEEDS-TWO', btnDisabled && groupsAfter === groupsBefore,
    `buttonDisabled=${btnDisabled} groups ${groupsBefore}→${groupsAfter}`);
  await shot('18-group-needs-two');
}

await page.close();
await browser.close();
server.close();

const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? '✓' : '✗'} ${r.name.padEnd(24)} ${r.detail}`);
if (pageErrors.length) console.log(`\npage errors: ${pageErrors.slice(0, 3).join(' | ')}`);
console.log(`\nvisio-editor: ${results.length - failed.length}/${results.length} cases pass · shots → ${SHOTS}`);
if (failed.length || pageErrors.length) {
  console.log('\nA VISIO EDITOR THAT FAILS THE GESTURE fails the user. This is the gate.');
  process.exit(1);
}
