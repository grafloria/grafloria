import { AfterViewInit, Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DiagramCanvasComponent } from '@grafloria/renderer-angular';
import { importDiagramText } from '@grafloria/element';
import { markReady } from '../demo-ready';

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

@Component({
  standalone: true,
  imports: [DiagramCanvasComponent, FormsModule],
  template: `
    <div style="display:flex;gap:10px;padding:8px 24px;border-bottom:1px solid rgba(127,127,127,.25);align-items:center;flex-wrap:wrap">
      <label>diagram
        <select [(ngModel)]="type" (change)="load()" style="font:inherit;color:inherit;background:transparent;border:1px solid rgba(127,127,127,.4);border-radius:6px;padding:4px 10px">
          <option value="flowchart">Flowchart (shapes + style)</option>
          <option value="flowchart-fancy">Flowchart (subgraph + status)</option>
          <option value="er">Entity-Relationship</option>
          <option value="class">Class diagram</option>
          <option value="state">State diagram</option>
          <option value="sequence">Sequence (unsupported)</option>
        </select>
      </label>
      <button (click)="apply()" style="font:inherit;color:inherit;background:transparent;border:1px solid rgba(127,127,127,.4);border-radius:6px;padding:4px 10px;cursor:pointer">apply text → diagram</button>
      <span [style.color]="bad ? '#c0392b' : 'inherit'" style="margin-left:auto;font:12px ui-monospace,monospace;opacity:.8">{{ status }}</span>
    </div>
    <div style="display:flex;height:calc(100vh - 105px)">
      <div style="flex:1.4;min-width:0">
        <grafloria-diagram-canvas [(nodes)]="nodes" [(edges)]="edges" style="display:block; height:100%" />
      </div>
      <div style="flex:1;min-width:0;border-left:1px solid rgba(127,127,127,.25)">
        <textarea [(ngModel)]="text" spellcheck="false"
          style="width:100%;height:100%;box-sizing:border-box;border:0;padding:10px 14px;font:12px/1.5 ui-monospace,Menlo,monospace;resize:none;color:inherit;background:transparent"></textarea>
      </div>
    </div>
  `,
})
export class MermaidViewerComponent implements AfterViewInit {
  type = 'flowchart';
  text = EXAMPLES['flowchart'];
  nodes: unknown[] = [];
  edges: unknown[] = [];
  status = '—';
  bad = false;

  private renderText(text: string) {
    const r = importDiagramText(text) as any;
    if (r.unsupported) {
      this.bad = true;
      this.status = `unsupported diagram type: ${r.unsupported}`;
      this.nodes = [];
      this.edges = [];
      return;
    }
    this.bad = false;
    const model = r.diagram;
    this.nodes = model.getNodes().map((n: any) => ({
      id: n.id, label: n.getMetadata('label'),
      position: { x: n.position.x, y: n.position.y },
      size: { width: n.size.width, height: n.size.height },
      shape: n.getMetadata('shape'), style: n.style,
    }));
    this.edges = model.getLinks().map((l: any) => ({ id: l.id, source: l.sourceNodeId, target: l.targetNodeId }));
    this.status = `${model.getNodes().length} nodes · ${model.getLinks().length} links`;
  }

  load() { this.text = EXAMPLES[this.type]; this.renderText(this.text); }
  apply() { this.renderText(this.text); }

  ngAfterViewInit() {
    this.renderText(this.text);
    markReady();
  }
}
