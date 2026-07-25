/**
 * Stencil BUILDERS — how a dropped master becomes node(s).
 *
 * Most masters are a silhouette plus a label, and `NodeFactory` builds those
 * perfectly well. A few are not shapes at all: an ER entity or a UML class is a
 * CARD with rows you select, rename and add to. The diagram kits already build
 * exactly those cards, with inline editing, row-selection events and an undoable
 * update funnel — and the palette had no way to reach them, so dropping "Entity"
 * produced a rectangle.
 *
 * Rather than special-case ids inside the palette (which would hardcode ER/UML
 * knowledge into a module that should not have it, and would lock a host's own
 * stencils out of the same capability), a master resolves to a REGISTERED
 * builder. The default builder is the template path; the ER and UML kits
 * register card builders; anyone can register their own.
 *
 *     registerStencilBuilder('erd-entity', myBuilder);
 */
import type { NodeTemplate } from '@grafloria/engine';

/** What a builder is handed. */
export interface StencilBuildContext {
  /** The live diagram instance (engine + model + container). */
  api: any;
  /** The master being placed. */
  master: NodeTemplate;
  /** World position for the node's TOP-LEFT (the palette centres before calling). */
  at: { x: number; y: number };
}

/**
 * Build the node(s) for a master. Return the created root node — the palette
 * takes it from there (undo entry, membership, onPlace). Return `null` to fall
 * through to the default template path.
 */
export type StencilBuilder = (ctx: StencilBuildContext) => any | null;

const builders = new Map<string, StencilBuilder>();

/** Register the builder for a master id. Last registration wins. */
export function registerStencilBuilder(masterId: string, builder: StencilBuilder): void {
  builders.set(masterId, builder);
}

/** The builder for a master id, or undefined for the default template path. */
export function getStencilBuilder(masterId: string): StencilBuilder | undefined {
  return builders.get(masterId);
}

/** Drop a registration (tests, or a host replacing a built-in). */
export function unregisterStencilBuilder(masterId: string): boolean {
  return builders.delete(masterId);
}

/** Every master id that currently resolves to a card builder. */
export function registeredStencilBuilders(): string[] {
  return [...builders.keys()].sort();
}
