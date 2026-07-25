// T5 (Visio build plan) — the Stencil model: named, categorized master sets.

import { DiagramEngine } from '../engine/DiagramEngine';
import { builtInStencils, getStencil, listStencils, registerStencils } from './stencils';

describe('T5 — stencils', () => {
  it('ships the four notation stencils with their authored master counts', () => {
    const by = new Map(builtInStencils().map((s) => [s.id, s]));
    // These are the counts on disk (generated/{dir}/*.template.ts) — the
    // notation grouping meta.category cannot express.
    expect(by.get('flowchart')!.masters).toHaveLength(16);
    expect(by.get('bpmn')!.masters).toHaveLength(15);
    expect(by.get('uml')!.masters).toHaveLength(30);
    expect(by.get('erd')!.masters).toHaveLength(19);
    // 80 generated masters, split by the notation a user actually browses by.
    const generated = 16 + 15 + 30 + 19;
    expect(generated).toBe(80);
  });

  it('every stencil is palette-ready (id, name, description, non-empty masters)', () => {
    for (const s of listStencils()) {
      expect(s.id).toBeTruthy();
      expect(s.name).toBeTruthy();
      expect(s.description).toBeTruthy();
      expect(s.masters.length).toBeGreaterThan(0);
      for (const m of s.masters) {
        expect(m.id).toBeTruthy();
        expect(m.meta?.name).toBeTruthy();  // the palette label
        expect(m.structure).toBeDefined();  // the palette thumbnail
      }
    }
  });

  it('includes the curated groups alongside the generated notations', () => {
    const ids = listStencils().map((s) => s.id);
    expect(ids).toEqual(expect.arrayContaining(['flowchart', 'bpmn', 'uml', 'erd', 'common', 'workflow']));
  });

  it('getStencil resolves by id and misses cleanly', () => {
    expect(getStencil('uml')?.name).toBe('UML');
    expect(getStencil('nope')).toBeUndefined();
  });

  it('registerStencils puts every master behind engine.templateRegistry', () => {
    const engine = new DiagramEngine();
    const n = registerStencils(engine.templateRegistry);
    expect(n).toBeGreaterThanOrEqual(80);
    for (const s of builtInStencils()) {
      for (const m of s.masters) expect(engine.templateRegistry.has(m.id)).toBe(true);
    }
  });

  it('registers a caller-supplied subset only', () => {
    const engine = new DiagramEngine();
    const uml = getStencil('uml')!;
    const n = registerStencils(engine.templateRegistry, [uml]);
    expect(n).toBe(30);
    expect(engine.templateRegistry.getAll()).toHaveLength(30);
  });

  it('hands back fresh arrays — mutating one call does not corrupt the next', () => {
    builtInStencils()[0].masters.length = 0;
    expect(builtInStencils()[0].masters.length).toBeGreaterThan(0);
  });
});
