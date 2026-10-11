// The outline layer's controller on the shared canvas (`highlighterConfig`).
import type { DiagramEngine, NodeModel } from '@grafloria/engine';
import { HighlighterController, type ValidationIssue } from '../interaction/highlighters';
import { hasShape } from '../svg/shape-registry';

/**
 * Does the canvas draw this node by itself, whatever its `type`? True for:
 *
 *  - a built-in or registered SHAPE type (`rect`, `ellipse`, `diamond`, …);
 *  - a node drawn on the HTML layer (`custom: true` → a framework component or
 *    `renderCustomNode`; a node template) — `metadata.useHTMLLayer`;
 *  - a foreignObject node (`metadata.useForeignObject`);
 *  - a node whose silhouette is named apart from its type: a registered shape
 *    in `metadata.shape.type`, or any `style.shape` (the whiteboard's rectangle
 *    tool makes `type: 'basic'` nodes with `style.shape: 'rectangle'` — the
 *    library's own nodes, drawn on purpose).
 *
 * A type none of these covers is drawn as the fallback rectangle, which is
 * exactly when "is not registered" is worth saying (a typo, a missing
 * registration). Shared by every binding, so they all agree.
 */
export function canvasDrawsNode(node: NodeModel): boolean {
  if (typeof node.type === 'string' && hasShape(node.type)) return true;
  const meta = (key: string): unknown => node.getMetadata?.(key);
  if (meta('useHTMLLayer') === true || meta('useForeignObject') === true) return true;
  const styleShape = (node.style as { shape?: unknown } | undefined)?.shape;
  if (typeof styleShape === 'string' && styleShape !== '') return true;
  const metaShape = (meta('shape') as { type?: unknown } | undefined)?.type;
  return typeof metaShape === 'string' && hasShape(metaShape);
}

/**
 * The shared {@link HighlighterController}, minus one false alarm — the same one
 * Angular's canvas drops (its `CanvasHighlighterController`, f2466582, aa6a6102).
 *
 * The engine's ValidationEngine reports every node whose `type` is not in its
 * TypeRegistry as "Node type '…' is not registered" — including the types the
 * canvas draws without any registry entry: built-in shapes (`rect`, the default
 * type of every node spec), custom nodes, templates, … With
 * `highlighterConfig: true` every such node wore the amber warning outline. A
 * type the canvas draws ({@link canvasDrawsNode}, plus the host's own `canDraw`)
 * is not an unknown type, so exactly that warning is dropped; every other issue
 * — a registered type's rules, ports, links, a type nothing draws — still shows.
 */
export class ShapeAwareHighlighterController extends HighlighterController {
  /**
   * The host's extra "I draw this node" test, beyond {@link canvasDrawsNode}:
   * a framework binding's registered node components, say.
   */
  canDraw: (node: NodeModel) => boolean = () => false;

  override refreshValidation(engine: DiagramEngine): ValidationIssue[] {
    const all = super.refreshValidation(engine);
    const diagram = engine?.getDiagram?.();
    if (!diagram) return all;

    const isDrawnTypeWarning = (issue: ValidationIssue): boolean => {
      if (issue.code !== 'UNREGISTERED_NODE_TYPE' || issue.entity !== 'node') return false;
      const node = diagram.getNode(issue.entityId);
      return !!node && (canvasDrawsNode(node) || this.canDraw(node));
    };

    for (const [entityId, list] of this.issues) {
      const kept = list.filter((issue) => !isDrawnTypeWarning(issue));
      if (kept.length === 0) this.issues.delete(entityId);
      else if (kept.length !== list.length) this.issues.set(entityId, kept);
    }
    return all.filter((issue) => !isDrawnTypeWarning(issue));
  }
}
