# Mermaid Compatibility — Gap Analysis & Plan (empirical)

**Date:** 2026-07-17
**Status:** Phases 0 ✅ (5db5b4a88), 1 ✅ (9528b1a57), 2 ✅ (0adc2f4a3) are
DONE — the parser reads real hand-written flowcharts, fails safe on everything
else, and the extension channel (styling + `%%grafloria:`) is live and validated
against real Mermaid (demos/e2e/mermaid-oracle-run.mjs). The §2/§3 matrices below record the pre-Phase-1 state (what was
broken); `mermaid-compat.spec.ts` is the living green version. Phases 2–4 remain.
**Method:** every current-state claim below was produced by feeding real Mermaid
syntax to `importDiagramText()` against the built engine and recording what
actually came back — node/link counts, throws, and garbage nodes. This
supersedes the aspirational figures in the older `GAP-ANALYSIS.md` (which claimed
"~17% coverage, 4 of 23 types"); the empirical reality is narrower, because even
the "implemented" types do not survive canonical input.

---

## 0. Decision (the strategy this plan implements)

- **Own parser.** We keep a hand-rolled parser in the engine. We do **not** adopt
  Mermaid's runtime parser as a dependency (control, no heavy browser-oriented
  dep, freedom to extend).
- **Mermaid syntax as the base.** We speak Mermaid because it is a known,
  widely-used standard — no reason to invent a private DSL.
- **Extend, don't fork.** Grafloria-only features are added *on top* of Mermaid, via
  Mermaid's own extension points where an analog exists, and via `%%grafloria:`
  comment directives where it does not.
- **The governing rule:** *the visible body must always stay valid, renderable
  Mermaid.* The whole point of adopting Mermaid is that the text renders in any
  Mermaid tool (GitHub, docs, mermaid.live). Extensions therefore use Mermaid's
  grammar or hide in `%%` comments — **never invented visible tokens.**

Note: `mermaid` v11 (MIT) and `@mermaid-js/parser` are already in `node_modules`
but imported nowhere. We are not shipping them. They may still be useful as a
**test-only oracle** (§6, Phase 2) to prove our exported bodies parse as valid
Mermaid — that uses the package to *check* compatibility, not to provide it.

---

## 1. The one-sentence finding (why this work exists)

**The parser reliably reads only what our own generator writes.** Our exporter
emits a narrow, spaced, shape-annotated subset (`a[A] --> b[B]`), and the parser
reads exactly that subset back. The lossless round-trip in the `mermaid-text`
demo works because the generator and parser are a matched pair on that subset
**and the sidecar carries everything else** — not because we understand Mermaid.
Point real-world hand-written Mermaid at it and it breaks.

This is why "edit both ways" already works for Grafloria's own diagrams (sidecar +
matched subset) but "any Mermaid syntax" does not. Closing that gap is Phase 1.

---

## 2. Current state — flowchart (our one real diagram type)

Even the flowchart family has core holes. `a --> b` with spaces works; the same
graph a human would actually type does not.

| Feature | Canonical input | Result | Severity |
|---|---|---|---|
| Bare edge, spaced | `a --> b` | ✅ OK | — |
| **Bare edge, glued** | `a-->b` | ❌ **THROW** | **High** — valid Mermaid; humans type this |
| Node shapes: rounded, circle, cylinder, rhombus, hexagon, asymmetric | `a(A)`, `a((A))`, `a[(A)]`, `a{A}`, `a{{A}}`, `a>A]` | ✅ OK | — |
| **Node shapes: stadium, subroutine, parallelogram, trapezoid** | `a([A])`, `a[[A]]`, `a[/A/]`, `a[/A\]` | ❌ **THROW** | **High** — common shapes; tokens exist but parser rejects |
| **v11 shape syntax** | `a@{ shape: rect }` | ❌ THROW | Medium — current Mermaid shape syntax **and our node-metadata extension channel** |
| Edge label (pipe) | `a -->\|yes\| b` | ✅ OK (spaced) | — |
| Edge label (inline) | `a -- yes --> b` | ⚠️ PARTIAL — makes a stray `yes` node | Medium |
| **Chained edges** | `a --> b --> c` | ❌ **only 1 link, not 2** | **High** — silently drops edges |
| **Multi-edge (`&`)** | `a & b --> c` | ❌ **1 link, not 2** | **High** — silently drops edges |
| Variable arrow length | `a ---> b`, `a ----> b` | ❌ not handled | Medium |
| Edge operators: line/dotted/thick/circle/cross | `---`, `-.->`, `==>`, `--o`, `--x` | ⚠️ PARTIAL — recognised but link often dropped | Medium |
| **`subgraph … end`** | `subgraph one … end` | ❌ **THROW** | **High** — should map to a group |
| **Styling: `style`, `classDef`, `class`, `:::`** | `style a fill:#f9f` | ❌ THROW **or garbage nodes** (`f9f` becomes a node) | **High** — silent corruption; also a native extension point (§5) |
| **`linkStyle`, `click`, `href`** | `click a "http://…"` | ❌ THROW or garbage | Medium |
| Comments | `%% note` (own line / trailing) | ✅ OK | — |
| **Self-loop** | `a --> a` | ❌ THROW | Medium |
| A realistic decision flow | `Start([Start]) --> Check{OK?}` / `Check -->\|no\| Start` | ❌ **THROW** | **High** — a normal flowchart fails |

**Takeaway:** the parser handles the generated subset (spaced single edges, half
the shapes, pipe labels) and fails on glued arrows, chains, multi-edges, four
shapes, subgraphs, all styling, and edge re-use — i.e. most hand-written
flowcharts.

---

## 3. Current state — every other diagram type

Mermaid ships ~23 diagram types. Our behaviour on the rest:

| Type | Routed to | Result | Notes |
|---|---|---|---|
| `flowchart` / `graph` | flowchart parser | ⚠️ partial (§2) | our only real support |
| `erDiagram` | ERD parser (exists) | ❌ 1 node, relationship dropped | half-wired: detection + parser bugs |
| `classDiagram` | UML parser (exists) | ❌ 0 nodes | half-wired: parser produces nothing on canonical input |
| `stateDiagram[-v2]` | flowchart (fallthrough) | ❌ garbage (`stateDiagram-v2` becomes a node) | no real parser |
| `sequenceDiagram` | flowchart (fallthrough) | ❌ THROW | no parser |
| `gantt` | flowchart | ❌ garbage nodes | no parser; also a chart, not a graph |
| `pie` | flowchart | ❌ garbage | chart, not a graph |
| `journey` | flowchart | ❌ garbage | chart-ish |
| `gitGraph` | flowchart | ❌ garbage | graph-family, no parser |
| `mindmap` | flowchart | ❌ garbage | graph-family, no parser |
| `timeline` | flowchart | ❌ garbage | chart-ish |
| `quadrantChart`, `xychart`, `sankey`, `block`, `packet`, `kanban`, `requirement`, `C4*`, `architecture` | flowchart | ❌ garbage / THROW | none supported |

There is scaffolding (`extended/`: `ERDParser`, `UMLParser`, `BPMNParser`, plus
generators/transformers, ~1,400 lines) that is **wired but buggy** — the
`erDiagram`/`classDiagram` routing exists in `DSL.parseDetailed()` yet produces
empty or wrong models on standard syntax.

### The silent-corruption footgun

The worst behaviour is not the throws — it is that unsupported input often
**succeeds into garbage**: `style a fill:#f9f` yields a node literally named
`f9f`; `sequenceDiagram` participants become flowchart nodes. A throw is
recoverable; a plausible-but-wrong diagram is not. Fixing this is the cheapest,
highest-value change we can make (Phase 0). It is also a **prerequisite for the
extension model** — the "ignore directives you don't understand" rule (§5) is
the same discipline as "don't nodify tokens you can't parse."

---

## 4. Architecture assessment

- **Pipeline:** hand-rolled `Lexer` (511 loc) → `Parser` recursive descent (606
  loc) → `ASTTransformer` (490 loc) → `DiagramModel`; `DSLGenerator` (384 loc)
  for the reverse. Single-diagram-type oriented; adding a type means a new
  grammar path end-to-end. This is the pipeline we are keeping and extending.
- **Token set** already declares stadium/subroutine/cylinder/trapezoid, `&`,
  and every edge operator — so several §2 failures are *parser* gaps, not lexer
  gaps (the tokens exist; the parser doesn't assemble them). Good news for
  Phase 1: some of the work is wiring, not inventing.
- **Model fit:** `DiagramModel` is a node/edge/group graph. Roughly half of
  Mermaid's types are **graph-family** (flowchart, state, class, ER, mindmap,
  gitGraph, requirement, C4, block, architecture) and map naturally. The other
  half are **charts** (pie, gantt, xychart, quadrant, timeline, journey,
  sankey, packet) — these are *not* nodes and edges, and forcing them into the
  graph model is a category error. Out of scope for this engine (§6).

---

## 5. The extension model (how Grafloria features live in Mermaid text)

Three tiers, in priority order. A feature goes in the *highest* tier it fits.

**Tier 1 — Mermaid-native extension points (visible, renders everywhere).**
Map a Grafloria feature onto real Mermaid syntax whenever an analog exists:
- fill / stroke / colour → `style a fill:#f00,stroke:#333` and `classDef` / `:::`
- grouping / swimlane container → `subgraph … end` (+ `direction`)
- link / navigation → `click` / `href`
- link styling → `linkStyle`
- arbitrary node metadata → Mermaid v11 `a@{ key: value, … }` node-metadata block

**Tier 2 — `%%grafloria:` comment directives (hidden, body still renders vanilla).**
For Grafloria-only semantics with no Mermaid analog — port geometry, edge animation,
routing config, per-entity render hints. Mermaid ignores `%%` comments, so the
body stays valid. Lighter than the whole-model sidecar; one directive per entity,
e.g. a per-node/per-edge line the reader folds back onto the parsed entity.

**Tier 3 — the `%%grafloria:document` sidecar (the whole model, hidden).**
Already implemented. The exact `DiagramModel`, for byte-lossless machine
round-trips of Grafloria-origin diagrams. The fallback of last resort, not the place
to put a single new attribute.

**The two invariants that keep the dialect safe (symmetric graceful degradation):**
1. **Our parser ignores Mermaid directives it does not understand yet** — never
   garbages them (this is Phase 0's discipline applied to directives).
2. **A stock Mermaid renderer ignores our `%%grafloria:` comments** — so the visible
   body always renders. Enforced by the Tier-1/Tier-2 split: anything not
   expressible in Mermaid's grammar goes in a comment, not the visible body.

---

## 6. Roadmap

Sequenced by value-per-effort. You cannot safely extend a syntax you do not yet
parse correctly, so the base (Phase 0–1) comes before the extension channel
(Phase 2). Estimates are engineer-days, rough.

### Phase 0 — Stop the corruption ✅ DONE (commit 5db5b4a88)
- Unrecognised diagram header (`sequenceDiagram`, `gantt`, …) → explicit
  `{ unsupported: '<type>' }` result, not the flowchart parser.
- Un-parseable flowchart line → typed error with line/col, or lossless raw-text
  passthrough — **never manufacture nodes from directive tokens.**
- Tooth: table-driven test asserting each unsupported input yields a clean
  signal, not garbage. (This discipline *is* invariant #1 of the extension
  model.)

### Phase 1 — Make the flowchart BASE real ✅ DONE (commit 9528b1a57)
- Lexer: glued arrows (`a-->b`), variable arrow length (`--->`), all edge ops.
- Parser: **chains** (`a-->b-->c`), **multi-edge** (`a & b --> c & d`),
  self-loops, edge re-use from one source.
- Shapes: stadium, subroutine, parallelogram, trapezoid, and v11 `@{ shape: … }`.
- `subgraph … end` → `GroupModel` (nesting + `direction`).
- Generator: emit the same forms so the round-trip stays lossless **through the
  body**, not only through the sidecar.
- Teeth: the §2 matrix, every row green, mutation-proven.

### Phase 2 — Formalize the extension channel ✅ DONE (commit 0adc2f4a3)
- Wire Tier-1 directives into the model: `style` / `classDef` / `:::` → node
  style bag; `linkStyle` → link style; `click`/`href` → node metadata; v11
  `@{ … }` → node metadata. (Ignore unknown keys, per invariant #1.)
- Define the Tier-2 `%%grafloria:` per-entity directive grammar and map each
  Grafloria-only feature to Tier 1 or Tier 2 (a short spec table: feature → channel
  → syntax).
- Teeth — the round-trip in both directions:
  - Grafloria → text → Grafloria is lossless (extensions survive).
  - The exported **visible body is valid Mermaid.** *Optional but recommended:*
    assert this in a **test-only** oracle using the already-installed `mermaid`
    package (`mermaid.parse(body)`), so the "renders everywhere" invariant is a
    permanent gate. Test-only — not shipped in the product.

### Phase 3 — Fix the scaffolded graph types (4–6 days each)
- `erDiagram`, `classDiagram`: parsers exist — fix detection + parse bugs, wire
  the generators, add round-trip teeth.
- `stateDiagram-v2`: closest to flowchart (states + transitions, composite
  states → groups); moderate new work.

### Phase 4 — New graph-family grammars (1–2 weeks each, as demand dictates)
- `sequenceDiagram`, `gitGraph`, `mindmap`, `requirementDiagram`, `C4`, `block`.
  Each hand-rolled following the same base-plus-extension pattern; prioritise by
  user demand.

### Out of scope — the chart family
`pie`, `gantt`, `xychart`, `quadrantChart`, `timeline`, `journey`, `sankey`,
`packet`. Charts, not graphs. A separate charting track or an explicit,
documented "not supported" — **not** forced into `DiagramModel`.

---

## 7. What "both ways" needs, per type

Bidirectional editing = a **matched, tested generator+parser pair** on the same
syntax, plus the extension tiers for anything the grammar can't say. Today only
the narrow flowchart subset achieves it (leaning on the sidecar). After Phase 1+2,
the flowchart body itself round-trips — base features in valid Mermaid, extras in
Tier-1 directives or `%%grafloria:` comments, sidecar only as the lossless backstop
for Grafloria-origin files. Each Phase-3/4 type repeats the pattern: teach its
generator to emit exactly what its parser reads, or the export silently loses
what the generator can't express.

---

## 8. Bottom line

- **Strategy:** own parser, Mermaid syntax as the base, Grafloria features added via
  Mermaid-native directives (Tier 1) and `%%grafloria:` comments (Tier 2/3). The
  visible body always stays valid Mermaid.
- **Today:** we reliably read only our own output. Even flowchart misses chains,
  multi-edges, four shapes, subgraphs, and all styling; other types garbage.
- **Cheapest high-value work:** Phase 0 (stop garbage) + Phase 1 (real
  flowchart) turns "reads our own output" into "reads real flowcharts" — the bulk
  of what anyone pastes — and is the foundation the extension channel (Phase 2)
  is built on.
- **Then:** Phase 2 formalizes the extension model that lets our extra features
  ride in Mermaid text without breaking Mermaid compatibility.
