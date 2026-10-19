// DiagramModel.lod-small.spec.ts
//
// A SMALL DIAGRAM KEEPS ITS WORDS.
//
// The default LOD policy drops labels and arrowheads below zoom 0.5 ('sketch')
// and nearly everything below 0.2 ('low'). Those tiers exist for COST — a 10k
// scene zoomed out cannot afford to measure every label — but a documentation
// figure is fitted to its column, so a 9-box `flowchart LR` lands at ~0.4 on a
// desktop reader and ~0.17 on a phone and rendered as EMPTY BOXES: words the
// author wrote, gone, with no way for a reader of a static figure to zoom in.
//
// A policy can gate the shedding tiers on scene size: a tier may carry
// `minNodes`, and a diagram with fewer nodes skips it — the zoom falls through to
// the richest tier that applies. `createDefaultLODConfig({ smallDiagramNodes })`
// puts that floor on 'sketch' and 'low'; SMALL_DIAGRAM_NODES (200) is the
// suggested value. It is OPT-IN: the default keeps the full ladder at any size,
// because the floor changes what every small canvas shows zoomed out. (A figure
// nobody can zoom asks the renderer for `lod: 'document'` instead.) A custom
// policy is honoured literally (no minNodes, no floor).

import { DiagramModel } from './DiagramModel';
import { NodeModel } from './NodeModel';
import {
  createDefaultLODConfig,
  createDocumentLODConfig,
  SMALL_DIAGRAM_NODES,
  ALL_LOD_FEATURES,
  type LODFeature,
} from '../types/performance.types';

/** A diagram of `count` nodes on the opted-in floor, unless `options` says otherwise. */
function diagramWith(count: number, options?: ConstructorParameters<typeof DiagramModel>[1]): DiagramModel {
  const diagram = new DiagramModel('lod-small', {
    lodConfig: createDefaultLODConfig({ smallDiagramNodes: SMALL_DIAGRAM_NODES }),
    ...options,
  });
  for (let i = 0; i < count; i++) {
    diagram.addNode(new NodeModel({ type: 'basic', position: { x: i * 200, y: 0 }, size: { width: 120, height: 80 } }));
  }
  return diagram;
}

const keepsWords = (d: DiagramModel, zoom: number): boolean =>
  d.shouldRender('labels', d.getLODLevel(zoom)) && d.shouldRender('decorations', d.getLODLevel(zoom));

describe('LOD: opted in, a small diagram never sheds its labels or arrowheads', () => {
  it('the suggested threshold is 200 nodes', () => {
    expect(SMALL_DIAGRAM_NODES).toBe(200);
  });

  it('BY DEFAULT there is no floor: the full ladder at any size, as before', () => {
    const tiers = createDefaultLODConfig().tiers;
    for (const tier of tiers) expect(tier.minNodes).toBeUndefined();
    const plain = new DiagramModel('plain');
    for (let i = 0; i < 9; i++) plain.addNode(new NodeModel({ type: 'basic', position: { x: i * 200, y: 0 }, size: { width: 120, height: 80 } }));
    expect(plain.getLODLevel(0.3)).toBe('sketch');
    expect(plain.getLODLevel(0.1)).toBe('low');
    expect(keepsWords(plain, 0.3)).toBe(false);
    expect(plain.getActiveLODTiers().map((t) => t.name)).toEqual(['high', 'medium', 'sketch', 'low']);
  });

  it.each([0.49, 0.4, 0.3, 0.2, 0.17, 0.1, 0.01])('9 nodes at zoom %p: labels + arrowheads (decorations) render', (zoom) => {
    const d = diagramWith(9);
    expect(keepsWords(d, zoom)).toBe(true);
    // It falls through to the richest tier that applies — 'medium' — not to a new one.
    expect(d.getLODLevel(zoom)).toBe('medium');
  });

  it('199 nodes is still small; 200 is not', () => {
    expect(keepsWords(diagramWith(199), 0.3)).toBe(true);
    const big = diagramWith(200);
    expect(big.getLODLevel(0.3)).toBe('sketch');
    expect(big.getLODLevel(0.1)).toBe('low');
    expect(keepsWords(big, 0.3)).toBe(false);
  });

  it('a big diagram keeps the full ladder — perception tiers unchanged', () => {
    const big = diagramWith(SMALL_DIAGRAM_NODES);
    expect(big.getLODLevel(1.5)).toBe('high');
    expect(big.getLODLevel(0.7)).toBe('medium');
    expect(big.getLODLevel(0.49)).toBe('sketch');
    expect(big.getLODLevel(0.2)).toBe('sketch');
    expect(big.getLODLevel(0.19)).toBe('low');
  });

  it('the floor is DATA on the tiers, and growing past it re-enables them', () => {
    const tiers = createDefaultLODConfig({ smallDiagramNodes: SMALL_DIAGRAM_NODES }).tiers;
    expect(tiers.find((t) => t.name === 'sketch')!.minNodes).toBe(SMALL_DIAGRAM_NODES);
    expect(tiers.find((t) => t.name === 'low')!.minNodes).toBe(SMALL_DIAGRAM_NODES);
    expect(tiers.find((t) => t.name === 'medium')!.minNodes).toBeUndefined();

    const d = diagramWith(SMALL_DIAGRAM_NODES - 1);
    expect(d.getLODLevel(0.3)).toBe('medium');
    d.addNode(new NodeModel({ type: 'basic', position: { x: 0, y: 500 }, size: { width: 10, height: 10 } }));
    expect(d.getLODLevel(0.3)).toBe('sketch');
  });

  it('smallDiagramNodes tunes it; 0 switches the floor off (the full ladder at any size)', () => {
    const off = diagramWith(9, { lodConfig: createDefaultLODConfig({ smallDiagramNodes: 0 }) });
    expect(off.getLODLevel(0.3)).toBe('sketch');
    expect(off.getLODLevel(0.1)).toBe('low');

    const tuned = diagramWith(9, { lodConfig: createDefaultLODConfig({ smallDiagramNodes: 5 }) });
    expect(tuned.getLODLevel(0.3)).toBe('sketch');
  });

  it('a custom policy without minNodes is honoured literally', () => {
    const d = diagramWith(3);
    d.setLODConfig({
      tiers: [
        { name: 'full', minZoom: 1, features: new Set<LODFeature>(ALL_LOD_FEATURES) },
        { name: 'bare', minZoom: Number.NEGATIVE_INFINITY, features: new Set<LODFeature>() },
      ],
    });
    expect(d.getLODLevel(0.3)).toBe('bare');
  });

  it('getActiveLODTiers lists only the tiers this diagram may use, richest first', () => {
    expect(diagramWith(9).getActiveLODTiers().map((t) => t.name)).toEqual(['high', 'medium']);
    expect(diagramWith(SMALL_DIAGRAM_NODES).getActiveLODTiers().map((t) => t.name)).toEqual(['high', 'medium', 'sketch', 'low']);
  });

  it('when no tier applies at all, the coarsest tier is still the fallback (never an unknown name)', () => {
    const d = diagramWith(1);
    d.setLODConfig({ tiers: [{ name: 'only-big', minZoom: 0, minNodes: 1000, features: new Set<LODFeature>() }] });
    expect(d.getLODLevel(0.5)).toBe('only-big');
  });
});

describe('createDocumentLODConfig: one tier, every feature, every zoom', () => {
  it('never sheds anything, at any zoom or size', () => {
    const d = diagramWith(SMALL_DIAGRAM_NODES + 50, { lodConfig: createDocumentLODConfig() });
    for (const zoom of [2, 1, 0.4, 0.1, 0.001]) {
      const lod = d.getLODLevel(zoom);
      for (const feature of ALL_LOD_FEATURES) expect(d.shouldRender(feature, lod)).toBe(true);
    }
  });
});
