import"./chunk-NW3FDOIU.js";import"./chunk-GNYYGCQD.js";import{a as b,b as w,c as C,d as S,e as _,f as M,g as v}from"./chunk-ANWBURSO.js";import{b as x}from"./chunk-VGGYH54B.js";import{J as y,Ya as E}from"./chunk-D2HMHYIB.js";import"./chunk-L6MGGPNE.js";import{Da as s,Pa as h,_a as u,gb as a,hb as n,lb as c,ub as o,vb as f,xb as p,yb as l,zb as g}from"./chunk-B6LY5JTT.js";import"./chunk-PICCZXHG.js";import"./chunk-TSRGIXR5.js";var k={flowchart:`flowchart TD
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
  Bob-->>Alice: Hi Alice`},N=(()=>{class d{constructor(){this.type="flowchart",this.text=k.flowchart,this.nodes=[],this.edges=[],this.status="\u2014",this.bad=!1}renderText(m){let r=y(m);if(r.unsupported){this.bad=!0,this.status=`unsupported diagram type: ${r.unsupported}`,this.nodes=[],this.edges=[];return}this.bad=!1;let e=r.diagram;this.nodes=e.getNodes().map(t=>({id:t.id,label:t.getMetadata("label"),position:{x:t.position.x,y:t.position.y},size:{width:t.size.width,height:t.size.height},shape:t.getMetadata("shape"),style:t.style})),this.edges=e.getLinks().map(t=>({id:t.id,source:t.sourceNodeId,target:t.targetNodeId})),this.status=`${e.getNodes().length} nodes \xB7 ${e.getLinks().length} links`}load(){this.text=k[this.type],this.renderText(this.text)}apply(){this.renderText(this.text)}ngAfterViewInit(){this.renderText(this.text),E()}static{this.\u0275fac=function(r){return new(r||d)}}static{this.\u0275cmp=h({type:d,selectors:[["ng-component"]],decls:25,vars:7,consts:[[2,"display","flex","gap","10px","padding","8px 24px","border-bottom","1px solid rgba(127,127,127,.25)","align-items","center","flex-wrap","wrap"],[2,"font","inherit","color","inherit","background","transparent","border","1px solid rgba(127,127,127,.4)","border-radius","6px","padding","4px 10px",3,"ngModelChange","change","ngModel"],["value","flowchart"],["value","flowchart-fancy"],["value","er"],["value","class"],["value","state"],["value","sequence"],[2,"font","inherit","color","inherit","background","transparent","border","1px solid rgba(127,127,127,.4)","border-radius","6px","padding","4px 10px","cursor","pointer",3,"click"],[2,"margin-left","auto","font","12px ui-monospace,monospace","opacity",".8"],[2,"display","flex","height","calc(100vh - 105px)"],[2,"flex","1.4","min-width","0"],[2,"display","block","height","100%",3,"nodesChange","edgesChange","nodes","edges"],[2,"flex","1","min-width","0","border-left","1px solid rgba(127,127,127,.25)"],["spellcheck","false",2,"width","100%","height","100%","box-sizing","border-box","border","0","padding","10px 14px","font","12px/1.5 ui-monospace,Menlo,monospace","resize","none","color","inherit","background","transparent",3,"ngModelChange","ngModel"]],template:function(r,e){r&1&&(a(0,"div",0)(1,"label"),o(2,"diagram "),a(3,"select",1),g("ngModelChange",function(i){return l(e.type,i)||(e.type=i),i}),c("change",function(){return e.load()}),a(4,"option",2),o(5,"Flowchart (shapes + style)"),n(),a(6,"option",3),o(7,"Flowchart (subgraph + status)"),n(),a(8,"option",4),o(9,"Entity-Relationship"),n(),a(10,"option",5),o(11,"Class diagram"),n(),a(12,"option",6),o(13,"State diagram"),n(),a(14,"option",7),o(15,"Sequence (unsupported)"),n()()(),a(16,"button",8),c("click",function(){return e.apply()}),o(17,"apply text \u2192 diagram"),n(),a(18,"span",9),o(19),n()(),a(20,"div",10)(21,"div",11)(22,"grafloria-diagram-canvas",12),g("nodesChange",function(i){return l(e.nodes,i)||(e.nodes=i),i})("edgesChange",function(i){return l(e.edges,i)||(e.edges=i),i}),n()(),a(23,"div",13)(24,"textarea",14),g("ngModelChange",function(i){return l(e.text,i)||(e.text=i),i}),n()()()),r&2&&(s(3),p("ngModel",e.type),s(15),u("color",e.bad?"#c0392b":"inherit"),s(),f(e.status),s(3),p("nodes",e.nodes)("edges",e.edges),s(2),p("ngModel",e.text))},dependencies:[x,v,_,M,b,S,w,C],encapsulation:2})}}return d})();export{N as MermaidViewerComponent};
