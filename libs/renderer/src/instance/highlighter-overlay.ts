// The outline layer's controller on the shared canvas (`highlighterConfig`).
import type { DiagramEngine } from '@grafloria/engine';
import { HighlighterController, type ValidationIssue } from '../interaction/highlighters';

/**
 * The shared {@link HighlighterController}, minus one false alarm — the rule
 * Angular's canvas follows too (`CanvasHighlighterController`).
 *
 * The engine's ValidationEngine reports every node whose `type` is not in its
 * TypeRegistry as "Node type '…' is not registered". On the canvas that is never
 * worth an outline: the canvas draws EVERY node — a shape, a custom node, a
 * template, a foreignObject node, and any other type as the fallback rectangle —
 * so a node with that warning is not broken on screen. The canvas drops exactly
 * that warning; `engine.validate()` still reports it (a typo, a missing
 * registration), and every other issue — a registered type's own rules, ports,
 * links — still outlines.
 */
export class ShapeAwareHighlighterController extends HighlighterController {
  override refreshValidation(engine: DiagramEngine): ValidationIssue[] {
    const all = super.refreshValidation(engine);
    const isUnregisteredType = (issue: ValidationIssue): boolean =>
      issue.code === 'UNREGISTERED_NODE_TYPE' && issue.entity === 'node';

    for (const [entityId, list] of this.issues) {
      const kept = list.filter((issue) => !isUnregisteredType(issue));
      if (kept.length === 0) this.issues.delete(entityId);
      else if (kept.length !== list.length) this.issues.set(entityId, kept);
    }
    return all.filter((issue) => !isUnregisteredType(issue));
  }
}
