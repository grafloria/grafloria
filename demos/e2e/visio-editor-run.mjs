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
const ctx = await browser.newContext({ viewport: { width: 1500, height: 900 }, deviceScaleFactor: 2 });
await ctx.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => false }));
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 200)));

await page.goto(`${origin}/diagrams/visio-editor.html`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__demoReady === true, { timeout: 30000 });

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
  // Rewind this case's edits (distribute, redo-align, chk stagger is unmanaged
  // — put chk back explicitly).
  await undoKey(); await page.waitForTimeout(80);
  await undoKey(); await page.waitForTimeout(80);
  await inPage(() => {
    const n = window.__demoCtx.diagram.getNode('chk');
    n.setPosition(n.position.x, 120);
    window.__demoCtx.diagram.clearSelection();
    window.__demoCtx.instance.renderNow();
  });
}

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
