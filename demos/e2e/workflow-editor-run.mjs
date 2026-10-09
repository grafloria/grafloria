// Workflow-editor gate — the library's workflow-editor surface, driven with a
// REAL mouse and keyboard on demos/interaction/workflow-editor.html, a
// screenshot per case, light and dark.
//
// The page's own checks (gallery-run) prove the APIs through the API. This
// proves what only a hand can: that the "+" on a port is pressable and opens the
// host's menu, that a link's buttons survive the pointer moving off the line,
// that a refused drag shows its reason where the hand is, that read-only stops
// a real drag while double-click still works, and that zooming out with the
// wheel swaps cards to their compact form.
//
//     node demos/e2e/workflow-editor-run.mjs [--shots <dir>]

import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, extname } from 'path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const shotsArg = process.argv.indexOf('--shots');
const SHOTS = shotsArg > -1 ? process.argv[shotsArg + 1] : join(here, 'out', 'workflow-editor');
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
const check = (name, ok, detail = '') => results.push({ name, ok: !!ok, detail });
const browser = await chromium.launch();
const pageErrors = [];

async function open(colorScheme) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 160)));
  await page.goto(`${origin}/interaction/workflow-editor.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__demoReady === true && !!window.__we, { timeout: 30000 });
  await page.waitForTimeout(300);
  return { ctx, page };
}

const { ctx, page } = await open('light');
const shot = (name) => page.screenshot({ path: join(SHOTS, `${name}.png`) });
const settle = (ms = 350) => page.waitForTimeout(ms);
const nodeBox = (id) => page.evaluate((id) => {
  const r = document.querySelector(`.grafloria-node-host[data-node-id="${id}"]`).getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
}, id);
const model = (fn, arg) => page.evaluate(fn, arg);
/** The screen point halfway along a link's drawn path. */
const linkMid = (id) => page.evaluate((id) => {
  const path = document.querySelector(`[data-link-id="${id}"] path.diagram-link, [data-link-id="${id}"] path`);
  const len = path.getTotalLength();
  const p = path.getPointAtLength(len / 2);
  const m = path.getScreenCTM();
  return { x: p.x * m.a + p.y * m.c + m.e, y: p.x * m.b + p.y * m.d + m.f };
}, id);

await shot('01-boot');

// ── 1. "+" on a free output → the HOST's menu → the step is added AND placed ──
{
  const plus = page.locator('.grafloria-port-add[data-port-id="route:r2"]');
  const box = await plus.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 8 });
  await page.mouse.down();
  await page.mouse.up();
  await settle(150);
  const menuOpen = await page.locator('.we-menu').isVisible();
  await shot('02-port-plus-menu');
  check('PORT-PLUS-MENU', menuOpen, 'the "+" on route:r2 opens the page\'s own menu');
  await page.locator('.we-menu [data-kind="http"]').click({ timeout: 2000 }).catch(() => {}); // no menu = the case above is already red
  await settle(500);
  const r = await model(() => {
    const m = window.__we.api.getModel();
    const added = m.getNodes().find((n) => n.type === 'http');
    const link = added && m.getLinks().find((l) => l.targetPortId === `${added.id}:in`);
    const route = m.getNode('route');
    const others = m.getNodes().filter((n) => n !== added);
    const hit = added && others.find((o) => added.position.x < o.position.x + o.size.width && o.position.x < added.position.x + added.size.width && added.position.y < o.position.y + o.size.height && o.position.y < added.position.y + added.size.height);
    return { id: added?.id, from: link?.sourcePortId, rightOf: added && added.position.x >= route.position.x + route.size.width, below: added && added.position.y > m.getNode('agent').position.y, overlap: hit?.id ?? null };
  });
  check('PORT-PLUS-ADDS-AND-PLACES', r.from === 'route:r2' && r.rightOf && r.below && !r.overlap, JSON.stringify(r));
  await shot('03-added-and-placed');
}

// ── 2. hover a wire → "+" and × at its middle; they survive the move onto them ──
{
  const mid = await linkMid('e3');
  await page.mouse.move(mid.x - 40, mid.y - 40, { steps: 5 });
  await page.mouse.move(mid.x, mid.y, { steps: 10 });
  await settle(200);
  const shown = await page.locator('.grafloria-link-add').isVisible().catch(() => false);
  const add = await page.locator('.grafloria-link-add').boundingBox();
  if (add) await page.mouse.move(add.x + add.width / 2, add.y + add.height / 2, { steps: 6 });
  await settle(200);
  const stays = await page.locator('.grafloria-link-add').isVisible().catch(() => false);
  await shot('04-link-hover');
  check('LINK-HOVER-BUTTONS', shown && stays && (await page.locator('.grafloria-link-delete').isVisible()), `shown=${shown} staysOnMove=${stays}`);
  await page.mouse.down();
  await page.mouse.up();
  await settle(150);
  await page.locator('.we-menu [data-kind="set"]').click({ timeout: 2000 }).catch(() => {});
  await settle(500);
  const r = await model(() => {
    const m = window.__we.api.getModel();
    const set = m.getNodes().find((n) => n.type === 'set');
    return { e3: !!m.getLink('e3'), set: !!set, into: set && m.getLinks().some((l) => l.sourcePortId === 'urgent:false' && l.targetPortId === `${set.id}:in`), out: set && m.getLinks().some((l) => l.sourcePortId === `${set.id}:out` && l.targetPortId === 'mail:in') };
  });
  check('LINK-PLUS-INSERTS', !r.e3 && r.set && r.into && r.out, JSON.stringify(r));
  await shot('05-inserted');
  await page.mouse.click(700, 860); // a blank spot, so the keys reach the canvas
  await page.keyboard.press('Control+z');
  await settle(300);
  const back = await model(() => ({ e3: !!window.__we.api.getModel().getLink('e3'), set: window.__we.api.getModel().getNodes().some((n) => n.type === 'set') }));
  check('INSERT-ONE-UNDO', back.e3 && !back.set, JSON.stringify(back));
}

// ── 3. "+ rule" on the Switch: a row, an output level with it, one undo ────────
{
  await page.locator('.grafloria-node-host[data-node-id="route"] [data-act="add-rule"]').click();
  await settle(350);
  const r = await model(() => {
    const api = window.__we.api, m = api.getModel(), node = m.getNode('route');
    const host = document.querySelector('.grafloria-node-host[data-node-id="route"]');
    const rows = [...host.querySelectorAll('.we-row')];
    const hr = host.getBoundingClientRect(), scale = hr.width / node.size.width;
    const offs = rows.map((row, i) => {
      const rr = row.getBoundingClientRect();
      const y = node.getPort(`route:r${i}`)?.layout?.args?.y;
      return Math.abs(hr.top + y * scale - (rr.top + rr.height / 2));
    });
    return { rows: rows.length, outs: [...node.ports.values()].filter((p) => p.type === 'output').length, worst: Math.max(...offs) };
  });
  await shot('06-rule-added');
  check('RULE-ADD-PORT-LEVEL', r.rows === 4 && r.outs === 4 && r.worst <= 1.5, JSON.stringify(r));
  await page.mouse.click(700, 860);
  await page.keyboard.press('Control+z');
  await settle(300);
  const after = await model(() => [...window.__we.api.getModel().getNode('route').ports.values()].filter((p) => p.type === 'output').length);
  check('RULE-ONE-UNDO', after === 3, `outputs after undo: ${after}`);
}

// ── 3b. a host that keeps its OWN state: rename + a rule via setNodes/setEdges only ──
// No command, no renderNow(): the host hands in its whole document, as a React/Vue
// app would. The card must repaint on the frame setNodes schedules, grow its
// output, and take the wire setEdges names on the port that only just appeared.
{
  await page.evaluate(async () => {
    const { toNodeSpec } = await import('/shell/grafloria.js');
    const api = window.__we.api, m = api.getModel();
    const nodes = m.getNodes().map((n) => {
      const spec = toNodeSpec(n);
      if (n.id === 'route') spec.data = { ...spec.data, title: 'Route by queue', rules: [...spec.data.rules, 'sales'] };
      return spec;
    });
    api.setNodes(nodes);
    const edges = m.getLinks().map((l) => ({ id: l.id, source: m.getNodeByPortId(l.sourcePortId).id, sourceHandle: l.sourcePortId, target: m.getNodeByPortId(l.targetPortId).id, targetHandle: l.targetPortId }));
    edges.push({ id: 'host-wire', source: 'route', sourceHandle: 'route:r3', target: 'mail', targetHandle: 'mail:in' });
    api.setEdges(edges);
  });
  await settle(1500); // nothing else happens on the page meanwhile
  const r = await model(() => {
    const m = window.__we.api.getModel();
    const host = document.querySelector('.grafloria-node-host[data-node-id="route"]');
    return {
      title: host.querySelector('.we-txt b')?.textContent,
      rows: host.querySelectorAll('.we-row').length,
      port: !!m.getNode('route').getPort('route:r3'),
      wire: m.getLink('host-wire')?.sourcePortId ?? null,
      plusGone: !document.querySelector('.grafloria-port-add[data-port-id="route:r3"]'),
      // Where the wire is PAINTED to start, against the centre of the row it leaves
      // from — screen px. No renderNow(): only the frames the library schedules.
      wireStartOff: (() => {
        const path = document.querySelector('[data-link-id="host-wire"] path.diagram-link, [data-link-id="host-wire"] path');
        const row = host.querySelectorAll('.we-row')[3];
        if (!path || !row) return null;
        const p = path.getPointAtLength(0), mtx = path.getScreenCTM();
        const y = p.x * mtx.b + p.y * mtx.d + mtx.f;
        const rr = row.getBoundingClientRect();
        return Math.round(Math.abs(y - (rr.top + rr.height / 2)) * 10) / 10;
      })(),
    };
  });
  await shot('06b-host-setnodes');
  check('HOST-SETNODES-REPAINTS', r.title === 'Route by queue' && r.rows === 4 && r.port && r.wire === 'route:r3' && r.plusGone && r.wireStartOff !== null && r.wireStartOff <= 1.5, JSON.stringify(r));
  // put the document back the same way (host state again)
  await page.evaluate(async () => {
    const { toNodeSpec } = await import('/shell/grafloria.js');
    const api = window.__we.api, m = api.getModel();
    api.setNodes(m.getNodes().map((n) => {
      const spec = toNodeSpec(n);
      if (n.id === 'route') spec.data = { ...spec.data, title: 'Route by team', rules: spec.data.rules.slice(0, 3) };
      return spec;
    }));
  });
  await settle(250);
  const back = await model(() => ({ wire: !!window.__we.api.getModel().getLink('host-wire'), outs: [...window.__we.api.getModel().getNode('route').ports.values()].filter((p) => p.type === 'output').length }));
  check('HOST-SETNODES-DROPS-WIRE', !back.wire && back.outs === 3, JSON.stringify(back));
}

// ── 4. a REAL drag into a slot that refuses: the reason, beside the slot ───────
{
  const from = await nodeBox('mail');
  const agent = await nodeBox('agent');
  const memory = await page.evaluate(() => {
    const r = document.querySelector('.grafloria-node-host[data-node-id="agent"] [data-port="agent:memory"]').getBoundingClientRect();
    return r.left + r.width / 2;
  });
  await page.mouse.move(from.x + from.w, from.y + from.h / 2, { steps: 4 });
  await page.mouse.down();
  await page.mouse.move(memory, agent.y + agent.h - 30, { steps: 18 });
  await page.mouse.move(memory, agent.y + agent.h, { steps: 6 });
  await settle(120);
  const reason = await page.locator('.grafloria-connect-reason').textContent().catch(() => null);
  const inside = await page.evaluate(() => {
    const l = document.querySelector('.grafloria-connect-reason')?.getBoundingClientRect();
    const c = document.getElementById('canvas').getBoundingClientRect();
    return !!l && l.left >= c.left && l.right <= c.right && l.top >= c.top && l.bottom <= c.bottom;
  });
  check('REASON-STAYS-ON-CANVAS', inside, 'the reason label is fully inside the canvas (it flips near the right edge)');
  await shot('07-refused-with-reason');
  await page.mouse.up();
  await settle(150);
  const links = await model(() => window.__we.api.getModel().getLinks().filter((l) => l.targetPortId === 'agent:memory').length);
  const gone = (await page.locator('.grafloria-connect-reason').count()) === 0;
  check('REFUSED-SAYS-WHY', reason === 'Only a window memory plugs into the Memory slot' && links === 0 && gone, `reason="${reason}" links=${links} goneAfter=${gone}`);
}

// ── 5. a run streams over the flow; the document never changes ─────────────────
{
  const before = await model(() => ({ doc: JSON.stringify(window.__we.api.getModel().serialize()), undo: window.__we.api.getEngine().commandManager.canUndo() }));
  await page.locator('#btn-run').click();
  await settle(1000);
  const mid = await model(() => [...document.querySelectorAll('.grafloria-run-frame')].map((f) => f.getAttribute('data-status')));
  await shot('08-run-mid');
  await page.waitForFunction(() => /run finished/.test(document.getElementById('readout').textContent), { timeout: 15000 });
  const end = await model(() => ({
    statuses: [...document.querySelectorAll('.grafloria-run-frame')].map((f) => f.getAttribute('data-status')),
    labels: [...document.querySelectorAll('.grafloria-run-label')].map((l) => l.textContent),
    doc: JSON.stringify(window.__we.api.getModel().serialize()),
    undo: window.__we.api.getEngine().commandManager.canUndo(),
  }));
  await shot('09-run-done');
  check('RUN-STREAMS', mid.includes('running') && mid.includes('completed') && end.statuses.every((s) => s === 'completed') && end.labels.length >= 4, `mid=[${[...new Set(mid)]}] end=[${[...new Set(end.statuses)]}] labels=${end.labels.length}`);
  check('RUN-NOT-IN-DOCUMENT', end.doc === before.doc && end.undo === before.undo, 'serialized document and undo stack unchanged');
}

// ── 5b. editable: a real drag on a card (even on one of its rows) moves it, and the overlay follows ──
{
  await page.locator('#btn-run').click();
  await page.waitForFunction(() => /run finished/.test(document.getElementById('readout').textContent), { timeout: 15000 });
  const b = await nodeBox('urgent');
  const x0 = await model(() => window.__we.api.getModel().getNode('urgent').position.x);
  await page.mouse.move(b.x + b.w / 2, b.y + b.h - 20, { steps: 3 }); // on the "false" row
  await page.mouse.down();
  await page.mouse.move(b.x + b.w / 2 + 50, b.y + b.h - 20, { steps: 12 });
  await page.mouse.up();
  await settle(150);
  const r = await model(() => {
    const n = window.__we.api.getModel().getNode('urgent');
    const f = document.querySelector('.grafloria-run-frame[data-node-id="urgent"]');
    return { x: n.position.x, frameLeft: f ? parseFloat(f.style.left) : null };
  });
  check('DRAG-MOVES-CARD', Math.abs(r.x - x0 - 50) <= 2 && r.frameLeft !== null && Math.abs(r.frameLeft - (r.x - 3)) < 0.5, `moved ${Math.round(r.x - x0)} px, run frame at ${r.frameLeft} for card x ${r.x}`);
  await page.keyboard.press('Control+z');
  await settle(200);
}

// ── 6. read-only: no "+", a real drag moves nothing, double-click still opens ──
{
  await page.locator('#btn-ro').click();
  await settle(200);
  const plus = await page.locator('.grafloria-port-add').count();
  const b = await nodeBox('mail');
  const x0 = await model(() => window.__we.api.getModel().getNode('mail').position.x);
  await page.mouse.move(b.x + 40, b.y + 20, { steps: 3 });
  await page.mouse.down();
  await page.mouse.move(b.x + 160, b.y + 80, { steps: 12 });
  await page.mouse.up();
  const x1 = await model(() => window.__we.api.getModel().getNode('mail').position.x);
  await page.mouse.dblclick(b.x + 40, b.y + 20);
  await settle(150);
  const details = await page.locator('#details').isVisible();
  await shot('10-read-only');
  check('READ-ONLY', plus === 0 && x0 === x1 && details, `plus=${plus} moved=${x1 - x0} details=${details}`);
  if (await page.locator('#details').isVisible()) await page.locator('#details .close').click();
  await page.locator('#btn-ro').click();
}

// ── 6b. the page owns its keys: Delete on the trigger is refused by beforeKey ──
{
  const t = await nodeBox('trigger');
  await page.mouse.click(t.x + 30, t.y + 20);
  await page.keyboard.press('Delete');
  await settle(200);
  const r = await model(() => ({ exists: !!window.__we.api.getModel().getNode('trigger'), said: document.getElementById('readout').textContent }));
  check('BEFOREKEY-REFUSES', r.exists && /trigger stays/.test(r.said), JSON.stringify(r));
  await page.mouse.click(700, 860);
}

// ── 7. the wheel zooms far out → compact cards ─────────────────────────────────
{
  await page.mouse.move(720, 500);
  for (let i = 0; i < 12; i++) {
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, 240);
    await page.keyboard.up('Control');
    await page.waitForTimeout(40);
  }
  await settle(250);
  const r = await model(() => ({ zoom: window.__we.api.viewport.getZoom(), lod: document.querySelector('.grafloria-node-host[data-node-id="route"]').getAttribute('data-lod'), mini: !!document.querySelector('.grafloria-node-host[data-node-id="route"] .we-mini') }));
  await shot('11-compact');
  check('COMPACT-BELOW', r.zoom < 0.6 && r.lod === 'compact' && r.mini, JSON.stringify(r));
}

// ── 8. Tidy keeps port order ───────────────────────────────────────────────────
{
  await page.evaluate(() => window.__we.api.fitView?.({ padding: 48 }));
  await page.locator('#btn-tidy').click();
  await settle(700);
  const r = await model(() => {
    const m = window.__we.api.getModel(), y = (id) => m.getNode(id).position.y;
    return { trueAboveFalse: y('route') < y('mail'), rulesInOrder: y('notify') < y('agent') };
  });
  await shot('12-tidy');
  check('TIDY-PORT-ORDER', r.trueAboveFalse && r.rulesInOrder, JSON.stringify(r));
}
await ctx.close();

// ── 10. wire gestures (a fresh page) ─────────────────────────────────────────────
{
  const { ctx: c2, page: p } = await open('light');
  const shot2 = (name) => p.screenshot({ path: join(SHOTS, `${name}.png`) });
  const m2 = (fn, arg) => p.evaluate(fn, arg);
  /** A port's screen point, from the live model. */
  const portAt = (portId) => p.evaluate(async (portId) => {
    const { portWorldPosition } = await import('/shell/grafloria.js');
    const api = window.__we.api, m = api.getModel();
    const node = m.getNodeByPortId(portId);
    const w = portWorldPosition(node.getPort(portId), node);
    const r = document.getElementById('canvas').getBoundingClientRect();
    return api.viewport.worldToClient(w.x, w.y, r);
  }, portId);
  const box = (id) => p.evaluate((id) => { const r = document.querySelector(`.grafloria-node-host[data-node-id="${id}"]`).getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }, id);
  const linksBetween = (from, to) => m2(([from, to]) => window.__we.api.getModel().getLinks().filter((l) => l.sourcePortId === from && l.targetPortId === to).length, [from, to]);
  const dragFromPlus = async (portId, to, steps = 16) => {
    const b = await p.locator(`.grafloria-port-add[data-port-id="${portId}"]`).boundingBox();
    await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 3 });
    await p.mouse.down();
    await p.mouse.move(to.x, to.y, { steps });
  };

  // 1. drag FROM the "+" to another step's input port → connect
  {
    const to = await portAt('mail:in');
    await dragFromPlus('route:r2', to);
    await p.mouse.up();
    await p.waitForTimeout(250);
    check('PLUS-DRAG-CONNECTS', (await linksBetween('route:r2', 'mail:in')) === 1, 'dragging the "+" of route:r2 onto mail:in made the link');
    await p.keyboard.press('Control+z');
    await p.waitForTimeout(200);
  }

  // 2. drag from the "+" to EMPTY canvas → connect:drop-empty with the world point → the page adds a step there
  {
    // An empty spot well inside the canvas: under the trigger, left of everything else.
    const tr = await box('trigger');
    const to = { x: tr.x + tr.w / 2, y: Math.min(tr.y + tr.h + 220, 860) };
    const empty = await p.evaluate((to) => !document.elementFromPoint(to.x, to.y)?.closest('.grafloria-node-host'), to);
    if (!empty) throw new Error('DROP-EMPTY staging: the chosen point is on a card');
    await dragFromPlus('agent:out', to);
    await p.mouse.up();
    await p.waitForTimeout(200);
    const drop = await m2(() => window.__we.lastDrop ?? null);
    const menu = await p.locator('.we-menu').isVisible();
    await shot2('20-drop-empty-menu');
    if (menu) await p.locator('.we-menu [data-kind="http"]').click();
    await p.waitForTimeout(300);
    const r = await m2((drop) => {
      const m = window.__we.api.getModel();
      const http = m.getNodes().find((n) => n.type === 'http');
      return { wired: !!http && m.getLinks().some((l) => l.sourcePortId === 'agent:out' && l.targetPortId === `${http.id}:in`), near: !!http && drop && Math.abs(http.position.x - drop.world.x) < 2 };
    }, drop);
    await shot2('21-drop-empty-added');
    check('DROP-EMPTY-REPORTED', drop?.portId === 'agent:out' && typeof drop?.world?.x === 'number' && menu && r.wired && r.near, JSON.stringify({ drop, menu, ...r }));
  }

  // 3a. snapToNode: release over a card's BODY → its first accepting input
  {
    const mb = await box('mail');
    await dragFromPlus('notify:out', { x: mb.x + mb.w / 2, y: mb.y + mb.h / 2 });
    await p.waitForTimeout(120);
    const marked = await m2(() => document.querySelector('.grafloria-node-host[data-node-id="mail"]')?.getAttribute('data-connect-snap'));
    await shot2('22-snap-accept');
    await p.mouse.up();
    await p.waitForTimeout(250);
    check('SNAP-TO-NODE', marked === 'accept' && (await linksBetween('notify:out', 'mail:in')) === 1, `marked=${marked}`);
    await p.keyboard.press('Control+z');
    await p.waitForTimeout(200);
  }
  // 3b. …a card whose inputs all refuse: marked refused, its reason shown, no link on release
  {
    const ub = await box('urgent');
    await dragFromPlus('mail:out', { x: ub.x + ub.w / 2, y: ub.y + 40 });
    await p.waitForTimeout(120);
    const r = await m2(() => ({ mark: document.querySelector('.grafloria-node-host[data-node-id="urgent"]')?.getAttribute('data-connect-snap'), reason: document.querySelector('.grafloria-connect-reason')?.textContent ?? null }));
    await shot2('23-snap-refuse');
    await p.mouse.up();
    await p.waitForTimeout(200);
    const links = await linksBetween('mail:out', 'urgent:in');
    const cleared = await m2(() => !document.querySelector('[data-connect-snap]'));
    check('SNAP-REFUSED-SAYS-WHY', r.mark === 'refuse' && r.reason === 'That would loop back to an earlier step' && links === 0 && cleared, JSON.stringify({ ...r, links, cleared }));
  }

  // 4. a SELECTED link keeps its buttons after the pointer leaves; Delete goes through beforeKey
  {
    const mid = await linkMid.call(null, 'e3').catch(() => null);
    const path = await p.evaluate(() => {
      const el = document.querySelector('[data-link-id="e3"] path.diagram-link, [data-link-id="e3"] path');
      const q = el.getPointAtLength(el.getTotalLength() / 3), mtx = el.getScreenCTM();
      return { x: q.x * mtx.a + q.y * mtx.c + mtx.e, y: q.x * mtx.b + q.y * mtx.d + mtx.f };
    });
    void mid;
    await p.mouse.move(path.x, path.y, { steps: 6 });
    await p.mouse.down();
    await p.mouse.up();
    await p.mouse.move(80, 860, { steps: 6 }); // far away
    await p.waitForTimeout(200);
    const still = await p.locator('.grafloria-link-add').isVisible().catch(() => false);
    await shot2('24-selected-link-buttons');
    await m2(() => (window.__we.keys = []));
    await p.keyboard.press('Delete');
    await p.waitForTimeout(250);
    const r = await m2(() => ({ keys: window.__we.keys, gone: !window.__we.api.getModel().getLink('e3') }));
    check('SELECTED-LINK-BUTTONS', still && r.keys.includes('delete') && r.gone, JSON.stringify({ still, ...r }));
    await p.keyboard.press('Control+z');
    await p.waitForTimeout(250);
  }

  // 5. drag a step OVER a link → the link is marked; release → link:insert-request → the page rewires A→X→B
  {
    const nb = await box('notify');
    const path = await p.evaluate(() => {
      const el = document.querySelector('[data-link-id="e3"] path.diagram-link, [data-link-id="e3"] path');
      const q = el.getPointAtLength(el.getTotalLength() / 2), mtx = el.getScreenCTM();
      return { x: q.x * mtx.a + q.y * mtx.c + mtx.e, y: q.x * mtx.b + q.y * mtx.d + mtx.f };
    });
    const grab = { x: nb.x + nb.w / 2, y: nb.y + 20 };
    await p.mouse.move(grab.x, grab.y, { steps: 3 });
    await p.mouse.down();
    await p.mouse.move(path.x, path.y, { steps: 20 });
    await p.waitForTimeout(120);
    const marked = await m2(() => !!document.querySelector('[data-link-id="e3"] .link-drop-target, [data-link-id="e3"].link-drop-target, path.link-drop-target'));
    await shot2('25-drop-on-link-hover');
    await p.mouse.up();
    await p.waitForTimeout(300);
    const r = await m2(() => {
      const m = window.__we.api.getModel();
      return { e3: !!m.getLink('e3'), into: m.getLinks().some((l) => l.sourcePortId === 'urgent:false' && l.targetPortId === 'notify:in'), out: m.getLinks().some((l) => l.sourcePortId === 'notify:out' && l.targetPortId === 'mail:in') };
    });
    await shot2('26-dropped-on-link');
    check('NODE-DROP-ON-LINK', marked && !r.e3 && r.into && r.out, JSON.stringify({ marked, ...r }));
  }

  // F4. Shift-click on a card's BODY extends the selection
  {
    await p.mouse.click(700, 860);
    const a = await box('mail'), b = await box('agent');
    await p.mouse.click(a.x + 40, a.y + 20);
    await p.keyboard.down('Shift');
    await p.mouse.click(b.x + 40, b.y + 20);
    await p.keyboard.up('Shift');
    const sel = await m2(() => window.__we.api.getModel().getSelectedNodes().map((n) => n.id).sort());
    check('SHIFT-CLICK-EXTENDS', JSON.stringify(sel) === JSON.stringify(['agent', 'mail']), JSON.stringify(sel));
  }

  // F3. an edge naming a port the node lacks is REPORTED, not dropped without a word
  {
    const r = await m2(() => {
      const api = window.__we.api, m = api.getModel(), got = [];
      const off = (w) => got.push(w);
      api.on('renderer:warning', off);
      const edges = m.getLinks().map((l) => ({ id: l.id, source: m.getNodeByPortId(l.sourcePortId).id, sourceHandle: l.sourcePortId, target: m.getNodeByPortId(l.targetPortId).id, targetHandle: l.targetPortId }));
      api.setEdges([...edges, { id: 'stale', source: 'mail', sourceHandle: 'mail:out', target: 'trigger', targetHandle: 'trigger:in' }]);
      api.off('renderer:warning', off);
      return got.map((w) => [w.kind, w.edgeId, w.end]);
    });
    check('EDGE-DROP-WARNED', JSON.stringify(r) === JSON.stringify([['edge-dropped', 'stale', 'target']]), JSON.stringify(r));
  }
  await c2.close();
}

// ── 9. dark: the same page, the same run, its own palette ──────────────────────
{
  const dark = await open('dark');
  await dark.page.screenshot({ path: join(SHOTS, '13-dark-boot.png') });
  await dark.page.locator('#btn-run').click();
  await dark.page.waitForTimeout(1300);
  await dark.page.screenshot({ path: join(SHOTS, '14-dark-run.png') });
  const bg = await dark.page.evaluate(() => getComputedStyle(document.querySelector('.we-card')).backgroundColor);
  check('DARK-PALETTE', bg !== 'rgb(255, 255, 255)', `card background ${bg}`);
  await dark.ctx.close();
}

await browser.close();
server.close();

const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? '✓' : '✗'} ${r.name.padEnd(26)} ${r.detail}`);
if (pageErrors.length) console.log(`\npage errors: ${pageErrors.slice(0, 3).join(' | ')}`);
console.log(`\nworkflow-editor: ${results.length - failed.length}/${results.length} cases pass · shots → ${SHOTS}`);
if (failed.length || pageErrors.length) {
  console.log('\nA FLOW EDITOR THAT WORKS THROUGH THE API BUT NOT UNDER A HAND is broken. This is the gate.');
  process.exit(1);
}
