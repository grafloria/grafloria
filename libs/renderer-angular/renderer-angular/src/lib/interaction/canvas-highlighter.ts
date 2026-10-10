import type { DiagramEngine, NodeModel } from '@grafloria/engine';
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
 *
 * The same goes for every type the canvas draws by other means — an
 * `<ng-template grafloriaNode="…">`, a `ComponentRendererService` component, a
 * `custom: true` node on the HTML layer: the host passes `canDraw` for those.
 */
export class CanvasHighlighterController extends HighlighterController {
  /** Extra "the canvas draws this node" test, beyond the built-in shapes. */
  canDraw: (node: NodeModel) => boolean = () => false;

  override refreshValidation(engine: DiagramEngine): ValidationIssue[] {
    const all = super.refreshValidation(engine);
    const diagram = engine?.getDiagram?.();
    if (!diagram) return all;

    const isShapeTypeWarning = (issue: ValidationIssue): boolean => {
      if (issue.code !== 'UNREGISTERED_NODE_TYPE' || issue.entity !== 'node') return false;
      const node = diagram.getNode(issue.entityId);
      if (!node) return false;
      return (typeof node.type === 'string' && hasShape(node.type)) || this.canDraw(node);
    };

    for (const [entityId, list] of this.issues) {
      const kept = list.filter((issue) => !isShapeTypeWarning(issue));
      if (kept.length === 0) this.issues.delete(entityId);
      else if (kept.length !== list.length) this.issues.set(entityId, kept);
    }
    return all.filter((issue) => !isShapeTypeWarning(issue));
  }
}
