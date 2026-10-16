import{_ as K}from"./preload-helper-D57DdDQb.js";import{y as X,L as F}from"./core.min-C7M5tFMw.js";import{c as U,d as J,f as V,g as Z}from"./index-LuEWI-m0.js";import{D as P,a0 as j}from"./create-diagram-CcxyiUl6.js";import{e as Y,d as q,c as Q,r as ee,b as te,f as ae,g as R,S as oe,h as re,i as ie}from"./dashboard-Di2y17TG.js";import"./preloader-D7tuiBjF.js";import"./index-B7GSxwA6.js";import"./default-dark-theme-CK9ZvHhX.js";import"./LinkModel-QnX2uu3i.js";import"./disposable-CKHTf1hZ.js";import"./NodeZOrderCommands-CJ6QuK9x.js";function D(t){return t.getMetadata("kitEntity")!==void 0||t.getMetadata("kitClass")!==void 0}function B(t){const i=t.getMetadata("widgetKind");if(i===void 0)return null;const c=t.getMetadata("widgetTitle");return{id:t.id,kind:i,...typeof c=="string"?{title:c}:{},data:t.getMetadata("widgetSpec")??{},span:t.getMetadata("columnSpan"),rows:t.getMetadata("rowSpan"),...t.getMetadata("widgetLimits")!==void 0?{limits:{...t.getMetadata("widgetLimits")}}:{},...t.getMetadata("widgetMovable")===!1?{movable:!1}:{},...t.getMetadata("widgetResizable")===!1?{resizable:!1}:{},...typeof t.getMetadata("widgetAutoHeight")=="boolean"?{autoHeight:t.getMetadata("widgetAutoHeight")}:{}}}function se(t,i={}){const c=typeof t=="string"?de(t):t,s=new P().deserialize(c),x=s.getNodes(),C=s.getGroups(),h=new Map;x.some(D)&&U(),x.some(e=>B(e)!==null)&&Y();const N=i.renderWidget??q,G=C.filter(e=>e.getMetadata("dashboardBoard")!==void 0),k=new Map,S=new Map,_=new Map,z=new Map,L=new Map(G.map(e=>[e.id,e])),O=new Set;for(const e of G)for(const r of e.members??[])L.has(r)&&O.add(r);const E=(e,r)=>{const l=[];for(const y of e.members??[]){const u=L.get(y);if(u){const m=u.getMetadata("containerWidget")??{},f=te(u.getMetadata("gridItem")),w=E(u,r),M=m.order;if(Array.isArray(M)){const v=b=>M.indexOf(b)<0?Number.MAX_SAFE_INTEGER:M.indexOf(b);w.sort((b,$)=>v(b.id)-v($.id))}const g={id:u.id,...m,...f?{x:f.x,y:f.y,span:f.w,rows:f.h}:{},widgets:w};k.set(g.id,g),S.set(g.id,e.id),_.set(g.id,g.widgets),z.set(g.id,r),l.push(g);continue}const a=s.getNode(y),o=a?B(a):null;o&&(k.set(o.id,o),S.set(o.id,e.id),l.push(o))}return l},p=G.filter(e=>!O.has(e.id)),T=p.map(e=>{const r=e.getMetadata("dashboardBoard"),l=E(e,e.id);return _.set(e.id,l),z.set(e.id,e.id),{id:e.id,name:e.name,widgets:l,columns:r.columns,width:e.size?.width,height:e.size?.height}}),n=p[0]?.getMetadata("dashboardBoard"),A=p.find(e=>e.position.x>-1e3)??p[0],d={views:T,groups:new Map(p.map(e=>[e.id,e])),binders:h,specById:k,viewOfWidget:S,boardGroups:L,boardWidgets:_,viewOfBoard:z,hosts:new Map,renderWidget:N,unmountWidget:i.unmountWidget,columns:n?.columns??12,gap:n?.gap??8,rowHeight:n?.baseRowHeight??130,boardW:p[0]?.size?.width??1180,boardH:p[0]?.size?.height??660,mode:n?.fluid===!0?"fluid":"fixed",overflow:n?.overflow??"bounded",activeTab:new Map,tabsOf:new Map,tabStrips:new Map,layoutOf:new Map(G.map(e=>[e.id,e.getMetadata("dashboardBoard")?.layout??"grid"])),optionsBase:n?{columns:n.columns,gap:n.gap,rowHeight:n.baseRowHeight,sizing:n.sizing,float:n.float,rtl:n.rtl,mode:n.fluid===!0?"fluid":"fixed",overflow:n.overflow??"bounded",static:n.static??!1,layout:n.layout??"grid",width:p[0]?.size?.width,height:p[0]?.size?.height}:{},active:A?.id??"main",apiRef:null,container:null},I=Q(d),H=(e,r)=>{if(i.renderCustomNode)return i.renderCustomNode(e,r);const l=k.get(e.id)??B(e);if(l){d.hosts.set(e.id,r),N(l,r),d.autoHeight?.observe(e.id,r);return}Z(e.type)?.(e,r)},W=e=>{const r=e;if(!r)return;const l=r.getModel?.();if(l){for(const o of C)l.getGroup?.(o.id)||l.addGroup?.(o);for(const o of s.getStrokes())l.getStroke?.(o.id)||l.addStroke?.(o);const a=r.getCommentStore?.();a?a.adopt(s.comments):j(l,s.comments)}if(i.interactive===!1)return;const y=x.filter(D);if(y.length>0&&r.container){for(const a of y)a.setBehavior?.({resizable:!1});y.some(a=>a.getMetadata("kitRowSelection")===!1)||J(r),y.some(a=>a.getMetadata("kitEditable")===!0)&&V(r)}d.apiRef=r,d.container=r.container??null;for(const a of C){const o=a.getMetadata("dashboardBoard");o&&o.layout!=="tabs"&&h.set(a.id,u(a,o))}ae(d,s,r.container??null,I),d.rebindView=(a,o)=>{const m=s.getGroup(a),f=h.get(a),w=m?.getMetadata("dashboardBoard");if(!m||!f||!w)return;const M=f.saveLayout().cells;f.dispose(),s.runSystemWrite(()=>{for(const[g,v]of M){const b=s.getNode(g);b?b.setMetadata("gridItem",R(v)):s.getGroup(g)?.setMetadata("gridItem",R(v))}m.setMetadata(oe,void 0),m.setMetadata("dashboardLayouts",void 0),m.setMetadata("dashboardBoard",{...w,layout:o})}),d.layoutOf.set(a,o),h.set(a,u(m,{...w,layout:o,...d.sizing?{sizing:d.sizing}:{}})),h.get(a)?.sync()},d.rebindContainer=a=>{const o=s.getGroup(a),m=o?.getMetadata("dashboardBoard");!o||!m||(d.boardGroups.set(a,o),h.set(a,u(o,m)))};function u(a,o){return o.layout==="split"?re(r,a,{...o}):ie(r,a,{...o,...o.stack&&d.listMoves?{lists:d.listMoves(a.id)}:{}})}d.attachHistory?.()};return{nodes:x,edges:s.getLinks(),renderCustomNode:H,removeCustomNode:(e,r)=>ee(d,e,r),finalize:W,model:s,boards:h,handle:I,...d.mode==="fluid"?{renderOptions:{minZoom:1,maxZoom:1}}:{}}}function de(t){try{return JSON.parse(t)}catch(i){throw new Error(`fromDocument: not a saved diagram (${i.message})`)}}const be=`<mxGraphModel dx="800" dy="600" grid="1">
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
</mxGraphModel>`,we=`<mxfile host="grafloria-demo" version="24.0">
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
</mxfile>`;async function Ce(t){const i=new TextEncoder().encode(encodeURIComponent(t)),c=new Blob([i]).stream().pipeThrough(new CompressionStream("deflate-raw")),s=new Uint8Array(await new Response(c).arrayBuffer());let x="";for(const C of s)x+=String.fromCharCode(C);return`<mxfile host="grafloria-demo" version="24.0"><diagram id="d1" name="Page-1">${btoa(x)}</diagram></mxfile>`}function Me(t,i,c){const s=`${t.getNodes().length} nodes · ${t.getLinks().length} links · ${t.getGroups().length} groups`;return{head:(c?`${c} · `:"")+s+(i.length?` · ${i.length} warning(s):`:" · no warnings"),warnings:[...i]}}function ve(t){const i=JSON.stringify(new P().serialize(t));return se(i)}const Ge=`
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
`,ke=X(F(()=>K(()=>import("./drawio-import.tsx_drawio_import_component_7KPCuCCi6Jw-CRNjers1.js"),[],import.meta.url),"s_7KPCuCCi6Jw"));export{Ge as _auto_CSS,we as _auto_MULTI_XML,be as _auto_PLAIN_XML,Ce as _auto_compressedCopy,ve as _auto_loadedSpec,Me as _auto_statusOf,ke as default};
