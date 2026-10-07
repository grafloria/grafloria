import{a as D}from"./chunk-Y27IVM25.js";import{a as S,b as T,c as A,g as L}from"./chunk-ENYHPKNS.js";import{a as R}from"./chunk-65N2GKAV.js";import"./chunk-PMJ46LHF.js";import{S as E,lb as V}from"./chunk-7Z2GZ3QF.js";import"./chunk-2CNM65BX.js";import{$a as _,Ga as s,Na as v,Sa as k,X as f,Y as p,ab as m,cb as h,ib as C,jb as M,ka as b,kb as n,lb as i,ob as y,pb as u,qb as x,vb as P,wb as O,yb as c,zb as w}from"./chunk-EDWZ7REV.js";import{h as d}from"./chunk-WWX6BADO.js";var H=["source"],N=(o,l)=>l[0];function F(o,l){if(o&1){let e=y();n(0,"button",10),u("click",function(){let r=f(e).$implicit,a=x();return p(a.redraw(r[0]))}),c(1),i()}if(o&2){let e=l.$implicit,t=x();h("on",t.layout()===e[0]),_("data-layout",e[0])("aria-pressed",t.layout()===e[0]),s(),w(e[1])}}var G=`flowchart LR
  %%grafloria:layout architecture
  customer["<b>Customer</b><br/>phone or browser"]
  subgraph hp["HEALTHPAY'S SIDE \xB7 CARDS ARE TYPED HERE"]
    direction LR
    page["<b>HealthPay payment page</b><br/>the card is typed here"]
    wallets["<b>HealthPay wallets</b><br/>hold the customer's money"]
  end
  subgraph ours["OUR SIDE \xB7 MUST NEVER SEE A CARD"]
    direction LR
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
  %%grafloria:group ours caption:bottom-left
  %%grafloria:edge * * label:above
  %%grafloria:edge customer api label:below
  %%grafloria:edge api wallets from:top, to:bottom
  %%grafloria:edge customer fake from:bottom, to:top
  %%grafloria:near note fake right
`,I=[["architecture","architecture"],["layered","layered (for comparison)"]],$="The Mermaid below has no coordinates. Edit it \u2014 the drawing follows.";function U(o,l,e){return d(this,null,function*(){let t;try{let r=e==="architecture"?l:l.replace(/^\s*%%grafloria:layout\s+architecture\s*$/m,"");t=E(r).diagram}catch(r){return`That text does not parse yet (${r&&r.message?r.message:r}) \u2014 the last drawing stays.`}return o.setEdges([]),o.setGroups([]),o.setNodes([]),o.setNodes(t.getNodes()),o.setGroups(t.getGroups()),o.setEdges(t.getLinks()),e==="layered"&&(yield o.getEngine().layout("layered",{direction:"LR"})),o.renderNow(),o.fitView(28),o.renderNow(),null})}var Z=(()=>{class o{constructor(){this.layouts=I,this.note=$,this.spec={nodes:[],edges:[]},this.layout=b("architecture"),this.error=b(null),this.text=G,this.source=v("source")}redraw(e){return d(this,null,function*(){if(!this.api)return!1;let t=yield U(this.api,this.text,e);return this.error.set(t),t||this.layout.set(e),!t})}onReady(e){return d(this,null,function*(){this.api=e,e.getEngine().setInteractionConfig({portVisibility:"hidden"}),yield this.redraw("architecture"),D(this.source()?.nativeElement,{language:"mermaid"}),V()})}onType(e){this.text=e,clearTimeout(this.timer),this.timer=setTimeout(()=>void this.redraw(this.layout()),300)}ngOnDestroy(){clearTimeout(this.timer)}static{this.\u0275fac=function(t){return new(t||o)}}static{this.\u0275cmp=k({type:o,selectors:[["ng-component"]],viewQuery:function(t,r){t&1&&P(r.source,H,5),t&2&&O()},decls:15,vars:5,consts:[["source",""],["id","al-bar"],["id","al-layout","role","group","aria-label","Layout",1,"seg"],["type","button",3,"on"],["id","al-note","role","status"],["id","al-canvas"],[2,"display","block","height","100%",3,"ready","spec"],["for","al-src",1,"visually-hidden",2,"position","absolute","left","-9999px"],["id","al-src-box"],["id","al-src","spellcheck","false","aria-label","Grafloria Mermaid source",3,"ngModelChange","ngModel"],["type","button",3,"click"]],template:function(t,r){if(t&1){let a=y();n(0,"div",1)(1,"span"),c(2,"Layout"),i(),n(3,"span",2),C(4,F,2,5,"button",3,N),i(),n(6,"span",4),c(7),i()(),n(8,"div",5)(9,"grafloria-diagram",6),u("ready",function(g){return f(a),p(r.onReady(g))}),i()(),n(10,"label",7),c(11,"Grafloria Mermaid source"),i(),n(12,"div",8)(13,"textarea",9,0),u("ngModelChange",function(g){return f(a),p(r.onType(g))}),i()()}if(t&2){let a;s(4),M(r.layouts),s(2),h("err",!!r.error()),s(),w((a=r.error())!==null&&a!==void 0?a:r.note),s(2),m("spec",r.spec),s(4),m("ngModel",r.text)}},dependencies:[R,L,S,T,A],styles:["#al-bar[_ngcontent-%COMP%]{display:flex;flex-wrap:wrap;align-items:center;gap:10px;padding:8px 12px;border-bottom:1px solid var(--gf-line, #e5e7eb);background:#fff;font:500 12.5px ui-sans-serif,system-ui,sans-serif;color:var(--gf-ink, #111827)}#al-bar[_ngcontent-%COMP%]   .seg[_ngcontent-%COMP%]{display:inline-flex;border:1px solid var(--gf-line, #e5e7eb);border-radius:7px;overflow:hidden}#al-bar[_ngcontent-%COMP%]   .seg[_ngcontent-%COMP%]   button[_ngcontent-%COMP%]{border:0;background:none;padding:4px 11px;cursor:pointer;white-space:nowrap;font:600 12px ui-sans-serif,system-ui,sans-serif;color:var(--gf-mut, #6b7280)}#al-bar[_ngcontent-%COMP%]   .seg[_ngcontent-%COMP%]   button[_ngcontent-%COMP%] + button[_ngcontent-%COMP%]{border-left:1px solid var(--gf-line, #e5e7eb)}#al-bar[_ngcontent-%COMP%]   .seg[_ngcontent-%COMP%]   button.on[_ngcontent-%COMP%]{background:var(--gf-ink, #111827);color:#fff}#al-bar[_ngcontent-%COMP%]   .seg[_ngcontent-%COMP%]   button[_ngcontent-%COMP%]:focus-visible{outline:2px solid var(--gf-accent, #2563eb);outline-offset:2px}#al-note[_ngcontent-%COMP%]{color:var(--gf-mut, #6b7280)}#al-note.err[_ngcontent-%COMP%]{color:#b42318}#al-canvas[_ngcontent-%COMP%]{height:540px;background:#fff}#al-src-box[_ngcontent-%COMP%]{height:420px;border-top:1px solid var(--gf-line, #e5e7eb);background:#f8fafc}#al-src[_ngcontent-%COMP%]{display:block;box-sizing:border-box;width:100%;height:100%;margin:0;padding:14px 18px;border:0;background:#f8fafc;color:#1f2937;font:12px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre;overflow:auto;resize:vertical;tab-size:2}#al-src[_ngcontent-%COMP%]:focus-visible{outline:2px solid var(--gf-accent, #2563eb);outline-offset:-2px}"]})}}return o})();export{Z as ArchitectureLayoutComponent};
