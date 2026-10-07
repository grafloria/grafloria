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
//
// Framework apps (React, Vue, Angular, Qwik) mount it over the textarea they
// already bind: each keystroke lands in the textarea as a real `input` event,
// which is what onChange / v-model / ngModel / onInput$ listen for, and a value
// the framework writes into the textarea (another example picked) shows in the
// editor. `highlightBlock(pre, 'mermaid')` colours read-only text in place.

const CDN = 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs';
let loading = null;

/** Load Monaco once per page. Resolves to `monaco`, or null if it never came.
 *  The promise lives on `window` because the demo shell's source drawer loads
 *  Monaco too: two injected loader.js scripts throw "_amdLoaderGlobal has
 *  already been declared". */
function loadMonaco() {
  if (loading) return loading;
  if (window.__grafloriaMonaco) return (loading = window.__grafloriaMonaco);
  loading = window.__grafloriaMonaco = new Promise((resolve, reject) => {
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
        // sequence / state / gantt statements
        // (at a statement's start, and never where a node's name begins an edge:
        // `note --> x` or `note@{ … }` in a flowchart is a node called note)
        [/^(\s*)([Nn]ote)(?=\s+(left of|right of|over)\b)/, ['', 'keyword']],
        [/^(\s*)(participant|actor|activate|deactivate|loop|alt|opt|par|critical|break|rect|title|section|dateFormat|state|namespace)(?=\s+[^-=.>|&\s])/, ['', 'keyword']],
        [/^(\s*)(else|and|autonumber)(?=\s|$)/, ['', 'keyword']],
        [/\b(left of|right of|over)\b/, 'keyword'],
        [/\[\*\]/, 'type'],                                       // state start / end
        // ER keys and the attribute / member types
        [/\b(PK|FK|UK)\b/, 'type'],
        [/\b(string|int|integer|float|double|decimal|bool|boolean|date|datetime|timestamp|text|varchar|char|uuid|json|void|long|number|String|Integer|Boolean|List)\b/, 'type'],
        // ER cardinality  ||--o{  }|..|{   and class relations  <|--  *--  o--  ..>
        [/(\|\||\|o|o\||\}\||\|\{|\}o|o\{)(--|\.\.)(\|\||\|o|o\||\}\||\|\{|\}o|o\{)/, 'operator'],
        [/<\|--|--\|>|<\|\.\.|\.\.\|>|\*--|--\*|o--|--o(?=\s)|\.\.>|<\.\./, 'operator'],
        // sequence messages  ->>  -->>  -x  --x  -)  --)
        [/--?>>|--?[x)](?=\s)/, 'operator'],
        [/^(\s*)([+\-#~])(?=\w)/, ['', 'operator']],                // class member visibility
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
 * it loads, with a textarea-backed shim otherwise. Options: `language`,
 * `onChange`, `readOnly`, and `host` (an empty element to mount into, styled
 * `display:none` until the editor arrives — required on a Qwik page).
 */
export function mountCodeEditor(textarea, options = {}) {
  // One editor per textarea, however often a framework's effect runs.
  if (textarea?.__gfCodeEditor) return textarea.__gfCodeEditor;
  const mounted = mount(textarea, options);
  if (textarea) textarea.__gfCodeEditor = mounted;
  return mounted;
}

async function mount(textarea, { language = 'mermaid', onChange, readOnly = false, host: into } = {}) {
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

    // `host`: an empty element of the page's own to mount into. A Qwik page
    // needs one — Qwik re-reads a parent's DOM children on re-render and would
    // remove an editor inserted beside its textarea; a childless element's
    // inside it leaves alone. Otherwise the editor goes just before the textarea.
    let host = into;
    if (host) {
      host.style.display = 'block';
    } else {
      host = document.createElement('div');
      // Inherit the textarea's box so the demo's own layout still governs size.
      host.style.cssText = 'width:100%;height:100%;min-height:0;';
      textarea.parentElement.insertBefore(host, textarea);
    }
    host.classList.add('gf-code-editor');
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
      // Sticky scroll throws "Illegal value for lineNumber" when the text shrinks
      // twice in quick succession (the query builder's SQL on a busy machine);
      // a short code box has no scopes worth pinning anyway.
      stickyScroll: { enabled: false },
    });

    // The textarea remains canonical — mirror every edit into it. The write goes
    // through the prototype setter, under any framework's own value tracking
    // (React's), so the `input` event that follows reads as a real change.
    const proto = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
    let echo = false;
    editor.onDidChangeModelContent(() => {
      if (echo) return;
      proto.set.call(textarea, editor.getValue());
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      onChange?.(textarea.value);
    });
    // …and the other way: a value written INTO the textarea (a framework
    // re-rendering it, a demo's own code) shows in the editor.
    const inner = Object.getOwnPropertyDescriptor(textarea, 'value') ?? proto;
    Object.defineProperty(textarea, 'value', {
      configurable: true,
      get() { return inner.get.call(this); },
      set(v) {
        inner.set.call(this, v);
        const text = String(v ?? '');
        if (editor.getValue() !== text) { echo = true; editor.setValue(text); echo = false; }
      },
    });

    return {
      monaco: true,
      getValue: () => editor.getValue(),
      // An explicit write is an edit: it reports through onChange and `input`,
      // as a keystroke does. (A value set on the textarea updates quietly.)
      setValue: (v) => {
        if (editor.getValue() !== v) editor.setValue(v);
        textarea.value = v;
      },
      layout: () => editor.layout(),
    };
  } catch {
    textarea.style.display = '';
    if (into) into.style.display = 'none';
    return fallback;
  }
}

/**
 * Colour read-only text in place — a `<pre>` or `<code>` showing Mermaid (or
 * any Monaco language). Call again after changing its text. Leaves the plain
 * text as it is when Monaco never arrives.
 */
export async function highlightBlock(el, language = 'mermaid') {
  if (!el) return false;
  const monaco = await loadMonaco();
  if (!monaco) return false;
  try {
    if (language === 'mermaid') registerMermaid(monaco);
    const dark = matchMedia('(prefers-color-scheme: dark)').matches;
    el.setAttribute('data-lang', language);
    await monaco.editor.colorizeElement(el, { theme: dark ? 'vs-dark' : 'vs', tabSize: 2 });
    return true;
  } catch {
    return false;
  }
}
