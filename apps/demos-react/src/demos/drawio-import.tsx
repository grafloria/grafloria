import { useEffect, useRef, useState } from 'react';
import { GrafloriaDiagram, type DiagramInstance } from '@grafloria/react';
import { fromDocument, DiagramSerializer, type RenderSpec } from '@grafloria/element';
import { importDrawio, type DrawioImportResult } from '@grafloria/engine';
import { markReady } from '../ready';
import { mountCodeEditor } from '../code-editor';

// A small order flow, hand-written in the exact XML draw.io saves: a rounded
// start box, a rhombus decision, a SWIMLANE CONTAINER whose children carry
// PARENT-RELATIVE geometry, an edge with MANUAL WAYPOINTS that detours under
// the decision, and an edge that ends ON the container itself — the four
// constructs this importer exists for.
const PLAIN_XML = `<mxGraphModel dx="800" dy="600" grid="1">
  <root>
    <mxCell id="0"/>
    <mxCell id="1" parent="0"/>
    <mxCell id="start" value="New order" style="rounded=1;fillColor=#dae8fc;strokeColor=#6c8ebf;" vertex="1" parent="1">
      <mxGeometry x="40" y="70" width="150" height="60" as="geometry"/>
    </mxCell>
    <mxCell id="check" value="In stock?" style="rhombus;fillColor=#fff2cc;strokeColor=#d6b656;" vertex="1" parent="1">
      <mxGeometry x="45" y="220" width="140" height="90" as="geometry"/>
    </mxCell>
    <mxCell id="lane" value="Fulfilment" style="swimlane;" vertex="1" parent="1">
      <mxGeometry x="330" y="70" width="380" height="280" as="geometry"/>
    </mxCell>
    <mxCell id="pick" value="Pick items" style="rounded=0;fillColor=#d5e8d4;strokeColor=#82b366;" vertex="1" parent="lane">
      <mxGeometry x="30" y="50" width="130" height="60" as="geometry"/>
    </mxCell>
    <mxCell id="pack" value="Pack &amp; ship" style="rounded=0;" vertex="1" parent="lane">
      <mxGeometry x="210" y="170" width="130" height="60" as="geometry"/>
    </mxCell>
    <mxCell id="e1" style="edgeStyle=orthogonalEdgeStyle;" edge="1" parent="1" source="start" target="check">
      <mxGeometry relative="1" as="geometry"/>
    </mxCell>
    <mxCell id="e2" value="yes" style="edgeStyle=orthogonalEdgeStyle;" edge="1" parent="1" source="check" target="pick">
      <mxGeometry relative="1" as="geometry">
        <Array as="points"><mxPoint x="115" y="420"/><mxPoint x="425" y="420"/></Array>
      </mxGeometry>
    </mxCell>
    <mxCell id="e3" edge="1" parent="lane" source="pick" target="pack">
      <mxGeometry relative="1" as="geometry"/>
    </mxCell>
    <mxCell id="e4" value="escalate" style="dashed=1;" edge="1" parent="1" source="check" target="lane">
      <mxGeometry relative="1" as="geometry"/>
    </mxCell>
  </root>
</mxGraphModel>`;

// A TWO-PAGE file, both pages inline (uncompressed) — the page picker appears
// and each page renders as its own diagram.
const MULTI_XML = `<mxfile host="grafloria-demo" version="24.0">
  <diagram id="p1" name="Overview"><mxGraphModel><root>
    <mxCell id="0"/><mxCell id="1" parent="0"/>
    <mxCell id="m1" value="PageOneNode" style="rounded=1;fillColor=#dae8fc;" vertex="1" parent="1"><mxGeometry x="40" y="40" width="170" height="60" as="geometry"/></mxCell>
  </root></mxGraphModel></diagram>
  <diagram id="p2" name="Detail"><mxGraphModel><root>
    <mxCell id="0"/><mxCell id="1" parent="0"/>
    <mxCell id="m2" value="PageTwoNode" style="ellipse;fillColor=#d5e8d4;" vertex="1" parent="1"><mxGeometry x="40" y="60" width="180" height="80" as="geometry"/></mxCell>
    <mxCell id="m3" value="Second" vertex="1" parent="1"><mxGeometry x="330" y="70" width="120" height="60" as="geometry"/></mxCell>
    <mxCell id="me" edge="1" parent="1" source="m2" target="m3"><mxGeometry relative="1" as="geometry"/></mxCell>
  </root></mxGraphModel></diagram>
</mxfile>`;

// The COMPRESSED example is generated from the SAME XML, through the browser's
// own CompressionStream — the exact inverse of the decode path importDrawio
// runs — so the two examples can never drift apart, and importing both proves
// compressed ≡ plain end to end.
async function compressedCopy(xml: string): Promise<string> {
  const bytes = new TextEncoder().encode(encodeURIComponent(xml));
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  const buf = new Uint8Array(await new Response(stream).arrayBuffer());
  let bin = '';
  for (const b of buf) bin += String.fromCharCode(b);
  return `<mxfile host="grafloria-demo" version="24.0"><diagram id="d1" name="Page-1">${btoa(bin)}</diagram></mxfile>`;
}

type Model = NonNullable<DrawioImportResult['diagram']>;
type Page = NonNullable<DrawioImportResult['pages']>[number];
/** The status line: the counts and every named warning — or the import's error. */
type Status = { head: string; warnings: string[] } | { error: string };

const statusOf = (model: Model, warnings: string[], pageNote: string): Status => {
  const counts = `${model.getNodes().length} nodes · ${model.getLinks().length} links · ${model.getGroups().length} groups`;
  return {
    head: (pageNote ? `${pageNote} · ` : '') + counts + (warnings.length ? ` · ${warnings.length} warning(s):` : ' · no warnings'),
    warnings,
  };
};

const CSS = `
  .di-page { display: flex; flex-direction: column; height: 100vh; }
  .di-page * { box-sizing: border-box; }
  .di-page .note { font-size: 12px; opacity: .8; padding: 10px 24px; border-bottom: 1px solid rgba(127,127,127,.25); line-height: 1.6; }
  .di-page code { background: rgba(127,127,127,.15); padding: 1px 5px; border-radius: 4px; }
  .di-canvas { display: flex; flex: 1; min-height: 0; }
  .di-stage { flex: 1; min-width: 0; position: relative; }
  .di-side { width: 400px; border-left: 1px solid rgba(127,127,127,.3); display: flex; flex-direction: column; }
  .di-text { flex: 1; font: 11px ui-monospace, Menlo, monospace; border: 0; border-bottom: 1px solid rgba(127,127,127,.3); padding: 10px; resize: none; background: transparent; color: inherit; white-space: pre; }
  .di-side .foot { padding: 8px 10px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .di-side button { padding: 6px 12px; border-radius: 6px; border: 1px solid rgba(127,127,127,.4); background: transparent; color: inherit; cursor: pointer; }
  .di-pagepick { padding: 5px 8px; border-radius: 6px; border: 1px solid rgba(127,127,127,.4); background: transparent; color: inherit; }
  .di-status { font-size: 12px; padding: 6px 10px 10px; line-height: 1.5; max-height: 130px; overflow: auto; }
  .di-status .bad { color: #dc2626; font-weight: 600; }
  .di-status .warn { opacity: .75; display: block; }
`;

/** .drawio (mxGraph XML) import — the migration on-ramp from draw.io /
 *  diagrams.net. importDrawio() reads plain <mxGraphModel> XML and the default
 *  compressed <mxfile> save; every page of a multi-page file imports, and every
 *  construct the import drops is named in a warning. The imported model goes
 *  serialize → fromDocument → render, the same public loader an embedder uses:
 *  GrafloriaDiagram hosts the loaded spec, and each import mounts a fresh one. */
export default function DrawioImportDemo() {
  const [text, setText] = useState(PLAIN_XML);
  const [status, setStatus] = useState<Status | null>(null);
  const [pages, setPages] = useState<Page[] | null>(null);
  const [page, setPage] = useState(0);
  // The mounted document: a new id remounts the canvas, as the JS page swaps its host.
  const [mount, setMount] = useState<{ id: number; spec: RenderSpec } | null>(null);
  const source = useRef<HTMLTextAreaElement>(null);
  const painted = useRef(false);

  // Import → serialize → fromDocument → render: the LOADED path is the same
  // public one-liner an embedder writes, so groups (frames + membership),
  // applied waypoints and link styles all arrive through the supported
  // loader instead of a demo-only rebuild.
  const renderModel = (model: Model) => {
    const json = JSON.stringify(new DiagramSerializer().serialize(model));
    setMount((m) => ({ id: (m?.id ?? 0) + 1, spec: fromDocument(json) as unknown as RenderSpec }));
  };

  const show = async (src: string) => {
    const result = await importDrawio(src);
    if (result.error && !result.diagram) {
      // Error path leaves the PREVIOUS diagram (and picker) fully intact.
      setStatus({ error: result.error });
      return result;
    }
    const all = result.pages ?? null;
    setPages(all);
    setPage(0);
    renderModel(result.diagram!);
    setStatus(statusOf(result.diagram!, result.warnings, all ? `page 1/${all.length} "${all[0]!.name}"` : ''));
    return result;
  };

  const pickPage = (i: number) => {
    const p = pages?.[i];
    if (!pages || !p || !p.diagram) return;
    setPage(i);
    renderModel(p.diagram);
    setStatus(statusOf(p.diagram, p.warnings, `page ${p.index + 1}/${pages.length} "${p.name}"`));
  };

  const onReady = (api: DiagramInstance) => {
    api.renderNow();
    api.fitView?.(40);
    if (!painted.current) { painted.current = true; markReady(); }
  };

  useEffect(() => {
    // Syntax-coloured XML; the textarea stays canonical beneath, so every
    // value read is untouched. Monaco's built-in xml tokenizer colours without workers.
    void mountCodeEditor(source.current, { language: 'xml' });
    void show(PLAIN_XML);
  }, []);

  const load = (xml: string) => { setText(xml); void show(xml); };

  return (
    <div className="di-page">
      <style>{CSS}</style>
      <div className="note">
        <b>.drawio (mxGraph XML) import</b> — the migration on-ramp from draw.io / diagrams.net.
        Reads plain <code>&lt;mxGraphModel&gt;</code> XML <i>and</i> the default compressed{' '}
        <code>&lt;mxfile&gt;</code> save (base64 → raw-deflate → URI-encoded). Vertices, styles,
        swimlane containers with real membership, edges with labels, arrow markers, <b>manual
        waypoints</b> (applied, not parked), edges that end <b>on a container</b>, and{' '}
        <b>multi-page files</b> (every page imports; pick one below) all map onto the engine's
        own models — and every construct the import drops is <b>named in a warning</b>, never
        lost in silence.
      </div>
      <div className="di-canvas">
        <div className="di-stage">
          {mount && (
            <GrafloriaDiagram key={mount.id} spec={mount.spec} onReady={onReady}
              style={{ position: 'absolute', inset: 0 }} />
          )}
        </div>
        <div className="di-side">
          <textarea ref={source} className="di-text" spellCheck={false} placeholder="Paste .drawio / mxGraph XML here…"
            value={text} onChange={(e) => setText(e.target.value)} />
          <div className="foot">
            <button onClick={() => load(PLAIN_XML)}>example: plain XML</button>
            <button onClick={async () => load(await compressedCopy(PLAIN_XML))}>example: compressed</button>
            <button onClick={() => load(MULTI_XML)}>example: 2 pages</button>
            <button onClick={() => void show(text)}>import</button>
            <select className="di-pagepick" hidden={!pages} value={String(page)} onChange={(e) => pickPage(Number(e.target.value))}>
              {pages?.map((p, i) => (
                <option key={i} value={String(i)} disabled={!!p.error}>{`page ${i + 1}: ${p.name}${p.error ? ' (unreadable)' : ''}`}</option>
              ))}
            </select>
          </div>
          <div className="di-status">
            {!status ? '—' : 'error' in status ? <span className="bad">{status.error}</span> : (
              <>
                <div>{status.head}</div>
                {status.warnings.map((w, i) => <span key={i} className="warn">{'⚠ ' + w}</span>)}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
