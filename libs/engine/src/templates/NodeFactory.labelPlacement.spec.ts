// Label placement plumbing: `structure.labelPlacement` → `metadata.labelPlacement`.
//
// The glyph-sized masters (event circles, gateway diamonds, connectors,
// fork/join bars) declare their caption paints BELOW the silhouette — the
// Visio/BPMN convention. The template carries the declaration as DATA and the
// factory forwards it to node metadata, where the renderer consumes it. These
// tests pin that forwarding (and that the default stays absent, so ordinary
// masters keep their inside label without any metadata noise).

import { DiagramModel } from '../models/DiagramModel';
import { TemplateRegistry } from './TemplateRegistry';
import { NodeFactory } from './NodeFactory';
import { EventBus } from '../events/EventBus';
import type { NodeTemplate } from './NodeTemplate';
import { generatedTemplates } from './generated/register';

const master = (id: string, labelPlacement?: 'inside' | 'below'): NodeTemplate =>
  ({
    id,
    version: '1.0.0',
    meta: { name: id, description: '', category: 'common', tags: [], author: 't' },
    structure: {
      type: `test:${id}`,
      size: { width: 36, height: 36 },
      shape: { type: 'circle', fill: '#fff', stroke: '#000', strokeWidth: 2, opacity: 1 },
      ...(labelPlacement ? { labelPlacement } : {}),
    },
    defaultData: { label: id },
  } as unknown as NodeTemplate);

describe('NodeFactory — labelPlacement', () => {
  let diagram: DiagramModel;
  let factory: NodeFactory;

  beforeEach(() => {
    diagram = new DiagramModel();
    const registry = new TemplateRegistry(new EventBus());
    registry.register(master('below-master', 'below'));
    registry.register(master('inside-master', 'inside'));
    registry.register(master('plain-master'));
    factory = new NodeFactory(registry, diagram);
  });

  it("forwards labelPlacement: 'below' to node metadata", () => {
    const node = factory.createFromTemplate('below-master', {}, { x: 0, y: 0 });
    expect(node.getMetadata('labelPlacement')).toBe('below');
  });

  it("an explicit 'inside' and an absent declaration both leave metadata clean", () => {
    const inside = factory.createFromTemplate('inside-master', {}, { x: 0, y: 0 });
    const plain = factory.createFromTemplate('plain-master', {}, { x: 0, y: 0 });
    expect(inside.getMetadata('labelPlacement')).toBeUndefined();
    expect(plain.getMetadata('labelPlacement')).toBeUndefined();
  });

  it('every glyph-sized generated master declares its caption below', () => {
    // The audit's glyph-caption class: captions inside these silhouettes clip
    // into garbage. The fix is DATA (template declarations, written by
    // tools/resync-template-shapes.mjs), and this test keeps it from regressing
    // on the next template regeneration.
    const mustBeBelow = [
      'flowchart-connector', 'flowchart-or', 'flowchart-summing-junction',
      'bpmn-exclusive-gateway', 'bpmn-inclusive-gateway', 'bpmn-parallel-gateway',
      'bpmn-start-event', 'bpmn-end-event', 'bpmn-intermediate-event',
      'bpmn-timer-event', 'bpmn-message-event', 'bpmn-error-event',
      'uml-decision', 'uml-initial-node', 'uml-final-node',
      'uml-initial-state', 'uml-final-state', 'uml-fork', 'uml-join',
      'uml-activation', 'uml-port',
      'erd-discriminator',
    ];
    const byId = new Map(generatedTemplates().map((t) => [t.id, t]));
    for (const id of mustBeBelow) {
      const t = byId.get(id) as any;
      expect(t).toBeDefined();
      expect(`${id}:${t.structure.labelPlacement}`).toBe(`${id}:below`);
    }
  });
});
