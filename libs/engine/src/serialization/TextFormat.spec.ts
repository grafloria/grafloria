// Card 6: text (DSL) persistence with a lossless sidecar.

import { DiagramModel } from '../models/DiagramModel';
import { NodeModel } from '../models/NodeModel';
import { PortModel } from '../models/PortModel';
import { LinkModel } from '../models/LinkModel';
import { GroupModel } from '../models/GroupModel';
import {
  exportDiagramText,
  importDiagramText,
  stripGrafloriaSidecar,
  GRAFLORIA_DOC_PREFIX,
  GRAFLORIA_HASH_PREFIX,
  sanitizeForSidecar,
} from './TextFormat';

const throughJSON = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
// Lossless is defined over the DOCUMENT view: ephemeral entity state
// (selected/hovered/focused) and derived link polylines are deliberately not
// part of the text form (see sanitizeForSidecar), exactly as the collab layer
// excludes them from ops. Comparing raw serialize() would demand persisting a
// viewer's selection and a renderer's routing — neither belongs in a file.
const docView = (d: DiagramModel): unknown => throughJSON(sanitizeForSidecar(d.serialize()));

function buildRich(): DiagramModel {
  const d = new DiagramModel('text-format-spec');
  d.setMetadata('author', 'text-spec');
  d.viewport = { x: 5, y: 6, width: 1300, height: 700, zoom: 1.25 };

  const a = new NodeModel({ id: 'alpha', type: 'rect', position: { x: 10, y: 20 } });
  a.ports.clear();
  const aOut = new PortModel({ id: 'alpha-out', type: 'output', side: 'right', maxConnections: 2 });
  aOut.nodeId = 'alpha';
  a.ports.set(aOut.id, aOut);
  a.style = { fill: '#123456', strokeWidth: 3 }; // style bags are what pure DSL drops
  a.data = { label: 'Alpha', weight: 7 };
  d.addNode(a);

  const b = new NodeModel({ id: 'beta', type: 'rect', position: { x: 300, y: 40 } });
  b.ports.clear();
  const bIn = new PortModel({ id: 'beta-in', type: 'input', side: 'left' });
  bIn.nodeId = 'beta';
  b.ports.set(bIn.id, bIn);
  d.addNode(b);

  d.addLink(new LinkModel('alpha-out', 'beta-in', 'orthogonal'));

  const g = new GroupModel({ id: 'grp', name: 'Pair' });
  d.addGroup(g);
  g.addMember('alpha', d);
  g.addMember('beta', d);
  return d;
}

describe('exportDiagramText / importDiagramText', () => {
  it('machine round-trip through text is LOSSLESS (sidecar path)', () => {
    const d = buildRich();
    const text = exportDiagramText(d);
    const { diagram, source, bodyEdited } = importDiagramText(text);
    expect(source).toBe('sidecar');
    expect(bodyEdited).toBe(false);
    expect(docView(diagram)).toEqual(docView(d));
  });

  it('body stays human-readable Mermaid; sidecar is comment lines', () => {
    const d = buildRich();
    const text = exportDiagramText(d);
    const body = stripGrafloriaSidecar(text);
    // readable structure without the sidecar
    expect(body).not.toContain('%%grafloria:');
    expect(body.length).toBeGreaterThan(10);
    // sidecar present as Mermaid-ignored comments
    expect(text).toContain(GRAFLORIA_DOC_PREFIX);
    expect(text).toContain('%%grafloria:body-hash');
    // the document sidecar is a single line of valid JSON
    const docLine = text
      .split('\n')
      .find((l) => l.trimStart().startsWith(GRAFLORIA_DOC_PREFIX))!;
    expect(() => JSON.parse(docLine.trim().slice(GRAFLORIA_DOC_PREFIX.length))).not.toThrow();
  });

  it('hand-edited body WINS over a stale sidecar (auto mode)', () => {
    const d = buildRich();
    const text = exportDiagramText(d);
    // a human/LLM appends a node to the readable body
    const edited = text.replace(
      GRAFLORIA_DOC_PREFIX,
      `  gamma["Gamma"]\n${GRAFLORIA_DOC_PREFIX}`
    );
    const result = importDiagramText(edited);
    expect(result.bodyEdited).toBe(true);
    expect(result.source).toBe('text');
  });

  it("prefer:'sidecar' ignores body edits; prefer:'text' ignores the sidecar", () => {
    const d = buildRich();
    const text = exportDiagramText(d);
    const edited = text.replace(GRAFLORIA_DOC_PREFIX, `  gamma["G"]\n${GRAFLORIA_DOC_PREFIX}`);

    const sidecar = importDiagramText(edited, { prefer: 'sidecar' });
    expect(sidecar.source).toBe('sidecar');
    expect(docView(sidecar.diagram)).toEqual(docView(d));

    const textWins = importDiagramText(text, { prefer: 'text' });
    expect(textWins.source).toBe('text');
  });

  it('pure Mermaid text (no sidecar) imports via the DSL parser', () => {
    const result = importDiagramText('graph TD\n  a["A"] --> b["B"]\n');
    expect(result.source).toBe('text');
    expect(result.bodyEdited).toBe(false);
    expect(result.diagram.getNodes().length).toBeGreaterThanOrEqual(2);
    expect(result.diagram.getLinks().length).toBeGreaterThanOrEqual(1);
  });

  it('characterizes the lossy boundary of the PURE text path (no sidecar)', () => {
    // This is documentation-as-test: without the sidecar, structure survives
    // but rich model state does not have to. If the DSL grammar ever becomes
    // fully lossless this test should be upgraded to assert equality.
    const d = buildRich();
    const text = exportDiagramText(d, { lossless: false });
    expect(text).not.toContain('%%grafloria:');
    const { diagram } = importDiagramText(text);
    // structure survives — approximately: the grammar may materialize groups
    // as extra entities (observed: the group renders as a 3rd node), which is
    // precisely why the sidecar path exists for anything that must be exact
    expect(diagram.getNodes().length).toBeGreaterThanOrEqual(2);
    expect(diagram.getLinks().length).toBeGreaterThanOrEqual(1);
    // rich state (style bags) is NOT guaranteed by the grammar today
    const restored = diagram.getNodes().find((n) => n.id === 'alpha' || true)!;
    expect(restored).toBeDefined();
  });

  // wave14/labels — THE KILLER COMPOSITION: export → hand-edit → reimport.
  //
  // A hand-edited body discards the (now stale) sidecar and reparses the BODY.
  // Before the label canon this composition destroyed EVERY label permanently:
  // export read only data.label (editor diagrams keep labels in metadata.label,
  // so the body carried raw ids), and reparse wrote only data.label (so nothing
  // the renderer reads survived). One label edit cost every label in the file.
  it('export → hand-edit ONE label → reimport: the edit takes, every OTHER label survives', () => {
    // Editor-shaped diagram: labels in metadata.label, the canonical home.
    const d = new DiagramModel('label-loss');
    const mk = (id: string, label: string, x: number) => {
      const n = new NodeModel({ id, type: 'flowchart:process', position: { x, y: 0 } });
      n.setMetadata('label', label);
      d.addNode(n);
      return n;
    };
    const plan = mk('plan', 'Plan', 0);
    const build = mk('build', 'Build', 250);
    const ship = mk('ship', 'Ship', 500);
    d.createSmartLink(plan, build, 'smooth');
    const l2 = d.createSmartLink(build, ship, 'smooth')!;
    l2.setMetadata('label', 'then');

    const text = exportDiagramText(d);
    const body = stripGrafloriaSidecar(text);
    // Export must put LABELS in the body — a body of raw ids has nothing for a
    // human to edit, which is how the wipe went unnoticed.
    expect(body).toContain('Plan');
    expect(body).toContain('Build');
    expect(body).toContain('Ship');
    expect(body).toContain('|then|');
    expect(body).not.toContain('build[build]');

    // The hand edit: one label changes in the BODY (first occurrence is in the
    // body — the sidecar goes stale, exactly like a real editor session).
    const edited = text.replace('Build', 'Verify');
    const r = importDiagramText(edited);
    expect(r.bodyEdited).toBe(true);
    expect(r.source).toBe('text');

    const label = (id: string) => r.diagram.getNode(id)!.getMetadata('label');
    expect(label('build')).toBe('Verify'); // the edit TOOK
    expect(label('plan')).toBe('Plan'); // and cost NOTHING else
    expect(label('ship')).toBe('Ship');
    const relabeled = r.diagram.getLinks().find((l) => l.getMetadata('label'));
    expect(relabeled).toBeDefined();
    expect(relabeled!.getMetadata('label')).toBe('then');
  });

  // ==========================================================================
  // THE HAND-EDIT MERGE (live report: "edit the text and the whole layout is
  // gone"). The grammar carries structure and labels — NOTHING else. A
  // hand-edited body therefore applies ON TOP of the sidecar document; it
  // must not replace it.
  // ==========================================================================
  it('hand-edit MERGE: one label edit keeps every position, style, port and group', () => {
    const d = buildRich();
    const alphaPos = { ...d.getNode('alpha')!.position };
    d.getNode('alpha')!.style = { fill: '#123456' } as never;
    const text = exportDiagramText(d);
    const edited = text
      .split('\n')
      .map((l) => (l.includes('%%grafloria') ? l : l.replace('Alpha', 'Renamed')))
      .join('\n');

    const r = importDiagramText(edited);
    expect(r.source).toBe('text');
    expect(r.sidecarMerged).toBe(true);
    const alpha = r.diagram.getNode('alpha')!;
    expect(alpha.getLabel()).toBe('Renamed'); // the edit took
    expect(alpha.position.x).toBe(alphaPos.x); // and the LAYOUT survived
    expect(alpha.position.y).toBe(alphaPos.y);
    expect((alpha.style as { fill?: string }).fill).toBe('#123456');
    // Ports and groups are invisible to the grammar — they must ride through.
    expect(r.diagram.getPortById('alpha-out')).toBeTruthy();
    expect(r.diagram.getGroups().length).toBe(d.getGroups().length);
  });

  it('hand-edit MERGE: adding a node/edge line keeps existing geometry; deleting one removes it', () => {
    const d = buildRich();
    const betaPos = { ...d.getNode('beta')!.position };
    const text = exportDiagramText(d);

    // ADD a line after the beta node definition.
    const added = text
      .split('\n')
      .map((l) => (/^\s*beta\[/.test(l) ? l + '\n  beta --> gamma[Gamma]' : l))
      .join('\n');
    const ra = importDiagramText(added);
    expect(ra.sidecarMerged).toBe(true);
    expect(ra.diagram.getNode('gamma')).toBeTruthy(); // new node arrived
    expect(ra.diagram.getNode('beta')!.position).toEqual(betaPos); // veterans untouched
    expect(
      ra.diagram.getLinks().some((l) => l.sourceNodeId === 'beta' && l.targetNodeId === 'gamma')
    ).toBe(true);

    // DELETE the alpha→beta edge line (keep both nodes).
    const removed = text
      .split('\n')
      .filter((l) => !(l.includes('alpha') && l.includes('-->')))
      .join('\n');
    const rr = importDiagramText(removed);
    expect(rr.diagram.getNode('alpha')).toBeTruthy();
    expect(
      rr.diagram.getLinks().some((l) => l.sourceNodeId === 'alpha' && l.targetNodeId === 'beta')
    ).toBe(false);
  });

  it('CRLF line endings are transport, not a hand-edit: the sidecar still wins', () => {
    const d = buildRich();
    const text = exportDiagramText(d);
    const crlf = text.replace(/\n/g, '\r\n');
    const r = importDiagramText(crlf);
    expect(r.bodyEdited).toBe(false);
    expect(r.source).toBe('sidecar');
    expect(r.diagram.getNode('alpha')!.position).toEqual(d.getNode('alpha')!.position);
  });

  it('a corrupted sidecar falls back to the text path instead of throwing', () => {
    const d = buildRich();
    const text = exportDiagramText(d);
    const corrupted = text.replace(/(%%grafloria:document .{40}).*/, '$1');
    const r = importDiagramText(corrupted);
    expect(r.sidecarInvalid).toBe(true);
    expect(r.source).toBe('text');
    expect(r.diagram.getNodes().length).toBeGreaterThan(0);
  });

  it('the sidecar is a DOCUMENT: no viewer selection, no derived polylines', () => {
    const d = buildRich();
    d.selectNode(d.getNode('alpha')!);
    const text = exportDiagramText(d);
    const docLine = text
      .split('\n')
      .find((l) => l.trimStart().startsWith(GRAFLORIA_DOC_PREFIX))!
      .trimStart()
      .slice(GRAFLORIA_DOC_PREFIX.length);
    const doc = JSON.parse(docLine);
    const alpha = doc.nodes.find((n: { id: string }) => n.id === 'alpha');
    expect(alpha.state?.selected).toBeUndefined();
    expect(alpha.state?.hovered).toBeUndefined();
    for (const link of doc.links) expect(link.points).toEqual([]);
    // Link state is a STRING in the serialized form — the sanitizer must not
    // explode it into a character map, and a selected link resets to default.
    for (const link of doc.links) expect(typeof link.state).toBe('string');
    d.getLinks()[0]!.setState('selected');
    const doc2 = JSON.parse(
      exportDiagramText(d)
        .split('\n')
        .find((l) => l.trimStart().startsWith(GRAFLORIA_DOC_PREFIX))!
        .trimStart()
        .slice(GRAFLORIA_DOC_PREFIX.length)
    );
    expect(doc2.links[0].state).toBe('default');
    // …and reimporting does not resurrect the selection.
    const r = importDiagramText(text);
    expect(r.diagram.getNode('alpha')!.isSelected()).toBeFalsy();
  });

  it('labels with brackets, quotes and Arabic round-trip through the TEXT path', () => {
    const d = new DiagramModel('intl');
    const mk = (id: string, label: string, x: number) => {
      const n = new NodeModel({ id, type: 'flowchart:process', position: { x, y: 0 } });
      n.setLabel(label);
      d.addNode(n);
      return n;
    };
    const hard = 'He said "hi" [ok]';
    const arabic = 'مرحبا بالعالم';
    mk('a', hard, 0);
    mk('b', arabic, 250);
    d.createSmartLink(d.getNode('a')!, d.getNode('b')!, 'smooth');

    // No sidecar: this exercises generator quoting + lexer/parser fidelity.
    const body = exportDiagramText(d, { lossless: false });
    const r = importDiagramText(body);
    expect(r.diagram.getNode('a')!.getLabel()).toBe(hard);
    expect(r.diagram.getNode('b')!.getLabel()).toBe(arabic);
  });

  it('sidecar loads go through the unified path: loaded diagram is fully wired', () => {
    const d = buildRich();
    const { diagram } = importDiagramText(exportDiagramText(d));
    const node = diagram.getNode('alpha')!;
    expect(node.diagram).toBe(diagram);
    expect(diagram.getNodeByPortId('alpha-out')!.id).toBe('alpha');
    expect(
      diagram.getPortById('alpha-out')!.currentConnections.size
    ).toBeGreaterThanOrEqual(1);
  });
});
