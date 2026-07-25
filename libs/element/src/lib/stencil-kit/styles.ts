/**
 * Stencil-palette styles, injected once per document (same discipline as the
 * dashboard kit: the kit owns its chrome so a host gets a working palette
 * without copying CSS, and every colour is a themable custom property).
 */
const STENCIL_KIT_STYLE_ID = 'grafloria-stencil-kit-styles';

const CSS = `
.gf-stencil {
  --gf-st-bg: #fff; --gf-st-ink: #1e2436; --gf-st-mut: #6b7280;
  --gf-st-line: #e5e7eb; --gf-st-accent: #3B52D9; --gf-st-hover: #f5f7ff;
  display: flex; flex-direction: column; min-height: 0; height: 100%;
  background: var(--gf-st-bg); color: var(--gf-st-ink);
  font: 13px/1.4 ui-sans-serif, system-ui, -apple-system, sans-serif;
  border-right: 1px solid var(--gf-st-line); box-sizing: border-box;
}
@media (prefers-color-scheme: dark) {
  .gf-stencil {
    --gf-st-bg: #161a24; --gf-st-ink: #e8ecfb; --gf-st-mut: #9aa4bf;
    --gf-st-line: #2a3040; --gf-st-accent: #8fa2ff; --gf-st-hover: #1e2536;
  }
}
.gf-stencil-search { padding: 10px; border-bottom: 1px solid var(--gf-st-line); }
.gf-stencil-search input {
  width: 100%; box-sizing: border-box; padding: 7px 10px; border-radius: 8px;
  border: 1px solid var(--gf-st-line); background: var(--gf-st-bg);
  color: var(--gf-st-ink); font: inherit; outline: none;
}
.gf-stencil-search input:focus { border-color: var(--gf-st-accent); }
.gf-stencil-body { overflow: auto; flex: 1; min-height: 0; padding-bottom: 8px; }
.gf-stencil-group > summary {
  cursor: pointer; padding: 8px 10px; font-weight: 600; font-size: 12px;
  letter-spacing: .02em; text-transform: uppercase; color: var(--gf-st-mut);
  list-style: none; user-select: none; display: flex; align-items: center; gap: 6px;
}
.gf-stencil-group > summary::-webkit-details-marker { display: none; }
.gf-stencil-group > summary::before { content: '▸'; font-size: 10px; transition: transform .15s; }
.gf-stencil-group[open] > summary::before { transform: rotate(90deg); }
.gf-stencil-group > summary:hover { color: var(--gf-st-ink); }
.gf-stencil-count { margin-left: auto; font-weight: 500; opacity: .7; text-transform: none; }
.gf-stencil-items {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(74px, 1fr));
  gap: 4px; padding: 2px 8px 10px;
}
.gf-stencil-item {
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  padding: 8px 4px; border-radius: 8px; cursor: grab; border: 1px solid transparent;
  text-align: center; background: none;
}
.gf-stencil-item:hover { background: var(--gf-st-hover); border-color: var(--gf-st-line); }
.gf-stencil-item:active { cursor: grabbing; }
.gf-stencil-item svg { display: block; overflow: visible; }
.gf-stencil-label {
  font-size: 10.5px; color: var(--gf-st-mut); line-height: 1.25;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
  overflow: hidden; word-break: break-word;
}
.gf-stencil-item:hover .gf-stencil-label { color: var(--gf-st-ink); }
.gf-stencil-empty { padding: 18px 12px; color: var(--gf-st-mut); font-size: 12px; text-align: center; }
.gf-shapedata {
  --gf-st-bg: #fff; --gf-st-ink: #1e2436; --gf-st-mut: #6b7280;
  --gf-st-line: #e5e7eb; --gf-st-accent: #3B52D9;
  display: flex; flex-direction: column; height: 100%; box-sizing: border-box;
  background: var(--gf-st-bg); color: var(--gf-st-ink); overflow: auto;
  font: 13px/1.4 ui-sans-serif, system-ui, -apple-system, sans-serif;
  border-left: 1px solid var(--gf-st-line);
}
@media (prefers-color-scheme: dark) {
  .gf-shapedata { --gf-st-bg: #161a24; --gf-st-ink: #e8ecfb; --gf-st-mut: #9aa4bf; --gf-st-line: #2a3040; --gf-st-accent: #8fa2ff; }
}
.gf-sd-title {
  padding: 10px 12px; font-weight: 600; font-size: 12px; text-transform: uppercase;
  letter-spacing: .02em; color: var(--gf-st-mut); border-bottom: 1px solid var(--gf-st-line);
}
.gf-sd-empty { padding: 16px 12px; color: var(--gf-st-mut); font-size: 12px; }
.gf-sd-fields { display: flex; flex-direction: column; gap: 8px; padding: 12px; }
.gf-sd-row { display: flex; flex-direction: column; gap: 3px; }
.gf-sd-label { font-size: 11px; color: var(--gf-st-mut); }
.gf-sd-input {
  padding: 6px 8px; border: 1px solid var(--gf-st-line); border-radius: 7px;
  background: var(--gf-st-bg); color: var(--gf-st-ink); font: inherit; outline: none; width: 100%; box-sizing: border-box;
}
.gf-sd-input:focus { border-color: var(--gf-st-accent); }
.gf-sd-check { width: 16px; height: 16px; accent-color: var(--gf-st-accent); }
.gf-sd-section {
  font-size: 10.5px; font-weight: 600; text-transform: uppercase; letter-spacing: .04em;
  color: var(--gf-st-mut); margin: 10px 0 2px; padding-top: 8px; border-top: 1px solid var(--gf-st-line);
}
.gf-sd-section:first-child { margin-top: 0; padding-top: 0; border-top: 0; }
.gf-sd-danger {
  margin-top: 8px; padding: 6px 10px; border-radius: 7px; cursor: pointer;
  border: 1px solid #fecaca; background: #fef2f2; color: #b91c1c;
  font: 600 12px ui-sans-serif, system-ui, sans-serif;
}
.gf-sd-danger:hover { background: #fee2e2; }
@media (prefers-color-scheme: dark) {
  .gf-sd-danger { background: #2a1414; border-color: #7f1d1d; color: #fca5a5; }
}

/* The canvas while a stencil is held over it. */
.gf-stencil-target { outline: 2px dashed var(--gf-st-accent); outline-offset: -3px; }
`;

/** Inject the palette stylesheet once per document. */
export function ensureStencilKitStyles(doc: Document = document): void {
  if (doc.getElementById(STENCIL_KIT_STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STENCIL_KIT_STYLE_ID;
  style.textContent = CSS;
  doc.head.appendChild(style);
}
