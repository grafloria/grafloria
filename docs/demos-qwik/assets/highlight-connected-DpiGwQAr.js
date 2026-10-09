import{_ as g}from"./preload-helper-D57DdDQb.js";import{y as f,L as b}from"./core.min-C7M5tFMw.js";import"./preloader-D7tuiBjF.js";const k=`
#hc-canvas { flex: 1; min-height: 0; position: relative; background: #f1f1f1; }
/* The control bar: a row above the canvas, so it never covers a step. */
#hc-bar {
  display: flex; flex-wrap: wrap; align-items: center; gap: 10px;
  padding: 8px 12px; border-bottom: 1px solid var(--gf-line, #E3E7F2);
  background: #fff;
  font: 500 12.5px ui-sans-serif, system-ui, sans-serif; color: var(--gf-ink, #232A3D);
}
#hc-bar label { display: inline-flex; align-items: center; gap: 6px; cursor: pointer; white-space: nowrap; }
#hc-bar .seg { display: inline-flex; border: 1px solid var(--gf-line, #E3E7F2); border-radius: 7px; overflow: hidden; }
#hc-bar .seg button {
  border: 0; background: none; padding: 4px 10px; cursor: pointer; white-space: nowrap;
  font: 600 12px ui-sans-serif, system-ui, sans-serif; color: var(--gf-mut, #5A6478);
}
#hc-bar .seg button + button { border-left: 1px solid var(--gf-line, #E3E7F2); }
#hc-bar .seg button.on { background: var(--gf-ink, #232A3D); color: #fff; }
#hc-bar .seg button:focus-visible, #hc-bar input:focus-visible { outline: 2px solid var(--gf-accent, #3B52D9); outline-offset: 2px; }
#hc-bar .seg[aria-disabled="true"] { opacity: .45; pointer-events: none; }
#hc-code { font: 12px ui-monospace, Menlo, monospace; color: var(--gf-mut, #5A6478); white-space: nowrap; }

/* The step cards — a flow editor's: a coloured header band, then what the step does. */
.hc-card {
  box-sizing: border-box; width: 100%; height: 100%; overflow: hidden;
  border-radius: 12px; background: #fff; border: 1px solid #e3e5e8;
  font: 14px ui-sans-serif, system-ui, sans-serif; color: #1f2328;
}
.hc-head { display: flex; align-items: center; gap: 9px; height: 48px; padding: 0 18px; font-weight: 600; font-size: 16px; }
.hc-glyph { width: 18px; text-align: center; font-size: 15px; }
.hc-body { padding: 12px 18px; line-height: 1.6; color: #30343a; }
.hc-card.k-input .hc-head { background: #f1fcaa; }
.hc-card.k-step .hc-head { background: #c9d8fb; }
.hc-card.k-output .hc-head { background: #c8f5d2; }
/* The selected step: a heavy ink frame, like the reference. */
.grafloria-node-host[data-selected="true"] .hc-card,
[data-selected="true"] .hc-card { border: 3px solid #111827; }
`,x=(e,t,o,r)=>({tag:"div",className:"hc-card k-"+e,children:[{tag:"div",className:"hc-head",children:[{tag:"span",className:"hc-glyph",text:t},{tag:"span",text:o}]},{tag:"div",className:"hc-body",text:r}]}),n={shape:"circle",size:10},m=(e,t,o,r,i)=>[...r==="bottom"?[{id:e+"_in",side:"bottom",type:"input",shape:n,layout:{strategy:"absolute",args:{units:"px",x:t/2,y:o}}}]:r?[{id:e+"_in",side:"left",type:"input",shape:n,layout:{strategy:"absolute",args:{units:"px",x:0,y:24}}}]:[],...i?[{id:e+"_out",side:"right",type:"output",shape:n,layout:{strategy:"absolute",args:{units:"px",x:t,y:24}}}]:[]],s=(e,t,o,r,i,d,c,p,l,h,u)=>({id:e,position:{x:t,y:o},size:{width:r,height:i},metadata:{html:{content:x(d,c,p,l),padding:0}},shape:{type:"rect",fill:"none",stroke:"none"},style:{fill:"transparent",stroke:"transparent",strokeWidth:0},ports:m(e,r,i,h,u)}),y={stroke:"#9aa0a6",strokeWidth:1.6,arrowHead:{type:"arrow",size:7,filled:!1}},a=(e,t)=>({id:`${e}-${t}`,source:e,target:t,sourceHandle:e+"_out",targetHandle:t+"_in",type:"bezier",style:y}),E=[s("name",100,490,300,104,"input","☰","Product Name","Enter the name of product",!1,!0),s("audience",100,850,300,104,"input","☰","Describe Target Audience","Describe the target audience",!1,!0),s("research",580,270,300,150,"step","✦","Research Product","Research the product’s specifications and value proposition using web search.",!0,!0),s("adtext",930,498,300,154,"step","≡","Generate Ad Text","Generate the ad text based on the product’s specifications and the target audience.",!0,!0),s("videodesc",930,850,300,154,"step","≡","Generate Video Description","Generate the video description based on the product’s specifications.",!0,!0),s("video",1290,498,300,128,"step","▶","Generate Video","Generate the video based on the video description.","bottom",!0),s("campaign",1650,498,300,128,"output","▦","Generate Ad Campaign","Combine the ad text and the video into an HTML webpage.",!0,!1)],T=[a("name","research"),a("name","adtext"),a("name","videodesc"),a("research","adtext"),a("research","videodesc"),a("audience","adtext"),a("audience","videodesc"),{...a("adtext","campaign"),points:[{x:1230,y:522},{x:1440,y:522},{x:1650,y:522}],metadata:{hasManualWaypoints:!0}},a("videodesc","video"),a("video","campaign")],N=e=>e.on?e.depth===1&&e.outgoing==="solid"?!0:{...e.depth!==1?{depth:1/0}:{},...e.outgoing!=="solid"?{outgoing:"dashed"}:{}}:!1,S=e=>"highlightConnected: "+(typeof e=="object"?JSON.stringify(e).replace("null","Infinity").replace(/"(\w+)":/g,"$1: "):String(e)),A=(e,...t)=>{const o=e.getModel();o.clearSelection();for(const r of t)o.addToSelection(o.getNode(r));e.renderNow()},D=f(b(()=>g(()=>import("./highlight-connected.tsx_highlight_connected_component_hdwXXaWpD5Y-BbBEntj3.js"),[],import.meta.url),"s_hdwXXaWpD5Y"));export{k as _auto_HOST_CSS,T as _auto_edges,E as _auto_nodes,N as _auto_optionFor,S as _auto_readout,A as _auto_selectOnly,D as default};
