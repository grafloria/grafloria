import type { DiagramEngine } from '@grafloria/engine';
import { HighlighterController, hasShape, type ValidationIssue } from '@grafloria/renderer';

/**
 * The canvas's highlighter: the shared {@link HighlighterController}, minus one
 * false alarm.
 *
 * The engine's ValidationEngine reports every node whose `type` is not in its
 * TypeRegistry as "Node type '…' is not registered" — including the built-in
 * SHAPES the renderer draws: `rect` (the default type of every node spec),
 * `ellipse`, `diamond`, … The Angular canvas shows the validation layer by
 * default, so every plain node wore an orange outline. A type the renderer has
 * a shape for is not an unknown type, so exactly that warning is dropped; every
 * other issue — a registered type's rules, ports, links, an unknown type that is
 * not a shape — still shows.
 */
export class CanvasHighlighterController extends HighlighterController {
  override refreshValidation(engine: DiagramEngine): ValidationIssue[] {
    const all = super.refreshValidation(engine);
    const diagram = engine?.getDiagram?.();
    if (!diagram) return all;

    const isShapeTypeWarning = (issue: ValidationIssue): boolean => {
      if (issue.code !== 'UNREGISTERED_NODE_TYPE' || issue.entity !== 'node') return false;
      const type = diagram.getNode(issue.entityId)?.type;
      return typeof type === 'string' && hasShape(type);
    };

    for (const [entityId, list] of this.issues) {
      const kept = list.filter((issue) => !isShapeTypeWarning(issue));
      if (kept.length === 0) this.issues.delete(entityId);
      else if (kept.length !== list.length) this.issues.set(entityId, kept);
    }
    return all.filter((issue) => !isShapeTypeWarning(issue));
  }
}
