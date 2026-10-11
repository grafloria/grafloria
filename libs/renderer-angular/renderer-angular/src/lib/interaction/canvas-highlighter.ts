import type { DiagramEngine } from '@grafloria/engine';
import { HighlighterController, type ValidationIssue } from '@grafloria/renderer';

/**
 * The canvas's highlighter: the shared {@link HighlighterController}, minus one
 * false alarm.
 *
 * The engine's ValidationEngine reports every node whose `type` is not in its
 * TypeRegistry as "Node type '…' is not registered". On the canvas that is never
 * a real problem: the canvas DRAWS every type — a built-in shape (`rect`, the
 * default type of every node spec, `ellipse`, `diamond`, …), an
 * `<ng-template grafloriaNode="…">`, a `ComponentRendererService` component, a
 * `custom: true` node on the HTML layer, and for any other type the shape
 * registry's rect fallback (`getShape()`). The Angular canvas shows the
 * validation layer by default, so plain nodes wore an orange outline — `rect`
 * (v3's A1) and then `basic` on the commands-and-history tab (v4's S7). So that
 * one warning is dropped for every node; every other issue — a registered
 * type's rules, ports, links — still shows. (The engine's own `validate()` is
 * untouched: a host that wants the TypeRegistry check still gets it.)
 */
export class CanvasHighlighterController extends HighlighterController {
  override refreshValidation(engine: DiagramEngine): ValidationIssue[] {
    const all = super.refreshValidation(engine);

    const isDrawableTypeWarning = (issue: ValidationIssue): boolean =>
      issue.code === 'UNREGISTERED_NODE_TYPE' && issue.entity === 'node';

    for (const [entityId, list] of this.issues) {
      const kept = list.filter((issue) => !isDrawableTypeWarning(issue));
      if (kept.length === 0) this.issues.delete(entityId);
      else if (kept.length !== list.length) this.issues.set(entityId, kept);
    }
    return all.filter((issue) => !isDrawableTypeWarning(issue));
  }
}
