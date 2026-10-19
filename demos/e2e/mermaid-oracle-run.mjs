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
 * Run: node demos/e2e/mermaid-oracle-run.mjs
 *
 * It serves `demos/` itself on an ephemeral port, so it needs nothing running
 * first. It used to require a hand-started server on :4321, which is exactly
 * why it sat outside CI while the site claimed it ran there.
 */
import { chromium } from 'playwright';
import { build } from 'esbuild';
import { createServer } from 'http';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, extname, join, resolve } from 'path';
import { tmpdir } from 'os';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const MERMAID_UMD = resolve(REPO, 'node_modules/mermaid/dist/mermaid.min.js');
const OUT = process.env.ORACLE_OUT || '/tmp/mermaid-oracle.png';
const BUNDLE = join(tmpdir(), 'mermaid-oracle-grafloria.js');

// Real hand-written Mermaid a visitor might paste. Grouped by diagram type so a
// failure names the family it belongs to.
/** A demo's Mermaid source, read from the page itself so the gate and the demo cannot drift. */
const demoSource = (page, id) => new RegExp(`<script type="text/plain" id="${id}">([\\s\\S]*?)</script>`).exec(readFileSync(join(HERE, '..', page), 'utf8'))[1].trim();

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

  // ── flowchart: the other label spelling, thick arrows, the slash shapes ──
  'flow inline labels': 'flowchart LR\n  a -- writes --> b\n  b -- "twice, quoted" --> c\n  c -. note .-> d\n  d == big ==> e\n  e ==> f',
  'flow slash shapes': 'flowchart LR\n  a[/Wide bottom\\] --> b[\\Wide top/] --> c[/In or out/] --> d[\\Lean left\\] --> e[(DB)]',

  // ── flowchart: valid Mermaid found in real pages that we used to REFUSE ──
  // (Atloria brief 2026-10-19, P1-6). Only lowercase `end` is reserved; `'` and a
  // `/` before `]` are label text; YAML frontmatter is read and its title kept.
  'flow End node id': 'flowchart LR\n  Handler --> End[Timing middleware records elapsed time]',
  'flow apostrophe': "flowchart LR\n  D --> E[418 I'm a Teapot Response]",
  'flow slash before ]': 'flowchart LR\n  D --> E[Join segments with /]',
  'flow frontmatter title': '---\ntitle: Order flow\n---\nflowchart LR\n  A --> B',

  // ── accTitle / accDescr: diagram metadata in every type, never a node (P0-5b)
  'flow acc metadata': 'flowchart LR\n  accTitle: Orders\n  accDescr {\n    From order\n    to invoice\n  }\n  A --> B',
  'state acc metadata': 'stateDiagram-v2\n  accTitle: Lifecycle\n  accDescr: How an invoice moves\n  [*] --> A\n  A --> [*]',

  // ── text in angle brackets is TEXT unless it is a label tag (P0-5c) ──────
  'flow angle brackets':
    'flowchart LR\n  A[Request] --> B["params: Record<string, string>"]\n  B --> C[Context&lt;T&gt;]\n  C --> D["a < b > c"]',

  // ── edge ends: circle, cross, both, none — and the flag shape (P1-10) ───
  'flow edge ends + flag': 'flowchart LR\n A --o B\n B --x C\n C <--> D\n D --- E\n E --> F>Flag]',
  'flow edge end variants':
    'flowchart LR\n  A -.- B\n  B === C\n  C o--o D\n  D x--x E\n  E <-.-> F\n  F <==> G\n  G -.-o H\n  H ==x I\n  I ---|plain| J\n  J --o|ball| K\n  K <-- both --> L',

  // ── architecture-beta: groups, services, junctions, sided edges ─────────
  'architecture docs':
    'architecture-beta\n    group api(cloud)[API]\n\n    service db(database)[Database] in api\n    service disk1(disk)[Storage] in api\n    service disk2(disk)[Storage] in api\n    service server(server)[Server] in api\n\n    db:L -- R:server\n    disk1:T -- B:server\n    disk2:T -- B:db',
  'architecture arrows+labels':
    'architecture-beta\n  service internet(internet)[Internet]\n  group cloud(cloud)[Cloud]\n  service web(server)[Web app] in cloud\n  group data(database)[Data tier] in cloud\n  service db(database)[Postgres] in data\n  junction j in cloud\n  internet:R --> L:web\n  web:B -[writes]- T:j\n  j:B <--> T:db\n  web{group}:R --> L:db{group}',

  // ── block-beta: the grid ────────────────────────────────────────────────
  'block docs':
    'block-beta\ncolumns 3\ndoc>"Document"]:3\nspace down1<[" "]>(down) space\n\nblock:e:3\n       l["left"]\n       m("A wide one in the middle")\n       r["right"]\nend\nspace down2<[" "]>(down) space\ndb[("DB")]:3\nspace:3\nD space C\ndb --> D\nC --> db\nD --> C\nstyle m fill:#d6d,stroke:#333,stroke-width:4px',
  'block spans+nested+labels':
    'block-beta\n  columns 3\n  a["Frontend"] b["API"] c[("Database")]\n  d["Cache layer"]:2 e["Queue"]\n  block:grp:3\n    columns 2\n    x y\n  end\n  a --> b\n  b -- "writes" --> c\n  d -.-> e\n  classDef hot fill:#fca\n  class e hot',
  // labelled nested blocks, as the 3-tier demo writes them
  'block labelled layers (3-tier demo)': demoSource('diagrams/mermaid-architecture-block.html', 'src-tiers'),

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
  // LOLLIPOP / ball-and-socket. Valid Mermaid that we did not parse AT ALL —
  // the line matched no rule, so it was skipped and both classes vanished with
  // it: an empty diagram, no error. Mermaid's own `addRelation` makes the
  // operand beside the `()` the INTERFACE and the far one the implementing
  // class, so we read it as the kit's `realization` (class → interface).
  'class lollipop':
    'classDiagram\n' +
    '    bar ()-- foo\n' +
    '    baz --() qux\n' +
    '    class foo {\n' +
    '        +run() void\n' +
    '    }',
  'class lollipop dotted + multiplicity':
    'classDiagram\n    bar ().. foo\n    Svc "1" --() "*" Client : provides',
  // MIXED operators — a marker at each end. Same silent-drop failure.
  'class mixed operators':
    'classDiagram\n    A <|--* B\n    C o--|> D\n    E *--o F\n    G ()--|> H\n    I <..> J',
  // Mermaid composes `relationType? lineType relationType?`, so there are 72
  // legal operators and every one must survive BOTH directions. This case is
  // the gate that stops the operator table drifting back into a hand-written
  // subset — the exact bug that hid the lollipop family.
  'class ALL 72 operators': (() => {
    const LEFT = ['', '<|', '*', 'o', '<', '()'];
    const RIGHT = ['', '|>', '*', 'o', '>', '()'];
    const lines = ['classDiagram'];
    let n = 0;
    for (const l of LEFT) for (const li of ['--', '..']) for (const r of RIGHT) {
      lines.push(`    A${n} ${l}${li}${r} B${n}`);
      n++;
    }
    return lines.join('\n');
  })(),

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
  // CONCURRENCY. The `--` separator was ignored, so the two regions merged into
  // one composite and — because `[*]` is scoped to its body — both regions'
  // entry points fused into a single start node. A wrong reading of a
  // concurrent machine, not a lossy one. Each region is now its own body, and
  // the separator goes back into the exported text.
  'state concurrency':
    'stateDiagram-v2\n' +
    '    [*] --> Active\n' +
    '    state Active {\n' +
    '        [*] --> NumLockOff\n' +
    '        NumLockOff --> NumLockOn : EvNumLockPressed\n' +
    '        NumLockOn --> NumLockOff : EvNumLockPressed\n' +
    '        --\n' +
    '        [*] --> CapsLockOff\n' +
    '        CapsLockOff --> CapsLockOn : EvCapsLockPressed\n' +
    '        CapsLockOn --> CapsLockOff : EvCapsLockPressed\n' +
    '    }',
  'state concurrency 3 regions + direction':
    'stateDiagram-v2\n' +
    '    state Machine {\n' +
    '        direction LR\n' +
    '        [*] --> a1\n' +
    '        --\n' +
    '        [*] --> b1\n' +
    '        b1 --> b2 : tick\n' +
    '        --\n' +
    '        [*] --> c1\n' +
    '    }',
  // A composite nested inside one region: the region pre-scan has to count
  // braces, or the inner `--` would make the OUTER state concurrent.
  'state concurrency + nested composite':
    'stateDiagram-v2\n' +
    '    state Outer {\n' +
    '        [*] --> x\n' +
    '        --\n' +
    '        state Inner {\n' +
    '            [*] --> y\n' +
    '            --\n' +
    '            [*] --> z\n' +
    '        }\n' +
    '    }',
  // `state "…" as X {` is valid Mermaid that matched NO rule: the composite was
  // lost, its children leaked to the enclosing scope, and the stray `}` popped
  // a scope that was never pushed.
  'state described composite':
    'stateDiagram-v2\n' +
    '    state "the long name" as A {\n' +
    '        [*] --> b\n' +
    '        b --> [H]\n' +
    '    }\n' +
    '    A --> [*]',
  // `A:::hot` is Mermaid's inline style hook. The description rule ate it, so
  // the state came out LABELLED `::hot` and export wrote `[*] --> A : ::hot` —
  // a transition label nobody typed. The hook is now captured by name (styling
  // itself is still not applied) and never mistaken for a label.
  'state inline css hook':
    'stateDiagram-v2\n' +
    '    [*] --> Active:::hot\n' +
    '    Active --> Idle:::cool : timeout\n' +
    '    classDef hot fill:#f9a\n' +
    '    classDef cool fill:#9cf',
};

// What a case must READ, beyond "it read": a validity pass alone cannot see an
// `accTitle` drawn as a state or a label with its `<T>` cut off. Each check gets
// Grafloria's summary and returns what is wrong, or null.
const EXPECT = {
  'flow End node id': (g) => g.labels.End === 'Timing middleware records elapsed time' ? null : `End reads ${JSON.stringify(g.labels.End)}`,
  'flow apostrophe': (g) => g.labels.E === "418 I'm a Teapot Response" ? null : `E reads ${JSON.stringify(g.labels.E)}`,
  'flow slash before ]': (g) => g.labels.E === 'Join segments with /' ? null : `E reads ${JSON.stringify(g.labels.E)}`,
  'flow frontmatter title': (g) => g.meta.title === 'Order flow' ? null : `title is ${JSON.stringify(g.meta.title)}`,
  'flow acc metadata': (g) =>
    g.meta.accTitle === 'Orders' && g.meta.accDescr === 'From order\nto invoice' && g.nodes.join() === 'A,B'
      ? null : `meta ${JSON.stringify(g.meta)} nodes ${g.nodes}`,
  'state acc metadata': (g) =>
    g.meta.accTitle === 'Lifecycle' && g.meta.accDescr === 'How an invoice moves' && !Object.values(g.labels).includes('Lifecycle')
      ? null : `meta ${JSON.stringify(g.meta)} labels ${JSON.stringify(g.labels)}`,
  'flow angle brackets': (g) =>
    g.labels.B === 'params: Record<string, string>' && g.labels.C === 'Context<T>' && g.labels.D === 'a < b > c'
      ? null : `labels ${JSON.stringify(g.labels)}`,
  'flow edge ends + flag': (g) => {
    const want = { 'A->B': 'none/circle', 'B->C': 'none/cross', 'C->D': 'arrow/arrow', 'D->E': 'none/none', 'E->F': 'none/arrow' };
    const bad = Object.entries(want).filter(([k, v]) => g.ends[k] !== v);
    if (g.shapes.F !== 'asymmetric') bad.push(['F shape', g.shapes.F]);
    return bad.length ? `ends ${JSON.stringify(g.ends)} shape F=${g.shapes.F}` : null;
  },
  'flow edge end variants': (g) => {
    const want = {
      'A->B': 'none/none', 'B->C': 'none/none', 'C->D': 'circle/circle', 'D->E': 'cross/cross', 'E->F': 'arrow/arrow',
      'F->G': 'arrow/arrow', 'G->H': 'none/circle', 'H->I': 'none/cross', 'I->J': 'none/none', 'J->K': 'none/circle', 'K->L': 'arrow/arrow',
    };
    return Object.entries(want).every(([k, v]) => g.ends[k] === v) ? null : `ends ${JSON.stringify(g.ends)}`;
  },
};

// Mermaid ACCEPTS these — and draws something the author did not write — so
// Grafloria refuses them on purpose, with an error naming each line (P0-5a). A
// state id cannot contain spaces: Mermaid reads `Release for Approval` as three
// states. This is the real corpus fence `invoice-lifecycle#1`.
const REFUSED = {
  'state ids with spaces (invoice-lifecycle#1)': {
    text:
      'stateDiagram-v2\n' +
      '    Draft --> Release for Approval: Request approval\n' +
      '    Release for Approval --> Approved: Approve\n' +
      '    Approved --> Due: Consider as sent to client/principal\n' +
      '    Due --> Overdue: payment period overdue\n' +
      '    Due --> Paid: due amount ≤ 0\n' +
      '    Approved --> Draft: Consider as not approved\n',
    lines: [2, 3],
  },
  'state ids with spaces only': {
    text: 'stateDiagram-v2\n    Draft --> Release for Approval\n    Release for Approval --> Sent to Client: Send\n',
    lines: [2, 3],
  },
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

// Serve demos/ on an ephemeral port — same pattern as gallery-run, so the gate
// is self-contained and can run in CI unattended.
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};
const docRoot = resolve(HERE, '..');
const server = createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  try {
    const file = join(docRoot, url === '/' ? 'index.html' : url);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
  } catch {
    res.writeHead(404).end('not found');
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;

const b = await chromium.launch({ args: ['--disable-blink-features=AutomationControlled'] });
const p = await b.newPage({ viewport: { width: 1400, height: 520 } });
await p.route('**/mermaid.min.js', (route) => route.fulfill({ path: MERMAID_UMD }));
await p.route('**/shell/grafloria.js', (route) =>
  route.fulfill({ path: BUNDLE, contentType: 'text/javascript' })
);
const pageErrors = [];
p.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 160)));
await p.goto(`${ORIGIN}/e2e/mermaid-oracle.html`);
await p.waitForFunction(() => window.__oracleReady === true, { timeout: 20000 });

let fail = 0;
console.log('--- VALIDITY: real Mermaid accepts what Grafloria reads AND what Grafloria exports ---');
for (const [name, text] of Object.entries(CASES)) {
  const original = await p.evaluate((t) => window.oracle.mermaidParse(t), text);
  const body = await p.evaluate((t) => window.oracle.grafloriaExportBody(t), text);
  const exported = await p.evaluate((t) => window.oracle.mermaidParse(t), body);
  const grafloria = await p.evaluate((t) => window.oracle.grafloriaRender(t), text);
  // Grafloria must read it (nodes present, no line skipped), BOTH the original and
  // Grafloria's exported body must be valid Mermaid, and what it read must be
  // what the case expects.
  const readOk = grafloria.nodes.length > 0 && grafloria.errors.length === 0;
  const expectFail = EXPECT[name]?.(grafloria) ?? null;
  const ok = original.valid && exported.valid && readOk && !expectFail;
  if (!ok) fail++;
  console.log(
    `  ${ok ? 'OK  ' : 'FAIL'} ${name.padEnd(26)} ` +
    `grafloria=[${grafloria.nodes.length}n/${grafloria.links.length}l] mermaid(orig)=${original.valid ? 'valid' : 'INVALID:' + original.error} ` +
    `mermaid(export)=${exported.valid ? 'valid' : 'INVALID:' + exported.error}` +
    (grafloria.errors.length ? ` grafloria errors: ${grafloria.errors.join(' | ')}` : '') +
    (expectFail ? ` EXPECTED: ${expectFail}` : '')
  );
  if (!ok) console.log('       exported body was:\n' + body.split('\n').map((l) => '       | ' + l).join('\n'));
}

console.log('\n--- REFUSED ON PURPOSE: Mermaid draws garbage, Grafloria names the lines ---');
for (const [name, { text, lines }] of Object.entries(REFUSED)) {
  const mermaid = await p.evaluate((t) => window.oracle.mermaidParse(t), text);
  const grafloria = await p.evaluate((t) => window.oracle.grafloriaRender(t), text);
  const named = grafloria.errors.map((e) => Number(/^Line (\d+):/.exec(e)?.[1]));
  const ok = named.join() === lines.join();
  if (!ok) fail++;
  console.log(
    `  ${ok ? 'OK  ' : 'FAIL'} ${name.padEnd(26)} errors on lines [${named}] (want [${lines}]) ` +
    `mermaid=${mermaid.valid ? 'accepts' : 'refuses'}`
  );
  if (!ok) console.log('       errors were: ' + grafloria.errors.join(' | '));
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
server.close();
process.exit(fail === 0 ? 0 : 1);
