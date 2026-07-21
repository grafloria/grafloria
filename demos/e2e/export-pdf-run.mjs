// GATE — does an exported PDF actually RENDER its gradients and images?
//
// Structural asserts on the bytes ("/ShadingType 2 exists") pass with the shading
// unreferenced by any fill, and an image XObject "exists" while never being Do'd. This
// gate closes both holes twice over:
//
//   1. WEAK-TOOTH structural asserts — the content stream must INVOKE the resources
//      (`/ShN sh` clipped to the shape, `/ImN Do` inside its placement q/Q).
//   2. PIXELS. The PDF is rasterized (poppler's pdftoppm → PPM, trivially parseable)
//      and read back: the gradient's red end must sit LEFT of its blue end (endpoint
//      swap = direction flip = this catches it), the embedded canvas PNG's green half
//      must be green on paper, and its TRANSPARENT half must not render as black —
//      which is exactly what a dropped /SMask looks like.
//
// Everything flows through the REAL export path: a live page, the shipped
// `await instance.export('pdf', …)`, the same capture the SVG export uses.
//
// Needs `demos/shell/grafloria.js` built from current libs (`node demos/build.mjs`) — the
// same standing requirement every demo gate has. Serves demos/ on an EPHEMERAL port
// (the user's demo server owns :4321 and is not touched).

import { chromium } from 'playwright';
import { createServer } from 'http';
import { spawnSync } from 'child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { dirname, extname, join } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';

const here = dirname(fileURLToPath(import.meta.url));
const demosRoot = join(here, '..');

const checks = [];
const check = (name, ok, detail) => {
  checks.push(ok);
  console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`);
};

// ---------------------------------------------------------------------------
// Ephemeral static server over demos/
// ---------------------------------------------------------------------------

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.svg': 'image/svg+xml' };

const server = createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  const path = join(demosRoot, url === '/' ? 'index.html' : url.slice(1));
  try {
    const body = readFileSync(path);
    res.writeHead(200, { 'Content-Type': MIME[extname(path)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;

// ---------------------------------------------------------------------------
// Rasterization — poppler when present; otherwise say so PLAINLY and skip pixels.
// ---------------------------------------------------------------------------

const havePdftoppm = spawnSync('pdftoppm', ['-v']).status !== null;

/** PDF bytes → { width, height, data(RGB) } of page 1, or null without a rasterizer. */
function rasterize(bytes, tag) {
  if (!havePdftoppm) return null;
  const dir = mkdtempSync(join(tmpdir(), `grafloria-pdf-${tag}-`));
  const pdfPath = join(dir, 'page.pdf');
  writeFileSync(pdfPath, bytes);
  const run = spawnSync('pdftoppm', ['-r', '100', '-f', '1', '-l', '1', pdfPath, join(dir, 'out')]);
  const ppmName = run.status === 0 ? readdirSync(dir).find((f) => f.endsWith('.ppm')) : null;
  if (!ppmName) {
    rmSync(dir, { recursive: true, force: true });
    return null;
  }
  const ppm = readFileSync(join(dir, ppmName));
  rmSync(dir, { recursive: true, force: true });
  // P6: "P6\n<w> <h>\n255\n" then binary RGB triplets (whitespace-separated header).
  let pos = 0;
  const token = () => {
    while (/\s/.test(String.fromCharCode(ppm[pos]))) pos++;
    let start = pos;
    while (pos < ppm.length && !/\s/.test(String.fromCharCode(ppm[pos]))) pos++;
    return ppm.toString('latin1', start, pos);
  };
  if (token() !== 'P6') return null;
  const width = Number(token());
  const height = Number(token());
  token(); // maxval
  pos++; // the single whitespace after maxval
  return { width, height, data: ppm.subarray(pos) };
}

const px = (img, x, y) => {
  const at = (y * img.width + x) * 3;
  return [img.data[at], img.data[at + 1], img.data[at + 2]];
};

const latin1 = (bytes) => {
  let out = '';
  for (let i = 0; i < bytes.length; i += 65536) out += String.fromCharCode(...bytes.subarray(i, i + 65536));
  return out;
};

const contentStreams = (body) => [...body.matchAll(/stream\n([\s\S]*?)\nendstream/g)].map((m) => m[1]).join('\n');

const b = await chromium.launch({ args: ['--disable-blink-features=AutomationControlled'] });
const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
const pageErrors = [];
p.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 200)));

// ===========================================================================
// Part A — the LIVE DASHBOARD, exported by its own instance.
// ===========================================================================

console.log('--- pdf export: the real dashboard, through await instance.export("pdf") ---');

await p.goto(`${origin}/dashboard/dashboard-builder.html`, { waitUntil: 'networkidle' });
await p.waitForFunction(() => window.__demoReady === true, { timeout: 20000 });
await p.waitForTimeout(500);

const dash = await p.evaluate(async () => {
  const warnings = [];
  const href = await window.__demoCtx.instance.export('pdf', {
    includeIds: [...window.__demoCtx.dashboard.exportIds()],
    onWarnings: (w) => warnings.push(...[].concat(w)),
  });
  return { href, warnings };
});

const dashBytes = Buffer.from(dash.href.split(',')[1], 'base64');
const dashBody = latin1(dashBytes);

check('dashboard export is a data:application/pdf URL', dash.href.startsWith('data:application/pdf;base64,'));
check('dashboard PDF is well-formed (%PDF … %%EOF)', dashBody.startsWith('%PDF-') && dashBody.trimEnd().endsWith('%%EOF'));
check(
  'the OBSOLETE warnings are gone — images/gradients are no longer reported as unimplemented',
  !dash.warnings.some((w) => /XObjects\) is not implemented|axial shadings are not implemented/.test(w)),
  dash.warnings.filter((w) => /not implemented/.test(w)).join(' | ').slice(0, 160) || 'clean'
);

{
  const raster = rasterize(dashBytes, 'dash');
  if (raster) {
    let ink = 0;
    const total = raster.width * raster.height;
    for (let i = 0; i < total * 3; i += 3) {
      if (raster.data[i] < 245 || raster.data[i + 1] < 245 || raster.data[i + 2] < 245) ink++;
    }
    check('dashboard PDF rasterizes to a NON-BLANK page', ink / total > 0.005, `${((ink / total) * 100).toFixed(2)}% ink`);
  } else {
    check('dashboard PDF rasterized', false, 'pdftoppm unavailable — pixel checks COULD NOT run');
  }
}

// ===========================================================================
// Part B — a gradient node + a transparent canvas-PNG widget, pixel-verified.
// ===========================================================================

console.log('--- pdf export: gradient + RGBA image, structural AND pixel asserts ---');

await p.goto(`${origin}/misc/pdf-export.html`, { waitUntil: 'networkidle' });
await p.waitForFunction(() => window.__demoReady === true, { timeout: 20000 });

const probe = await p.evaluate(async () => {
  const { render } = await import('/shell/grafloria.js');

  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:0;top:0;width:900px;height:520px;background:#fff;z-index:99';
  document.body.appendChild(host);

  // The probe image: LEFT half fully transparent (the /SMask probe — a dropped SMask
  // renders it black), RIGHT half solid green (the "image really painted" probe).
  const canvas = document.createElement('canvas');
  canvas.width = 120;
  canvas.height = 80;
  const c2d = canvas.getContext('2d');
  c2d.fillStyle = '#00ff00';
  c2d.fillRect(60, 0, 60, 80);
  const dataUrl = canvas.toDataURL('image/png');

  const spec = {
    nodes: [
      {
        id: 'grad',
        position: { x: 40, y: 40 },
        size: { width: 300, height: 120 },
        style: {
          stroke: 'none',
          fill: {
            type: 'linear',
            x1: 0, y1: 0.5, x2: 1, y2: 0.5, // left → right
            stops: [
              { offset: 0, color: '#ff0000' },
              { offset: 1, color: '#0000ff' },
            ],
          },
        },
      },
      { id: 'img', custom: true, position: { x: 40, y: 240 }, size: { width: 120, height: 80 } },
    ],
    edges: [],
  };

  const api = render(spec, host, {
    renderCustomNode: (node, el) => {
      const img = document.createElement('img');
      img.src = dataUrl;
      img.width = 120;
      img.height = 80;
      el.appendChild(img);
      return img.decode(); // the async-painter contract: export() waits for the load
    },
  });
  api.renderNow();

  const warnings = [];
  const href = await api.export('pdf', { onWarnings: (w) => warnings.push(...[].concat(w)) });
  const svg = api.exportSvgString().svg;
  api.destroy?.();
  host.remove();
  return { href, warnings, svgHasImage: svg.includes('<image'), svgHasGradient: /<(linear|radial)Gradient/.test(svg) };
});

check('capture emitted a gradient def and an <image> into the SVG side (probe premise)', probe.svgHasGradient && probe.svgHasImage);

const bytes = Buffer.from(probe.href.split(',')[1], 'base64');
const body = latin1(bytes);
const content = contentStreams(body);

// -- structural, weak-tooth grade ------------------------------------------------
check('PDF carries an axial shading (/ShadingType 2)', body.includes('/ShadingType 2'));
check(
  'the shading is INVOKED: clip (W n) then /ShN sh in the content stream',
  /W n\n\/Sh\d+ sh/.test(content)
);
check('the gradient did NOT fall back to a flat first stop', !probe.warnings.some((w) => /first stop/.test(w)), probe.warnings.join(' | ').slice(0, 160) || 'no warnings');
check('PDF carries an image XObject (/Subtype /Image)', body.includes('/Subtype /Image'));
check('the image is INVOKED: /ImN Do inside its placement q/Q', /q\n[^]*?cm\n\/Im\d+ Do\nQ/.test(content));
{
  const smask = /\/SMask (\d+) 0 R/.exec(body);
  const smaskObject = smask ? new RegExp(`(?:^|\\n)${smask[1]} 0 obj\\n([\\s\\S]*?)\\nendstream`).exec(body) : null;
  check(
    'the canvas PNG alpha is wired as an /SMask whose object is a DeviceGray image',
    !!smaskObject && smaskObject[1].includes('/DeviceGray') && smaskObject[1].includes('/Subtype /Image')
  );
}
check('no obsolete "not implemented" warnings on the probe', !probe.warnings.some((w) => /not implemented/.test(w)));

// -- pixels ---------------------------------------------------------------------
const raster = rasterize(bytes, 'probe');
if (!raster) {
  check('probe PDF rasterized for pixel verification', false, 'pdftoppm unavailable — PIXEL CHECKS DID NOT RUN');
} else {
  // Scan for the strongest red / blue / green / black signals. Coordinate-free on
  // purpose: the page fit centres content, and scanning cannot be fooled by layout.
  let reddest = { score: -1, x: 0, y: 0 };
  let bluest = { score: -1, x: 0, y: 0 };
  let green = 0;
  let black = 0;
  for (let y = 0; y < raster.height; y++) {
    for (let x = 0; x < raster.width; x++) {
      const [r, g2, b2] = px(raster, x, y);
      const redScore = r - Math.max(g2, b2);
      const blueScore = b2 - Math.max(r, g2);
      if (redScore > reddest.score) reddest = { score: redScore, x, y };
      if (blueScore > bluest.score) bluest = { score: blueScore, x, y };
      if (g2 > 200 && r < 90 && b2 < 90) green++;
      if (r < 40 && g2 < 40 && b2 < 40) black++;
    }
  }

  check('gradient paints a STRONG red region', reddest.score > 120, `max red score ${reddest.score}`);
  check('gradient paints a STRONG blue region', bluest.score > 120, `max blue score ${bluest.score}`);
  check(
    'gradient DIRECTION: red end is left of blue end (endpoint swap would flip this)',
    reddest.score > 120 && bluest.score > 120 && reddest.x < bluest.x,
    `red@x=${reddest.x} blue@x=${bluest.x}`
  );
  check('the embedded canvas PNG really painted (green pixels on paper)', green > 50, `${green} green px`);
  check(
    'the /SMask is honoured: the transparent half does NOT render as black',
    black < 20,
    `${black} near-black px (a dropped SMask paints thousands)`
  );
}

// ===========================================================================
// Part C — gradient stop-opacity: the BLEND must land on paper, and the mask must not leak.
// ===========================================================================

console.log('--- pdf export: stop-opacity — luminosity soft mask, pixel-blended ---');

const blend = await p.evaluate(async () => {
  const { render } = await import('/shell/grafloria.js');
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:0;top:0;width:900px;height:520px;background:#fff;z-index:99';
  document.body.appendChild(host);

  // ids sort in paint order on purpose: bg under the fade, the canary painted LAST.
  const spec = {
    nodes: [
      { id: 'a-bg', position: { x: 40, y: 40 }, size: { width: 300, height: 120 },
        style: { stroke: 'none', fill: '#ffff00' } },
      { id: 'b-fade', position: { x: 40, y: 40 }, size: { width: 300, height: 120 },
        style: { stroke: 'none', fill: {
          type: 'linear', x1: 0, y1: 0.5, x2: 1, y2: 0.5,
          stops: [
            { offset: 0, color: '#0000ff', opacity: 1 },
            { offset: 1, color: '#0000ff', opacity: 0 },
          ],
        } } },
      // Painted AFTER the masked gradient, to its RIGHT — where the extended alpha ramp
      // is 0. A leaked SMask multiplies this square by 0: it VANISHES. The canary.
      { id: 'z-canary', position: { x: 420, y: 40 }, size: { width: 120, height: 120 },
        style: { stroke: 'none', fill: '#ff00ff' } },
    ],
    edges: [],
  };
  const api = render(spec, host, {});
  api.renderNow();
  const warnings = [];
  const href = await api.export('pdf', { onWarnings: (w) => warnings.push(...[].concat(w)) });
  api.destroy?.();
  host.remove();
  return { href, warnings };
});

const blendBytes = Buffer.from(blend.href.split(',')[1], 'base64');
const blendBody = latin1(blendBytes);
const blendContent = contentStreams(blendBody);

check(
  'stop opacity no longer warns "OPAQUE" — the mask is real',
  !blend.warnings.some((w) => /OPAQUE/.test(w)),
  blend.warnings.join(' | ').slice(0, 160) || 'clean'
);
check(
  'the PDF carries a /Luminosity SMask whose /G form is a /DeviceGray transparency group',
  /\/SMask << \/S \/Luminosity \/G \d+ 0 R >>/.test(blendBody) &&
    /\/Subtype \/Form[^>]*\/Group << \/S \/Transparency \/CS \/DeviceGray >>/.test(blendBody)
);
check(
  'the mask gs is INVOKED inside the q/Q, before the clipped sh',
  /q\n\/GSM1 gs\n[^]*?W n\n\/Sh\d+ sh\nQ/.test(blendContent)
);

{
  const raster = rasterize(blendBytes, 'blend');
  if (!raster) {
    check('blend probe rasterized', false, 'pdftoppm unavailable — PIXEL CHECKS DID NOT RUN');
  } else {
    // Gradient: blue #0000ff fading over yellow #ffff00. At position t the composite is
    // (255t, 255t, 255(1−t)) — pure blue at the left edge, pure yellow at the right,
    // exactly (127.5, 127.5, 127.5) in the middle. An OPAQUE render is solid blue
    // everywhere: no yellow at all, and (0,0,255) at the midpoint — >120 per channel off.
    let blue = { count: 0, minX: Infinity };
    let yellow = { count: 0, maxX: -Infinity };
    let magenta = 0;
    const rows = new Map(); // row → count of gradient-ish pixels, to find the band
    for (let y = 0; y < raster.height; y++) {
      for (let x = 0; x < raster.width; x++) {
        const [r, g2, b2] = px(raster, x, y);
        const isBlue = b2 - Math.max(r, g2) > 120;
        const isYellow = r > 200 && g2 > 200 && b2 < 90;
        if (isBlue) { blue.count++; blue.minX = Math.min(blue.minX, x); }
        if (isYellow) { yellow.count++; yellow.maxX = Math.max(yellow.maxX, x); }
        if (isBlue || isYellow) rows.set(y, (rows.get(y) ?? 0) + 1);
        if (Math.abs(r - 255) < 25 && g2 < 25 && Math.abs(b2 - 255) < 25) magenta++;
      }
    }

    check('the opaque end paints strong blue', blue.count > 50, `${blue.count} blue px`);
    check(
      'the transparent end lets the yellow background THROUGH (an opaque shading covers it all)',
      yellow.count > 200,
      `${yellow.count} yellow px`
    );

    const band = [...rows.entries()].sort((a, b) => b[1] - a[1])[0];
    const midX = Math.round((blue.minX + yellow.maxX) / 2);
    const [mr, mg, mb] = band ? px(raster, midX, band[0]) : [0, 0, 0];
    check(
      'the MIDPOINT pixel is the computed BLEND (≈127,127,127), not the opaque gradient (0,0,255)',
      Math.abs(mr - 127) < 35 && Math.abs(mg - 127) < 35 && Math.abs(mb - 127) < 35,
      `midpoint (${mr},${mg},${mb}) @x=${midX}`
    );
    check(
      'the SMask does NOT leak: the magenta shape painted AFTER the gradient survives pure',
      magenta > 100,
      `${magenta} pure-magenta px (a leaked mask multiplies them to zero)`
    );
  }
}

// ===========================================================================
// Part D — gradient-filled TEXT: the glyphs clip the shading (7 Tr).
// ===========================================================================

console.log('--- pdf export: gradient text — glyphs clip the shading ---');

const gtext = await p.evaluate(async () => {
  // exportPdf is pure and shipped from the same bundle — the widget spec has no
  // gradient-text knob, so the probe drives the export surface directly.
  const { exportPdf } = await import('/shell/grafloria.js');
  const tree = {
    type: 'svg', props: {}, children: [
      { type: 'defs', props: {}, children: [
        { type: 'linearGradient',
          props: { id: 'tg', gradientUnits: 'userSpaceOnUse', x1: 0, y1: 0, x2: 340, y2: 0 },
          children: [
            { type: 'stop', props: { offset: 0, 'stop-color': '#ff0000' } },
            { type: 'stop', props: { offset: 1, 'stop-color': '#0000ff' } },
          ] },
      ] },
      { type: 'text', props: { x: 0, y: 90, fontSize: 100, fill: 'url(#tg)', textContent: 'MMMM' } },
    ],
  };
  const { pdf, warnings } = exportPdf(tree, {});
  let bin = '';
  for (const b of pdf) bin += String.fromCharCode(b);
  return { b64: btoa(bin), warnings };
});

const gtextBytes = Buffer.from(gtext.b64, 'base64');
const gtextContent = contentStreams(latin1(gtextBytes));

check('gradient text no longer flattens to its first stop', !gtext.warnings.some((w) => /first stop/.test(w)));
check(
  'the text is shown in CLIP mode then sh: BT … 7 Tr … Tj … ET … /ShN sh',
  /BT\n7 Tr\n[^]*?Tj\nET\n\/Sh\d+ sh/.test(gtextContent)
);

{
  const raster = rasterize(gtextBytes, 'gtext');
  if (!raster) {
    check('gradient-text probe rasterized', false, 'pdftoppm unavailable — PIXEL CHECKS DID NOT RUN');
  } else {
    let reddest = { score: -1, x: 0 };
    let bluest = { score: -1, x: 0 };
    let ink = 0;
    let black = 0;
    const total = raster.width * raster.height;
    for (let y = 0; y < raster.height; y++) {
      for (let x = 0; x < raster.width; x++) {
        const [r, g2, b2] = px(raster, x, y);
        const redScore = r - Math.max(g2, b2);
        const blueScore = b2 - Math.max(r, g2);
        if (redScore > reddest.score) reddest = { score: redScore, x };
        if (blueScore > bluest.score) bluest = { score: blueScore, x };
        if (r < 245 || g2 < 245 || b2 < 245) ink++;
        if (r < 40 && g2 < 40 && b2 < 40) black++;
      }
    }
    check(
      'glyph pixels differ left vs right: red glyphs LEFT of blue glyphs',
      reddest.score > 120 && bluest.score > 120 && reddest.x < bluest.x,
      `red ${reddest.score}@x=${reddest.x}, blue ${bluest.score}@x=${bluest.x}`
    );
    // A `7 Tr → 0 Tr` mutation leaves NO clip: the sh floods the whole content window
    // (~35% of the page) and the glyphs paint solid black underneath. Both tells:
    check(
      'the shading is CONFINED to the glyphs — the page stays mostly white',
      ink / total < 0.15,
      `${((ink / total) * 100).toFixed(1)}% ink`
    );
    check('no solid-black glyphs (clip mode paints nothing itself)', black < 20, `${black} black px`);
  }
}

// ===========================================================================
// Part E — exotic images: interlaced PNG, 16-bit PNG, CMYK + YCCK JPEG.
// ===========================================================================

console.log('--- pdf export: interlaced PNG, 16-bit PNG, CMYK/YCCK JPEG — pixel colours ---');

// Real Adobe CMYK fixtures (solid red 8×8). PIL: APP14 transform 0, inverted CMYK.
// ImageMagick: APP14 transform 2, YCCK. Both must come out RED — the inversion bug
// renders them CYAN, which is exactly what the pixel assert below is tuned to catch.
const PIL_CMYK_RED =
  '/9j/7gAOQWRvYmUAZAAAAAAA/9sAQwAQCwwODAoQDg0OEhEQExgoGhgWFhgxIyUdKDozPTw5Mzg3QEhcTkBEV0U3OFBtUVdfYmdoZz5NcXlwZHhcZWdj/8AAFAgACAAIBEMRAE0RAFkRAEsRAP/EAB8AAAEFAQEBAQEBAAAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+v/aAA4EQwBNAFkASwAAPwD0CvP68/r0Cv/Z';
const IM_YCCK_RED =
  '/9j/7gAOQWRvYmUAZAAAAAAC/9sAQwAQCwwODAoQDg0OEhEQExgoGhgWFhgxIyUdKDozPTw5Mzg3QEhcTkBEV0U3OFBtUVdfYmdoZz5NcXlwZHhcZWdj/9sAQwEREhIYFRgvGhovY0I4QmNjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2Nj/8AAFAgACAAIBAEiAAIRAQMRAQQiAP/EABYAAQEBAAAAAAAAAAAAAAAAAAAFB//EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAVAQEBAAAAAAAAAAAAAAAAAAAFBv/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAOBAEAAhEDEQQAAD8AtAFEG0AB/9k=';

const exotic = await p.evaluate(async ({ pilRed, imRed }) => {
  const { render } = await import('/shell/grafloria.js');

  // -- tiny in-page PNG writer: real CRCs (the browser <img> checks them), stored-block
  // zlib (valid everywhere), so the EXACT bytes below flow through capture into the PDF.
  const crcTable = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcTable[n] = c >>> 0;
  }
  const crc32 = (bytes) => {
    let c = 0xffffffff;
    for (const b of bytes) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const body = [...[...type].map((ch) => ch.charCodeAt(0)), ...data];
    const crc = crc32(body);
    const len = data.length;
    return [
      (len >>> 24) & 0xff, (len >>> 16) & 0xff, (len >>> 8) & 0xff, len & 0xff,
      ...body,
      (crc >>> 24) & 0xff, (crc >>> 16) & 0xff, (crc >>> 8) & 0xff, crc & 0xff,
    ];
  };
  const adler32 = (data) => {
    let a = 1, b = 0;
    for (const byte of data) { a = (a + byte) % 65521; b = (b + a) % 65521; }
    return (((b << 16) | a) >>> 0);
  };
  const zlibStored = (data) => {
    const out = [0x78, 0x01];
    for (let i = 0; i < Math.max(1, Math.ceil(data.length / 65535)); i++) {
      const part = data.slice(i * 65535, (i + 1) * 65535);
      const last = (i + 1) * 65535 >= data.length ? 1 : 0;
      out.push(last, part.length & 0xff, part.length >> 8, ~part.length & 0xff, (~part.length >> 8) & 0xff, ...part);
    }
    const ad = adler32(data);
    out.push((ad >>> 24) & 0xff, (ad >>> 16) & 0xff, (ad >>> 8) & 0xff, ad & 0xff);
    return out;
  };
  const png = (width, height, bitDepth, colorType, scanlines, interlace = 0) => {
    const ihdr = [
      (width >>> 24) & 0xff, (width >>> 16) & 0xff, (width >>> 8) & 0xff, width & 0xff,
      (height >>> 24) & 0xff, (height >>> 16) & 0xff, (height >>> 8) & 0xff, height & 0xff,
      bitDepth, colorType, 0, 0, interlace,
    ];
    const bytes = [
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ...chunk('IHDR', ihdr),
      ...chunk('IDAT', zlibStored(scanlines)),
      ...chunk('IEND', []),
    ];
    return `data:image/png;base64,${btoa(String.fromCharCode(...new Uint8Array(bytes)))}`;
  };

  // Interlaced 16×16 RGB: LEFT half green, RIGHT half blue — written as Adam7 passes.
  // A swapped pass offset scatters green into the blue half and vice versa.
  const ADAM7 = [
    [0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2],
  ];
  const laceLines = [];
  for (const [x0, y0, dx, dy] of ADAM7) {
    const pw = Math.ceil((16 - x0) / dx);
    const ph = Math.ceil((16 - y0) / dy);
    if (!pw || !ph) continue;
    for (let j = 0; j < ph; j++) {
      laceLines.push(0); // filter None
      for (let i = 0; i < pw; i++) {
        const x = x0 + i * dx;
        laceLines.push(0, x < 8 ? 255 : 0, x < 8 ? 0 : 255); // green left, blue right
      }
    }
  }
  const laceUrl = png(16, 16, 8, 2, laceLines, 1);

  // 16-bit RGB solid orange: samples FF11 8022 0033 — high bytes (255,128,0); a
  // low-byte mutation renders (17,34,51), a nearly-black nothing.
  const deepLines = [];
  for (let y = 0; y < 16; y++) {
    deepLines.push(0);
    for (let x = 0; x < 16; x++) deepLines.push(0xff, 0x11, 0x80, 0x22, 0x00, 0x33);
  }
  const deepUrl = png(16, 16, 16, 2, deepLines, 0);

  const sources = {
    'a-lace': laceUrl,
    'b-deep': deepUrl,
    'c-cmyk': `data:image/jpeg;base64,${pilRed}`,
    'd-ycck': `data:image/jpeg;base64,${imRed}`,
  };

  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:0;top:0;width:900px;height:520px;background:#fff;z-index:99';
  document.body.appendChild(host);

  const spec = {
    nodes: Object.keys(sources).map((id, index) => ({
      id, custom: true,
      position: { x: 40 + index * 180, y: 40 },
      size: { width: 120, height: 120 },
    })),
    edges: [],
  };

  const api = render(spec, host, {
    renderCustomNode: (node, el) => {
      const img = document.createElement('img');
      img.src = sources[node.id];
      img.width = 120;
      img.height = 120;
      el.appendChild(img);
      return img.decode();
    },
  });
  api.renderNow();

  const warnings = [];
  const href = await api.export('pdf', { onWarnings: (w) => warnings.push(...[].concat(w)) });
  api.destroy?.();
  host.remove();
  return { href, warnings };
}, { pilRed: PIL_CMYK_RED, imRed: IM_YCCK_RED });

const exoticBytes = Buffer.from(exotic.href.split(',')[1], 'base64');
const exoticBody = latin1(exoticBytes);

check(
  'NO refusal warnings: interlaced, 16-bit and CMYK all embed now',
  !exotic.warnings.some((w) => /interlaced|16-bit|CMYK|omitted/.test(w)),
  exotic.warnings.join(' | ').slice(0, 200) || 'clean'
);
check(
  'the CMYK JPEGs embed as /DeviceCMYK DCTDecode with the Adobe /Decode inversion',
  /\/ColorSpace \/DeviceCMYK[^>]*\/Decode \[1 0 1 0 1 0 1 0\]/.test(exoticBody) ||
    (exoticBody.includes('/DeviceCMYK') && exoticBody.includes('/Decode [1 0 1 0 1 0 1 0]'))
);

{
  const raster = rasterize(exoticBytes, 'exotic');
  if (!raster) {
    check('exotic-image probe rasterized', false, 'pdftoppm unavailable — PIXEL CHECKS DID NOT RUN');
  } else {
    let green = { count: 0, maxX: -Infinity };
    let blue = { count: 0, minX: Infinity };
    let orange = 0;
    let red = 0;
    let cyan = 0;
    for (let y = 0; y < raster.height; y++) {
      for (let x = 0; x < raster.width; x++) {
        const [r, g2, b2] = px(raster, x, y);
        if (g2 > 150 && r < 100 && b2 < 100) { green.count++; green.maxX = Math.max(green.maxX, x); }
        if (b2 > 150 && r < 100 && g2 < 100) { blue.count++; blue.minX = Math.min(blue.minX, x); }
        if (r > 200 && g2 > 90 && g2 < 170 && b2 < 80) orange++;
        if (r > 150 && g2 < 90 && b2 < 90) red++;
        if (r < 90 && g2 > 150 && b2 > 150) cyan++;
      }
    }
    check(
      'interlaced PNG: green half LEFT of blue half (a swapped Adam7 pass scrambles them together)',
      green.count > 50 && blue.count > 50 && green.maxX <= blue.minX + 4,
      `green ${green.count}px maxX=${green.maxX}, blue ${blue.count}px minX=${blue.minX}`
    );
    check('16-bit PNG: the HIGH bytes paint — solid orange on paper', orange > 50, `${orange} orange px`);
    check('CMYK JPEGs: red stays RED (both Adobe transform 0 and YCCK)', red > 100, `${red} red px`);
    check(
      'the inversion canary: essentially no CYAN (a dropped /Decode flips red to cyan)',
      cyan < 10,
      `${cyan} cyan px`
    );
  }
}

check('no page errors', pageErrors.length === 0, pageErrors.join(' | ').slice(0, 200));

await b.close();
server.close();

const passed = checks.filter(Boolean).length;
console.log(`\npdf export gate: ${passed}/${checks.length}`);
process.exit(passed === checks.length ? 0 : 1);
