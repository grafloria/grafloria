import{_ as s}from"./preload-helper-D57DdDQb.js";import{y as l,L as i}from"./core.min-C7M5tFMw.js";import"./index-YJHSr4jy.js";import{w as n}from"./create-diagram-BM1CvY1Y.js";import"./preloader-D7tuiBjF.js";import"./index-B7GSxwA6.js";import"./default-dark-theme-CK9ZvHhX.js";import"./LinkModel-CNp_BZcH.js";import"./disposable-CKHTf1hZ.js";const x=`flowchart LR
  %%grafloria:layout architecture
  customer["<b>Customer</b><br/>phone or browser"]
  subgraph hp["HEALTHPAY'S SIDE · CARDS ARE TYPED HERE"]
    direction LR
    page["<b>HealthPay payment page</b><br/>the card is typed here"]
    wallets["<b>HealthPay wallets</b><br/>hold the customer's money"]
  end
  subgraph ours["OUR SIDE · MUST NEVER SEE A CARD"]
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
`,y=[["architecture","architecture"],["layered","layered (for comparison)"]],k="The Mermaid below has no coordinates. Edit it — the drawing follows.";async function w(e,a,r){let t;try{const o=r==="architecture"?a:a.replace(/^\s*%%grafloria:layout\s+architecture\s*$/m,"");t=n(o).diagram}catch(o){return`That text does not parse yet (${o&&o.message?o.message:o}) — the last drawing stays.`}return e.setEdges([]),e.setGroups([]),e.setNodes([]),e.setNodes(t.getNodes()),e.setGroups(t.getGroups()),e.setEdges(t.getLinks()),r==="layered"&&await e.getEngine().layout("layered",{direction:"LR"}),e.renderNow(),e.fitView(28),e.renderNow(),null}const v=`
#al-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; padding: 8px 12px; border-bottom: 1px solid var(--gf-line, #e5e7eb); background: #fff; font: 500 12.5px ui-sans-serif, system-ui, sans-serif; color: var(--gf-ink, #111827); }
#al-bar .seg { display: inline-flex; border: 1px solid var(--gf-line, #e5e7eb); border-radius: 7px; overflow: hidden; }
#al-bar .seg button { border: 0; background: none; padding: 4px 11px; cursor: pointer; white-space: nowrap; font: 600 12px ui-sans-serif, system-ui, sans-serif; color: var(--gf-mut, #6b7280); }
#al-bar .seg button + button { border-left: 1px solid var(--gf-line, #e5e7eb); }
#al-bar .seg button.on { background: var(--gf-ink, #111827); color: #fff; }
#al-bar .seg button:focus-visible { outline: 2px solid var(--gf-accent, #2563eb); outline-offset: 2px; }
#al-note { color: var(--gf-mut, #6b7280); }
#al-note.err { color: #b42318; }
#al-canvas { height: 540px; background: #fff; }
/* The source box: the gallery's editor mounts in it (Mermaid colouring); the
   textarea is the fallback and stays the value the page reads. */
#al-src-box { height: 420px; border-top: 1px solid var(--gf-line, #e5e7eb); background: #f8fafc; }
#al-src { display: block; box-sizing: border-box; width: 100%; height: 100%; margin: 0; padding: 14px 18px; border: 0; background: #f8fafc; color: #1f2937; font: 12px/1.55 ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre; overflow: auto; resize: vertical; tab-size: 2; }
#al-src:focus-visible { outline: 2px solid var(--gf-accent, #2563eb); outline-offset: -2px; }
`,E=l(i(()=>s(()=>import("./architecture-layout.tsx_architecture_layout_component_nILNNbuXYmI-CagCMEjC.js"),[],import.meta.url),"s_nILNNbuXYmI"));export{v as _auto_HOST_CSS,y as _auto_LAYOUTS,k as _auto_NOTE,x as _auto_SOURCE,w as _auto_draw,E as default};
