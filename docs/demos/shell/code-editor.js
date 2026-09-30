// A syntax-coloured code surface for the gallery's text demos.
//
// Monaco is loaded lazily from the CDN and mounted OVER an existing textarea.
// The textarea stays in the DOM and stays canonical: every Monaco keystroke
// writes straight back into `textarea.value`, so a demo that already reads
// `ta.value` — and a gate that already drives it — keeps working untouched.
// Programmatic writes go through `setValue()` so both halves stay in step.
//
// If Monaco never arrives (offline, CSP, CI without network) the textarea is
// simply left visible and fully functional. A demo must never depend on a CDN
// to work; this is polish, not plumbing.
//
//     const ed = await mountCodeEditor(document.getElementById('text'));
//     ed.setValue(src);          // programmatic write (both surfaces)
//     ed.getValue();             // always the live text

const CDN = 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs';
let loading = null;

/** Load Monaco once per page. Resolves to `monaco`, or null if it never came. */
function loadMonaco() {
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    if (window.monaco) return resolve(window.monaco);
    // A BLOB worker (page origin) can importScripts the CDN's CORS-enabled
    // worker; a data: worker has an opaque origin and is blocked.
    window.MonacoEnvironment = {
      getWorkerUrl: () => URL.createObjectURL(new Blob(
        [`self.MonacoEnvironment={baseUrl:'${CDN}/'};importScripts('${CDN}/base/worker/workerMain.js');`],
        { type: 'application/javascript' })),
    };
    const s = document.createElement('script');
    s.src = `${CDN}/loader.js`;
    s.onload = () => {
      window.require.config({ paths: { vs: CDN } });
      window.require(['vs/editor/editor.main'], () => resolve(window.monaco), reject);
    };
    s.onerror = reject;
    document.head.appendChild(s);
  }).catch(() => null);
  return loading;
}

/**
 * Mermaid is not a Monaco language. Registering a small tokenizer is what makes
 * the source actually READ as code — keywords, the arrow forms, node-shape
 * brackets, edge labels and quoted text each get their own colour.
 */
function registerMermaid(monaco) {
  if (monaco.languages.getLanguages().some((l) => l.id === 'mermaid')) return;
  monaco.languages.register({ id: 'mermaid' });
  monaco.languages.setMonarchTokensProvider('mermaid', {
    tokenizer: {
      root: [
        [/%%.*$/, 'comment'],
        [/\b(flowchart|graph|sequenceDiagram|classDiagram|erDiagram|stateDiagram(-v2)?|journey|gantt|pie|mindmap|timeline|gitGraph|quadrantChart|requirementDiagram|architecture-beta|block-beta|sankey-beta|xychart-beta|packet-beta|kanban)\b/, 'keyword'],
        // architecture-beta declarations and block-beta grid words, where a statement starts
        [/^(\s*)(service|group|junction|columns|block)\b/, ['', 'keyword']],
        [/\b(subgraph|end|direction|class|classDef|style|click|linkStyle)\b/, 'keyword'],
        [/\bspace\b(?=(:\d+)?(\s|$))/, 'keyword'],                 // block-beta: a hole in the grid
        [/\bin(?=\s+[\w-]+\s*$)/, 'keyword'],                     // … in cloud
        [/\b(TD|TB|BT|LR|RL)\b/, 'type'],
        [/:[TBLR]\b|\b[TBLR]:/, 'type'],                          // architecture sides  web:R --> L:api
        // any other word is ONE token — left to the per-character default, a rule
        // matched from inside it (`down1` → a number 1, `weekend` → keyword end)
        [/[A-Za-z_]\w*/, ''],
        [/(\()(cloud|database|disk|internet|server)(\))/, ['delimiter.bracket', 'type', 'delimiter.bracket']],
        [/(>)(\()(up|down|left|right|x|y)(\))/, ['delimiter.bracket', 'delimiter.bracket', 'type', 'delimiter.bracket']],
        [/\{group\}/, 'keyword'],
        [/(<?-)(\[)([^\]]*)(\])(->?)/, ['operator', 'operator', 'string', 'operator', 'operator']], // -[HTTPS]->
        [/\|[^|]*\|/, 'string'],            // edge label  -->|yes|
        [/<?(--+>|==+>|-\.-+>|--+|===+)/, 'operator'],
        [/"[^"]*"/, 'string'],
        // an unquoted label is words, not syntax: `[Log in]` must not colour `in`
        [/[[({](?=[^"[({])/, { token: 'delimiter.bracket', next: '@label' }],
        [/[[\](){}]/, 'delimiter.bracket'],
        [/#[0-9a-fA-F]{3,8}\b/, 'number'],  // style fill:#c8e6c9
        [/\b\d+\b/, 'number'],
      ],
      label: [
        [/[^\])}]+/, ''],
        [/[\])}]/, { token: 'delimiter.bracket', next: '@pop' }],
      ],
    },
  });
}

/**
 * Mount a coloured editor over `textarea`. Always resolves — with Monaco when
 * it loads, with a textarea-backed shim otherwise.
 */
export async function mountCodeEditor(textarea, { language = 'mermaid', onChange, readOnly = false } = {}) {
  const fallback = {
    monaco: false,
    getValue: () => textarea.value,
    setValue: (v) => { textarea.value = v; },
    layout: () => undefined,
  };
  if (!textarea) return fallback;
  if (readOnly) textarea.readOnly = true;   // the canonical surface obeys too

  const monaco = await loadMonaco();
  if (!monaco) return fallback;

  try {
    if (language === 'mermaid') registerMermaid(monaco);

    const host = document.createElement('div');
    host.className = 'gf-code-editor';
    // Inherit the textarea's box so the demo's own layout still governs size.
    host.style.cssText = 'width:100%;height:100%;min-height:0;';
    textarea.parentElement.insertBefore(host, textarea);
    textarea.style.display = 'none';

    const dark = matchMedia('(prefers-color-scheme: dark)').matches;
    const editor = monaco.editor.create(host, {
      value: textarea.value,
      language,
      theme: dark ? 'vs-dark' : 'vs',
      readOnly,
      minimap: { enabled: false },
      fontSize: 12.5,
      lineNumbers: 'on',
      scrollBeyondLastLine: false,
      automaticLayout: true,
      tabSize: 2,
      renderLineHighlight: 'none',
      padding: { top: 10 },
    });

    // The textarea remains canonical — mirror every edit into it.
    editor.onDidChangeModelContent(() => {
      textarea.value = editor.getValue();
      onChange?.(textarea.value);
    });

    return {
      monaco: true,
      getValue: () => editor.getValue(),
      setValue: (v) => {
        if (editor.getValue() !== v) editor.setValue(v);
        textarea.value = v;
      },
      layout: () => editor.layout(),
    };
  } catch {
    textarea.style.display = '';
    return fallback;
  }
}
