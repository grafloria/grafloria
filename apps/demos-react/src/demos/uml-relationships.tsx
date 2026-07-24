import { useEffect } from 'react';
import { GrafloriaDiagram } from '@grafloria/react';
import { umlDiagram } from '@grafloria/element';
import { markReady } from '../ready';

/** The FULL UML class-relationship vocabulary from PURE DATA via the reusable
 *  umlDiagram() kit: generalization, realization, association (with
 *  multiplicity chips), directed association, aggregation, composition and
 *  dependency — each with its real UML notation. Only the Employee
 *  self-association is a hand-written edge (self-loops are not in the kit
 *  vocabulary yet). */
const SPEC = umlDiagram({
  classes: [
    { id: 'Shape', stereotype: 'abstract', abstract: true, position: { x: 70, y: 36 },
      attributes: ['# x: float', '# y: float'],
      methods: ['+ area(): float', '+ draw(): void'] },
    { id: 'Circle', position: { x: 70, y: 392 },
      attributes: ['+ radius: float'], methods: ['+ area(): float'] },

    { id: 'Drawable', stereotype: 'interface', position: { x: 460, y: 55 },
      attributes: [], methods: ['+ render(): void', '+ bounds(): Rect'] },
    { id: 'Button', position: { x: 460, y: 392 },
      attributes: ['+ label: String'], methods: ['+ render(): void'] },

    { id: 'Playlist', position: { x: 850, y: 62 },
      attributes: ['+ name: String'], methods: ['+ add(s): void'] },
    { id: 'Song', position: { x: 850, y: 392 },
      attributes: ['+ title: String', '+ seconds: int'], methods: [] },

    { id: 'Window', position: { x: 1240, y: 62 },
      attributes: ['+ title: String'], methods: ['+ close(): void'] },
    { id: 'TitleBar', position: { x: 1240, y: 402 },
      attributes: ['+ text: String'], methods: [] },

    { id: 'Student', position: { x: 70, y: 682 },
      attributes: ['+ name: String'], methods: [] },
    { id: 'Course', position: { x: 380, y: 682 },
      attributes: ['+ code: String'], methods: [] },

    { id: 'Order', position: { x: 730, y: 672 },
      attributes: ['+ id: int'], methods: ['+ total(): Money'] },
    { id: 'Product', position: { x: 1040, y: 672 },
      attributes: ['+ sku: String', '+ price: Money'], methods: [] },

    { id: 'OrderService', position: { x: 70, y: 962 },
      attributes: [], methods: ['+ checkout(o): void'] },
    { id: 'Logger', position: { x: 380, y: 962 },
      attributes: [], methods: ['+ log(msg): void'] },

    { id: 'Employee', position: { x: 800, y: 952 },
      attributes: ['+ name: String'], methods: ['+ manage(e): void'] },
  ],
  relationships: [
    { id: 'gen', from: 'Circle', to: 'Shape', kind: 'inheritance',
      label: 'generalization', fromSide: 'top', toSide: 'bottom' },
    { id: 'real', from: 'Button', to: 'Drawable', kind: 'realization',
      label: 'realization', fromSide: 'top', toSide: 'bottom' },
    { id: 'agg', from: 'Playlist', to: 'Song', kind: 'aggregation',
      label: 'aggregation', fromSide: 'bottom', toSide: 'top' },
    { id: 'comp', from: 'Window', to: 'TitleBar', kind: 'composition',
      label: 'composition', fromSide: 'bottom', toSide: 'top' },
    { id: 'assoc', from: 'Student', to: 'Course', kind: 'association',
      multiplicity: ['0..*', '1..*'], fromSide: 'right', toSide: 'left' },
    { id: 'dir', from: 'Order', to: 'Product', kind: 'directed-association',
      multiplicity: ['1', '0..*'], fromSide: 'right', toSide: 'left' },
    { id: 'dep', from: 'OrderService', to: 'Logger', kind: 'dependency',
      label: '«uses»', fromSide: 'right', toSide: 'left' },
  ],
});

// THE ONE THING THE KIT CANNOT SAY (yet): a SELF-association. Employee loops out
// of and back into its own top edge — a hand-composed edge on top of the kit spec.
SPEC.edges.push({
  id: 'self', source: 'Employee', target: 'Employee', type: 'orthogonal',
  sourceHandle: 'top', targetHandle: 'top', label: 'manages',
  style: { stroke: '#475569', strokeWidth: 1.5,
    selfLoop: { side: 'top', size: 52, width: 96 },
    arrowHead: { type: 'open-arrow', size: 12, filled: false } },
} as never);

/** The full UML class-relationship vocabulary from pure data via umlDiagram(),
 *  with a hand-composed self-association loop on top. */
export default function UmlRelationshipsDemo() {
  useEffect(() => markReady(), []);
  return (
    <div style={{ height: '100vh' }}>
      <GrafloriaDiagram spec={SPEC} />
    </div>
  );
}
