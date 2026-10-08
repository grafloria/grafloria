import{a as N}from"./chunk-Y27IVM25.js";import{a as V,b as E,c as k,d as D,e as T,f as L,g as W}from"./chunk-L5KG6PLN.js";import"./chunk-IYX3DZYG.js";import{b as v}from"./chunk-DF4QST4X.js";import{S as M,pb as A}from"./chunk-YTTOJJNE.js";import"./chunk-4XGBY5JY.js";import"./chunk-U3EUL5X4.js";import{Db as h,Eb as g,Fb as u,Ga as d,Na as w,Sa as y,X as s,Y as l,bb as x,kb as a,lb as r,ob as C,pb as f,vb as b,wb as _,yb as o,zb as S}from"./chunk-ZIFWXPMG.js";import"./chunk-WWX6BADO.js";var B=["source"],R={flowchart:`flowchart TD
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
  Bob-->>Alice: Hi Alice`},X=(()=>{class m{constructor(){this.source=w("source"),this.type="flowchart",this.text=R.flowchart,this.nodes=[],this.edges=[],this.status="\u2014",this.bad=!1}renderText(c){let n=M(c);if(n.unsupported){this.bad=!0,this.status=`unsupported diagram type: ${n.unsupported}`,this.nodes=[],this.edges=[];return}this.bad=!1;let e=n.diagram;this.nodes=e.getNodes().map(t=>({id:t.id,label:t.getMetadata("label"),position:{x:t.position.x,y:t.position.y},size:{width:t.size.width,height:t.size.height},shape:t.getMetadata("shape"),style:t.style})),this.edges=e.getLinks().map(t=>({id:t.id,source:t.sourceNodeId,target:t.targetNodeId})),this.status=`${e.getNodes().length} nodes \xB7 ${e.getLinks().length} links`}load(){this.text=R[this.type],this.renderText(this.text)}apply(){this.renderText(this.text)}ngAfterViewInit(){this.renderText(this.text),N(this.source()?.nativeElement,{language:"mermaid"}),A()}static{this.\u0275fac=function(n){return new(n||m)}}static{this.\u0275cmp=y({type:m,selectors:[["ng-component"]],viewQuery:function(n,e){n&1&&b(e.source,B,5),n&2&&_()},decls:26,vars:7,consts:[["source",""],[2,"display","flex","gap","10px","padding","8px 24px","border-bottom","1px solid rgba(127,127,127,.25)","align-items","center","flex-wrap","wrap"],[2,"font","inherit","color","inherit","background","transparent","border","1px solid rgba(127,127,127,.4)","border-radius","6px","padding","4px 10px",3,"ngModelChange","change","ngModel"],["value","flowchart"],["value","flowchart-fancy"],["value","er"],["value","class"],["value","state"],["value","sequence"],[2,"font","inherit","color","inherit","background","transparent","border","1px solid rgba(127,127,127,.4)","border-radius","6px","padding","4px 10px","cursor","pointer",3,"click"],[2,"margin-left","auto","font","12px ui-monospace,monospace","opacity",".8"],[2,"display","flex","height","calc(100vh - 105px)"],[2,"flex","1.4","min-width","0"],[2,"display","block","height","100%",3,"nodesChange","edgesChange","nodes","edges"],[2,"flex","1","min-width","0","border-left","1px solid rgba(127,127,127,.25)"],["spellcheck","false",2,"width","100%","height","100%","box-sizing","border-box","border","0","padding","10px 14px","font","12px/1.5 ui-monospace,Menlo,monospace","resize","none","color","inherit","background","transparent",3,"ngModelChange","ngModel"]],template:function(n,e){if(n&1){let t=C();a(0,"div",1)(1,"label"),o(2,"diagram "),a(3,"select",2),u("ngModelChange",function(i){return s(t),g(e.type,i)||(e.type=i),l(i)}),f("change",function(){return s(t),l(e.load())}),a(4,"option",3),o(5,"Flowchart (shapes + style)"),r(),a(6,"option",4),o(7,"Flowchart (subgraph + status)"),r(),a(8,"option",5),o(9,"Entity-Relationship"),r(),a(10,"option",6),o(11,"Class diagram"),r(),a(12,"option",7),o(13,"State diagram"),r(),a(14,"option",8),o(15,"Sequence (unsupported)"),r()()(),a(16,"button",9),f("click",function(){return s(t),l(e.apply())}),o(17,"apply text \u2192 diagram"),r(),a(18,"span",10),o(19),r()(),a(20,"div",11)(21,"div",12)(22,"grafloria-diagram-canvas",13),u("nodesChange",function(i){return s(t),g(e.nodes,i)||(e.nodes=i),l(i)})("edgesChange",function(i){return s(t),g(e.edges,i)||(e.edges=i),l(i)}),r()(),a(23,"div",14)(24,"textarea",15,0),u("ngModelChange",function(i){return s(t),g(e.text,i)||(e.text=i),l(i)}),r()()()}n&2&&(d(3),h("ngModel",e.type),d(15),x("color",e.bad?"#c0392b":"inherit"),d(),S(e.status),d(3),h("nodes",e.nodes)("edges",e.edges),d(2),h("ngModel",e.text))},dependencies:[v,W,T,L,V,D,E,k],encapsulation:2})}}return m})();export{X as MermaidViewerComponent};
