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

check('no page errors', pageErrors.length === 0, pageErrors.join(' | ').slice(0, 200));

await b.close();
server.close();

const passed = checks.filter(Boolean).length;
console.log(`\npdf export gate: ${passed}/${checks.length}`);
process.exit(passed === checks.length ? 0 : 1);
