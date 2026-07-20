# Mermaid Compatibility — Gap Analysis & Plan (empirical)

**Date:** 2026-07-20 (Phase 3.1 — the silent-wrong sweep; Phase 3 was 2026-07-19)
**Status:** Phases 0 ✅ (5db5b4a88), 1 ✅ (9528b1a57), 2 ✅ (0adc2f4a3),
**3 ✅**, **3.1 ✅ (this revision)** are DONE — the parser reads real hand-written
flowcharts, **`erDiagram`, `classDiagram` and `stateDiagram[-v2]`**, fails safe
on everything else, and the extension channel (styling + `%%grafloria:`) is live.
All of it is validated against REAL mermaid v11.16 by
`demos/e2e/mermaid-oracle-run.mjs` (28 cases, both directions: what we read and
what we export). The §2/§3 matrices below record the pre-Phase-1 state (what was
broken); `mermaid-compat.spec.ts` + `mermaid-graph-types.spec.ts` are the living
green version. Phase 4 remains.

**Phase 3.1 closed the six inputs that produced a WRONG DIAGRAM WITHOUT AN
ERROR** — the failure mode this module treats as worse than an honest refusal.
Two were on Phase 3's own honest list (§3a); four more were found while in
there, by sweeping the real Mermaid grammar rather than trusting the code:

| # | Input | Was | Now |
|---|---|---|---|
| 1 | `bar ()-- foo` (lollipop) | **empty diagram, silently** | realization, both directions |
| 2 | 55 more operators (`A <\|--* B`, …) | **empty diagram, silently** | all 72 spellings parse |
| 3 | `--` regions in a composite | merged into ONE composite, one shared `[*]` | separate nested regions |
| 4 | `state "d" as X {` | composite lost, children leaked, `}` popped a scope it never pushed | composite, round-trips |
| 5 | `A:::hot` | state **labelled `::hot`**; export wrote `: ::hot` | style hook, captured by name |
| 6 | `direction` inside a composite | hoisted → re-oriented the WHOLE diagram | scoped to the composite |

Plus two export defects with the same signature: `[H]`/`[H*]` transitions were
dropped entirely, and a transition crossing two composites was written twice
(a duplicate edge on re-import) or, at the root, not at all.

**Per-type coverage today is §3a — read that, not the historical §3 table.**
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

## 3. Historical — every other diagram type, BEFORE Phase 3

*(Kept as the record of what was broken. For today's truth see §3a.)*

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

## 3a. Current state — per-type coverage AFTER Phase 3 (2026-07-19)

Every claim here was produced by feeding the syntax to `importDiagramText()`
and, for the export claims, by feeding our generated body back to **real
mermaid 11.16** through the oracle. Anything not listed as supported is either
in the "still missing" list or is not implemented.

| Type | Import | Export | Notes |
|---|---|---|---|
| `flowchart` / `graph` | ✅ full base + Tier-1 styling | ✅ | Phases 1–2 |
| **`erDiagram`** | ✅ **new** | ✅ **new** | entities, attribute blocks, all 16 cardinality pairs, identifying/non-identifying |
| **`classDiagram`** | ✅ | ✅ | classes, members, annotations, **all 72 relationship operators** (lollipop included), multiplicity |
| **`stateDiagram` / `-v2`** | ✅ | ✅ | states, `[*]`, `[H]`/`[H*]`, transitions, composites→nested groups, **concurrent regions**, fork/join/choice |
| `sequenceDiagram`, `gantt`, `pie`, `journey`, `gitGraph`, `mindmap`, `timeline`, `quadrantChart`, `requirement`, `C4*`, `block`, `packet`, `sankey`, `xychart`, `kanban`, `architecture`, `radar`, `zenuml` | ❌ explicit `unsupported` signal, empty diagram | — | Phase 0 discipline: never garbage |

The implementation is `dsl/mermaid/` — one file per type, each a matched
**parser + model builder + generator** triple, because a type that parses but
cannot re-emit itself loses everything the grammar cannot say on first save
(§7). The old `extended/ERDParser` + `extended/UMLParser` scaffolding is no
longer on any live path; `DSL.parseERD/parseUML/generateERD/generateUML` now
delegate to `dsl/mermaid/` so there is exactly one implementation of each
grammar. Those two classes remain only for demo scripts that import them
directly and are deletion candidates.

**Why now:** the diagram kit (`libs/element/src/lib/diagram-kit/`) gave ER and
class diagrams a REAL target representation — table cards with typed columns and
PK/FK badges, three-compartment UML cards, crow's-foot cardinality, the 7-kind
notation vocabulary. Each parser therefore also publishes the kit's own spec on
the diagram metadata (`erSpec` / `umlSpec`), so an embedder can hand it straight
to `erDiagram()` / `umlDiagram()` without re-deriving anything.

### What IS supported, per type

**`erDiagram`** — entities declared by mention, by bare line, or by attribute
block; attributes as `type name [PK|FK|UK[, …]] ["comment"]` (compound types
like `string(99)` / `int[]` survive); all 4×4 cardinality token pairs (`||`,
`|o`, `}o`, `}|` × `||`, `o|`, `o{`, `|{`) mapped onto the renderer's marker
vocabulary (`one` / `zero-or-one` / `zero-or-many` / `one-or-many`);
identifying `--` vs non-identifying `..`; relationship labels quoted or bare;
GLUED relationships (`CUSTOMER||--o{ORDER`); hyphenated ids (`LINE-ITEM`);
`direction`.

**`classDiagram`** — `class X`, `class X { … }`, bare `X`, generics
`class X~T~`, labels `class X["Label"]`, `X:::cssClass`; members in BOTH forms
(`Animal : +int age` and inside a block) with visibility `+ - # ~` and the
`$`/`*` classifiers; member names read from both spellings Mermaid accepts
(`+String beakColor` and `+age: int`); `<<interface>>` in-block and
`<<Interface>> X` standalone; multiplicity `"1" *-- "1..*"` including the chip
swap on reversed operators; labels; `direction`; `note` / `note for X`.

**…and the relationship operator set is now DERIVED FROM THE GRAMMAR.** Mermaid
composes `relationType? lineType relationType?` — `<|`/`|>` `*` `o` `<`/`>` `()`
crossed with `--`/`..` — which is **72 legal spellings**, every one verified
against the real parser. The previous hand-written table listed 17; a line using
any of the other 55 matched no rule at all, so it was skipped and BOTH of its
classes vanished with it. Each operator maps to the kit's kind by rule, not by
lookup: the line type decides triangle→`inheritance`/`realization` and
arrow→`directed-association`/`dependency`, and the ends flip when Mermaid writes
the marker first — except for the diamond kinds, where the diamond marks the
*whole* and the rule mirrors. **Lollipop** (`()`) → `realization`: mermaid's own
`addRelation` calls `addInterface()` on the operand beside the `()`, making it
the interface and the far operand the implementing class, which is exactly
`class ..|> interface` in long form.

**`stateDiagram` / `stateDiagram-v2`** — states and transitions with labels;
`[*]` resolved to **scoped** start/end pseudo-states (a composite's entry is not
the diagram's entry) and `[H]`/`[H*]` likewise; composite states → `GroupModel`,
**nested when the composites nest**; **concurrent `--` regions** → a synthetic
composite per region, so each region keeps its own children and its own `[*]`,
and the separator is written back out; `state "desc" as id` **with or without a
`{ … }` body**; `id : desc`; `id:::cssClass` captured as a style hook rather
than read as a label; `<<fork>>` `<<join>>` `<<choice>>`; `direction`, **scoped
to its composite when written inside one**; single-line and `end note`-terminated
note blocks. v1 and v2 share the grammar (v2 is a different layout engine in
Mermaid, not a different syntax).

The `--` separator is matched as `(?:--)+`, not `-{2,}`: Mermaid lexes it as a
repeated `--`, so `--` and `----` separate while `---` and `-----` are lexical
errors. Guessing here would have invented regions Mermaid never accepts.

### What is STILL MISSING — the honest list

*Everything below is either ignored (never garbage) or lossy in a stated way.*

**`erDiagram`**
- `ENTITY["display alias"]` is PARSED but not re-emitted — mermaid 11.16 has no
  syntax for it, so emitting it would produce a body real Mermaid rejects. The
  display name rides the `%%grafloria:document` sidecar (Tier 3) instead.
- ER `style` / `classDef` / `:::` directives (v11 added them to ER): ignored,
  not applied to the entity cards.
- **Field-level relationships are not expressible.** The kit can pin an edge to
  a specific column (`ORDER.customer_id → CUSTOMER.id`); Mermaid's ER grammar
  cannot say WHICH column a relationship uses, so every imported relationship is
  table-level. This is a Mermaid limitation, not ours.
- `title` / frontmatter metadata is stripped, not stored.
- `direction` is recorded on the model but does not drive layout.

**`classDiagram`**
- `namespace Foo { … }` — the classes inside are parsed correctly, but the
  namespace GROUPING is lost (no `GroupModel`). Unlike flowchart `subgraph`,
  which does become a group. *(The classes survive, so this is lossy, not
  wrong — but it is now the largest remaining class-diagram gap.)*
- **Both-ends operators render with only ONE glyph.** `<-->`, `<|--|>`, `<..>`
  and every mixed spelling (`<|--*`, `o--|>`, `*--o`, `()--|>`, …) carry a
  marker at each end; the kit's notation table has no both-ends kind, so the
  RIGHT marker wins and the left glyph is dropped. Structure and the literal
  operator are preserved, so export is exact and the loss is display-only.
- **Lollipop draws as a realization, not as a ball.** `bar ()-- foo` now parses
  (kind, direction and re-export are all correct), but the kit has no
  lollipop/socket marker, so it renders as the long-form dashed-triangle
  realization instead of the interface ball. Mermaid additionally collapses the
  interface operand into a bare ball rather than a class card; we keep it as a
  card. Semantically equivalent, visually not identical.
- `click`, `callback`, `link`, `cssClass` directives: ignored (not applied as
  node metadata the way flowchart `click` is).
- `:::cssClass` is captured by NAME only; no style resolution against `classDef`.
- Member internals (parameter list, return type, generics inside a member) are
  kept as RAW TEXT, not structurally parsed — deliberate (the kit renders member
  strings verbatim and Mermaid accepts several spellings), but it means you
  cannot query "the return type of this method".
- `note` is stored on diagram metadata, not rendered as a note node.

**`stateDiagram` / `-v2`**
- Concurrent regions are modelled and re-exported, but **layout does not band
  them**: the regions are nested `GroupModel`s and the placement is still the
  naive 4-up grid, so nothing draws the dashed divider Mermaid puts between
  regions. The structure is right; the picture is not yet.
- A region is a SYNTHETIC state (`A.region1`) carrying `region: true`, so it
  appears in `states` and as a node. Consumers that enumerate states see them;
  they are excluded from the exported text on purpose.
- `classDef` / `class` / `style` for states: still not applied. The inline
  `:::cssClass` hook is now captured by NAME on the state (so it is no longer
  misread as a label) but it is **not re-emitted** — a `classDef` we dropped
  would leave the hook dangling. Round-trip loses state styling, silently in
  the sense that the diagram is right and only the colour is gone.
- History states `[H]` / `[H*]` are modelled as scoped pseudo-states and
  round-trip through the text, but they render as a plain circle rather than
  the H-in-circle glyph, and the "resume the region's last active state"
  semantics are not modelled (there is nothing static to model).
- Transition arrows other than `-->` (Mermaid state has none) — n/a. We do
  accept `--->`, which real Mermaid rejects; leniency on input only.

**All three types**
- The `%%grafloria:` Tier-2 per-entity directive channel (Phase 2) is wired for
  FLOWCHART only. ER/class/state extras currently fall back to the Tier-3
  sidecar, which is lossless but opaque.
- Layout is a naive grid (3-up for ER/class, 4-up for state); no type-aware
  layout (ER tables by FK dependency, class by inheritance depth, state by flow).

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

### Phase 3 — The graph types beyond flowchart ✅ DONE (this revision)
The scaffolding was not "fixed" — it was REPLACED. `extended/ERDParser`
produced a single node called `CUSTOMER ||--o`; `extended/UMLParser` produced
zero nodes on canonical input (it only saw `class X` when the `{` was on the
NEXT line, ignored the `Animal : +int age` member form entirely, and its
relationship regex could not tell `<|--` from `<--`). `dsl/mermaid/` is a
rewrite: one file per type, each a parser + model builder + generator triple.
- `erDiagram`, `classDiagram`, `stateDiagram[-v2]`: import ✅, export ✅.
- Teeth: `mermaid-graph-types.spec.ts` (61 rows, table-driven, mutation-proven)
  **plus 14 new real-Mermaid oracle cases** — unit tests lock the STRUCTURE, the
  oracle locks the VALIDITY. That split matters: the oracle is what caught the
  export bug where `A ||--|| B : one` is a PARSE ERROR in real Mermaid, because
  its ER lexer reads `one` as a cardinality keyword even in label position. No
  unit test would have found that. We now quote ER labels unconditionally.

### Phase 3.1 — Kill the silent-wrong readings ✅ DONE (this revision)
The six inputs tabulated at the top of this document, all of which produced a
plausible diagram that said something the author did not write. The method is
the finding worth keeping: **do not audit the code, sweep the grammar.** Both
headline bugs were the same mistake — a hand-written subset standing in for a
compositional rule — and enumerating what real mermaid 11.16 actually accepts,
operator by operator and separator by separator, is what turned "lollipop is
missing" into "55 operators are missing" and "`--` is ignored" into the precise
`(?:--)+` lexing rule.
- Teeth: `mermaid-graph-types.spec.ts` is now **190 rows**, every new rule
  mutation-proven (21 mutations applied, all killed, baseline green before and
  after). The oracle went 19 → **28 cases**, including a sweep that puts all 72
  class operators through real Mermaid in both directions — the gate that stops
  the operator table drifting back into a hand-written subset.

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
syntax, plus the extension tiers for anything the grammar can't say. After
Phase 1+2 the flowchart body itself round-trips — base features in valid
Mermaid, extras in Tier-1 directives or `%%grafloria:` comments, sidecar only as the
lossless backstop for Grafloria-origin files.

**After Phase 3, ER / class / state round-trip through the BODY too.** Each of
the three stores its parse in MERMAID form on the model — the literal operator
and the literal operand order, not a normalized guess — so the generator
re-emits the author's own syntax rather than a re-derivation. That is what makes
`parse → generate → parse` an identity on entities, attributes, cardinality,
members and relationship kinds (locked by the round-trip rows in
`mermaid-graph-types.spec.ts`), and it is why `DSL.generate()` routes by the
diagram type the parser tagged: handing an ER model to the flowchart generator
would emit valid Mermaid of the WRONG TYPE, with the attributes and cardinality
silently gone.

The residual losses are listed in §3a and all fall back to the Tier-3 sidecar.

---

## 8. Bottom line

- **Strategy:** own parser, Mermaid syntax as the base, Grafloria features added via
  Mermaid-native directives (Tier 1) and `%%grafloria:` comments (Tier 2/3). The
  visible body always stays valid Mermaid.
- **Today (post-Phase-3):** we read real hand-written **flowcharts, ER diagrams,
  class diagrams and state diagrams**, and we write all four back as bodies real
  Mermaid accepts. Four of Mermaid's ~23 types — but four of the graph-family
  ones people actually paste. Everything else fails safe with an explicit
  `unsupported` signal instead of a plausible-but-wrong diagram.
- **The gate that makes this claim worth anything** is the oracle
  (`demos/e2e/mermaid-oracle-run.mjs`): 28 cases run through REAL mermaid v11.16
  in both directions. It has now caught a real export bug that no unit test
  would have (ER labels colliding with cardinality keywords). Any new type or
  syntax MUST arrive with oracle cases, not just unit tests.
- **The remaining gaps are LOSSY, not WRONG.** As of Phase 3.1 every input we
  accept in these four types either produces the diagram the author wrote or
  drops something we have named above — nothing else parses into a plausible
  lie. That is the property worth defending on every future change: a hand-
  written subset of a compositional grammar is the shape this bug always takes.
- **Next, by demand:** Phase 4's remaining graph-family grammars
  (`sequenceDiagram` is the most-requested), then the §3a per-type gaps —
  namespace grouping, banded layout for concurrent regions, and wiring the
  Tier-2 `%%grafloria:` channel for the three new types.
