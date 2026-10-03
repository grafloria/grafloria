import { component$, $, useSignal, useVisibleTask$ } from '@builder.io/qwik';
import { GrafloriaFlow, type NodeSpec, type EdgeSpec } from '@grafloria/qwik';
import { importDiagramText } from '@grafloria/element';
import { markReady } from '../ready';
import { mountCodeEditor } from '../code-editor';

/** Mermaid viewer: paste Mermaid text and see it rendered. importDiagramText()
 *  parses the source into a model; the canvas renders the reconciled spec.
 *  Unsupported diagram types report their reason rather than throwing. */
const EXAMPLES: Record<string, string> = {
  flowchart: `flowchart TD
  Start([Start]) --> Load[(Fetch data)]
  Load --> Check{Valid?}
  Check -->|yes| Save[[Persist]]
  Check -->|no| Start
  Save --> Done((Done))
  style Start fill:#c8e6c9,stroke:#2e7d32
  style Done fill:#bbdefb,stroke:#1565c0
  classDef warn fill:#ffe0b2,stroke:#e65100
  class Check warn`,
  'flowchart-fancy': `flowchart LR
  subgraph pipeline
    Extract --> Transform --> Load
  end
  Load --> Warehouse[(Warehouse)]
  Trigger --> Extract`,
  er: `erDiagram
  CUSTOMER ||--o{ ORDER : places
  ORDER ||--|{ LINE_ITEM : contains
  CUSTOMER {
    string name
    string email
  }`,
  class: `classDiagram
  class Animal {
    +int age
    +String name
    +bark() void
  }
  class Dog
  class Cat
  Animal <|-- Dog
  Animal <|-- Cat`,
  state: `stateDiagram-v2
  [*] --> Still
  Still --> Moving
  Moving --> Still
  Moving --> Crash
  Crash --> [*]`,
  sequence: `sequenceDiagram
  Alice->>Bob: Hello Bob
  Bob-->>Alice: Hi Alice`,
};

type Parsed = { nodes: NodeSpec[]; edges: EdgeSpec[]; status: string; bad: boolean };

/** Parse Mermaid text into plain specs (signals hold data, never models). */
function parse(src: string): Parsed {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = importDiagramText(src) as any;
  if (r.unsupported) {
    return { nodes: [], edges: [], status: `unsupported diagram type: ${r.unsupported}`, bad: true };
  }
  const model = r.diagram;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nodes = model.getNodes().map((n: any) => ({
    id: n.id, label: n.getMetadata('label'),
    position: { x: n.position.x, y: n.position.y },
    size: { width: n.size.width, height: n.size.height },
    shape: n.getMetadata('shape'), style: n.style,
  }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const edges = model.getLinks().map((l: any) => ({ id: l.id, source: l.sourceNodeId, target: l.targetNodeId }));
  // JSON round-trip: the specs go into Qwik signals, which only hold plain data.
  return {
    nodes: JSON.parse(JSON.stringify(nodes)),
    edges,
    status: `${model.getNodes().length} nodes · ${model.getLinks().length} links`,
    bad: false,
  };
}

const ctl = { font: 'inherit', color: 'inherit', background: 'transparent', border: '1px solid rgba(127,127,127,.4)', borderRadius: '6px', padding: '4px 10px' };

export default component$(() => {
  // The source reads as Mermaid: the gallery's editor colours it, mounted in
  // an empty host (Qwik leaves a childless element's inside alone).
  const source = useSignal<HTMLTextAreaElement>();
  const editorHost = useSignal<HTMLDivElement>();
  useVisibleTask$(() => { void mountCodeEditor(source.value, { language: 'mermaid', host: editorHost.value }); });
  const type = useSignal('flowchart');
  const text = useSignal(EXAMPLES['flowchart']!);
  const parsed = useSignal<Parsed>(() => parse(EXAMPLES['flowchart']!));

  return (
    <div>
      <div style={{ display: 'flex', gap: '10px', padding: '8px 24px', borderBottom: '1px solid rgba(127,127,127,.25)', alignItems: 'center', flexWrap: 'wrap' }}>
        <label>diagram{' '}
          <select value={type.value} style={ctl} onChange$={(_, el) => {
            type.value = el.value;
            const src = EXAMPLES[el.value]!;
            text.value = src;
            parsed.value = parse(src);
          }}>
            <option value="flowchart">Flowchart (shapes + style)</option>
            <option value="flowchart-fancy">Flowchart (subgraph + status)</option>
            <option value="er">Entity-Relationship</option>
            <option value="class">Class diagram</option>
            <option value="state">State diagram</option>
            <option value="sequence">Sequence (unsupported)</option>
          </select>
        </label>
        <button style={{ ...ctl, cursor: 'pointer' }} onClick$={() => { parsed.value = parse(text.value); }}>apply text → diagram</button>
        <span style={{ marginLeft: 'auto', font: '12px ui-monospace,monospace', opacity: '.8', color: parsed.value.bad ? '#c0392b' : 'inherit' }}>{parsed.value.status}</span>
      </div>
      <div style={{ display: 'flex', height: 'calc(100vh - 105px)' }}>
        <div style={{ flex: '1.4', minWidth: '0' }}>
          <GrafloriaFlow nodes={parsed.value.nodes} edges={parsed.value.edges} style={{ display: 'block', height: '100%' }}
            onInit$={$(() => markReady())} />
        </div>
        <div style={{ flex: '1', minWidth: '0', borderLeft: '1px solid rgba(127,127,127,.25)' }}>
          <div ref={editorHost} style={{ display: 'none', height: '100%' }} />
          <textarea ref={source} value={text.value} onInput$={(_, el) => { text.value = el.value; }} spellcheck={false}
            style={{ width: '100%', height: '100%', boxSizing: 'border-box', border: '0', padding: '10px 14px', font: '12px/1.5 ui-monospace,Menlo,monospace', resize: 'none', color: 'inherit', background: 'transparent' }} />
        </div>
      </div>
    </div>
  );
});
