import{b as L}from"./chunk-Y27IVM25.js";import{a as U}from"./chunk-IQJZLHIX.js";import"./chunk-ETJUSDOS.js";import{S as V,jb as W}from"./chunk-LUZMMOHL.js";import{$a as _,Ga as p,Na as w,Ob as N,Sa as D,X as y,Y as x,ab as M,cb as A,hb as O,ib as R,jb as s,ka as H,kb as n,lb as T,nb as k,ob as v,pb as S,ub as E,vb as z,xb as g,yb as I}from"./chunk-4UTUPI3Y.js";import{a as f}from"./chunk-WWX6BADO.js";var Y=["canvas"],q=["src"],Q=(o,r)=>r[0];function K(o,r){if(o&1){let e=k();s(0,"button",9),v("click",function(){let a=y(e).$implicit,c=S();return x(c.show(a[0]))}),g(1),n()}if(o&2){let e=r.$implicit,t=S();A("on",t.source()===e[0]),_("data-src",e[0])("aria-pressed",t.source()===e[0]),p(),I(e[1])}}var $="#1f2328",C="#5f6b7a",b="#6b7785",F="#1a7f37",u="#cf222e",X="#2a7a86",j={fill:"#ffffff",stroke:"#d0d5dd",borderRadius:4,shadow:!1,color:$,fontSize:13},i=(o,r,e,t,a,c,P,m={})=>({id:o,position:{x:r,y:e},size:{width:t,height:a},label:c,sublabel:P,style:f(f({},j),m)}),d=o=>({text:o,fontSize:11,color:C}),l=(o,r={})=>f({stroke:o,strokeWidth:1.5,arrowHead:{type:"arrow",size:7,filled:!0,color:o}},r),h={fontSize:11,color:C},Z={groups:[{id:"hp",label:"HEALTHPAY'S SIDE \xB7 CARDS ARE TYPED HERE",children:["page","wallets"],bounds:{x:380,y:36,width:566,height:138},style:{fill:"#e9f2f3",stroke:"#7aabb3",strokeDasharray:"5 4",color:X,fontWeight:"700",letterSpacing:1}},{id:"ours",label:"OUR SIDE \xB7 MUST NEVER SEE A CARD",children:["api","db"],bounds:{x:380,y:236,width:566,height:150},labelPlacement:"bottom-left",style:{fill:"#f3f4f6",stroke:"#d7dbe0",color:"#4b5563",fontWeight:"700",letterSpacing:1}}],nodes:[i("customer",20,78,150,292,"Customer",d("phone or browser"),{borderRadius:6}),i("page",410,78,210,72,"HealthPay payment page",d("the card is typed here")),i("wallets",712,78,210,72,"HealthPay wallets",d("hold the customer's money")),i("api",410,264,210,72,"Our API",{text:"sherkety-erp-api",fontFamily:"mono",fontSize:11,color:C}),i("db",712,264,210,72,"Our database",d("keys, ledger, bank numbers")),i("fake",20,398,150,60,"Fake card page",d("not HealthPay's"),{fill:"#fdecec",stroke:"#e5a0a0"}),{id:"note",position:{x:186,y:421},size:{width:360,height:24},shape:{type:"text"},label:"if someone swaps the link, the customer lands here (M1)",style:{color:u,fontWeight:"700",fontSize:11}}],edges:[{source:"customer",target:"page",sourceHandle:"right@36",targetHandle:"left@36",type:"orthogonal",style:l(F),label:"card number and CVV",labelPlacement:"above",labelStyle:{color:F,fontWeight:"700",fontSize:11}},{source:"page",target:"wallets",sourceHandle:"right@36",targetHandle:"left@36",type:"orthogonal",style:l(b),label:"adds money",labelPlacement:"above",labelStyle:h},{source:"api",target:"wallets",sourceHandle:"top@170",targetHandle:"bottom@138",type:"orthogonal",waypoints:[{x:580,y:204},{x:850,y:204}],style:l(b),label:"asks HealthPay to move money",labelPlacement:"above",labelStyle:h},{source:"api",target:"db",sourceHandle:"right@36",targetHandle:"left@36",type:"orthogonal",style:l(b),label:"saves keys",labelPlacement:"above",labelStyle:h},{source:"api",target:"customer",sourceHandle:"left@24",targetHandle:"right@210",type:"orthogonal",style:l(b),label:"sends the payment link",labelPlacement:"above",labelStyle:h},{source:"customer",target:"api",sourceHandle:"right@240",targetHandle:"left@54",type:"orthogonal",style:l(u,{strokeDasharray:"5 4"}),label:`card typed as a
"bank account" (H1)`,labelPlacement:"below",labelStyle:{color:u,fontWeight:"700",fontSize:11}},{source:"customer",target:"fake",sourceHandle:"bottom@75",targetHandle:"top@75",type:"orthogonal",style:l(u,{strokeDasharray:"5 4"})}]},J=`// The diagram, as a render() spec. Every look is a field:
//   sublabel \xB7 shape 'text' \xB7 groups (zones) \xB7 'right@36' anchors
//   labelPlacement / labelStyle \xB7 waypoints \xB7 style.shadow: false
const INK = '#1f2328', MUTED = '#5f6b7a', LINE = '#6b7785', GOOD = '#1a7f37', BAD = '#cf222e', ACC = '#2a7a86';
const flat = { fill: '#ffffff', stroke: '#d0d5dd', borderRadius: 4, shadow: false, color: INK, fontSize: 13 };
const box = (id, x, y, w, h, label, sublabel, style = {}) =>
  ({ id, position: { x, y }, size: { width: w, height: h }, label, sublabel, style: { ...flat, ...style } });
const sub = (text) => ({ text, fontSize: 11, color: MUTED });
const line = (c, extra = {}) => ({ stroke: c, strokeWidth: 1.5, arrowHead: { type: 'arrow', size: 7, filled: true, color: c }, ...extra });
const small = { fontSize: 11, color: MUTED };

export default {
  groups: [
    { id: 'hp', label: "HEALTHPAY'S SIDE \xB7 CARDS ARE TYPED HERE", children: ['page', 'wallets'],
      bounds: { x: 380, y: 36, width: 566, height: 138 },
      style: { fill: '#e9f2f3', stroke: '#7aabb3', strokeDasharray: '5 4', color: ACC, fontWeight: '700', letterSpacing: 1 } },
    { id: 'ours', label: 'OUR SIDE \xB7 MUST NEVER SEE A CARD', children: ['api', 'db'],
      bounds: { x: 380, y: 236, width: 566, height: 150 }, labelPlacement: 'bottom-left',
      style: { fill: '#f3f4f6', stroke: '#d7dbe0', color: '#4b5563', fontWeight: '700', letterSpacing: 1 } },
  ],
  nodes: [
    box('customer', 20, 78, 150, 292, 'Customer', sub('phone or browser'), { borderRadius: 6 }),
    box('page', 410, 78, 210, 72, 'HealthPay payment page', sub('the card is typed here')),
    box('wallets', 712, 78, 210, 72, 'HealthPay wallets', sub("hold the customer's money")),
    box('api', 410, 264, 210, 72, 'Our API', { text: 'sherkety-erp-api', fontFamily: 'mono', fontSize: 11, color: MUTED }),
    box('db', 712, 264, 210, 72, 'Our database', sub('keys, ledger, bank numbers')),
    box('fake', 20, 398, 150, 60, 'Fake card page', sub("not HealthPay's"), { fill: '#fdecec', stroke: '#e5a0a0' }),
    { id: 'note', position: { x: 186, y: 421 }, size: { width: 360, height: 24 }, shape: { type: 'text' },
      label: 'if someone swaps the link, the customer lands here (M1)', style: { color: BAD, fontWeight: '700', fontSize: 11 } },
  ],
  edges: [
    { source: 'customer', target: 'page', sourceHandle: 'right@36', targetHandle: 'left@36', type: 'orthogonal', style: line(GOOD),
      label: 'card number and CVV', labelPlacement: 'above', labelStyle: { color: GOOD, fontWeight: '700', fontSize: 11 } },
    { source: 'page', target: 'wallets', sourceHandle: 'right@36', targetHandle: 'left@36', type: 'orthogonal', style: line(LINE),
      label: 'adds money', labelPlacement: 'above', labelStyle: small },
    { source: 'api', target: 'wallets', sourceHandle: 'top@170', targetHandle: 'bottom@138', type: 'orthogonal',
      waypoints: [{ x: 580, y: 204 }, { x: 850, y: 204 }], style: line(LINE),
      label: 'asks HealthPay to move money', labelPlacement: 'above', labelStyle: small },
    { source: 'api', target: 'db', sourceHandle: 'right@36', targetHandle: 'left@36', type: 'orthogonal', style: line(LINE),
      label: 'saves keys', labelPlacement: 'above', labelStyle: small },
    { source: 'api', target: 'customer', sourceHandle: 'left@24', targetHandle: 'right@210', type: 'orthogonal', style: line(LINE),
      label: 'sends the payment link', labelPlacement: 'above', labelStyle: small },
    { source: 'customer', target: 'api', sourceHandle: 'right@240', targetHandle: 'left@54', type: 'orthogonal',
      style: line(BAD, { strokeDasharray: '5 4' }), label: 'card typed as a\\n"bank account" (H1)',
      labelPlacement: 'below', labelStyle: { color: BAD, fontWeight: '700', fontSize: 11 } },
    { source: 'customer', target: 'fake', sourceHandle: 'bottom@75', targetHandle: 'top@75', type: 'orthogonal',
      style: line(BAD, { strokeDasharray: '5 4' }) },
  ],
};`,B=`flowchart LR
  customer["<b>Customer</b><br/>phone or browser"]
  subgraph hp["HEALTHPAY'S SIDE \xB7 CARDS ARE TYPED HERE"]
    page["<b>HealthPay payment page</b><br/>the card is typed here"]
    wallets["<b>HealthPay wallets</b><br/>hold the customer's money"]
  end
  subgraph ours["OUR SIDE \xB7 MUST NEVER SEE A CARD"]
    api["<b>Our API</b><br/><code>sherkety-erp-api</code>"]
    db["<b>Our database</b><br/>keys, ledger, bank numbers"]
  end
  fake["<b>Fake card page</b><br/>not HealthPay's"]:::bad
  note@{ shape: text, label: "if someone swaps the link, the customer lands here (M1)" }
  customer -->|card number and CVV| page
  page -->|adds money| wallets
  api -->|asks HealthPay to move money| wallets
  api -->|saves keys| db
  api -->|sends the payment link| customer
  customer -.->|"card typed as a<br/>#quot;bank account#quot; (H1)"| api
  customer -.-> fake
  classDef box fill:#ffffff,stroke:#d0d5dd,shadow:none,rx:4,font-size:13px
  classDef bad fill:#fdecec,stroke:#e5a0a0,shadow:none,rx:4,font-size:13px
  class customer,page,wallets,api,db box
  style note color:#cf222e,font-weight:bold,font-size:11px
  style hp fill:#e9f2f3,stroke:#7aabb3,stroke-dasharray:5 4,color:#2a7a86,font-weight:bold,letter-spacing:1px
  style ours fill:#f3f4f6,stroke:#d7dbe0,color:#4b5563,font-weight:bold,letter-spacing:1px
  linkStyle default interpolate stepBefore
  linkStyle 0 stroke:#1a7f37,color:#1a7f37,font-weight:bold,font-size:11px,stroke-width:1.5px
  linkStyle 1,2,3,4 stroke:#6b7785,color:#5f6b7a,font-size:11px,stroke-width:1.5px
  linkStyle 5,6 stroke:#cf222e,color:#cf222e,font-weight:bold,font-size:11px,stroke-width:1.5px
  %% Grafloria layout \u2014 comments any other Mermaid renderer ignores
  %%grafloria:at customer 20,78 150x292
  %%grafloria:at page 410,78 210x72
  %%grafloria:at wallets 712,78 210x72
  %%grafloria:at api 410,264 210x72
  %%grafloria:at db 712,264 210x72
  %%grafloria:at fake 20,398 150x60
  %%grafloria:at note 186,421 360x24
  %%grafloria:at hp 380,36 566x138
  %%grafloria:at ours 380,236 566x150
  %%grafloria:group ours caption:bottom-left
  %%grafloria:edge * * label:above
  %%grafloria:edge customer page from:right@36, to:left@36
  %%grafloria:edge page wallets from:right@36, to:left@36
  %%grafloria:edge api wallets from:top@170, to:bottom@138, via:580 204 850 204
  %%grafloria:edge api db from:right@36, to:left@36
  %%grafloria:edge api customer from:left@24, to:right@210
  %%grafloria:edge customer api from:right@240, to:left@54, label:below
  %%grafloria:edge customer fake from:bottom@75, to:top@75`,ee=[["native","the native API"],["mermaid","Grafloria Mermaid"]];function G(o,r){let e;if(r==="mermaid"){let t=V(B).diagram;e={nodes:t.getNodes(),edges:t.getLinks(),groups:t.getGroups()}}else e=structuredClone(Z);o.setEdges([]),o.setGroups([]),o.setNodes([]),o.setNodes(e.nodes),o.setGroups(e.groups),o.setEdges(e.edges),o.renderNow()}var ie=(()=>{class o{constructor(){this.sources=ee,this.spec={nodes:[],edges:[]},this.options={zoom:1},this.source=H("native"),this.canvas=w.required("canvas"),this.src=w("src"),N(()=>{let e=this.source(),t=this.src()?.nativeElement;t&&(t.textContent=e==="mermaid"?B:J,L(t,e==="mermaid"?"mermaid":"javascript"))})}onReady(e){this.api=e,e.getEngine().setInteractionConfig({portVisibility:"hidden"}),G(e,"native");let t=this.canvas().nativeElement.getBoundingClientRect();e.viewport.setZoom(1),e.viewport.setViewport({x:-Math.max(0,(t.width-960)/2),y:-Math.max(0,(t.height-480)/2),width:t.width,height:t.height}),e.renderNow(),W()}show(e){this.api&&G(this.api,e),this.source.set(e)}static{this.\u0275fac=function(t){return new(t||o)}}static{this.\u0275cmp=D({type:o,selectors:[["ng-component"]],viewQuery:function(t,a){t&1&&(E(a.canvas,Y,5),E(a.src,q,5)),t&2&&z(2)},decls:13,vars:2,consts:[["canvas",""],["src",""],["id","ai-bar"],["id","ai-source","role","group","aria-label","Drawn from",1,"seg"],["type","button",3,"on"],["id","ai-note"],["id","ai-canvas"],[2,"display","block","height","100%",3,"ready","spec","options"],["id","ai-src"],["type","button",3,"click"]],template:function(t,a){if(t&1){let c=k();s(0,"div",2)(1,"span"),g(2,"Drawn from"),n(),s(3,"span",3),O(4,K,2,5,"button",4,Q),n(),s(6,"span",5),g(7,"The same picture from either source. Its text is below."),n()(),s(8,"div",6,0)(10,"grafloria-diagram",7),v("ready",function(m){return y(c),x(a.onReady(m))}),n()(),T(11,"pre",8,1)}t&2&&(p(4),R(a.sources),p(6),M("spec",a.spec)("options",a.options))},dependencies:[U],styles:["#ai-bar[_ngcontent-%COMP%]{display:flex;flex-wrap:wrap;align-items:center;gap:10px;padding:8px 12px;border-bottom:1px solid var(--gf-line, #e5e7eb);background:#fff;font:500 12.5px ui-sans-serif,system-ui,sans-serif;color:var(--gf-ink, #111827)}#ai-bar[_ngcontent-%COMP%]   .seg[_ngcontent-%COMP%]{display:inline-flex;border:1px solid var(--gf-line, #e5e7eb);border-radius:7px;overflow:hidden}#ai-bar[_ngcontent-%COMP%]   .seg[_ngcontent-%COMP%]   button[_ngcontent-%COMP%]{border:0;background:none;padding:4px 11px;cursor:pointer;white-space:nowrap;font:600 12px ui-sans-serif,system-ui,sans-serif;color:var(--gf-mut, #6b7280)}#ai-bar[_ngcontent-%COMP%]   .seg[_ngcontent-%COMP%]   button[_ngcontent-%COMP%] + button[_ngcontent-%COMP%]{border-left:1px solid var(--gf-line, #e5e7eb)}#ai-bar[_ngcontent-%COMP%]   .seg[_ngcontent-%COMP%]   button.on[_ngcontent-%COMP%]{background:var(--gf-ink, #111827);color:#fff}#ai-bar[_ngcontent-%COMP%]   .seg[_ngcontent-%COMP%]   button[_ngcontent-%COMP%]:focus-visible{outline:2px solid var(--gf-accent, #2563eb);outline-offset:2px}#ai-note[_ngcontent-%COMP%]{color:var(--gf-mut, #6b7280)}#ai-canvas[_ngcontent-%COMP%]{height:520px;background:#fff}#ai-src[_ngcontent-%COMP%]{margin:0;padding:14px 18px;border-top:1px solid var(--gf-line, #e5e7eb);background:#f8fafc;color:#1f2937;font:12px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre;overflow:auto;max-height:520px}"]})}}return o})();export{ie as AiStyleDiagramComponent};
