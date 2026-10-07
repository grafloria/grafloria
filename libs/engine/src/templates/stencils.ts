/**
 * Stencils — a NAMED, CATEGORIZED set of shape masters, the unit a Visio-style
 * palette shows as one collapsible section ("BPMN", "UML", "Flowchart"…).
 *
 * Why this exists: {@link TemplateRegistry} is a flat id→template map, and the
 * masters' own `meta.category` is too coarse to drive a palette — all 30 UML and
 * all 19 ERD masters share the single category `"diagram"`. The notation a shape
 * belongs to is what a user browses by, so stencils are built from the authored
 * groupings (the generated notation barrels + the curated library groups) rather
 * than re-derived from a field that cannot express them.
 *
 *     const engine = new DiagramEngine();
 *     registerStencils(engine.templateRegistry);   // every master, one call
 *     listStencils();                              // → palette sections
 */
import type { NodeTemplate } from './NodeTemplate';
import type { TemplateRegistry } from './TemplateRegistry';

// Notation barrels — imported individually because the DIRECTORY is the real
// grouping (see the note above); the flat `generated/index` would lose it.
import * as bpmn from './generated/bpmn';
import * as flowchart from './generated/flowchart';
import * as uml from './generated/uml';
import * as erd from './generated/erd';


/** A named, categorized set of masters — one section of a stencil palette. */
export interface Stencil {
  /** Stable id, e.g. `'bpmn'`. */
  id: string;
  /** Display name for the palette section, e.g. `'BPMN'`. */
  name: string;
  /** One-line description of what the set covers. */
  description: string;
  /** The shape masters in this set. */
  masters: NodeTemplate[];
}

/** A generated/curated module namespace is a bag of exports; keep the templates. */
function templatesOf(mod: Record<string, unknown>): NodeTemplate[] {
  const seen = new Set<string>();
  const out: NodeTemplate[] = [];
  for (const v of Object.values(mod)) {
    if (v && typeof v === 'object' && 'id' in v && 'structure' in v && 'meta' in v) {
      const t = v as NodeTemplate;
      if (!seen.has(t.id)) { seen.add(t.id); out.push(t); }
    }
  }
  return out;
}

/**
 * The stencils that ship with Grafloria — the 80 generated NOTATION masters
 * (flowchart / BPMN / UML / ERD), each a true silhouette the SVG canvas draws.
 * Freshly built on each call so a caller can mutate the returned arrays without
 * corrupting the built-ins.
 */
export function builtInStencils(): Stencil[] {
  return [
    { id: 'flowchart', name: 'Flowchart', description: 'Process, decision, data and terminator shapes.', masters: templatesOf(flowchart) },
    { id: 'bpmn',      name: 'BPMN',      description: 'Tasks, gateways and events for business process models.', masters: templatesOf(bpmn) },
    { id: 'uml',       name: 'UML',       description: 'Class, activity, state and component shapes.', masters: templatesOf(uml) },
    { id: 'erd',       name: 'ERD',       description: 'Entities, relationships and attributes for data models.', masters: templatesOf(erd) },
    // NOTE: the `template-library/` groups (common, workflow, data-viz, erd) are
    // deliberately NOT stencils. Every one of them carries its real content in an
    // HTML template, and the SVG canvas paints only the silhouette — so a KPI
    // card, a gauge, an avatar or a table drops as a bare labelled rectangle.
    // They also have working successors: the dashboard kit (`dashboard()`) for
    // KPI/line/bar/donut widgets, and the `erDiagram()` / `erTable()` kit for
    // true entity tables with typed rows, field ports and reconciling FK→PK
    // edges (demos/diagrams/erd-editor.html). The erd-templates set was doubly
    // unfit: its entries are design experiments ("ERD Table (OLD)", "Option A",
    // "Option B", "Repeater") and two of them — "ERD Container (Option B)" and
    // "ERD Header (Option B)" — are SEPARATE nodes, so dragging the body left
    // the header behind. A stencil ships only shapes that actually draw. Those
    // entries are design experiments — their own names say so ("ERD Table (OLD)",
    // "Option A", "Option B", "Repeater") — and two of them ("ERD Container
    // (Option B)" + "ERD Header (Option B)") are SEPARATE nodes, so dragging the
    // body leaves the header behind. Their table fidelity also lived in HTML
    // templates the SVG path does not paint, so they drop as bare rectangles.
    // The real entity-relationship surface is the `erDiagram()` / `erTable()`
    // kit (see demos/diagrams/erd-editor.html), which renders true tables with
    // typed rows, field ports and reconciling FK→PK edges.
  ].filter((s) => s.masters.length > 0);
}

/** Built-in stencils, by id. */
export function getStencil(id: string): Stencil | undefined {
  return builtInStencils().find((s) => s.id === id);
}

/** Alias of {@link builtInStencils} — the palette's "what can I show?" call. */
export function listStencils(): Stencil[] {
  return builtInStencils();
}

/**
 * Register every master of the given stencils (default: all built-ins) into a
 * {@link TemplateRegistry}, so `NodeFactory` can stamp any of them by id.
 * Returns the number of masters registered.
 */
export function registerStencils(registry: TemplateRegistry, stencils: Stencil[] = builtInStencils()): number {
  let n = 0;
  for (const s of stencils) {
    for (const m of s.masters) { registry.register(m); n++; }
  }
  return n;
}
