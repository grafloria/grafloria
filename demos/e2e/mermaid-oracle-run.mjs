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
 * WHY IT BUILDS ITS OWN BUNDLE: the oracle gates the SOURCE, not the last
 * `demos/build.mjs` run. It bundles libs/element into a temp file and serves it
 * for `shell/grafloria.js` — the same route-interception trick used for mermaid
 * itself. That also keeps a validation run from rewriting the shared demo
 * bundle (other lanes are live on this tree and the demo server serves it).
 *
 * Run: node demos/e2e/mermaid-oracle-run.mjs   (needs the demo server on :4321)
 */
import { chromium } from 'playwright';
import { build } from 'esbuild';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import { tmpdir } from 'os';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const MERMAID_UMD = resolve(REPO, 'node_modules/mermaid/dist/mermaid.min.js');
const OUT = process.env.ORACLE_OUT || '/tmp/mermaid-oracle.png';
const BUNDLE = join(tmpdir(), 'mermaid-oracle-grafloria.js');

// Real hand-written Mermaid a visitor might paste. Grouped by diagram type so a
// failure names the family it belongs to.
const CASES = {
  // ── flowchart: base + the Tier-1 styling channel (Phases 1–2) ────────────
  'flow base': 'flowchart TD\n  a-->b-->c',
  'flow shapes + decision':
    'flowchart TD\n  Start([Start])-->Check{OK?}\n  Check-->|yes|Done[[Save]]\n  Check-->|no|Start',
  'flow multi-edge': 'flowchart LR\n  a & b --> c & d',
  'flow styling':
    'flowchart TD\n  a[Hot]-->b[Cold]\n  style a fill:#f9a,stroke:#900,stroke-width:2\n  classDef cool fill:#9cf,stroke:#036\n  class b cool',
  'flow inline class + link':
    'flowchart LR\n  a:::hot-->b\n  classDef hot fill:#fa0\n  click a "https://example.com"',

  // ── erDiagram (Phase 3) ─────────────────────────────────────────────────
  'er minimal': 'erDiagram\n    CUSTOMER ||--o{ ORDER : places',
  'er attributes':
    'erDiagram\n' +
    '    CUSTOMER ||--o{ ORDER : places\n' +
    '    CUSTOMER {\n' +
    '        string name\n' +
    '        string custNumber PK\n' +
    '        string sector "which market"\n' +
    '    }\n' +
    '    ORDER {\n' +
    '        int orderId PK\n' +
    '        string custNumber FK\n' +
    '    }',
  // NB: the labels are quoted on purpose — Mermaid's ER lexer reads `one` /
  // `many` as CARDINALITY KEYWORDS even in label position, so `: one` is a
  // parse error in real Mermaid. (Found by this oracle; our generator now
  // quotes unconditionally for the same reason.)
  'er all cardinalities':
    'erDiagram\n' +
    '    A ||--|| B : "exactly one"\n' +
    '    C |o--o| D : "zero or one"\n' +
    '    E }o--o{ F : "zero or more"\n' +
    '    G }|--|{ H : "one or more"',
  'er non-identifying':
    'erDiagram\n' +
    '    PERSON }|..|{ NAMED_DRIVER : "is"\n' +
    '    PERSON {\n' +
    '        string driversLicence PK "The license #"\n' +
    '        string firstName\n' +
    '    }',
  'er glued + quoted label':
    'erDiagram\n    CUSTOMER||--o{ORDER : "places an order"',

  // ── classDiagram (Phase 3) ──────────────────────────────────────────────
  'class minimal': 'classDiagram\n    Animal <|-- Duck',
  'class members':
    'classDiagram\n' +
    '    Animal : +int age\n' +
    '    Animal : +isMammal()\n' +
    '    class Duck {\n' +
    '        +String beakColor\n' +
    '        +swim()\n' +
    '        +quack() void\n' +
    '    }\n' +
    '    Animal <|-- Duck',
  'class annotations':
    'classDiagram\n' +
    '    class Shape {\n' +
    '        <<interface>>\n' +
    '        noOfVertices\n' +
    '        draw()\n' +
    '    }\n' +
    '    Shape <|.. Circle',
  'class all relations':
    'classDiagram\n' +
    '    ClassA <|-- ClassB\n' +
    '    ClassC *-- ClassD\n' +
    '    ClassE o-- ClassF\n' +
    '    ClassG <-- ClassH\n' +
    '    ClassI <.. ClassJ\n' +
    '    ClassK <|.. ClassL\n' +
    '    ClassM -- ClassN',
  'class multiplicity + label':
    'classDiagram\n    Vehicle "1" *-- "1..*" Wheel : has\n    Client ..> Service : uses',

  // ── stateDiagram-v2 (Phase 3) ───────────────────────────────────────────
  'state minimal': 'stateDiagram-v2\n    [*] --> Still\n    Still --> [*]',
  'state labels':
    'stateDiagram-v2\n' +
    '    [*] --> Idle\n' +
    '    Idle --> Running : start\n' +
    '    Running --> Idle : stop\n' +
    '    Running --> [*]',
  'state descriptions + fork':
    'stateDiagram-v2\n' +
    '    state "A long description" as s2\n' +
    '    [*] --> s2\n' +
    '    state fork_state <<fork>>\n' +
    '    s2 --> fork_state',
  'state composite':
    'stateDiagram-v2\n' +
    '    [*] --> First\n' +
    '    state First {\n' +
    '        [*] --> second\n' +
    '        second --> third\n' +
    '    }\n' +
    '    First --> [*]',
};

// Bundle the public entry point (same alias map as demos/build.mjs).
await build({
  entryPoints: [join(REPO, 'libs/element/src/index.ts')],
  bundle: true,
  format: 'esm',
  outfile: BUNDLE,
  platform: 'browser',
  target: 'es2020',
  alias: {
    '@grafloria/engine': join(REPO, 'libs/engine/src/index.ts'),
    '@grafloria/renderer': join(REPO, 'libs/renderer/src/index.ts'),
    'fs/promises': join(REPO, 'libs/renderer/e2e/node-stubs.ts'),
    path: join(REPO, 'libs/renderer/e2e/node-stubs.ts'),
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

const b = await chromium.launch({ args: ['--disable-blink-features=AutomationControlled'] });
const p = await b.newPage({ viewport: { width: 1400, height: 520 } });
await p.route('**/mermaid.min.js', (route) => route.fulfill({ path: MERMAID_UMD }));
await p.route('**/shell/grafloria.js', (route) =>
  route.fulfill({ path: BUNDLE, contentType: 'text/javascript' })
);
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
    `  ${ok ? 'OK  ' : 'FAIL'} ${name.padEnd(26)} ` +
    `grafloria=[${grafloria.nodes.length}n/${grafloria.links.length}l] mermaid(orig)=${original.valid ? 'valid' : 'INVALID:' + original.error} ` +
    `mermaid(export)=${exported.valid ? 'valid' : 'INVALID:' + exported.error}`
  );
  if (!ok) console.log('       exported body was:\n' + body.split('\n').map((l) => '       | ' + l).join('\n'));
}

console.log('\n--- VISUAL PARITY: the styling case, Grafloria vs Mermaid, side by side ---');
await p.evaluate((t) => window.oracle.grafloriaRender(t), CASES['flow styling']);
await p.evaluate((t) => window.oracle.mermaidRender(t), CASES['flow styling']);
await p.waitForTimeout(400);
await p.screenshot({ path: OUT });
console.log('  wrote ' + OUT);

if (pageErrors.length) { console.log('\nPAGE ERRORS:', pageErrors.join(' | ')); fail++; }
console.log(`\nmermaid-oracle: ${fail === 0 ? 'ALL VALID' : fail + ' FAILURE(S)'}`);
await b.close();
process.exit(fail === 0 ? 0 : 1);
