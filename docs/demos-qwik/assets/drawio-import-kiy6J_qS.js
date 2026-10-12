import{_ as K}from"./preload-helper-D57DdDQb.js";import{y as X,L as F}from"./core.min-C7M5tFMw.js";import{c as U,d as J,f as V,g as Z}from"./index-Cfb-z7LP.js";import{D as P,$ as j}from"./create-diagram-87aYItmf.js";import{e as Y,d as q,c as Q,b as ee,f as te,g as R,S as ae,h as oe,i as re}from"./dashboard-BjFfs8TJ.js";import"./preloader-D7tuiBjF.js";import"./index-B7GSxwA6.js";import"./default-dark-theme-CK9ZvHhX.js";import"./LinkModel-QnX2uu3i.js";import"./disposable-CKHTf1hZ.js";import"./NodeZOrderCommands-DW-pv8nK.js";function D(t){return t.getMetadata("kitEntity")!==void 0||t.getMetadata("kitClass")!==void 0}function B(t){const s=t.getMetadata("widgetKind");if(s===void 0)return null;const c=t.getMetadata("widgetTitle");return{id:t.id,kind:s,...typeof c=="string"?{title:c}:{},data:t.getMetadata("widgetSpec")??{},span:t.getMetadata("columnSpan"),rows:t.getMetadata("rowSpan"),...t.getMetadata("widgetLimits")!==void 0?{limits:{...t.getMetadata("widgetLimits")}}:{},...t.getMetadata("widgetMovable")===!1?{movable:!1}:{},...t.getMetadata("widgetResizable")===!1?{resizable:!1}:{},...typeof t.getMetadata("widgetAutoHeight")=="boolean"?{autoHeight:t.getMetadata("widgetAutoHeight")}:{}}}function ie(t,s={}){const c=typeof t=="string"?se(t):t,i=new P().deserialize(c),x=i.getNodes(),C=i.getGroups(),h=new Map;x.some(D)&&U(),x.some(e=>B(e)!==null)&&Y();const N=s.renderWidget??q,G=C.filter(e=>e.getMetadata("dashboardBoard")!==void 0),k=new Map,S=new Map,_=new Map,z=new Map,L=new Map(G.map(e=>[e.id,e])),O=new Set;for(const e of G)for(const r of e.members??[])L.has(r)&&O.add(r);const E=(e,r)=>{const n=[];for(const y of e.members??[]){const u=L.get(y);if(u){const m=u.getMetadata("containerWidget")??{},f=ee(u.getMetadata("gridItem")),w=E(u,r),M=m.order;if(Array.isArray(M)){const v=b=>M.indexOf(b)<0?Number.MAX_SAFE_INTEGER:M.indexOf(b);w.sort((b,$)=>v(b.id)-v($.id))}const g={id:u.id,...m,...f?{x:f.x,y:f.y,span:f.w,rows:f.h}:{},widgets:w};k.set(g.id,g),S.set(g.id,e.id),_.set(g.id,g.widgets),z.set(g.id,r),n.push(g);continue}const a=i.getNode(y),o=a?B(a):null;o&&(k.set(o.id,o),S.set(o.id,e.id),n.push(o))}return n},p=G.filter(e=>!O.has(e.id)),T=p.map(e=>{const r=e.getMetadata("dashboardBoard"),n=E(e,e.id);return _.set(e.id,n),z.set(e.id,e.id),{id:e.id,name:e.name,widgets:n,columns:r.columns,width:e.size?.width,height:e.size?.height}}),d=p[0]?.getMetadata("dashboardBoard"),A=p.find(e=>e.position.x>-1e3)??p[0],l={views:T,groups:new Map(p.map(e=>[e.id,e])),binders:h,specById:k,viewOfWidget:S,boardGroups:L,boardWidgets:_,viewOfBoard:z,hosts:new Map,renderWidget:N,columns:d?.columns??12,gap:d?.gap??8,rowHeight:d?.baseRowHeight??130,boardW:p[0]?.size?.width??1180,boardH:p[0]?.size?.height??660,mode:d?.fluid===!0?"fluid":"fixed",overflow:d?.overflow??"bounded",activeTab:new Map,tabsOf:new Map,tabStrips:new Map,layoutOf:new Map(G.map(e=>[e.id,e.getMetadata("dashboardBoard")?.layout??"grid"])),optionsBase:d?{columns:d.columns,gap:d.gap,rowHeight:d.baseRowHeight,sizing:d.sizing,float:d.float,rtl:d.rtl,mode:d.fluid===!0?"fluid":"fixed",overflow:d.overflow??"bounded",static:d.static??!1,layout:d.layout??"grid",width:p[0]?.size?.width,height:p[0]?.size?.height}:{},active:A?.id??"main",apiRef:null,container:null},I=Q(l),H=(e,r)=>{if(s.renderCustomNode)return s.renderCustomNode(e,r);const n=k.get(e.id)??B(e);if(n){l.hosts.set(e.id,r),N(n,r),l.autoHeight?.observe(e.id,r);return}Z(e.type)?.(e,r)},W=e=>{const r=e;if(!r)return;const n=r.getModel?.();if(n){for(const o of C)n.getGroup?.(o.id)||n.addGroup?.(o);for(const o of i.getStrokes())n.getStroke?.(o.id)||n.addStroke?.(o);const a=r.getCommentStore?.();a?a.adopt(i.comments):j(n,i.comments)}if(s.interactive===!1)return;const y=x.filter(D);if(y.length>0&&r.container){for(const a of y)a.setBehavior?.({resizable:!1});y.some(a=>a.getMetadata("kitRowSelection")===!1)||J(r),y.some(a=>a.getMetadata("kitEditable")===!0)&&V(r)}l.apiRef=r,l.container=r.container??null;for(const a of C){const o=a.getMetadata("dashboardBoard");o&&o.layout!=="tabs"&&h.set(a.id,u(a,o))}te(l,i,r.container??null,I),l.rebindView=(a,o)=>{const m=i.getGroup(a),f=h.get(a),w=m?.getMetadata("dashboardBoard");if(!m||!f||!w)return;const M=f.saveLayout().cells;f.dispose(),i.runSystemWrite(()=>{for(const[g,v]of M){const b=i.getNode(g);b?b.setMetadata("gridItem",R(v)):i.getGroup(g)?.setMetadata("gridItem",R(v))}m.setMetadata(ae,void 0),m.setMetadata("dashboardLayouts",void 0),m.setMetadata("dashboardBoard",{...w,layout:o})}),l.layoutOf.set(a,o),h.set(a,u(m,{...w,layout:o,...l.sizing?{sizing:l.sizing}:{}})),h.get(a)?.sync()},l.rebindContainer=a=>{const o=i.getGroup(a),m=o?.getMetadata("dashboardBoard");!o||!m||(l.boardGroups.set(a,o),h.set(a,u(o,m)))};function u(a,o){return o.layout==="split"?oe(r,a,{...o}):re(r,a,{...o})}l.attachHistory?.()};return{nodes:x,edges:i.getLinks(),renderCustomNode:H,finalize:W,model:i,boards:h,handle:I,...l.mode==="fluid"?{renderOptions:{minZoom:1,maxZoom:1}}:{}}}function se(t){try{return JSON.parse(t)}catch(s){throw new Error(`fromDocument: not a saved diagram (${s.message})`)}}const ye=`<mxGraphModel dx="800" dy="600" grid="1">
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
</mxGraphModel>`,be=`<mxfile host="grafloria-demo" version="24.0">
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
</mxfile>`;async function we(t){const s=new TextEncoder().encode(encodeURIComponent(t)),c=new Blob([s]).stream().pipeThrough(new CompressionStream("deflate-raw")),i=new Uint8Array(await new Response(c).arrayBuffer());let x="";for(const C of i)x+=String.fromCharCode(C);return`<mxfile host="grafloria-demo" version="24.0"><diagram id="d1" name="Page-1">${btoa(x)}</diagram></mxfile>`}function Ce(t,s,c){const i=`${t.getNodes().length} nodes · ${t.getLinks().length} links · ${t.getGroups().length} groups`;return{head:(c?`${c} · `:"")+i+(s.length?` · ${s.length} warning(s):`:" · no warnings"),warnings:[...s]}}function Me(t){const s=JSON.stringify(new P().serialize(t));return ie(s)}const ve=`
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
`,Ge=X(F(()=>K(()=>import("./drawio-import.tsx_drawio_import_component_7KPCuCCi6Jw-XEXIlGOW.js"),[],import.meta.url),"s_7KPCuCCi6Jw"));export{ve as _auto_CSS,be as _auto_MULTI_XML,ye as _auto_PLAIN_XML,we as _auto_compressedCopy,Me as _auto_loadedSpec,Ce as _auto_statusOf,Ge as default};
