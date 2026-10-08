import{_ as u}from"./preload-helper-D57DdDQb.js";import{y,L as m}from"./core.min-C7M5tFMw.js";import"./index-YJHSr4jy.js";import{w as x}from"./create-diagram-BM1CvY1Y.js";import"./preloader-D7tuiBjF.js";import"./index-B7GSxwA6.js";import"./default-dark-theme-CK9ZvHhX.js";import"./LinkModel-CNp_BZcH.js";import"./disposable-CKHTf1hZ.js";const k="#1f2328",f="#5f6b7a",n="#6b7785",b="#1a7f37",i="#cf222e",w="#2a7a86",S={fill:"#ffffff",stroke:"#d0d5dd",borderRadius:4,shadow:!1,color:k,fontSize:13},o=(e,l,t,r,c,g,p,h={})=>({id:e,position:{x:l,y:t},size:{width:r,height:c},label:g,sublabel:p,style:{...S,...h}}),s=e=>({text:e,fontSize:11,color:f}),a=(e,l={})=>({stroke:e,strokeWidth:1.5,arrowHead:{type:"arrow",size:7,filled:!0,color:e},...l}),d={fontSize:11,color:f},E={groups:[{id:"hp",label:"HEALTHPAY'S SIDE · CARDS ARE TYPED HERE",children:["page","wallets"],bounds:{x:380,y:36,width:566,height:138},style:{fill:"#e9f2f3",stroke:"#7aabb3",strokeDasharray:"5 4",color:w,fontWeight:"700",letterSpacing:1}},{id:"ours",label:"OUR SIDE · MUST NEVER SEE A CARD",children:["api","db"],bounds:{x:380,y:236,width:566,height:150},labelPlacement:"bottom-left",style:{fill:"#f3f4f6",stroke:"#d7dbe0",color:"#4b5563",fontWeight:"700",letterSpacing:1}}],nodes:[o("customer",20,78,150,292,"Customer",s("phone or browser"),{borderRadius:6}),o("page",410,78,210,72,"HealthPay payment page",s("the card is typed here")),o("wallets",712,78,210,72,"HealthPay wallets",s("hold the customer's money")),o("api",410,264,210,72,"Our API",{text:"sherkety-erp-api",fontFamily:"mono",fontSize:11,color:f}),o("db",712,264,210,72,"Our database",s("keys, ledger, bank numbers")),o("fake",20,398,150,60,"Fake card page",s("not HealthPay's"),{fill:"#fdecec",stroke:"#e5a0a0"}),{id:"note",position:{x:186,y:421},size:{width:360,height:24},shape:{type:"text"},label:"if someone swaps the link, the customer lands here (M1)",style:{color:i,fontWeight:"700",fontSize:11}}],edges:[{source:"customer",target:"page",sourceHandle:"right@36",targetHandle:"left@36",type:"orthogonal",style:a(b),label:"card number and CVV",labelPlacement:"above",labelStyle:{color:b,fontWeight:"700",fontSize:11}},{source:"page",target:"wallets",sourceHandle:"right@36",targetHandle:"left@36",type:"orthogonal",style:a(n),label:"adds money",labelPlacement:"above",labelStyle:d},{source:"api",target:"wallets",sourceHandle:"top@170",targetHandle:"bottom@138",type:"orthogonal",waypoints:[{x:580,y:204},{x:850,y:204}],style:a(n),label:"asks HealthPay to move money",labelPlacement:"above",labelStyle:d},{source:"api",target:"db",sourceHandle:"right@36",targetHandle:"left@36",type:"orthogonal",style:a(n),label:"saves keys",labelPlacement:"above",labelStyle:d},{source:"api",target:"customer",sourceHandle:"left@24",targetHandle:"right@210",type:"orthogonal",style:a(n),label:"sends the payment link",labelPlacement:"above",labelStyle:d},{source:"customer",target:"api",sourceHandle:"right@240",targetHandle:"left@54",type:"orthogonal",style:a(i,{strokeDasharray:"5 4"}),label:`card typed as a
"bank account" (H1)`,labelPlacement:"below",labelStyle:{color:i,fontWeight:"700",fontSize:11}},{source:"customer",target:"fake",sourceHandle:"bottom@75",targetHandle:"top@75",type:"orthogonal",style:a(i,{strokeDasharray:"5 4"})}]},C=`// The diagram, as a render() spec. Every look is a field:
//   sublabel · shape 'text' · groups (zones) · 'right@36' anchors
//   labelPlacement / labelStyle · waypoints · style.shadow: false
const INK = '#1f2328', MUTED = '#5f6b7a', LINE = '#6b7785', GOOD = '#1a7f37', BAD = '#cf222e', ACC = '#2a7a86';
const flat = { fill: '#ffffff', stroke: '#d0d5dd', borderRadius: 4, shadow: false, color: INK, fontSize: 13 };
const box = (id, x, y, w, h, label, sublabel, style = {}) =>
  ({ id, position: { x, y }, size: { width: w, height: h }, label, sublabel, style: { ...flat, ...style } });
const sub = (text) => ({ text, fontSize: 11, color: MUTED });
const line = (c, extra = {}) => ({ stroke: c, strokeWidth: 1.5, arrowHead: { type: 'arrow', size: 7, filled: true, color: c }, ...extra });
const small = { fontSize: 11, color: MUTED };

export default {
  groups: [
    { id: 'hp', label: "HEALTHPAY'S SIDE · CARDS ARE TYPED HERE", children: ['page', 'wallets'],
      bounds: { x: 380, y: 36, width: 566, height: 138 },
      style: { fill: '#e9f2f3', stroke: '#7aabb3', strokeDasharray: '5 4', color: ACC, fontWeight: '700', letterSpacing: 1 } },
    { id: 'ours', label: 'OUR SIDE · MUST NEVER SEE A CARD', children: ['api', 'db'],
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
};`,H=`flowchart LR
  customer["<b>Customer</b><br/>phone or browser"]
  subgraph hp["HEALTHPAY'S SIDE · CARDS ARE TYPED HERE"]
    page["<b>HealthPay payment page</b><br/>the card is typed here"]
    wallets["<b>HealthPay wallets</b><br/>hold the customer's money"]
  end
  subgraph ours["OUR SIDE · MUST NEVER SEE A CARD"]
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
  %% Grafloria layout — comments any other Mermaid renderer ignores
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
  %%grafloria:edge customer fake from:bottom@75, to:top@75`,O=[["native","the native API"],["mermaid","Grafloria Mermaid"]];function M(e,l){let t;if(l==="mermaid"){const r=x(H).diagram;t={nodes:r.getNodes(),edges:r.getLinks(),groups:r.getGroups()}}else t=structuredClone(E);e.setEdges([]),e.setGroups([]),e.setNodes([]),e.setNodes(t.nodes),e.setGroups(t.groups),e.setEdges(t.edges),e.renderNow()}const N=`
#ai-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; padding: 8px 12px; border-bottom: 1px solid var(--gf-line, #e5e7eb); background: #fff; font: 500 12.5px ui-sans-serif, system-ui, sans-serif; color: var(--gf-ink, #111827); }
#ai-bar .seg { display: inline-flex; border: 1px solid var(--gf-line, #e5e7eb); border-radius: 7px; overflow: hidden; }
#ai-bar .seg button { border: 0; background: none; padding: 4px 11px; cursor: pointer; white-space: nowrap; font: 600 12px ui-sans-serif, system-ui, sans-serif; color: var(--gf-mut, #6b7280); }
#ai-bar .seg button + button { border-left: 1px solid var(--gf-line, #e5e7eb); }
#ai-bar .seg button.on { background: var(--gf-ink, #111827); color: #fff; }
#ai-bar .seg button:focus-visible { outline: 2px solid var(--gf-accent, #2563eb); outline-offset: 2px; }
#ai-note { color: var(--gf-mut, #6b7280); }
#ai-canvas { height: 520px; background: #fff; }
#ai-src { margin: 0; padding: 14px 18px; border-top: 1px solid var(--gf-line, #e5e7eb); background: #f8fafc; color: #1f2937; font: 12px/1.55 ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre; overflow: auto; max-height: 520px; }
`,L=y(m(()=>u(()=>import("./ai-style-diagram.tsx_ai_style_diagram_component_WPMbiDu0IjM-Ck9N4qgN.js"),[],import.meta.url),"s_WPMbiDu0IjM"));export{N as _auto_HOST_CSS,H as _auto_MERMAID_TEXT,C as _auto_NATIVE_TEXT,O as _auto_SOURCES,M as _auto_draw,L as default};
