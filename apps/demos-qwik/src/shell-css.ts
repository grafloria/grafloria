/**
 * The gallery chrome, as a string so it is inlined in the server's first byte
 * (a `.css` import would arrive as a separate request and flash).
 */
export const SHELL_CSS = `
*, *::before, *::after { box-sizing: border-box; }
html, body { margin: 0; height: 100%; }
body {
  display: flex;
  font: 14px/1.5 ui-sans-serif, system-ui, sans-serif;
  background: #FCFCFF;
  color: #232A3D;
}
.sidebar {
  width: 260px;
  flex: 0 0 260px;
  border-right: 1px solid #E4E7F0;
  background: #fff;
  padding: 18px 14px;
  overflow-y: auto;
}
.sidebar h1 { font-size: 15px; margin: 0 0 14px; }
.sidebar h1 span {
  display: block;
  font-size: 11px;
  font-weight: 500;
  color: #6b7280;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.sidebar nav { display: flex; flex-direction: column; gap: 4px; }
.sidebar a {
  display: block;
  padding: 8px 10px;
  border-radius: 8px;
  text-decoration: none;
  color: inherit;
}
.sidebar a:hover { background: #F2F4FB; }
.sidebar a.active { background: #EEF2FF; box-shadow: inset 2px 0 0 #4F46E5; }
.sidebar a strong { display: block; font-size: 13px; font-weight: 600; }
.sidebar a em { display: block; font-size: 11px; font-style: normal; color: #6b7280; }
.sidebar .note { margin-top: 18px; font-size: 11px; color: #8a90a2; }
.stage { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; }
.stage > * { flex: 1 1 auto; min-height: 0; }
.toolbar {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 10px 14px;
  border-bottom: 1px solid #E4E7F0;
  background: #fff;
}
.toolbar button {
  font: inherit;
  font-size: 13px;
  padding: 5px 11px;
  border: 1px solid #D7DBE8;
  border-radius: 7px;
  background: #fff;
  cursor: pointer;
}
.toolbar button:hover { background: #F2F4FB; }
.toolbar .readout { font-size: 12px; color: #6b7280; margin-left: 4px; }
.canvas { flex: 1 1 auto; min-height: 0; }
`;
