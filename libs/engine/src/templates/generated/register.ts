/**
 * Bulk-register the auto-generated shape "masters" (BPMN / flowchart / UML / ERD)
 * into a {@link TemplateRegistry}.
 *
 * The 80 masters under `generated/{bpmn,flowchart,uml,erd}` are real
 * {@link NodeTemplate}s (geometry + ports + defaults + dataSchema) but shipped
 * orphaned — authored and barrel-exported, imported by nothing. This is the
 * one-call bridge that puts them behind the same registry `NodeFactory` and the
 * stencil palette consume. Opt-in (a plain workflow app need not pay for them);
 * the Visio-style editor calls this alongside `registerTemplateLibrary`.
 *
 *     const engine = new DiagramEngine();
 *     registerGeneratedTemplates(engine.templateRegistry); // → 80
 */
import type { TemplateRegistry } from '../TemplateRegistry';
import type { NodeTemplate } from '../NodeTemplate';
import * as generated from './index';

/** A generated export is a master iff it is a NodeTemplate-shaped object. */
function isNodeTemplate(v: unknown): v is NodeTemplate {
  return !!v && typeof v === 'object' && 'id' in v && 'structure' in v && 'meta' in v;
}

/** All generated masters, deduped by id (the registry keys on id anyway). */
export function generatedTemplates(): NodeTemplate[] {
  const seen = new Set<string>();
  const out: NodeTemplate[] = [];
  for (const v of Object.values(generated)) {
    if (isNodeTemplate(v) && !seen.has(v.id)) {
      seen.add(v.id);
      out.push(v);
    }
  }
  return out;
}

/**
 * Register every generated master into `registry`. Returns the number
 * registered. Idempotent — re-registering an id overwrites in place.
 */
export function registerGeneratedTemplates(registry: TemplateRegistry): number {
  const templates = generatedTemplates();
  registry.registerMany(templates);
  return templates.length;
}
