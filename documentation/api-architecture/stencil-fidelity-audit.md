# Stencil fidelity audit — all 80 masters vs standard (Visio) notation

**Date:** 2026-07-25 · **Surface:** [visio-editor](https://grafloria.com/demos/diagrams/visio-editor.html) / [stencil-palette](https://grafloria.com/demos/diagrams/stencil-palette.html)
**Method:** every master placed on a live canvas, emitted SVG geometry inspected, compared against its notation's standard symbol.

## The headline

**60 of the 80 masters declare `shape.type: "rect"`.** They were auto-generated from a TypeRegistry that only knew `rect` / `circle` / `diamond` / `ellipse` / `hexagon`, so every symbol needing a distinctive silhouette was flattened to a rectangle.

This is *not* a renderer limitation. **The renderer already implements 34 shapes**, including most of the missing ones:

```
actor, circle, cloud, comment, component, cube, cylinder, cylinder3d, data,
database, diamond, document, ellipse, folder, hexagon, input-output,
manual-operation, note, package, parallelogram, parallelogram-top, pill,
predefined-process, predefined-process-alt, rect, stadium, subroutine,
terminal, terminator, trapezoid, trapezoid-bottom, triangle, triangle-down,
use-case-actor
```

So the fix for most rows is a **one-line data change per master** — point it at the shape that already exists. No renderer work.

---

## A · Wrong shape — the renderer ALREADY has the right one (fix = data only)

| Stencil | Master | Declares | Should be | Available as |
|---|---|---|---|---|
| Flowchart | **Data** | `rect` | parallelogram | `parallelogram` / `data` |
| Flowchart | **Document** | `rect` | wavy-bottom page | `document` |
| Flowchart | **Manual Operation** | `rect` | inverted trapezoid | `trapezoid` / `trapezoid-bottom` |
| Flowchart | **Manual Input** | `rect` | slanted top edge | `parallelogram-top` |
| Flowchart | **Predefined Process** | `rect` | double side bars | `predefined-process` / `subroutine` |
| Flowchart | **Terminal** | `rect` | stadium / pill | `stadium` / `terminator` / `pill` |
| Flowchart | **Merge** | `rect` | downward triangle | `triangle-down` |
| Flowchart | **Stored Data** | `rect` | curved left edge | `cylinder` (closest) |
| BPMN | **Error / Message / Timer Event** | `rect` | circle + event icon | `circle` (icon still missing) |
| UML | **Actor** | `rect` | stick figure | `actor` / `use-case-actor` |
| UML | **Note** | `rect` | folded corner | `note` / `comment` |
| UML | **Package** | `rect` | tabbed folder | `package` / `folder` |
| UML | **Component** | `rect` | component icon | `component` |
| ERD | **Key / Partial Key / Composite / Derived / Optional / Multivalued Attribute** | `rect` | ellipse (Chen) | `ellipse` |
| ERD | **ISA** | `rect` | triangle | `triangle` |

**15 rows / ~26 masters — all fixable by changing declared shape types.**

> **STATUS: DONE (2026-07-25).** `tools/resync-template-shapes.mjs` corrected **25 masters**. Root cause was narrower than assumed: `types/domain/*.ts` always declared the right shapes and `ShapeMapper` always mapped them — the checked-in `generated/` output simply predated ShapeMapper's extended table. Verified visually: Data is a parallelogram, Document has its wavy bottom, Manual Operation a trapezoid, Predefined Process double bars, Stored Data a cylinder, Terminal a stadium.

## B · Wrong shape — needs a NEW shape in the registry

| Stencil | Master | Should be | Note |
|---|---|---|---|
| Flowchart | **Delay** | half-rounded "D" | not in the 34 |
| Flowchart | **Display** | curved left, rounded right | not in the 34 |
| Flowchart | **Summing Junction** | circle with an ✕ | circle exists, no cross overlay |
| Flowchart | **OR** | circle with a ✚ | same |
| UML | **Fork / Join** | thick solid bar | currently a full rectangle |
| UML | **Merge** (activity) | diamond | trivial — `diamond` exists, but listed here as it's a semantic mismatch, not a missing shape |
| ERD | **Weak Entity** | double rectangle | needs a double-outline variant |
| ERD | **Weak Relationship** | double diamond | same |
| ERD | **Multivalued Attribute** | double ellipse | same |

**~9 masters need renderer work** (mostly "double outline" variants + two curved flowchart symbols + an icon overlay).

## C · Style-level, not shape-level

| Stencil | Masters | Issue |
|---|---|---|
| BPMN | ~~all 6 Tasks render sharp~~ | **CORRECTED + DONE.** Measured: plain **Task already rendered rx=8** and **UML State rx=12** — both were right; my first measurement read the drop-shadow `<rect>` (rx=4) instead of the body. The real defect was narrower: the 5 task *variants* (User/Service/Script/Manual/Business Rule) carried **no** `cornerRadius` while plain Task did. All six are now rx=8. |
| UML | **Class / Interface** | ~~should be rounded~~ — **verified correctly SHARP** (rx=none), which is right for UML classifiers. No action. |
| BPMN | events | correct circles, but no **event-type icon** (envelope / clock / lightning) inside |
| UML | **Class / Interface / Enumeration** etc. | rectangle is correct, but real UML needs **name / attribute / method compartments** — the divider lines are absent |

## D · Correct today ✓

Flowchart **Process, Decision, Preparation, Connector, OR**(circle) · BPMN **Start / End / Intermediate Event, all 3 Gateways** · UML **Use Case, Collaboration, Initial/Final Node, Initial/Final State, Decision** · ERD **Entity, Table, View, Associative & Bridge Entity, Attribute, Relationship, Discriminator**

**~20 of 80 are right.**

## E · Cross-cutting rendering defects

1. ~~Labels are hard-centred on the bounding box~~ — **CORRECTED after measuring.** `renderNodeLabel` already routes through `getInnerRect()`, and the insets are right (diamond 100×100 → inner 50×50; circle → 60×60). It also passes `maxWidth`, `maxLines` and a clip path. E1 as originally written was wrong.
2. **The real defect: no fit for UNBREAKABLE words.** "Decision" (8 chars, ~67 px at 14 px font) does not fit a diamond's 50 px inner width, and being a single word with no space the greedy wrapper cannot break it — so it stays one over-wide line and the clip path shears it to "Decisior". "Connector" in a 36 px circle becomes "nnec". The fix is shrink-to-fit (or hyphenate/ellipsis) when a single token exceeds `maxWidth`, **not** inner-rect plumbing. Compounding it: width is estimated as `length × fontSize × 0.6`, duplicated across ~8 sites, while a real `measureText` exists in the canvas backend and never feeds the wrap.
3. **Colour is per-master, not per-notation.** Flowchart masters ship individually coloured (pink Manual Operation, yellow Document, teal Manual Input). Visio stencils are monochrome by default and take colour from a theme. Dropping five shapes yields a harlequin diagram.
4. **No ports on drop.** Placed masters expose no connection points until hovered, and several notation shapes (gateways, events) should carry fixed anchor points.

---

## Recommended order

1. ~~Group A~~ — **DONE** (25 masters re-synced).
2. ~~E2~~ — **DONE.** Shrink-to-fit for unbreakable tokens, and feed the real `measureText` into the wrap. Fixes clipped text across *every* shape at once. (E1 needs no work — verified already correct.)
3. **C** — rounded corners for BPMN tasks + UML states (`rx`), then UML class compartments.
4. **Group B** — add the missing silhouettes (double-outline variants, Delay, Display, icon overlays).
5. **E3** — a neutral default palette, with colour moved to the theme.
