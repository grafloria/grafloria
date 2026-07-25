import { DiagramEngine } from '../../engine/DiagramEngine';
import { registerGeneratedTemplates, generatedTemplates } from './register';
import { registerTemplateLibrary } from '../../template-library/integration';

// T4 (Visio build plan) — the engine now owns a real `templateRegistry`, and the
// 80 orphaned generated masters can be bulk-registered into it in one call.
describe('T4 — engine.templateRegistry + generated masters', () => {
  it('exposes a real, empty templateRegistry on a fresh engine', () => {
    const engine = new DiagramEngine();
    expect(engine.templateRegistry).toBeDefined();
    expect(engine.templateRegistry.getAll()).toHaveLength(0); // opt-in: a plain app pays nothing
  });

  it('registerGeneratedTemplates registers all 80 masters and returns the count', () => {
    const engine = new DiagramEngine();
    const n = registerGeneratedTemplates(engine.templateRegistry);
    expect(n).toBe(80); // bpmn 15 + erd 19 + flowchart 16 + uml 30
    for (const t of generatedTemplates()) {
      expect(engine.templateRegistry.get(t.id)).toBeDefined(); // every master resolves by id
    }
  });

  it('every generated master is a real NodeTemplate (geometry + meta + unique id)', () => {
    const t = generatedTemplates();
    expect(t).toHaveLength(80);
    expect(new Set(t.map((x) => x.id)).size).toBe(80); // no duplicate ids
    for (const x of t) {
      expect(x.structure).toBeDefined();
      expect(x.meta?.name).toBeTruthy();
    }
  });

  it('the curated 26-template library and the 80 masters coexist in one registry', () => {
    const engine = new DiagramEngine();
    const lib = registerTemplateLibrary(engine.templateRegistry);
    const gen = registerGeneratedTemplates(engine.templateRegistry);
    expect(lib).toBeGreaterThan(0);
    expect(gen).toBe(80);
    // both sets are individually resolvable (ids are disjoint enough that all 80 masters survive)
    for (const t of generatedTemplates()) expect(engine.templateRegistry.has(t.id)).toBe(true);
    expect(engine.templateRegistry.getAll().length).toBeGreaterThanOrEqual(80);
  });
});
