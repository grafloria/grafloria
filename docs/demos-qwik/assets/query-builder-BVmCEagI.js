import{_ as w}from"./preload-helper-D57DdDQb.js";import{y as _,L as E}from"./core.min-e2MmCxtB.js";import"./index-DvcOhNA0.js";import{N,P as z}from"./LinkModel-CNp_BZcH.js";const h="#2080e8",l=220,m=34,d=28,f=e=>1+m+e*d+d/2,q=e=>2+m+e.columns.length*d,p=[{id:"customers",columns:[{name:"id",pk:!0},{name:"name"},{name:"email"},{name:"country"}]},{id:"orders",columns:[{name:"id",pk:!0},{name:"customer_id",fk:!0},{name:"order_date"},{name:"total"}]},{id:"order_items",columns:[{name:"id",pk:!0},{name:"order_id",fk:!0},{name:"product_id",fk:!0},{name:"quantity"},{name:"price"}]},{id:"products",columns:[{name:"id",pk:!0},{name:"sku"},{name:"name"},{name:"unit_price"}]}],u=e=>p.find(t=>t.id===e),S=()=>new Map(p.map(e=>[e.id,new Set(e.id==="customers"?["name"]:e.id==="orders"?["order_date","total"]:[])]));function k(e,t){const a=t.size===e.columns.length&&e.columns.length>0,r=e.columns.map(o=>({tag:"div",className:"axk-row"+(t.has(o.name)?" qb-on":""),children:[{tag:"span",className:"qb-check"+(t.has(o.name)?" on":""),attrs:{title:"include in SELECT"}},{tag:"span",className:"axk-col",text:o.name},...o.pk?[{tag:"span",className:"qb-badge pk",text:"PK"}]:o.fk?[{tag:"span",className:"qb-badge fk",text:"FK"}]:[]]}));return{tag:"div",className:"axk-entity qb-card",children:[{tag:"div",className:"axk-entity-head",children:[{tag:"span",className:"qb-check qb-head-check qb-all"+(a?" on":""),attrs:{title:"select all columns"}},{tag:"span",className:"qb-title",text:e.id}]},{tag:"div",className:"axk-entity-body",children:r}]}}const v=e=>e.columns.flatMap((t,a)=>[{id:`${e.id}.${t.name}-in`,side:"left",type:"input",shape:{shape:"circle",size:9},layout:{strategy:"absolute",args:{units:"px",x:0,y:f(a)}}},{id:`${e.id}.${t.name}-out`,side:"right",type:"output",shape:{shape:"circle",size:9},layout:{strategy:"absolute",args:{units:"px",x:l,y:f(a)}}}]),x=(e,t,a)=>({id:e.id,position:t,size:{width:l,height:q(e)},metadata:{html:{content:k(e,a),interactive:!0,padding:0},kitEntity:{id:e.id,name:e.id,columns:e.columns}},shape:{type:"rect",fill:"none",stroke:"none"},style:{fill:"transparent",stroke:"transparent",strokeWidth:0},ports:v(e)});function D(e,t,a){const r=new N({id:e.id,type:"rect",position:t,size:{width:l,height:q(e)}});r.ports.clear();for(const o of v(e))r.addPort(new z({...o,visible:!0}));return r.setMetadata("html",{content:k(e,a),interactive:!0,padding:0}),r.setMetadata("kitEntity",{id:e.id,name:e.id,columns:e.columns}),r.setMetadata("shape",{type:"rect",fill:"none",stroke:"none"}),r.style={...r.style,fill:"transparent",stroke:"transparent",strokeWidth:0},r.setBehavior?.({resizable:!1}),r}const y={stroke:h,strokeWidth:2,arrowHead:{type:"none"},arrowTail:{type:"none"}};function T(){const e=S();return{nodes:[x(u("customers"),{x:60,y:80},e.get("customers")),x(u("orders"),{x:430,y:250},e.get("orders"))],edges:[{id:"join-1",source:"customers",target:"orders",sourceHandle:"customers.id-out",targetHandle:"orders.customer_id-in",type:"orthogonal",style:y}]}}const H=["INNER","LEFT","RIGHT","FULL"],I=e=>({id:"join-type",text:e,position:.5,offset:{x:0,y:0},style:{fontSize:10,color:"#fff",background:h,padding:6,borderRadius:999,border:"#fff"}}),g=e=>{const t=/^([^.]+)\.(.+)-(in|out)$/.exec(e||"");return t?{table:t[1],column:t[2]}:null},$=e=>(e.labels?.[0]?.text??"INNER").toUpperCase();function W(e){const t=g(e.sourcePortId),a=g(e.targetPortId);return!t||!a?!1:(e.getMetadata("qbJoin")||e.setMetadata("qbJoin",{source:t,target:a}),e.updateStyle(y),(!e.labels||e.labels.length===0)&&e.setLabels([I("INNER")]),!0)}const G=(e,t,a)=>e.getLinks().some(r=>{const o=r.getMetadata("qbJoin");return o&&(o.source.table===t&&o.target.table===a||o.source.table===a&&o.target.table===t)}),Q=e=>{const t=e.getMetadata("qbJoin");return`${t.source.table}.${t.source.column} = ${t.target.table}.${t.target.column}`};function V(e,t){const a=p.filter(n=>!!e.getNode(n.id));if(a.length===0)return"SELECT *";const r=e.getLinks().map(n=>({link:n,j:n.getMetadata("qbJoin")})).filter(n=>!!n.j),o=[a[0].id],b=[];for(const{link:n,j:s}of r){const c=o.includes(s.source.table)?s.target.table:s.source.table;o.includes(c)||o.push(c),b.push(`${$(n)} JOIN ${c} ON ${s.source.table}.${s.source.column} = ${s.target.table}.${s.target.column}`)}const i=[];for(const n of a)if(o.includes(n.id))for(const s of n.columns)t.get(n.id).has(s.name)&&i.push(`${n.id}.${s.name}`);return[`${i.length?`SELECT
`+i.map(n=>`  ${n}`).join(`,
`):"SELECT *"}`,`FROM ${o[0]}`,...b].join(`
`)}const C=T(),L={background:{variant:"dots",gap:20,size:1.4,color:"rgba(120,130,145,.38)"}},M={portVisibility:"always"},j=1.2,O=_(E(()=>w(()=>import("./query-builder.tsx_query_builder_component_YLvX1qbI9cs-Dsep8C2s.js"),[],import.meta.url),"s_YLvX1qbI9cs")),F=`
#qb-shell { --gf-bg: #FCFCFF; --gf-panel: #FFFFFF; --gf-ink: #232A3D; --gf-mut: #5A6478; --gf-line: #E3E7F2;
  height: 100vh; -webkit-font-smoothing: antialiased; }
#qb-shell * { box-sizing: border-box; }
#qb-shell { display: flex; flex-direction: column; min-height: 0; }
#qb-body { display: flex; flex: 1; min-height: 0; }
#qb-rail {
  flex: 0 1 190px; min-width: 140px; border-right: 1px solid var(--gf-line, #e5e7eb);
  background: var(--gf-panel, #fff); padding: 10px; overflow-y: auto;
  font: 12px ui-sans-serif, system-ui, sans-serif;
}
#qb-rail .qb-rail-title { font-weight: 700; color: var(--gf-mut, #6b7280);
  text-transform: uppercase; font-size: 10px; letter-spacing: .6px; margin: 2px 0 8px; }
.qb-chip {
  display: flex; align-items: center; gap: 8px; padding: 8px 10px; margin-bottom: 6px;
  border: 1px solid var(--gf-line, #e5e7eb); border-radius: 8px; cursor: grab;
  background: var(--gf-bg, #fff); color: var(--gf-ink, #1e2436); user-select: none;
}
.qb-chip:hover { border-color: #2080e8; }
.qb-chip .qb-chip-n { font-weight: 600; flex: 1; }
.qb-chip .qb-chip-c { color: var(--gf-mut, #6b7280); font-size: 10px; }
.qb-chip.placed { opacity: .38; cursor: default; }
.qb-chip.placed:hover { border-color: var(--gf-line, #e5e7eb); }
#qb-canvas { flex: 1 1 auto; min-width: 260px; position: relative; --qb-accent: #2080e8; }
#qb-inspector {
  flex: 0 1 210px; min-width: 160px; border-left: 1px solid var(--gf-line, #e5e7eb);
  background: var(--gf-panel, #fff); padding: 12px; overflow-y: auto;
  font: 12px ui-sans-serif, system-ui, sans-serif; color: var(--gf-ink, #1e2436);
}
@media (max-width: 1280px) { #qb-inspector { display: none; } }
#qb-inspector h3 { font-size: 11px; text-transform: uppercase; letter-spacing: .6px;
  color: var(--gf-mut, #6b7280); margin: 0 0 8px; }
#qb-inspector .qb-join-eq { font: 12px ui-monospace, Menlo, monospace; padding: 8px;
  background: rgba(32,128,232,.08); border-radius: 6px; margin-bottom: 10px; word-break: break-all; }
#qb-inspector .qb-types { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
#qb-inspector .qb-type {
  padding: 6px 0; border: 1px solid var(--gf-line, #e5e7eb); border-radius: 6px;
  background: transparent; color: var(--gf-ink, #1e2436); cursor: pointer;
  font: 11px/1 ui-sans-serif, system-ui, sans-serif; font-weight: 700;
}
#qb-inspector .qb-type:hover { border-color: #2080e8; color: #2080e8; }
#qb-inspector .qb-type.on { background: #2080e8; border-color: #2080e8; color: #fff; }
#qb-inspector .qb-hint { color: var(--gf-mut, #6b7280); line-height: 1.5; }
#qb-inspector .qb-placed-list { margin: 8px 0 0; padding: 0; list-style: none; }
#qb-inspector .qb-placed-list li { padding: 3px 0; font-family: ui-monospace, Menlo, monospace; }
/* SQL preview pane — the textarea stays canonical; Monaco mounts over it. */
#qb-sql { flex: 0 0 148px; border-top: 1px solid var(--gf-line, #e5e7eb);
  display: flex; flex-direction: column; min-height: 0; background: var(--gf-panel, #fff); }
#qb-sql .qb-sql-head { padding: 5px 12px; font: 10px ui-sans-serif, system-ui, sans-serif;
  font-weight: 700; text-transform: uppercase; letter-spacing: .6px;
  color: var(--gf-mut, #6b7280); border-bottom: 1px solid var(--gf-line, #e5e7eb); flex: none; }
#qb-sql .qb-sql-body { flex: 1; min-height: 0; position: relative; }
#qb-sql-text { width: 100%; height: 100%; border: 0; resize: none; outline: none;
  font: 12.5px/1.5 ui-monospace, Menlo, monospace; padding: 8px 12px; box-sizing: border-box;
  background: transparent; color: var(--gf-ink, #1e2436); }

/* ===== The Query Studio card skin — OVER the kit's .axk-* classes ===== */
#qb-canvas .axk-entity { background: #fff; border: 1px solid #c7cfdd; border-radius: 10px;
  box-shadow: 0 4px 14px rgba(30,40,70,.10); font: 13px/1.45 ui-sans-serif, system-ui, sans-serif; }
#qb-canvas .axk-entity-head { background: var(--qb-accent); color: #fff; font-weight: 700;
  font-size: 13px; padding: 8px 12px; height: 34px; box-sizing: border-box;
  display: flex; align-items: center; gap: 8px; text-transform: none; letter-spacing: 0; }
#qb-canvas .axk-row { display: flex; align-items: center; gap: 8px; padding: 5px 12px;
  height: 28px; box-sizing: border-box; border-top: 1px solid #eef1f7; font-size: 13px; }
/* no zebra, no hover tint (the guidance tiers own the row backgrounds) */
#qb-canvas .axk-row:not([class*="axk-match"]):not(.qb-on):hover { background: transparent; }
#qb-canvas .axk-col { flex: 1; color: #22314f; }
#qb-canvas .qb-badge { font-size: 10px; font-weight: 700; border-radius: 4px;
  padding: 1px 5px; flex: 0 0 auto; line-height: 1.3; }
#qb-canvas .qb-badge.pk { background: #fde68a; color: #92600a; }
#qb-canvas .qb-badge.fk { background: #bfdbfe; color: #1e40af; }
/* checkboxes (structured spans — the html layer allows no form controls) */
#qb-canvas .qb-check { width: 14px; height: 14px; flex: 0 0 auto; box-sizing: border-box;
  border: 1.5px solid #b6c2d6; border-radius: 4px; background: #fff; cursor: pointer; position: relative; }
#qb-canvas .qb-check.on { background: var(--qb-accent); border-color: var(--qb-accent); }
#qb-canvas .qb-check.on::after { content: ''; position: absolute; left: 3.5px; top: 0.5px;
  width: 4px; height: 7px; border: solid #fff; border-width: 0 2px 2px 0; transform: rotate(45deg); }
#qb-canvas .qb-head-check { border-color: rgba(255,255,255,.85); background: transparent; }
#qb-canvas .qb-head-check.on { background: #fff; border-color: #fff; }
#qb-canvas .qb-head-check.on::after { border-color: var(--qb-accent); }
/* checked-row fill */
#qb-canvas .axk-row.qb-on, #qb-canvas .axk-row.qb-on:hover {
  background: color-mix(in srgb, var(--qb-accent) 8%, #fff); }
/* guidance tiers must WIN over the skin's row fills (same values as the kit
   stylesheet — re-scoped here so #qb-canvas rules cannot out-rank them) */
#qb-canvas .axk-row.axk-match-top, #qb-canvas .axk-row.axk-match-top:hover {
  background: #fffbeb; box-shadow: inset 4px 0 0 #f59e0b, inset 0 0 0 1px #fcd34d; }
#qb-canvas .axk-row.axk-match-top .axk-col { font-weight: 800; color: #92600a; }
#qb-canvas .axk-row.axk-match-good, #qb-canvas .axk-row.axk-match-good:hover {
  background: #dcfce7; box-shadow: inset 4px 0 0 #16a34a; }
#qb-canvas .axk-row.axk-match-good .axk-col { font-weight: 700; color: #14532d; }
#qb-canvas .axk-row.axk-match-ok, #qb-canvas .axk-row.axk-match-ok:hover {
  background: #dbeafe; box-shadow: inset 4px 0 0 #2563eb; }
#qb-canvas .axk-row.axk-match-none { opacity: .4; }
/* selection = a RING on the card, accent (the kit hides the node rect) */
#qb-canvas g.node-group[data-selected="true"] .axk-entity {
  border-color: var(--qb-accent);
  box-shadow: 0 0 0 2px var(--qb-accent), 0 4px 14px rgba(30,40,70,.10); }
/* per-column ports: 9px accent dots with a white 2px ring, never clipped —
   they are SVG glyphs BESIDE the card, not children of its overflow box */
#qb-canvas circle[data-port-id] { fill: var(--qb-accent); stroke: #fff; stroke-width: 2; }
#qb-canvas circle[data-port-invalid] { fill: #dc2626 !important; stroke: #fff !important; }
/* join pill: accent bg, white 2px border, radius 999, 10px/800 uppercase */
#qb-canvas .link-label-bg { fill: var(--qb-accent); stroke: #fff; stroke-width: 2; rx: 999px;
  filter: drop-shadow(0 1px 4px rgba(20,25,40,.25)); }
#qb-canvas .link-label-group text { fill: #fff; font-weight: 800; font-size: 10px;
  letter-spacing: .5px; text-transform: uppercase; cursor: pointer; }
/* refusal toast — a refused join must be VISIBLE, never a console error */
#qb-toast { position: absolute; left: 50%; bottom: 76px; transform: translateX(-50%);
  background: #b42318; color: #fff; padding: 6px 14px; border-radius: 8px;
  font: 12px ui-sans-serif, system-ui, sans-serif; opacity: 0; transition: opacity .15s;
  pointer-events: none; z-index: 40; white-space: nowrap; }
#qb-toast.show { opacity: 1; }
/* zoom cluster (the visio-editor convention, bottom-right; 34px clears the fold) */
#qb-zoom { position: absolute; right: 10px; bottom: 34px; z-index: 25;
  display: flex; align-items: center; gap: 2px; padding: 3px;
  background: var(--gf-panel, #fff); border: 1px solid var(--gf-line, #e5e7eb);
  border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,.08);
  font: 12px ui-sans-serif, system-ui, sans-serif; }
#qb-zoom button { padding: 4px 8px; border: 0; border-radius: 6px; background: transparent;
  color: var(--gf-ink, #1e2436); cursor: pointer; font: inherit; }
#qb-zoom button:hover { background: rgba(32,128,232,.1); color: #2080e8; }
#qb-zoom #qb-zoom-pct { min-width: 44px; text-align: center; font-variant-numeric: tabular-nums; }
`,K=Object.freeze(Object.defineProperty({__proto__:null,_auto_BACKGROUND:L,_auto_INTERACTION:M,_auto_QB_CSS:F,_auto_SEED:C,_auto_ZOOM_STEP:j,default:O},Symbol.toStringTag,{value:"Module"}));export{L as B,l as C,m as H,M as I,H as J,F as Q,C as S,p as T,j as Z,W as a,G as b,D as c,Q as d,k as e,V as g,$ as j,I as p,K as q,S as s,u as t};
