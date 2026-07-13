// Wave 7 (Auto-layout) — Card 2: the layout PRESETS were dead.
//
// `layout-presets.ts` ships 17 presets across 5 categories — "Org Chart
// (Compact)", "Workflow (Horizontal)", "Force-Directed (Tight)", each with its
// own adapter and its own carefully-tuned `rankdir`/`nodesep`/`ranker` — and
// `LayoutDetector` chooses between them with a confidence score.
//
// NONE OF IT DID ANYTHING. `applyLayoutPreset()` built a config object whose
// `algorithm` field does not exist on the type it claimed to be, spread the
// preset's options at a level `reLayout()` never reads, and handed it to a method
// that overwrites the algorithm with the LayoutManager's own single-node
// placement strategy before it starts. Every preset produced the same picture.
//
// It survived six waves because `LayoutApplicator` had NO SPEC. This is it. The
// first two tests would both have failed before Card 2 — they are the regression
// guard, not decoration.

import { LayoutApplicator } from './LayoutApplicator';
import { DiagramModel } from '../../models/DiagramModel';
import { NodeModel } from '../../models/NodeModel';
import { LinkModel } from '../../models/LinkModel';
import { PortModel } from '../../models/PortModel';
import { LayoutPresets } from '../../layout/layout-presets';

function makeNode(id: string): NodeModel {
  const node = new NodeModel({
    type: 'basic',
    position: { x: 0, y: 0 },
    size: { width: 100, height: 50 },
  });
  (node as unknown as { id: string }).id = id;
  node.addPort(new PortModel({ id: `${id}-out`, type: 'output', side: 'right' }));
  node.addPort(new PortModel({ id: `${id}-in`, type: 'input', side: 'left' }));
  return node;
}

function makeLink(source: string, target: string): LinkModel {
  const link = new LinkModel(`${source}-out`, `${target}-in`, 'orthogonal');
  (link as unknown as { id: string }).id = `${source}->${target}`;
  link.sourceNodeId = source;
  link.targetNodeId = target;
  return link;
}

/** A → B → C. Enough that a direction change is unmistakable. */
function chain(): DiagramModel {
  const diagram = new DiagramModel('presets');
  for (const id of ['a', 'b', 'c']) diagram.addNode(makeNode(id));
  diagram.addLink(makeLink('a', 'b'));
  diagram.addLink(makeLink('b', 'c'));
  return diagram;
}

const positionsOf = (diagram: DiagramModel): string =>
  JSON.stringify(
    diagram
      .getNodes()
      .map((n) => [n.id, Math.round(n.position.x), Math.round(n.position.y)])
      .sort()
  );

describe('Card 2 — the OLD preset path, preserved as evidence', () => {
  it('PROOF the presets were dead: the old call shape ignores rankdir entirely', async () => {
    // This is EXACTLY what applyLayoutPreset() used to do, reproduced verbatim:
    //
    //     const config = { algorithm: 'dagre', ...preset.options };
    //     await diagram.reLayout(config);
    //
    // Run it with dagre's two opposite directions and the output is IDENTICAL —
    // which is the whole finding, demonstrated rather than asserted. `reLayout()`
    // overwrites `type` with the LayoutManager's placement algorithm and reads
    // options from `config.options`, so a top-level `rankdir` is simply never
    // looked at.
    const lr = chain();
    await lr.reLayout({ algorithm: 'dagre', rankdir: 'LR', nodesep: 70, ranksep: 150 } as never);

    const tb = chain();
    await tb.reLayout({ algorithm: 'dagre', rankdir: 'TB', nodesep: 60, ranksep: 100 } as never);

    expect(positionsOf(lr)).toBe(positionsOf(tb)); // no difference whatsoever
  });
});

describe('Card 2 — the layout presets are no longer a no-op', () => {
  it('THE BUG: two different presets used to produce the IDENTICAL picture', async () => {
    // 'workflow-horizontal' is dagre rankdir LR. 'workflow-vertical' is dagre
    // rankdir TB. They are the same preset library's answer to "which way does
    // this flow?" — and before Card 2 they produced byte-identical coordinates,
    // because the rankdir never reached dagre.
    const applicator = new LayoutApplicator();

    const horizontal = chain();
    await applicator.applyLayoutPreset(horizontal, 'workflow-horizontal');

    const vertical = chain();
    await applicator.applyLayoutPreset(vertical, 'workflow-vertical');

    expect(positionsOf(horizontal)).not.toBe(positionsOf(vertical));
  });

  it('a preset genuinely applies its DIRECTION', async () => {
    const applicator = new LayoutApplicator();

    const horizontal = chain();
    await applicator.applyLayoutPreset(horizontal, 'workflow-horizontal'); // rankdir: 'LR'
    // Left-to-right: x increases along the chain, y does not.
    expect(horizontal.getNode('a')!.position.x).toBeLessThan(horizontal.getNode('c')!.position.x);
    expect(horizontal.getNode('a')!.position.y).toBe(horizontal.getNode('c')!.position.y);

    const vertical = chain();
    await applicator.applyLayoutPreset(vertical, 'workflow-vertical'); // rankdir: 'TB'
    expect(vertical.getNode('a')!.position.y).toBeLessThan(vertical.getNode('c')!.position.y);
    expect(vertical.getNode('a')!.position.x).toBe(vertical.getNode('c')!.position.x);
  });

  it('a preset genuinely applies its SPACING', async () => {
    // 'org-chart-compact' is nodesep 40 / ranksep 60; 'org-chart-spacious' is
    // 100 / 120. Same adapter, same direction — only the numbers differ, so if
    // the options reach dagre the spacious chart is strictly taller.
    const applicator = new LayoutApplicator();

    const compact = chain();
    await applicator.applyLayoutPreset(compact, 'org-chart-compact');

    const spacious = chain();
    await applicator.applyLayoutPreset(spacious, 'org-chart-spacious');

    const height = (d: DiagramModel) =>
      Math.max(...d.getNodes().map((n) => n.position.y)) -
      Math.min(...d.getNodes().map((n) => n.position.y));

    expect(height(spacious)).toBeGreaterThan(height(compact));
  });

  it('a preset genuinely selects its ADAPTER (dagre vs elk)', async () => {
    const applicator = new LayoutApplicator();

    const viaDagre = chain();
    await applicator.applyLayoutPreset(viaDagre, 'component-diagram'); // adapter: dagre

    const viaElk = chain();
    await applicator.applyLayoutPreset(viaElk, 'microservices-layered'); // adapter: elk

    expect(positionsOf(viaDagre)).not.toBe(positionsOf(viaElk));
  });

  it('positions are COMMITTED to the model, not merely computed', async () => {
    const diagram = chain();
    await new LayoutApplicator().applyLayoutPreset(diagram, 'org-chart-compact');

    // setPosition() fired ⇒ the spatial index and the routing obstacle map saw it.
    const moved = diagram.getNodes().some((n) => n.position.x !== 0 || n.position.y !== 0);
    expect(moved).toBe(true);
  });

  it('every preset in the library actually runs — no preset names a dead adapter', async () => {
    // The presets name their adapter as a string. If one of them named an adapter
    // that is not registered, the old code would have silently ignored it; the new
    // code throws. Better to find that out here than in a user's diagram.
    const applicator = new LayoutApplicator();

    for (const preset of LayoutPresets.getAllPresets()) {
      const diagram = chain();
      await expect(applicator.applyLayoutPreset(diagram, preset.id)).resolves.toBeUndefined();
      expect(diagram.getNodes()).toHaveLength(3);
    }
  });

  it('an unknown preset id still throws', async () => {
    await expect(new LayoutApplicator().applyLayoutPreset(chain(), 'no-such-preset')).rejects.toThrow(
      /Layout preset not found: no-such-preset/
    );
  });

  it('presets run through the ENGINE\'s registry, so a host override is honoured', async () => {
    // A host that replaced 'dagre' must get its version when a preset asks for
    // dagre too — otherwise the applicator would quietly hold a second, private
    // copy of the built-ins and the override would apply to some layouts and not
    // others.
    const applicator = new LayoutApplicator();

    applicator.getLayoutRegistry().register({
      name: 'dagre',
      async apply() {
        return {
          nodePositions: new Map([['a', { x: 42, y: 42 }]]),
          bounds: { x: 0, y: 0, width: 0, height: 0 },
        };
      },
    });

    const diagram = chain();
    await applicator.applyLayoutPreset(diagram, 'org-chart-compact'); // a dagre preset

    expect(diagram.getNode('a')!.position).toEqual({ x: 42, y: 42 });
  });

  it('custom layouts still take the LayoutManager path (that one was never broken)', async () => {
    const applicator = new LayoutApplicator();
    applicator.addCustomLayout('mine', { type: 'grid' });

    const diagram = chain();
    await applicator.applyLayoutPreset(diagram, 'mine');

    expect(diagram.getNodes()).toHaveLength(3);
  });
});
