// TEXT KITS — how a diagram type loaded from text gets its proper LOOK.
//
// `loadText('erDiagram …')` parses to a plain model: entity nodes, relationship
// links, and the grammar's own metadata (what exportText reads to write the same
// Mermaid back). The NOTATION — table cards with columns, crow's-foot markers, UML
// class cards, hollow generalization triangles — lives in the diagram kits of
// `@grafloria/element`, which this package cannot import (element depends on it).
// So the dependency is inverted: the kit registers itself here for its diagram
// type when `@grafloria/element` loads, and `loadText` asks.
//
// A kit DECORATES the imported model in place — ids, links and grammar metadata
// untouched, so exportText round-trips exactly as before — and may FINALIZE against
// the live instance afterwards (row interactions, behaviours a model cannot hold).
import type { DiagramModel } from '@grafloria/engine';

export interface TextKit {
  /** Restyle the freshly imported model (before it reaches the canvas). */
  decorate(diagram: DiagramModel): void;
  /** Optional wiring that needs the live instance (called after the load paints). */
  finalize?(instance: unknown): void;
}

const kits = new Map<string, TextKit>();

/**
 * Register the look for a diagram type loaded from text (`diagramType` metadata of
 * the imported model, e.g. `'erDiagram'`, `'classDiagram'`). The last registration
 * for a type wins. `@grafloria/element` registers its ER and UML kits on import.
 */
export function registerTextKit(diagramType: string, kit: TextKit): void {
  kits.set(diagramType, kit);
}

/** The kit registered for a diagram type, if any. */
export function textKitFor(diagramType: unknown): TextKit | undefined {
  return typeof diagramType === 'string' ? kits.get(diagramType) : undefined;
}
