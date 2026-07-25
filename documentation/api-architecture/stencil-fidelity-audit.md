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
| BPMN | all 6 **Tasks** (Task, User, Service, Script, Manual, Business Rule) | BPMN tasks are **rounded** rectangles; these render with sharp corners (needs `rx`, not a new shape) |
| UML | **State** | UML states are rounded rectangles; renders sharp |
| BPMN | events | correct circles, but no **event-type icon** (envelope / clock / lightning) inside |
| UML | **Class / Interface / Enumeration** etc. | rectangle is correct, but real UML needs **name / attribute / method compartments** — the divider lines are absent |

## D · Correct today ✓

Flowchart **Process, Decision, Preparation, Connector, OR**(circle) · BPMN **Start / End / Intermediate Event, all 3 Gateways** · UML **Use Case, Collaboration, Initial/Final Node, Initial/Final State, Decision** · ERD **Entity, Table, View, Associative & Bridge Entity, Attribute, Relationship, Discriminator**

**~20 of 80 are right.**

## E · Cross-cutting rendering defects

1. **Labels overflow their silhouette.** "Decision" is clipped left and right inside its diamond; "Connector" reads as `nnec` in its circle. Node labels are hard-centred on the *bounding box* rather than fitted to the shape's inner rect — `getInnerRect()` exists and insets correctly for diamonds/ellipses, but the label engine does not use it here. (Matches the gap analysis' "node labels hard-centred" row.)
2. **No text auto-fit.** A small circle (36 px) keeps a full-size font, so any label longer than ~4 characters is truncated rather than shrunk or wrapped.
3. **Colour is per-master, not per-notation.** Flowchart masters ship individually coloured (pink Manual Operation, yellow Document, teal Manual Input). Visio stencils are monochrome by default and take colour from a theme. Dropping five shapes yields a harlequin diagram.
4. **No ports on drop.** Placed masters expose no connection points until hovered, and several notation shapes (gateways, events) should carry fixed anchor points.

---

## Recommended order

1. **Group A** — retarget ~26 masters to shapes that already exist. Pure data edit, highest visual payoff per unit of work.
2. **E1 / E2** — route node labels through `getInnerRect()` and add auto-shrink. Fixes clipped text across *every* shape at once.
3. **C** — rounded corners for BPMN tasks + UML states (`rx`), then UML class compartments.
4. **Group B** — add the missing silhouettes (double-outline variants, Delay, Display, icon overlays).
5. **E3** — a neutral default palette, with colour moved to the theme.
