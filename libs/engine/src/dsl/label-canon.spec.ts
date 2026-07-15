// wave14/labels — THE LABEL CANON.
//
// A label has exactly ONE canonical home: `metadata.label`. That is the field
// the renderer reads (svg-renderer node label + a11y accessible name + link
// label), the field the spec input layer writes (instance/model-input.ts), the
// field the label-edit command writes (SetNodeLabelCommand), and the field the
// collab op-log addresses ('metadata.label'). `data['label']` is the legacy
// DSL-era location — readable as a FALLBACK (old documents, external writers),
// but never again the only place a label lives.
//
// Before this wave the DSL layer wrote ONLY `data['label']` and read ONLY
// `data['label']`, while everything else wrote/read `metadata.label`. The two
// sides never met:
//   - Mermaid text → parse → render: nodes drew UNLABELED and their accessible
//     names degraded to "<type> node".
//   - Editor/spec diagram → generate: the Mermaid body carried raw node IDS
//     instead of labels — defeating the human-readable-body goal.
//   - export → hand-edit → reimport (TextFormat): every label WIPED (the
//     composition of the two; pinned in TextFormat.spec.ts).
//
// These tests pin both directions of the seam plus the canonical accessor.

import { DSL } from './DSL';
import { DiagramModel } from '../models/DiagramModel';
import { NodeModel } from '../models/NodeModel';

const dsl = () => new DSL({ autoLayout: false });

describe('label canon — Mermaid parse writes metadata.label (the renderer read side)', () => {
  it('explicit node labels land in metadata.label', () => {
    const d = dsl().parse('graph TD\n  a["Alpha"] --> b["Beta"]\n');
    expect(d.getNode('a')!.getMetadata('label')).toBe('Alpha');
    expect(d.getNode('b')!.getMetadata('label')).toBe('Beta');
  });

  it('label-less nodes default their id into metadata.label', () => {
    const d = dsl().parse('graph TD\n  a --> b\n');
    expect(d.getNode('a')!.getMetadata('label')).toBe('a');
    expect(d.getNode('b')!.getMetadata('label')).toBe('b');
  });

  it('re-defining a node updates metadata.label (last-write-wins, like Mermaid)', () => {
    // ...whether the re-definition is a standalone node line or a label riding
    // inside an edge line — both are real hand-edit shapes.
    const d = dsl().parse('graph TD\n  a["First"]\n  a["Second"] --> b["B"]\n');
    expect(d.getNode('a')!.getMetadata('label')).toBe('Second');
  });

  it('a BARE reference in an edge line does not reset an existing label', () => {
    const d = dsl().parse('graph TD\n  a["Alpha"]\n  a --> b["B"]\n');
    expect(d.getNode('a')!.getMetadata('label')).toBe('Alpha');
  });

  it('link labels land in metadata.label (the renderer link-label read side)', () => {
    const d = dsl().parse('graph TD\n  a["A"] -->|yes| b["B"]\n');
    const links = d.getLinks();
    expect(links.length).toBe(1);
    expect(links[0].getMetadata('label')).toBe('yes');
  });

  it("a11y: a parsed node's label sits in the exact field nodeAccessibleName reads", () => {
    // svg-renderer.nodeAccessibleName(node) reads node.getMetadata('label') and
    // falls back to `${node.type} node`. Before this wave a Mermaid-parsed node
    // had no metadata.label, so every parsed diagram read to a screen reader as
    // a bag of "flowchart:process node"s. This is the engine-side pin of that
    // contract; the renderer a11y e2e drives the DOM end of it.
    const d = dsl().parse('graph TD\n  approve["Approve invoice"] --> pay["Pay"]\n');
    const label = d.getNode('approve')!.getMetadata('label');
    expect(typeof label).toBe('string');
    expect((label as string).trim()).toBe('Approve invoice');
  });
});

describe('label canon — the canonical accessor (getLabel/setLabel)', () => {
  it('getLabel() reads metadata.label first', () => {
    const n = new NodeModel({ id: 'n', type: 'rect', position: { x: 0, y: 0 } });
    n.setMetadata('label', 'Canonical');
    n.data['label'] = 'Legacy';
    expect(n.getLabel()).toBe('Canonical');
  });

  it('getLabel() falls back to legacy data.label so old documents still surface', () => {
    const n = new NodeModel({ id: 'n', type: 'rect', position: { x: 0, y: 0 } });
    n.data['label'] = 'Legacy only';
    expect(n.getLabel()).toBe('Legacy only');
  });

  it('getLabel() is undefined when neither field carries a non-empty string', () => {
    const n = new NodeModel({ id: 'n', type: 'rect', position: { x: 0, y: 0 } });
    expect(n.getLabel()).toBeUndefined();
    n.data['label'] = '';
    expect(n.getLabel()).toBeUndefined();
  });

  it('setLabel() writes the canon AND mirrors the legacy field, so no reader forks', () => {
    const n = new NodeModel({ id: 'n', type: 'rect', position: { x: 0, y: 0 } });
    n.setLabel('One home');
    expect(n.getMetadata('label')).toBe('One home');
    expect(n.data['label']).toBe('One home');
  });
});

describe('label canon — DSLGenerator reads labels wherever they live (export side)', () => {
  function specBuilt(): { d: DiagramModel; a: NodeModel; b: NodeModel } {
    // An editor/spec-built diagram: labels live ONLY in metadata.label, exactly
    // as instance/model-input.ts and SetNodeLabelCommand leave them.
    const d = new DiagramModel('spec-built');
    const a = new NodeModel({ id: 'plan', type: 'flowchart:process', position: { x: 0, y: 0 } });
    a.setMetadata('label', 'Plan the work');
    d.addNode(a);
    const b = new NodeModel({ id: 'ship', type: 'flowchart:process', position: { x: 300, y: 0 } });
    b.setMetadata('label', 'Ship it');
    d.addNode(b);
    return { d, a, b };
  }

  it('node labels from metadata.label reach the Mermaid body — not raw ids', () => {
    const { d } = specBuilt();
    const body = dsl().generate(d, { preserveIds: true, includeComments: false });
    expect(body).toContain('Plan the work');
    expect(body).toContain('Ship it');
    // the regression shape: `plan[plan]` — the id doubling as its own label
    expect(body).not.toContain('plan[plan]');
    expect(body).not.toContain('ship[ship]');
  });

  it('link labels from metadata.label reach the Mermaid body', () => {
    const { d, a, b } = specBuilt();
    const link = d.createSmartLink(a, b, 'smooth')!;
    expect(link).toBeTruthy();
    link.setMetadata('label', 'when approved');
    const body = dsl().generate(d, { preserveIds: true, includeComments: false });
    expect(body).toContain('|when approved|');
  });

  it('legacy diagrams (data.label only) still export their labels', () => {
    const d = new DiagramModel('legacy');
    const n = new NodeModel({ id: 'old', type: 'flowchart:process', position: { x: 0, y: 0 } });
    n.data['label'] = 'Old document label';
    d.addNode(n);
    const body = dsl().generate(d, { preserveIds: true, includeComments: false });
    expect(body).toContain('Old document label');
  });
});

describe('label canon — full text round-trip (parse → generate → parse)', () => {
  it('labels survive parse → generate → parse byte-for-byte', () => {
    const text = 'graph TD\n  a["Alpha"] -->|go| b["Beta"]\n';
    const first = dsl().parse(text);
    const regenerated = dsl().generate(first, { preserveIds: true, includeComments: false });
    const second = dsl().parse(regenerated);
    expect(second.getNode('a')!.getMetadata('label')).toBe('Alpha');
    expect(second.getNode('b')!.getMetadata('label')).toBe('Beta');
    expect(second.getLinks()[0].getMetadata('label')).toBe('go');
  });
});
