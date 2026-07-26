// Mermaid edge labels must reach the array the renderer paints from.
//
// `-->|yes|` parsed fine and `setLabel()` stored it on `metadata.label`, but the
// SVG renderer paints `link.labels[]` — so branch labels were silently dropped
// and a labelled back-edge read as an unexplained stray line.

import { DSL } from '../DSL';

const SRC = [
  'flowchart TD',
  '  Start([Start]) --> Check{Valid?}',
  '  Check -->|yes| Save[[Persist]]',
  '  Check -->|no| Start',
].join('\n');

describe('mermaid edge labels', () => {
  const diagram = new DSL().parse(SRC);
  const links = diagram.getLinks();

  it('puts the label in labels[] — what the renderer reads', () => {
    const texts = links.flatMap((l: any) => (l.labels ?? []).map((x: any) => x.text));
    expect(texts).toEqual(expect.arrayContaining(['yes', 'no']));
  });

  it('still records it on metadata for readers on the old field', () => {
    const yes = links.find((l: any) => l.getMetadata('label') === 'yes');
    expect(yes).toBeDefined();
  });

  it('leaves unlabelled edges without labels', () => {
    const plain = links.find((l: any) => l.sourceNodeId === 'Start');
    expect(plain?.labels?.length ?? 0).toBe(0);
  });
});
