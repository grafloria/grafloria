import{_ as i}from"./preload-helper-D57DdDQb.js";import{y as l,L as n}from"./core.min-C7M5tFMw.js";import"./index-YJHSr4jy.js";import{w as d}from"./create-diagram-BM1CvY1Y.js";import"./preloader-D7tuiBjF.js";import"./index-B7GSxwA6.js";import"./default-dark-theme-CK9ZvHhX.js";import"./LinkModel-CNp_BZcH.js";import"./disposable-CKHTf1hZ.js";const _={flowchart:`flowchart TD
  Start([Start]) --> Load[(Fetch data)]
  Load --> Check{Valid?}
  Check -->|yes| Save[[Persist]]
  Check -->|no| Start
  Save --> Done((Done))
  style Start fill:#c8e6c9,stroke:#2e7d32
  style Done fill:#bbdefb,stroke:#1565c0
  classDef warn fill:#ffe0b2,stroke:#e65100
  class Check warn`,"flowchart-fancy":`flowchart LR
  subgraph pipeline
    Extract --> Transform --> Load
  end
  Load --> Warehouse[(Warehouse)]
  Trigger --> Extract`,er:`erDiagram
  CUSTOMER ||--o{ ORDER : places
  ORDER ||--|{ LINE_ITEM : contains
  CUSTOMER {
    string name
    string email
  }`,class:`classDiagram
  class Animal {
    +int age
    +String name
    +bark() void
  }
  class Dog
  class Cat
  Animal <|-- Dog
  Animal <|-- Cat`,state:`stateDiagram-v2
  [*] --> Still
  Still --> Moving
  Moving --> Still
  Moving --> Crash
  Crash --> [*]`,sequence:`sequenceDiagram
  Alice->>Bob: Hello Bob
  Bob-->>Alice: Hi Alice`};function D(s){const a=d(s);if(a.unsupported)return{nodes:[],edges:[],status:`unsupported diagram type: ${a.unsupported}`,bad:!0};const t=a.diagram,r=t.getNodes().map(e=>({id:e.id,label:e.getMetadata("label"),position:{x:e.position.x,y:e.position.y},size:{width:e.size.width,height:e.size.height},shape:e.getMetadata("shape"),style:e.style})),o=t.getLinks().map(e=>({id:e.id,source:e.sourceNodeId,target:e.targetNodeId}));return{nodes:JSON.parse(JSON.stringify(r)),edges:o,status:`${t.getNodes().length} nodes · ${t.getLinks().length} links`,bad:!1}}const E={font:"inherit",color:"inherit",background:"transparent",border:"1px solid rgba(127,127,127,.4)",borderRadius:"6px",padding:"4px 10px"},k=l(n(()=>i(()=>import("./mermaid-viewer.tsx_mermaid_viewer_component_YMkPqhUVcsg-U5zcLssf.js"),[],import.meta.url),"s_YMkPqhUVcsg"));export{_ as _auto_EXAMPLES,E as _auto_ctl,D as _auto_parse,k as default};
