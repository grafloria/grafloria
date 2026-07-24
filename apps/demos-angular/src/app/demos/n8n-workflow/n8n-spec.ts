// The n8n-workflow demo's spec DATA + per-node registry, copied VERBATIM from
// the JS gallery source (demos/interaction/n8n-workflow.html). Only the mount
// idiom differs between frameworks — this data is identical everywhere.

/** A node in the renderer's structured, sanitized HTML-content tree. */
export interface HtmlNode {
  tag: string;
  className?: string;
  text?: string;
  children?: HtmlNode[];
}

export interface CardOpts {
  mono?: boolean;
  dangling?: boolean;
  status?: string;
  flash?: boolean;
}

// ---- palette / node-type catalogue ---------------------------------------
export const PALETTE: Record<string, { glyph: string; sub: string; mono?: boolean }> = {
  trigger: { glyph: '▶', sub: 'Trigger' },
  http: { glyph: '🌐', sub: 'HTTP Request' },
  set: { glyph: '✏️', sub: 'Edit Fields' },
  code: { glyph: '{}', sub: 'Code', mono: true },
  merge: { glyph: '🔀', sub: 'Merge' },
  if: { glyph: '⋔', sub: 'If' },
  ai: { glyph: '🤖', sub: 'AI Agent' },
  sheet: { glyph: '📊', sub: 'Spreadsheet File' },
  notify: { glyph: '🔔', sub: 'Send Message' },
};

// A node's HTML body: icon badge + title + type subtitle — the n8n card.
export const card = (
  cat: string,
  glyph: string,
  title: string,
  sub: string,
  opts: CardOpts = {},
): HtmlNode => ({
  tag: 'div',
  className:
    'n8n-card cat-' +
    cat +
    (opts.dangling ? ' dangling' : '') +
    (opts.status && opts.status !== 'idle' ? ' st-' + opts.status : '') +
    (opts.flash ? ' st-flash' : ''),
  children: [
    { tag: 'div', className: 'n8n-badge' + (opts.mono ? ' mono' : ''), text: glyph },
    {
      tag: 'div',
      className: 'n8n-body',
      children: [
        { tag: 'div', className: 'n8n-title', text: title },
        { tag: 'div', className: 'n8n-sub', text: sub },
      ],
    },
    ...(opts.status === 'completed'
      ? [{ tag: 'div', className: 'n8n-status ok', text: '✓' }]
      : opts.status === 'error'
        ? [{ tag: 'div', className: 'n8n-status err', text: '!' }]
        : opts.status === 'running'
          ? [{ tag: 'div', className: 'n8n-spin' }]
          : []),
  ],
});

// The node factory: a transparent SVG rect (so the HTML card's border is the
// only border) carrying the card in its foreignObject, plus explicit ports.
const N = (
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
  cat: string,
  glyph: string,
  title: string,
  sub: string,
  ports: any[],
  opts: CardOpts = {},
): any => ({
  id,
  position: { x, y },
  size: { width: w, height: h },
  metadata: { html: { content: card(cat, glyph, title, sub, opts), padding: 0 } },
  shape: { type: 'rect', fill: 'none', stroke: 'none' },
  style: { fill: 'transparent', stroke: 'transparent', strokeWidth: 0 },
  ports,
});

const PORT = { shape: 'circle', size: 10 };
const inPort = (id: string) => ({ id: id + '_in', side: 'left', type: 'input', shape: PORT });
const outPort = (id: string) => ({ id: id + '_out', side: 'right', type: 'output', shape: PORT });
// A port pinned to an exact node-local pixel (the FK→PK / bottom-AI pattern).
const absPort = (
  id: string,
  side: string,
  x: number,
  y: number,
  type: string,
  label?: string,
) => ({
  id,
  side,
  type,
  shape: PORT,
  layout: { strategy: 'absolute', args: { units: 'px', x, y } },
  ...(label
    ? {
        label: {
          text: label,
          layout: 'outside',
          offset: 8,
          fontSize: 11,
          fontWeight: 600,
          noNudge: true,
          className: 'ai-port-label',
        },
      }
    : {}),
});

// ---- the two line families + the branch colours --------------------------
export const MAIN = '#9aa2b1'; // gray solid — the main data flow
export const AI = '#8b5cf6'; // violet dashed — the ai_* sub-node connections
export const YES = '#16a34a'; // if → true
export const NO = '#dc2626'; // if → false

export const mainStyle = () => ({
  stroke: MAIN,
  strokeWidth: 2,
  arrowHead: { type: 'arrow', size: 8, filled: true },
});
export const aiStyle = () => ({
  stroke: AI,
  strokeWidth: 2,
  strokeDasharray: '2 5',
  arrowHead: { type: 'none' },
});

const mE = (id: string, s: string, sh: string, t: string, th: string) => ({
  id,
  source: s,
  target: t,
  sourceHandle: sh,
  targetHandle: th,
  type: 'bezier',
  style: mainStyle(),
});
const aE = (id: string, s: string, sh: string, t: string, th: string) => ({
  id,
  source: s,
  target: t,
  sourceHandle: sh,
  targetHandle: th,
  type: 'bezier',
  style: aiStyle(),
});
const bE = (
  id: string,
  sh: string,
  t: string,
  th: string,
  color: string,
  label: string,
) => ({
  id,
  source: 'ifNode',
  target: t,
  sourceHandle: sh,
  targetHandle: th,
  type: 'bezier',
  label,
  style: { stroke: color, strokeWidth: 2, arrowHead: { type: 'arrow', size: 8, filled: true } },
});

export const buildSpec = () => ({
  nodes: [
    N('start', 40, 180, 180, 64, 'trigger', '▶', 'On Start', 'Trigger', [outPort('start')]),
    N('login', 280, 180, 200, 64, 'http', '🌐', 'Login to PAMS', 'HTTP Request', [inPort('login'), outPort('login')]),
    N('setToken', 540, 180, 200, 64, 'set', '✏️', 'Set Bearer Token', 'Edit Fields', [inPort('setToken'), outPort('setToken')]),
    N('getBranches', 800, 80, 200, 64, 'http', '🌐', 'Get Branches', 'HTTP Request', [inPort('getBranches'), outPort('getBranches')]),
    N('getVendors', 800, 290, 200, 64, 'http', '🌐', 'Get Vendors', 'HTTP Request', [inPort('getVendors'), outPort('getVendors')]),
    N('merge', 1070, 180, 180, 64, 'merge', '🔀', 'Merge Lookups', 'Merge', [
      absPort('merge_in1', 'left', 0, 20, 'input'),
      absPort('merge_in2', 'left', 0, 44, 'input'),
      outPort('merge'),
    ]),
    N('store', 1310, 180, 200, 64, 'code', '{}', 'Store Lookup Data', 'Code', [inPort('store'), outPort('store')], { mono: true }),
    N('agent', 1570, 168, 210, 88, 'ai', '🤖', 'AI Quality Agent', 'AI Agent', [
      inPort('agent'),
      outPort('agent'),
      absPort('agent_model', 'bottom', 46, 88, 'input', 'Model'),
      absPort('agent_memory', 'bottom', 105, 88, 'input', 'Memory'),
      absPort('agent_tool', 'bottom', 164, 88, 'input', 'Tool'),
    ]),
    N('model', 1450, 390, 168, 58, 'ai', '🧠', 'Azure OpenAI', 'Chat Model', [absPort('model_aiout', 'top', 84, 0, 'output')]),
    N('memory', 1628, 390, 168, 58, 'ai', '💾', 'MongoDB Memory', 'Memory', [absPort('memory_aiout', 'top', 84, 0, 'output')]),
    N('tool', 1806, 390, 168, 58, 'ai', '🔧', 'Calendar Tool', 'Tool', [absPort('tool_aiout', 'top', 84, 0, 'output')]),
    N('ifNode', 1840, 180, 180, 64, 'if', '⋔', 'All Inquiries Done?', 'If', [
      inPort('ifNode'),
      absPort('if_true', 'right', 180, 20, 'output'),
      absPort('if_false', 'right', 180, 44, 'output'),
    ]),
    N('excel', 2090, 80, 200, 64, 'sheet', '📊', 'Write Summary', 'Spreadsheet File', [inPort('excel'), outPort('excel')]),
    N('wait', 2090, 290, 200, 64, 'set', '⏳', 'Wait & Retry', 'No-Op', [inPort('wait')]),
    N('slack', 2350, 80, 200, 64, 'notify', '🔔', 'Send Slack Alert', 'drag a wire to me', [inPort('slack'), outPort('slack')], { dangling: true }),
  ],
  edges: [
    mE('e_start_login', 'start', 'start_out', 'login', 'login_in'),
    mE('e_login_set', 'login', 'login_out', 'setToken', 'setToken_in'),
    mE('e_set_branches', 'setToken', 'setToken_out', 'getBranches', 'getBranches_in'),
    mE('e_set_vendors', 'setToken', 'setToken_out', 'getVendors', 'getVendors_in'),
    mE('e_branches_merge', 'getBranches', 'getBranches_out', 'merge', 'merge_in1'),
    mE('e_vendors_merge', 'getVendors', 'getVendors_out', 'merge', 'merge_in2'),
    mE('e_merge_store', 'merge', 'merge_out', 'store', 'store_in'),
    mE('e_store_agent', 'store', 'store_out', 'agent', 'agent_in'),
    mE('e_agent_if', 'agent', 'agent_out', 'ifNode', 'ifNode_in'),
    // IF branches — two labelled, colour-coded outputs.
    bE('if_true_excel', 'if_true', 'excel', 'excel_in', YES, 'true'),
    bE('if_false_wait', 'if_false', 'wait', 'wait_in', NO, 'false'),
    // AI sub-node connections — the distinct dashed violet family, on the bottom.
    aE('ai_model', 'model', 'model_aiout', 'agent', 'agent_model'),
    aE('ai_memory', 'memory', 'memory_aiout', 'agent', 'agent_memory'),
    aE('ai_tool', 'tool', 'tool_aiout', 'agent', 'agent_tool'),
  ],
});

// ---- the per-node registry the execution sim runs on ----------------------
export const KIND: Record<string, string> = {
  start: 'trigger', login: 'http', setToken: 'set', getBranches: 'http', getVendors: 'http',
  merge: 'merge', store: 'code', agent: 'ai', model: 'ai-model', memory: 'ai-memory',
  tool: 'ai-tool', ifNode: 'if', excel: 'sheet', wait: 'noop', slack: 'notify',
};
export const META: Record<string, { cat: string; glyph: string; sub: string; mono?: boolean }> = {
  start: { cat: 'trigger', glyph: '▶', sub: 'Trigger' },
  login: { cat: 'http', glyph: '🌐', sub: 'HTTP Request' },
  setToken: { cat: 'set', glyph: '✏️', sub: 'Edit Fields' },
  getBranches: { cat: 'http', glyph: '🌐', sub: 'HTTP Request' },
  getVendors: { cat: 'http', glyph: '🌐', sub: 'HTTP Request' },
  merge: { cat: 'merge', glyph: '🔀', sub: 'Merge' },
  store: { cat: 'code', glyph: '{}', sub: 'Code', mono: true },
  agent: { cat: 'ai', glyph: '🤖', sub: 'AI Agent' },
  model: { cat: 'ai', glyph: '🧠', sub: 'Chat Model' },
  memory: { cat: 'ai', glyph: '💾', sub: 'Memory' },
  tool: { cat: 'ai', glyph: '🔧', sub: 'Tool' },
  ifNode: { cat: 'if', glyph: '⋔', sub: 'If' },
  excel: { cat: 'sheet', glyph: '📊', sub: 'Spreadsheet File' },
  wait: { cat: 'set', glyph: '⏳', sub: 'No-Op' },
  slack: { cat: 'notify', glyph: '🔔', sub: 'Send Message' },
};
export const TITLES0: Record<string, string> = {
  start: 'On Start', login: 'Login to PAMS', setToken: 'Set Bearer Token', getBranches: 'Get Branches',
  getVendors: 'Get Vendors', merge: 'Merge Lookups', store: 'Store Lookup Data', agent: 'AI Quality Agent',
  model: 'Azure OpenAI', memory: 'MongoDB Memory', tool: 'Calendar Tool', ifNode: 'All Inquiries Done?',
  excel: 'Write Summary', wait: 'Wait & Retry', slack: 'Send Slack Alert',
};
// Per-kind default Parameters — what the NDV's centre form edits.
export const DEFAULT_PARAMS: Record<string, (id: string) => any> = {
  trigger: () => ({}),
  http: (id) =>
    id === 'login'
      ? { method: 'POST', url: 'https://pams.example/api/login', auth: 'None' }
      : id === 'getBranches'
        ? { method: 'GET', url: 'https://pams.example/api/branches', auth: 'Bearer Token' }
        : id === 'getVendors'
          ? { method: 'GET', url: 'https://pams.example/api/vendors?state=all', auth: 'Bearer Token' }
          : { method: 'GET', url: 'https://api.example.com/data', auth: 'None' },
  set: (id) =>
    id === 'wait'
      ? { fields: [{ name: 'retryAfter', value: '600' }] }
      : { fields: [{ name: 'authorization', value: 'Bearer {{ $json.token }}' }, { name: 'source', value: 'pams' }] },
  code: () => ({
    mode: 'Run Once for All Items',
    code: '// annotate each merged lookup row\nreturn items.map((it) => ({\n  ...it.json,\n  storedAt: "lookup_cache",\n}));',
  }),
  merge: () => ({ mode: 'Append', inputs: 2 }),
  if: () => ({ value1: '{{ $json.allDone }}', operation: 'is true', value2: '' }),
  ai: () => ({ prompt: 'Review the merged branch + vendor lookups and decide whether every inquiry is resolved.', model: 'gpt-5.5', temperature: 0.2 }),
  'ai-model': () => ({ deployment: 'gpt-5.5', apiVersion: 'v1' }),
  'ai-memory': () => ({ collection: 'agent_memory', contextWindow: 10 }),
  'ai-tool': () => ({ description: 'Look up the on-call calendar for a branch.' }),
  sheet: () => ({ operation: 'Write to file', file: 'quality-summary.xlsx' }),
  noop: () => ({ amount: 10, unit: 'seconds' }),
  notify: () => ({ channel: '#it-ops', text: 'Quality run finished: {{ $json.verdict }}' }),
};
// Simulated per-node execution time (ms) — DETERMINISTIC.
export const SIM_MS: Record<string, number> = {
  start: 3, login: 341, setToken: 12, getBranches: 512, getVendors: 387,
  merge: 24, store: 56, agent: 1240, ifNode: 9, excel: 96, wait: 11, slack: 74,
};

export const kindLabel: Record<string, string> = {
  trigger: 'Trigger', http: 'HTTP Request', set: 'Edit Fields', code: 'Code',
  merge: 'Merge', if: 'If', ai: 'AI Agent', 'ai-model': 'Chat Model', 'ai-memory': 'Memory',
  'ai-tool': 'Tool', sheet: 'Spreadsheet File', noop: 'No-Op', notify: 'Send Message',
};
export const CAT_BG: Record<string, string> = {
  trigger: '#10b981', http: '#0ea5e9', set: '#6366f1', code: '#475569',
  merge: '#06b6d4', if: '#f97316', ai: '#8b5cf6', sheet: '#22a565', notify: '#ec4899',
};

// The If node's condition, evaluated per ITEM the way n8n routes items.
export const evalIf = (items: any[], p: any) => {
  const key = (/\$json\.(\w+)/.exec(p.value1 || '') || [])[1];
  const val = (it: any) => (key ? it[key] : p.value1);
  const pass = (v: any) => {
    switch (p.operation) {
      case 'is true': return v === true;
      case 'is false': return v === false;
      case 'equals': return String(v) === String(p.value2);
      case 'not equals': return String(v) !== String(p.value2);
      case 'larger': return Number(v) > Number(p.value2);
      default: return !!v;
    }
  };
  const t: any[] = [], f: any[] = [];
  for (const it of items) (pass(val(it)) ? t : f).push(it);
  return { t, f };
};
