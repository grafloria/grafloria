import{_ as o}from"./preload-helper-D57DdDQb.js";import{y as r,L as t}from"./core.min-C7M5tFMw.js";import"./preloader-D7tuiBjF.js";const n=`
/* ---- the builder: a step editor on the left, the flow canvas on the right -- */
/* Full-bleed here (the gallery shell wraps the route), so the builder takes the
   whole viewport; the gallery page's own reset (box-sizing, colour scheme) is
   scoped to the builder and its measuring twin. */
#stage { display: grid; grid-template-columns: 300px 1fr; height: 100vh; min-height: 520px;
  color-scheme: light dark; -webkit-font-smoothing: antialiased; }
#stage *, #mc-measure * { box-sizing: border-box; }
#canvas { height: 100%; position: relative; overflow: hidden; background-color: #f2f3f5;
  background-image: radial-gradient(circle, #dde0e6 1px, transparent 1px); background-size: 24px 24px; }
#canvas foreignObject { overflow: visible; }
/* The node's SHAPE is the card: a 12px-rounded box (shape.cornerRadius), so
   a far zoom that drops the HTML still shows the card. The HTML only draws
   what is inside. Selected, a card changes its BORDER only — no extra ring —
   because every step says \`style: { selection: 'border' }\`. The fill is
   pinned because the theme also tints a HOVERED body, and these cards keep
   their colour. */
#canvas rect.diagram-node { fill: #fff !important; stroke: #e3e6eb; stroke-width: 1px; }

/* ---- a step card, painted inside each node's foreignObject ---------------- */
.mc-card { box-sizing: border-box; width: 100%; height: 100%; display: flex; flex-direction: column;
  background: transparent; color: #1f2430; border: 1px solid transparent; border-radius: 12px;
  box-shadow: 0 1px 2px rgba(16,24,40,.05), 0 3px 8px rgba(16,24,40,.05);
  font: 12px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans Arabic", sans-serif;
  letter-spacing: normal; text-align: left; overflow: hidden; }
/* The step the Preview is running: a green glow, apart from selection's blue border. */
.mc-card.mc-run { box-shadow: 0 0 0 3px rgba(34,177,76,.45), 0 4px 14px rgba(34,177,76,.2); }
.mc-head { display: flex; align-items: center; gap: 8px; padding: 9px 12px 6px; flex: none; }
.mc-ch { width: 22px; height: 22px; border-radius: 50%; flex: none; position: relative;
  background: linear-gradient(135deg, #1aa3ff, #0a62f5); }
.mc-ch::before { content: ""; position: absolute; left: 5px; top: 6px; width: 12px; height: 9px;
  border-radius: 6px 6px 6px 2px; background: #fff; }
.mc-ch::after { content: ""; position: absolute; left: 8px; top: 9px; width: 6px; height: 3px;
  border-left: 2px solid #0a62f5; border-bottom: 2px solid #0a62f5; transform: skewX(-25deg); opacity: .9; }
.mc-chan { font-size: 9.5px; color: #8a92a3; line-height: 1.2; }
.mc-title { font-size: 12.5px; font-weight: 600; color: #1f2430; line-height: 1.25;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mc-body { padding: 2px 12px 4px; display: flex; flex-direction: column; gap: 6px; }
.mc-bubble { background: #f3f4f7; border-radius: 10px; padding: 8px 9px; display: flex; flex-direction: column; gap: 5px; }
.mc-text { white-space: pre-wrap; unicode-bidi: plaintext; text-align: start; font-size: 11.5px; color: #2b303b;
  overflow-wrap: anywhere; }
.mc-text.mc-empty { color: #a3aab8; font-style: italic; }
.mc-link { color: #2f7cf6; }
.mc-btn { background: #fff; border: 1px solid #e6e8ed; border-radius: 7px; padding: 6px 12px;
  text-align: center; font-weight: 500; font-size: 11.5px; color: #1f2430; unicode-bidi: plaintext;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; position: relative; }
.mc-btn.mc-url { color: #2f7cf6; padding-right: 26px; padding-left: 26px; }
.mc-url-ico { position: absolute; right: 9px; top: 50%; transform: translateY(-50%); font-size: 11px; color: #f5a524; }
.mc-wait { display: flex; align-items: center; gap: 7px; background: #efefff; color: #4b47d6;
  border-radius: 8px; padding: 7px 10px; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mc-wait-ico { width: 14px; height: 14px; border: 1.6px solid #6461ea; border-radius: 50%; flex: none; box-sizing: border-box; }
.mc-delay { display: flex; align-items: center; gap: 7px; color: #5b6272; font-size: 11px; padding: 2px 2px; }
.mc-delay-ico { width: 12px; height: 12px; border: 1.5px solid #8a92a3; border-radius: 50%; flex: none; box-sizing: border-box; position: relative; }
.mc-img { height: 74px; border-radius: 10px; background: linear-gradient(135deg, #dbe7ff, #f2e6ff);
  display: flex; align-items: flex-end; padding: 7px 9px; box-sizing: border-box; color: #4a4f5c; font-size: 11px; }
.mc-foot { margin-top: auto; padding: 2px 0 8px; display: flex; flex-direction: column; }
.mc-out { text-align: right; padding: 3px 14px 3px 12px; font-size: 10.5px; color: #7d8596; white-space: nowrap; }
.mc-out.mc-reply { color: #b7791f; }
.mc-out.mc-noreply { color: #6b7280; }

/* trigger card */
.mc-head-trig { font-weight: 600; font-size: 12px; color: #1f2430; padding-top: 10px; }
.mc-bolt { color: #1f2430; font-size: 13px; }
.mc-trig-chip { display: flex; gap: 8px; align-items: center; background: #e4f7e8; border-radius: 9px; padding: 7px 9px; }
.mc-trig-chip .mc-ch { width: 18px; height: 18px; }
.mc-trig-chip .mc-ch::before { left: 4px; top: 5px; width: 10px; height: 7px; }
.mc-trig-chip .mc-ch::after { left: 6px; top: 7px; width: 5px; height: 2px; border-width: 1.5px; }
.mc-trig-l { font-size: 11px; color: #1d4d2b; font-weight: 500; line-height: 1.25; }
.mc-trig-s { font-size: 9.5px; color: #4f7a5c; }
.mc-new-trig { border: 1px dashed #c9cfda; border-radius: 9px; text-align: center; padding: 7px 0; color: #2f7cf6; font-size: 11px; }

/* actions card */
.mc-head-act { background: #fdeaa5; color: #5e4500; font-weight: 600; padding: 7px 12px; margin-bottom: 6px; }
.mc-action { padding: 2px 0; }
.mc-a-l { font-size: 11px; color: #5b6272; }
.mc-a-s { font-size: 11px; color: #1f2430; }

/* The dots. The theme colours .port-input/.port-output in CSS, which beats a
   glyph's own attributes, so the page names its four kinds here. The input
   stays invisible until a line is dragged: you drop on the whole card. */
/* A dot re-seated on a taller card must move WITH its line, not glide 0.2s
   behind it: only its hover growth animates. */
#canvas circle.port { stroke: #fff; stroke-width: 1.5px; transition-property: r, stroke-width, opacity !important; }
#canvas circle.port[data-port-id*="__b_"] { fill: #7d8698; }
#canvas circle.port[data-port-id$="__next"], #canvas circle.port[data-port-id$="__then"] { fill: #fff; stroke: #7d8698; }
#canvas circle.port[data-port-id$="__reply"] { fill: #f5a524; }
#canvas circle.port[data-port-id$="__noreply"] { fill: #ef4444; }
#canvas circle.port.port-input { fill: transparent; stroke: transparent; }
#canvas circle.port.port-input.port-highlighted { fill: #22b14c; stroke: #fff; }
#canvas circle.port.port-output:hover { stroke: #2f7cf6; stroke-width: 2.5px; }

/* hidden twin the page measures cards in, so every port lands on its row */
#mc-measure { position: absolute; left: -10000px; top: 0; visibility: hidden; pointer-events: none; }
#mc-measure .mc-card { height: auto; }

/* ---- the left step editor --------------------------------------------------- */
#side { border-right: 1px solid #e3e6eb; background: #fff; overflow-y: auto; color: #1f2430;
  font: 13px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; display: flex; flex-direction: column; }
.sd-top { padding: 14px 16px 12px; background: #f6f7f9; border-bottom: 1px solid #eceef2; display: grid; gap: 4px; }
.sd-kind { font-size: 10.5px; letter-spacing: .06em; text-transform: uppercase; color: #8a92a3; font-weight: 600; }
.sd-title { font: 600 16px/1.3 system-ui, sans-serif; border: 1px solid transparent; background: transparent;
  padding: 3px 6px; margin-left: -7px; border-radius: 6px; color: inherit; width: 100%; box-sizing: border-box; }
.sd-title:hover, .sd-title:focus { border-color: #d5d9e1; background: #fff; outline: none; }
.sd-sub { font-size: 12px; color: #5b6272; }
.sd-sub b { color: #2f7cf6; font-weight: 500; }
.sd-pad { padding: 14px 16px; display: grid; gap: 12px; align-content: start; }
.sd-block { border: 1px solid #e6e8ed; border-radius: 10px; padding: 10px; display: grid; gap: 8px; background: #fafbfc; }
.sd-bh { display: flex; align-items: center; justify-content: space-between; font-size: 11px; font-weight: 600;
  color: #5b6272; text-transform: uppercase; letter-spacing: .05em; }
.sd-block textarea { width: 100%; box-sizing: border-box; min-height: 92px; resize: vertical; border: 1px solid #dfe3ea;
  border-radius: 8px; padding: 8px 9px; font: 12.5px/1.5 system-ui, "Noto Sans Arabic", sans-serif; color: inherit; background: #fff; }
.sd-block input, .sd-block select { border: 1px solid #dfe3ea; border-radius: 7px; padding: 6px 8px; font: 12.5px/1.3 system-ui, sans-serif;
  color: inherit; background: #fff; min-width: 0; }
.sd-btns { display: grid; gap: 6px; }
.sd-btn { display: grid; grid-template-columns: 1fr auto auto; gap: 6px; align-items: center; }
.sd-btn input { text-align: center; }
.sd-row { display: flex; gap: 8px; align-items: center; font-size: 12.5px; }
.sd-row input[type=number] { width: 58px; }
.sd-row input:not([type]) { flex: 1; }
.sd-ib { border: 1px solid #dfe3ea; background: #fff; border-radius: 7px; width: 28px; height: 28px; cursor: pointer;
  color: #5b6272; font-size: 13px; line-height: 1; }
.sd-ib:hover { border-color: #b9c0cc; color: #1f2430; }
.sd-ib[aria-pressed="true"] { border-color: #f5a524; color: #b7791f; background: #fff8eb; }
.sd-add { border: 1px dashed #c3c9d4; background: #fff; color: #2f7cf6; border-radius: 8px; padding: 7px; cursor: pointer;
  font: 500 12.5px/1.2 system-ui, sans-serif; }
.sd-add:hover { border-color: #2f7cf6; }
.sd-label { font-size: 12px; color: #5b6272; padding-top: 4px; }
.sd-pal { display: grid; gap: 8px; }
.sd-pal button { display: grid; grid-template-columns: 30px 1fr; grid-template-rows: auto auto; column-gap: 8px; text-align: left;
  border: 1px dashed #c3c9d4; background: #fff; border-radius: 10px; padding: 8px 10px; cursor: pointer; color: inherit; }
.sd-pal button:hover { border-color: #2f7cf6; background: #f7faff; }
.sd-pal .ico { grid-row: span 2; align-self: center; font-size: 17px; color: #5b6272; text-align: center; }
.sd-pal b { font-weight: 500; font-size: 13px; }
.sd-pal small { color: #8a92a3; font-size: 11.5px; }
.sd-next { border: 1px dashed #8fb6f7; background: #f5f9ff; color: #2f7cf6; border-radius: 10px; padding: 10px; cursor: pointer;
  font: 500 13px/1.2 system-ui, sans-serif; }
.sd-next:hover { background: #ebf3ff; }
.sd-del { border: none; background: none; color: #d93636; cursor: pointer; font: 500 12.5px/1.2 system-ui, sans-serif; justify-self: start; padding: 4px 0; }
.sd-empty { padding: 18px 16px; display: grid; gap: 12px; color: #5b6272; font-size: 13px; }
.sd-empty h2 { margin: 0; font: 600 15px/1.3 system-ui, sans-serif; color: #1f2430; }
.sd-empty ul { margin: 0; padding-left: 18px; display: grid; gap: 6px; }
.sd-stat { display: flex; gap: 10px; }
.sd-stat div { flex: 1; border: 1px solid #e6e8ed; border-radius: 10px; padding: 8px 10px; font-variant-numeric: tabular-nums; }
.sd-stat b { display: block; font-size: 18px; color: #1f2430; }

/* ---- canvas chrome: the top bar, the + button, zoom, the next-step menu ---- */
.cv-top { position: absolute; left: 0; right: 0; top: 0; height: 46px; z-index: 6; display: flex; align-items: center; gap: 10px;
  padding: 0 14px; background: #fff; border-bottom: 1px solid #e6e8ed; font: 13px/1.2 system-ui, sans-serif; color: #5b6272; }
.cv-crumb b { color: #1f2430; font-weight: 600; }
.cv-live { background: #e5383b; color: #fff; font: 700 10px/1 system-ui, sans-serif; letter-spacing: .05em; padding: 4px 6px; border-radius: 4px; }
.cv-sp { flex: 1; }
#cv-saved { font-size: 12.5px; color: #3f8f5a; }
#cv-saved.dirty { color: #b7791f; }
.cv-btn { border: 1px solid #2f7cf6; color: #2f7cf6; background: #fff; border-radius: 7px; padding: 7px 13px; cursor: pointer; white-space: nowrap;
  font: 500 13px/1.2 system-ui, sans-serif; }
.cv-btn[aria-pressed="true"] { background: #eaf2ff; }
.cv-btn.primary { background: #2f7cf6; color: #fff; }
.cv-btn:disabled { opacity: .45; cursor: default; }
#cv-fab { position: absolute; right: 22px; top: 62px; z-index: 6; width: 46px; height: 46px; border-radius: 50%; border: none;
  background: #2f7cf6; color: #fff; font: 300 28px/1 system-ui, sans-serif; cursor: pointer; box-shadow: 0 6px 16px rgba(47,124,246,.35); }
.cv-zoom { position: absolute; right: 22px; bottom: 22px; z-index: 6; display: grid; gap: 6px; }
.cv-zoom button { width: 34px; height: 34px; border: 1px solid #dfe3ea; background: #fff; border-radius: 8px; cursor: pointer;
  color: #3c4250; font: 500 16px/1 system-ui, sans-serif; }
.cv-hint[hidden] { display: none; }
.cv-hint { position: absolute; left: 50%; top: 56px; transform: translateX(-50%); z-index: 5; background: #e9ecf1; color: #5b6272;
  font: 12px/1.2 system-ui, sans-serif; padding: 6px 12px; border-radius: 7px; pointer-events: none; white-space: nowrap; }
#mc-menu { position: absolute; z-index: 20; width: 230px; background: #fff; border: 1px solid #e3e6eb; border-radius: 12px;
  box-shadow: 0 12px 32px rgba(16,24,40,.16); padding: 8px; display: grid; gap: 4px; font: 13px/1.3 system-ui, sans-serif; }
#mc-menu[hidden] { display: none; }
#mc-menu .mh { font-size: 11px; font-weight: 600; color: #8a92a3; text-transform: uppercase; letter-spacing: .05em; padding: 4px 6px 6px; }
#mc-menu button { display: flex; align-items: center; gap: 9px; border: none; background: none; text-align: left; padding: 8px 8px;
  border-radius: 8px; cursor: pointer; color: #1f2430; font: inherit; }
#mc-menu button:hover, #mc-menu button:focus-visible { background: #f2f5fa; outline: none; }
#mc-menu .dot { width: 22px; height: 22px; border-radius: 6px; flex: none; }

/* ---- the Preview: the bot, run for real, beside the canvas ----------------- */
#pv { position: absolute; right: 14px; top: 58px; bottom: 14px; width: 330px; z-index: 8; display: flex; flex-direction: column;
  background: #fff; border: 1px solid #e3e6eb; border-radius: 16px; box-shadow: 0 16px 40px rgba(16,24,40,.18); overflow: hidden;
  font: 13px/1.4 system-ui, -apple-system, "Segoe UI", "Noto Sans Arabic", sans-serif; color: #1f2430; }
#pv[hidden] { display: none; }
.pv-head { display: flex; align-items: center; gap: 9px; padding: 11px 12px; border-bottom: 1px solid #eceef2; }
.pv-head .mc-ch { width: 30px; height: 30px; }
.pv-head .mc-ch::before { left: 7px; top: 9px; width: 16px; height: 12px; }
.pv-head .mc-ch::after { left: 11px; top: 13px; width: 8px; height: 4px; }
.pv-name { font-weight: 600; font-size: 13.5px; }
.pv-sub { font-size: 11px; color: #8a92a3; }
.pv-head .sp { flex: 1; }
.pv-head button { border: 1px solid #dfe3ea; background: #fff; border-radius: 7px; padding: 5px 9px; cursor: pointer; font: 500 12px/1.2 system-ui, sans-serif; color: #3c4250; }
#pv-chat { flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 6px; background: #fafbfc; }
.pv-msg { max-width: 82%; padding: 8px 11px; border-radius: 16px; white-space: pre-wrap; unicode-bidi: plaintext; text-align: start;
  overflow-wrap: anywhere; font-size: 12.5px; }
.pv-bot { align-self: flex-start; background: #eceef2; border-bottom-left-radius: 5px; }
.pv-user { align-self: flex-end; background: #0a7cff; color: #fff; border-bottom-right-radius: 5px; }
.pv-sys { align-self: center; font-size: 11px; color: #8a92a3; text-align: center; padding: 2px 8px; }
.pv-sys.act { color: #9a6b00; background: #fff6dc; border-radius: 8px; padding: 4px 9px; }
.pv-btns { align-self: flex-start; display: grid; gap: 5px; width: 74%; margin-bottom: 4px; }
.pv-btns button { border: 1px solid #cfd8e6; background: #fff; color: #0a62f5; border-radius: 16px; padding: 7px 10px; cursor: pointer;
  font: 500 12.5px/1.2 system-ui, "Noto Sans Arabic", sans-serif; unicode-bidi: plaintext; }
.pv-btns button.chosen { background: #e8f1ff; border-color: #8fb6f7; }
.pv-img { align-self: flex-start; width: 70%; height: 110px; border-radius: 14px; background: linear-gradient(135deg, #dbe7ff, #f2e6ff);
  display: flex; align-items: flex-end; padding: 8px 10px; box-sizing: border-box; font-size: 11.5px; color: #4a4f5c; }
.pv-typing { align-self: flex-start; background: #eceef2; border-radius: 16px; padding: 10px 12px; display: flex; gap: 4px; }
.pv-typing i { width: 6px; height: 6px; border-radius: 50%; background: #9aa1ae; animation: pvdot 1s infinite; }
.pv-typing i:nth-child(2) { animation-delay: .15s; } .pv-typing i:nth-child(3) { animation-delay: .3s; }
@keyframes pvdot { 0%, 60%, 100% { opacity: .35; } 30% { opacity: 1; } }
.pv-foot { border-top: 1px solid #eceef2; padding: 9px 10px; display: grid; gap: 7px; }
.pv-wait { font-size: 11.5px; color: #4b47d6; display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.pv-wait[hidden] { display: none; }
.pv-wait button { border: 1px solid #f3b4b4; color: #c53030; background: #fff; border-radius: 7px; padding: 4px 8px; cursor: pointer; font: 500 11.5px/1.2 system-ui, sans-serif; }
.pv-in { display: flex; gap: 6px; }
.pv-in input { flex: 1; border: 1px solid #dfe3ea; border-radius: 18px; padding: 8px 12px; font: 13px/1.2 system-ui, sans-serif; min-width: 0; }
.pv-in button { border: none; background: #0a7cff; color: #fff; border-radius: 18px; padding: 0 14px; cursor: pointer; font: 600 12.5px/1 system-ui, sans-serif; }
.pv-in button:disabled, .pv-in input:disabled { opacity: .5; cursor: default; }

@media (prefers-color-scheme: dark) {
  #canvas { background-color: #15171c; background-image: radial-gradient(circle, #262a33 1px, transparent 1px); }
  .mc-card { color: #e6e9ef; box-shadow: 0 1px 2px rgba(0,0,0,.3); }
  #canvas rect.diagram-node { fill: #22252d !important; stroke: #343844; }
  .mc-title, .mc-head-trig, .mc-bolt, .mc-a-s { color: #eef0f4; }
  .mc-bubble { background: #2c3039; }
  .mc-text { color: #d9dde5; }
  .mc-btn { background: #22252d; border-color: #3a3f4b; color: #e6e9ef; }
  .mc-wait { background: #2b2b4d; color: #b5b3ff; }
  .mc-delay, .mc-a-l { color: #a3aab8; }
  .mc-trig-chip { background: #1e3a28; } .mc-trig-l { color: #c4ecd0; } .mc-trig-s { color: #8fbf9e; }
  .mc-new-trig { border-color: #3a3f4b; }
  .mc-head-act { background: #4a3b10; color: #f8dd8a; }
  .mc-out { color: #9aa1ae; } .mc-out.mc-reply { color: #e0a43a; }
  #canvas circle.port { stroke: #22252d; }
  #canvas circle.port[data-port-id$="__next"], #canvas circle.port[data-port-id$="__then"] { fill: #22252d; stroke: #9aa1ae; }
  #canvas circle.port.port-input { fill: transparent; stroke: transparent; }
  #side { background: #1b1d23; border-right-color: #2c2f38; color: #e6e9ef; }
  .sd-top { background: #20232a; border-bottom-color: #2c2f38; }
  .sd-sub, .sd-label, .sd-bh, .sd-empty { color: #a3aab8; }
  .sd-block { background: #20232a; border-color: #2f333d; }
  .sd-block textarea, .sd-block input, .sd-block select, .sd-ib, .sd-add, .sd-pal button { background: #191b21; border-color: #343844; color: #e6e9ef; }
  .sd-title:hover, .sd-title:focus { background: #191b21; border-color: #343844; }
  .sd-next { background: #1c2536; border-color: #33507d; }
  .sd-empty h2, .sd-stat b { color: #eef0f4; } .sd-stat div { border-color: #2f333d; }
  .cv-top { background: #1b1d23; border-bottom-color: #2c2f38; color: #a3aab8; }
  .cv-crumb b { color: #eef0f4; }
  .cv-btn { background: #1b1d23; } .cv-btn[aria-pressed="true"] { background: #1c2a44; }
  .cv-zoom button { background: #22252d; border-color: #343844; color: #d9dde5; }
  .cv-hint { background: #23262e; color: #a3aab8; }
  #mc-menu, #pv { background: #22252d; border-color: #343844; color: #e6e9ef; }
  #mc-menu button { color: #e6e9ef; } #mc-menu button:hover { background: #2c3039; }
  .pv-head { border-bottom-color: #2f333d; } .pv-foot { border-top-color: #2f333d; }
  .pv-head button, .pv-in input { background: #191b21; border-color: #343844; color: #e6e9ef; }
  #pv-chat { background: #1d2026; } .pv-bot, .pv-typing { background: #2c3039; color: #e6e9ef; }
  .pv-btns button { background: #22252d; border-color: #3a4a66; color: #8fb6f7; }
  .pv-btns button.chosen { background: #1c2a44; }
  .pv-sys.act { background: #3a3013; color: #f0cf74; }
  .pv-wait button { background: #2a1d1f; border-color: #6b2b2b; color: #f19a9a; }
}
@media (prefers-reduced-motion: reduce) { .pv-typing i { animation: none; } }
`,s=[],c={portVisibility:"always"},l={display:"block",height:"100%",width:"100%"},f=["Phone","Email","Text"],x=e=>e==="text"?"Text":e==="collect"?"Data collection":e==="delay"?"Delay":"Image";function b(e,i){return e}const g=r(t(()=>o(()=>import("./chatbot-flow.tsx_chatbot_flow_component_HOFeeg49K18-DrOOPZzU.js"),[],import.meta.url),"s_HOFeeg49K18"));export{n as _auto_CSS,f as _auto_FIELDS,l as _auto_FLOW_STYLE,c as _auto_INTERACTION,s as _auto_NO_NODES,b as _auto_at,x as _auto_blockName,g as default};
