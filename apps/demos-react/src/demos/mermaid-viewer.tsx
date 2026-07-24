import { useEffect, useState } from 'react';
import { GrafloriaFlow } from '@grafloria/react';
import { importDiagramText } from '@grafloria/element';
import { markReady } from '../ready';

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

export default function MermaidViewerDemo() {
  const [type, setType] = useState('flowchart');
  const [text, setText] = useState(EXAMPLES['flowchart']);
  const [nodes, setNodes] = useState<unknown[]>([]);
  const [edges, setEdges] = useState<unknown[]>([]);
  const [status, setStatus] = useState('—');
  const [bad, setBad] = useState(false);

  const renderText = (src: string) => {
    const r = importDiagramText(src) as any;
    if (r.unsupported) {
      setBad(true);
      setStatus(`unsupported diagram type: ${r.unsupported}`);
      setNodes([]);
      setEdges([]);
      return;
    }
    setBad(false);
    const model = r.diagram;
    setNodes(model.getNodes().map((n: any) => ({
      id: n.id, label: n.getMetadata('label'),
      position: { x: n.position.x, y: n.position.y },
      size: { width: n.size.width, height: n.size.height },
      shape: n.getMetadata('shape'), style: n.style,
    })));
    setEdges(model.getLinks().map((l: any) => ({ id: l.id, source: l.sourceNodeId, target: l.targetNodeId })));
    setStatus(`${model.getNodes().length} nodes · ${model.getLinks().length} links`);
  };

  useEffect(() => { renderText(EXAMPLES['flowchart']); markReady(); }, []);

  const load = (t: string) => { setType(t); const src = EXAMPLES[t]; setText(src); renderText(src); };
  const apply = () => renderText(text);

  const ctl = { font: 'inherit', color: 'inherit', background: 'transparent', border: '1px solid rgba(127,127,127,.4)', borderRadius: 6, padding: '4px 10px' } as const;
  return (
    <div>
      <div style={{ display: 'flex', gap: 10, padding: '8px 24px', borderBottom: '1px solid rgba(127,127,127,.25)', alignItems: 'center', flexWrap: 'wrap' }}>
        <label>diagram{' '}
          <select value={type} onChange={(e) => load(e.target.value)} style={ctl}>
            <option value="flowchart">Flowchart (shapes + style)</option>
            <option value="flowchart-fancy">Flowchart (subgraph + status)</option>
            <option value="er">Entity-Relationship</option>
            <option value="class">Class diagram</option>
            <option value="state">State diagram</option>
            <option value="sequence">Sequence (unsupported)</option>
          </select>
        </label>
        <button onClick={apply} style={{ ...ctl, cursor: 'pointer' }}>apply text → diagram</button>
        <span style={{ marginLeft: 'auto', font: '12px ui-monospace,monospace', opacity: .8, color: bad ? '#c0392b' : 'inherit' }}>{status}</span>
      </div>
      <div style={{ display: 'flex', height: 'calc(100vh - 105px)' }}>
        <div style={{ flex: 1.4, minWidth: 0 }}>
          <GrafloriaFlow nodes={nodes as never} edges={edges as never} style={{ display: 'block', height: '100%' }} />
        </div>
        <div style={{ flex: 1, minWidth: 0, borderLeft: '1px solid rgba(127,127,127,.25)' }}>
          <textarea value={text} onChange={(e) => setText(e.target.value)} spellCheck={false}
            style={{ width: '100%', height: '100%', boxSizing: 'border-box', border: 0, padding: '10px 14px', font: '12px/1.5 ui-monospace,Menlo,monospace', resize: 'none', color: 'inherit', background: 'transparent' }} />
        </div>
      </div>
    </div>
  );
}
