import{_ as p}from"./preload-helper-D57DdDQb.js";import{y as l,L as c}from"./core.min-BYz3EHBQ.js";import"./index-DGklG4Bk.js";import{a as g}from"./dashboard-DqYF4EyH.js";import"./preloader-D7tuiBjF.js";import"./index-B7GSxwA6.js";import"./create-diagram-BoGZBrMu.js";import"./default-dark-theme-CK9ZvHhX.js";import"./disposable-CKHTf1hZ.js";const o=(r,e,t,i=1,d=!1)=>({id:r,kind:"tile",span:t,rows:i,pinned:d,title:e,data:{label:e}}),a=(r,e,t,i,d={})=>({id:r,kind:"tile",span:i.w,rows:i.h,...i.x!==void 0?{x:i.x,y:i.y}:{},pinned:d.pinned??!1,title:e,data:{label:e,note:t,tone:d.tone}}),b=[{id:"pack",name:"Gravity pack",widgets:[o("p1","A · span 6",6,2),o("p2","B · span 3",3),o("p3","C · span 3",3),o("p4","D · span 4",4),o("p5","E · span 8",8),o("p6","F · span 12",12)]},{id:"wide",name:"Wide cells",columns:6,widgets:[o("w1","half",3,2),o("w2","half",3),o("w3","third",2),o("w4","two-thirds",4),o("w5","full",6)]},{id:"pinned",name:"Pinned",widgets:[o("k1","PINNED — survives reflow",4,2,!0),o("k2","flows",4),o("k3","flows",4),o("k4","flows",6),o("k5","flows",6)]},{id:"dense",name:"Dense mix",widgets:[o("d1","lead",8,2),o("d2","side",4),o("d3","side",4),o("d4","q",3),o("d5","q",3),o("d6","q",3),o("d7","q",3)]},{id:"boards",name:"Two boards",widgets:[{id:"sec-a",title:"Board A",span:5,rows:2,columns:6,caption:{subtitle:"drag a tile into board B — the crossing is ONE undo"},widgets:[a("a1","A · one","drag me into board B",{x:0,y:0,w:3,h:1}),a("a2","A · two","an ordinary tile",{x:3,y:0,w:3,h:1}),a("a3","A · pinned","locked — never pushed, drags onto it refused",{x:0,y:1,w:3,h:1},{pinned:!0}),a("a4","A · three","an ordinary tile",{x:3,y:1,w:3,h:1})]},{id:"sec-b",title:"Board B",span:5,rows:2,columns:6,caption:{subtitle:"the green tile holds fixed cells; the rest auto-flow"},widgets:[a("b0","B · fixed cells","x 2–3 · y 0–1",{x:2,y:0,w:2,h:2},{tone:"fixed"}),a("b1","B · one","no cells — auto-placed",{w:2,h:1}),a("b2","B · two","no cells — auto-placed",{w:2,h:1}),a("b3","B · three","no cells — auto-placed",{w:2,h:1})]}]},{id:"section",name:"Bounded section",widgets:[{id:"strip",title:"Bounded strip",span:12,rows:1,columns:4,maxRows:1,widgets:["A","B","C","D"].map((r,e)=>a(`s${r}`,`Strip ${r}`,e===0?"pull my corner down":"maxRows: 1",{x:e,y:0,w:1,h:1},{tone:"strip"}))},a("c1","Trend panel","an ordinary member of board C",{x:0,y:1,w:8,h:2}),a("c2","Share panel","an ordinary member of board C",{x:8,y:1,w:4,h:2}),a("c3","Detail table","an ordinary member of board C",{x:0,y:3,w:12,h:1})]}],n=(r,e)=>window.dispatchEvent(new CustomEvent(r,{detail:e})),s=r=>String(r).replace(/[&<>"]/g,e=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"})[e]),f={columns:12,gap:8,sizing:"grow",rowHeight:96,float:!1,responsive:{columnWidth:96},renderWidget:(r,e)=>{const t=r.data??{};e.innerHTML=`<div class="gt${t.tone?` gt-${t.tone}`:""}${r.pinned?" locked":""}"><div class="gt-h">${s(t.label??r.title??"Tile")}<span class="pin" title="Pinned">📌</span></div>`+(t.note?`<div class="gt-n">${s(t.note)}</div>`:"")+"</div>"},onSelect:()=>n("gochanged"),onLayoutChange:()=>n("gochanged"),binder:{dragOut:"remove",removeZone:r=>{const e=document.querySelector(".go-side");return!!e&&r.x<=e.getBoundingClientRect().right+8},onRemoveRequest:(r,e)=>{n("goremove",{nodeId:r,displaced:e})}}};function B(){return g({...f,views:JSON.parse(JSON.stringify(b))})}const S={tile:{label:"Tile (2×1)",span:2},wide:{label:"Wide tile (4×1)",span:4}},E=`
  .go-page { height: 100vh; display: flex; flex-direction: column; }
  .go-bar { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; padding: 8px 20px;
    border-bottom: 1px solid rgba(127,127,127,.22); background: #fbfbfd; }
  .go-tabs { display: flex; gap: 4px; margin-right: auto; }
  .go-tab { border: 1px solid transparent; background: none; cursor: pointer;
    font: 600 13px/1.2 system-ui, sans-serif; color: #5b6270; padding: 7px 14px; border-radius: 8px; }
  .go-tab:hover { background: rgba(127,127,127,.09); color: #2d2e3a; }
  .go-tab[aria-selected="true"] { background: #eef2ff; color: #3b52d9; border-color: #d6def9; }
  .go-tool { border: 1px solid #d8dce6; background: #fff; cursor: pointer;
    font: 500 12px/1.2 system-ui, sans-serif; color: #3c4254; padding: 7px 10px; border-radius: 7px; }
  .go-tool:hover { border-color: #b9c0d0; background: #f6f7fb; }
  .go-tool:disabled { opacity: .42; cursor: default; }
  .go-sep { width: 1px; height: 22px; background: rgba(127,127,127,.24); margin: 0 4px; }
  .go-body { flex: 1; min-height: 0; display: grid; grid-template-columns: 214px 1fr; }
  .go-side { border-right: 1px solid rgba(127,127,127,.2); padding: 12px 12px 20px; overflow-y: auto; background: #fafbfd; }
  .go-title { font: 700 10px/1.4 system-ui, sans-serif; letter-spacing: .8px; text-transform: uppercase; color: #8a91a2; margin: 2px 2px 9px; }
  .pal-item { display: flex; align-items: center; gap: 9px; width: 100%; margin: 0 0 8px; padding: 8px 9px;
    border: 1px solid #e4e7ee; border-radius: 9px; background: #fff; cursor: pointer; text-align: left;
    font: 500 12.5px/1.2 system-ui, sans-serif; color: #2d2e3a; box-shadow: 0 1px 1px rgba(16,24,40,.04); }
  .pal-item:hover { border-color: #b9c0d0; background: #f6f7fb; }
  .pal-glyph { width: 24px; height: 24px; border-radius: 7px; flex: none; display: flex; align-items: center;
    justify-content: center; font-size: 13px; color: #fff; background: #3b52d9; }
  .go-note { margin: 10px 2px 16px; font: 11px/1.5 system-ui, sans-serif; color: #949bab; }
  .go-canvas { position: relative; overflow: hidden; height: 100%; background-color: #f1f3f7;
    background-image: radial-gradient(circle, rgba(120,128,145,.16) 1px, transparent 1px); background-size: 26px 26px; }
  .go-status { position: absolute; left: 14px; bottom: 12px; z-index: 6; max-width: 74%;
    padding: 6px 11px; border-radius: 8px; background: rgba(20,24,33,.86); color: #eef1f7;
    font: 500 11.5px/1.35 ui-monospace, SFMono-Regular, monospace; pointer-events: none;
    box-shadow: 0 3px 10px rgba(15,23,42,.2); opacity: 0; transition: opacity .18s; }
  .go-status.show { opacity: 1; }
  .gt { box-sizing: border-box; width: 100%; height: 100%; display: flex; flex-direction: column;
    background: #fff; border: 1px solid #e7eaf1; border-radius: 3px; padding: 11px 13px; overflow: hidden;
    font-family: system-ui, sans-serif; cursor: pointer; box-shadow: 0 1px 2px rgba(16,24,40,.05); }
  .gt:hover { border-color: #c4ccdb; }
  .gt-h { display: flex; align-items: center; gap: 6px; font: 650 14px/1.25 system-ui, sans-serif; color: #1f2430; }
  .gt-h .pin { margin-left: auto; font-size: 13px; opacity: 0; }
  .gt.locked { border-color: #e2b467; background: #fffaf0; }
  .gt.locked .gt-h .pin { opacity: 1; }
  .gt-n { margin-top: 5px; font: 11.5px/1.4 system-ui, sans-serif; color: #7a8496; }
  .gt-strip { background: #eef2ff; border-color: #d6def9; }
  .gt-fixed { background: #eefaf4; border-color: #bfe6d4; }
  @media (prefers-color-scheme: dark) {
    .gt { background: #1a1d25; border-color: #2b3040; } .gt-h { color: #eceef4; } .gt-n { color: #98a1b4; }
    .gt.locked { background: #2a2418; } .gt-strip { background: #1e2440; } .gt-fixed { background: #16261f; }
    .go-bar { background: #171a21; } .go-side { background: #14161c; }
    .go-canvas { background-color: #0f1116; background-image: radial-gradient(circle, rgba(150,160,180,.14) 1px, transparent 1px); }
    .go-tab { color: #9aa2b2; } .go-tab:hover { color: #e6e9f0; }
    .go-tab[aria-selected="true"] { background: #23294a; color: #b7c2ff; border-color: #33407a; }
    .go-tool, .pal-item { background: #1c1f27; border-color: #333a49; color: #cbd2df; }
    .go-tool:hover, .pal-item:hover { background: #232734; }
  }
`,T=l(c(()=>p(()=>import("./grid-options.tsx_grid_options_component_KIT01Wm3e84-DPZY5qTb.js"),[],import.meta.url),"s_KIT01Wm3e84"));export{E as _auto_CSS,S as _auto_PALETTE,b as _auto_VIEWS,B as _auto_buildBoard,T as default};
