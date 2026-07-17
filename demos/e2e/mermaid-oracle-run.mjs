/**
 * Mermaid oracle — validates Grafloria's Mermaid compatibility against REAL Mermaid.
 *
 * Two things, both using mermaid v11 (already a dependency, served from
 * node_modules via route interception — never vendored):
 *   1. VALIDITY GATE: the body Grafloria EXPORTS must parse as valid Mermaid. This
 *      is the "visible body stays valid Mermaid" invariant (gap-analysis §5).
 *      Also: everything Grafloria claims to read, real Mermaid accepts too.
 *   2. VISUAL PARITY: render the same styled flowchart in Grafloria and Mermaid
 *      side by side → PNG for eyeballing.
 *
 * Run: node demos/e2e/mermaid-oracle-run.mjs   (needs the demo server on :4321)
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const HERE = dirname(fileURLToPath(import.meta.url));
const MERMAID_UMD = resolve(HERE, '../../node_modules/mermaid/dist/mermaid.min.js');
const OUT = process.env.ORACLE_OUT || '/tmp/mermaid-oracle.png';

// Real hand-written Mermaid a visitor might paste — base + Tier-1 styling.
const CASES = {
  'base flowchart': 'flowchart TD\n  a-->b-->c',
  'shapes + decision': 'flowchart TD\n  Start([Start])-->Check{OK?}\n  Check-->|yes|Done[[Save]]\n  Check-->|no|Start',
  'multi-edge': 'flowchart LR\n  a & b --> c & d',
  'styling': 'flowchart TD\n  a[Hot]-->b[Cold]\n  style a fill:#f9a,stroke:#900,stroke-width:2\n  classDef cool fill:#9cf,stroke:#036\n  class b cool',
  'inline class + link': 'flowchart LR\n  a:::hot-->b\n  classDef hot fill:#fa0\n  click a "https://example.com"',
};

const b = await chromium.launch({ args: ['--disable-blink-features=AutomationControlled'] });
const p = await b.newPage({ viewport: { width: 1400, height: 520 } });
await p.route('**/mermaid.min.js', (route) => route.fulfill({ path: MERMAID_UMD }));
const pageErrors = [];
p.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 160)));
await p.goto('http://127.0.0.1:4321/e2e/mermaid-oracle.html');
await p.waitForFunction(() => window.__oracleReady === true, { timeout: 20000 });

let fail = 0;
console.log('--- VALIDITY: real Mermaid accepts what Grafloria reads AND what Grafloria exports ---');
for (const [name, text] of Object.entries(CASES)) {
  const original = await p.evaluate((t) => window.oracle.mermaidParse(t), text);
  const body = await p.evaluate((t) => window.oracle.grafloriaExportBody(t), text);
  const exported = await p.evaluate((t) => window.oracle.mermaidParse(t), body);
  const grafloria = await p.evaluate((t) => window.oracle.grafloriaRender(t), text);
  // Grafloria must read it (nodes present), and BOTH the original and Grafloria's
  // exported body must be valid Mermaid.
  const readOk = grafloria.nodes.length > 0;
  const ok = original.valid && exported.valid && readOk;
  if (!ok) fail++;
  console.log(
    `  ${ok ? 'OK  ' : 'FAIL'} ${name.padEnd(22)} ` +
    `grafloria=[${grafloria.nodes.length}n/${grafloria.links.length}l] mermaid(orig)=${original.valid ? 'valid' : 'INVALID:' + original.error} ` +
    `mermaid(export)=${exported.valid ? 'valid' : 'INVALID:' + exported.error}`
  );
}

console.log('\n--- VISUAL PARITY: the styling case, Grafloria vs Mermaid, side by side ---');
await p.evaluate((t) => window.oracle.grafloriaRender(t), CASES['styling']);
await p.evaluate((t) => window.oracle.mermaidRender(t), CASES['styling']);
await p.waitForTimeout(400);
await p.screenshot({ path: OUT });
console.log('  wrote ' + OUT);

if (pageErrors.length) { console.log('\nPAGE ERRORS:', pageErrors.join(' | ')); fail++; }
console.log(`\nmermaid-oracle: ${fail === 0 ? 'ALL VALID' : fail + ' FAILURE(S)'}`);
await b.close();
process.exit(fail === 0 ? 0 : 1);
