import{_ as K}from"./preload-helper-D57DdDQb.js";import{y as X,L as F}from"./core.min-e2MmCxtB.js";import{g as U}from"./index-ThD-w6X4.js";import{D as P}from"./create-diagram-cOo2ebNs.js";import{b as J,a as V}from"./editing-Do27FXOT.js";import{e as Z}from"./styles-CwqKFtQy.js";import{e as j,d as Y,c as q,b as Q,f as ee,g as R,S as te,h as ae,i as oe}from"./dashboard-BaIFTxLo.js";import"./preloader-D7tuiBjF.js";import"./index-B7GSxwA6.js";import"./default-dark-theme-CK9ZvHhX.js";import"./LinkModel-CNp_BZcH.js";import"./disposable-CKHTf1hZ.js";import"./update-B39-oaCK.js";import"./NodeZOrderCommands-B39KVUYY.js";function D(a){return a.getMetadata("kitEntity")!==void 0||a.getMetadata("kitClass")!==void 0}function B(a){const i=a.getMetadata("widgetKind");if(i===void 0)return null;const c=a.getMetadata("widgetTitle");return{id:a.id,kind:i,...typeof c=="string"?{title:c}:{},data:a.getMetadata("widgetSpec")??{},span:a.getMetadata("columnSpan"),rows:a.getMetadata("rowSpan"),...a.getMetadata("widgetLimits")!==void 0?{limits:{...a.getMetadata("widgetLimits")}}:{},...a.getMetadata("widgetMovable")===!1?{movable:!1}:{},...a.getMetadata("widgetResizable")===!1?{resizable:!1}:{}}}function re(a,i={}){const c=typeof a=="string"?ie(a):a,s=new P().deserialize(c),x=s.getNodes(),C=s.getGroups(),h=new Map;x.some(D)&&Z(),x.some(e=>B(e)!==null)&&j();const N=i.renderWidget??Y,G=C.filter(e=>e.getMetadata("dashboardBoard")!==void 0),k=new Map,S=new Map,_=new Map,z=new Map,L=new Map(G.map(e=>[e.id,e])),O=new Set;for(const e of G)for(const o of e.members??[])L.has(o)&&O.add(o);const E=(e,o)=>{const n=[];for(const y of e.members??[]){const u=L.get(y);if(u){const l=u.getMetadata("containerWidget")??{},f=Q(u.getMetadata("gridItem")),w=E(u,o),M=l.order;if(Array.isArray(M)){const v=b=>M.indexOf(b)<0?Number.MAX_SAFE_INTEGER:M.indexOf(b);w.sort((b,$)=>v(b.id)-v($.id))}const p={id:u.id,...l,...f?{x:f.x,y:f.y,span:f.w,rows:f.h}:{},widgets:w};k.set(p.id,p),S.set(p.id,e.id),_.set(p.id,p.widgets),z.set(p.id,o),n.push(p);continue}const t=s.getNode(y),r=t?B(t):null;r&&(k.set(r.id,r),S.set(r.id,e.id),n.push(r))}return n},g=G.filter(e=>!O.has(e.id)),T=g.map(e=>{const o=e.getMetadata("dashboardBoard"),n=E(e,e.id);return _.set(e.id,n),z.set(e.id,e.id),{id:e.id,name:e.name,widgets:n,columns:o.columns,width:e.size?.width,height:e.size?.height}}),d=g[0]?.getMetadata("dashboardBoard"),A=g.find(e=>e.position.x>-1e3)??g[0],m={views:T,groups:new Map(g.map(e=>[e.id,e])),binders:h,specById:k,viewOfWidget:S,boardGroups:L,boardWidgets:_,viewOfBoard:z,hosts:new Map,renderWidget:N,columns:d?.columns??12,gap:d?.gap??8,rowHeight:d?.baseRowHeight??130,boardW:g[0]?.size?.width??1180,boardH:g[0]?.size?.height??660,mode:d?.fluid===!0?"fluid":"fixed",overflow:d?.overflow??"bounded",activeTab:new Map,tabsOf:new Map,tabStrips:new Map,layoutOf:new Map(G.map(e=>[e.id,e.getMetadata("dashboardBoard")?.layout??"grid"])),optionsBase:d?{columns:d.columns,gap:d.gap,rowHeight:d.baseRowHeight,sizing:d.sizing,float:d.float,rtl:d.rtl,mode:d.fluid===!0?"fluid":"fixed",overflow:d.overflow??"bounded",static:d.static??!1,layout:d.layout??"grid",width:g[0]?.size?.width,height:g[0]?.size?.height}:{},active:A?.id??"main",apiRef:null,container:null},I=q(m),W=(e,o)=>{if(i.renderCustomNode)return i.renderCustomNode(e,o);const n=k.get(e.id)??B(e);if(n)return m.hosts.set(e.id,o),N(n,o);U(e.type)?.(e,o)},H=e=>{const o=e;if(!o)return;const n=o.getModel?.();if(n)for(const t of C)n.getGroup?.(t.id)||n.addGroup?.(t);if(i.interactive===!1)return;const y=x.filter(D);if(y.length>0&&o.container){for(const t of y)t.setBehavior?.({resizable:!1});y.some(t=>t.getMetadata("kitRowSelection")===!1)||J(o),y.some(t=>t.getMetadata("kitEditable")===!0)&&V(o)}m.apiRef=o,m.container=o.container??null;for(const t of C){const r=t.getMetadata("dashboardBoard");r&&r.layout!=="tabs"&&h.set(t.id,u(t,r))}ee(m,s,o.container??null,I),m.rebindView=(t,r)=>{const l=s.getGroup(t),f=h.get(t),w=l?.getMetadata("dashboardBoard");if(!l||!f||!w)return;const M=f.saveLayout().cells;f.dispose(),s.runSystemWrite(()=>{for(const[p,v]of M){const b=s.getNode(p);b?b.setMetadata("gridItem",R(v)):s.getGroup(p)?.setMetadata("gridItem",R(v))}l.setMetadata(te,void 0),l.setMetadata("dashboardLayouts",void 0),l.setMetadata("dashboardBoard",{...w,layout:r})}),m.layoutOf.set(t,r),h.set(t,u(l,{...w,layout:r})),h.get(t)?.sync()},m.rebindContainer=t=>{const r=s.getGroup(t),l=r?.getMetadata("dashboardBoard");!r||!l||(m.boardGroups.set(t,r),h.set(t,u(r,l)))};function u(t,r){return r.layout==="split"?ae(o,t,{...r}):oe(o,t,{...r})}m.attachHistory?.()};return{nodes:x,edges:s.getLinks(),renderCustomNode:W,finalize:H,model:s,boards:h,handle:I,...m.mode==="fluid"?{renderOptions:{minZoom:1,maxZoom:1}}:{}}}function ie(a){try{return JSON.parse(a)}catch(i){throw new Error(`fromDocument: not a saved diagram (${i.message})`)}}const we=`<mxGraphModel dx="800" dy="600" grid="1">
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
</mxGraphModel>`,Ce=`<mxfile host="grafloria-demo" version="24.0">
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
</mxfile>`;async function Me(a){const i=new TextEncoder().encode(encodeURIComponent(a)),c=new Blob([i]).stream().pipeThrough(new CompressionStream("deflate-raw")),s=new Uint8Array(await new Response(c).arrayBuffer());let x="";for(const C of s)x+=String.fromCharCode(C);return`<mxfile host="grafloria-demo" version="24.0"><diagram id="d1" name="Page-1">${btoa(x)}</diagram></mxfile>`}function ve(a,i,c){const s=`${a.getNodes().length} nodes · ${a.getLinks().length} links · ${a.getGroups().length} groups`;return{head:(c?`${c} · `:"")+s+(i.length?` · ${i.length} warning(s):`:" · no warnings"),warnings:[...i]}}function Ge(a){const i=JSON.stringify(new P().serialize(a));return re(i)}const ke=`
  .di-page { display: flex; flex-direction: column; height: 100vh; }
  .di-page, .di-page * { box-sizing: border-box; }
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
`,Se=X(F(()=>K(()=>import("./drawio-import.tsx_drawio_import_component_7KPCuCCi6Jw-DrzJDk0b.js"),[],import.meta.url),"s_7KPCuCCi6Jw"));export{ke as _auto_CSS,Ce as _auto_MULTI_XML,we as _auto_PLAIN_XML,Me as _auto_compressedCopy,Ge as _auto_loadedSpec,ve as _auto_statusOf,Se as default};
