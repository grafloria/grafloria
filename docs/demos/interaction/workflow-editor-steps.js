// The step catalogue of the workflow-editor demo: ONE node template per step
// type — `(data, ctx) → { html, ports, size }` — plus a compact form for far
// zoom. Every port a row stands for is marked `data-port`, so the library puts
// the port level with its row (no hidden copy of the card, no measuring here).
// Port ids are `<node id>:<name>`: unique across the diagram.

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** What the "+" menu offers, and how each kind looks. */
export const KINDS = {
  trigger: { icon: '⚡', title: 'On form submit', hue: 'amber' },
  http: { icon: '⇅', title: 'HTTP request', hue: 'blue' },
  set: { icon: '✎', title: 'Edit fields', hue: 'slate' },
  if: { icon: '⑂', title: 'If', hue: 'green' },
  switch: { icon: '⇶', title: 'Switch', hue: 'violet' },
  slack: { icon: '#', title: 'Send a message', hue: 'pink' },
  email: { icon: '✉', title: 'Send email', hue: 'teal' },
  agent: { icon: '✦', title: 'AI agent', hue: 'indigo' },
  model: { icon: '◎', title: 'Chat model', hue: 'indigo' },
  memory: { icon: '◫', title: 'Window memory', hue: 'indigo' },
  tool: { icon: '⚙', title: 'Calculator', hue: 'indigo' },
};

/** The steps a "+" can add (sub-nodes go under an AI agent's slots, not into the flow). */
export const MENU = ['http', 'set', 'if', 'switch', 'slack', 'email', 'agent'];

const head = (kind, data) => {
  const k = KINDS[kind];
  return `<div class="we-head"><span class="we-ico we-${k.hue}">${k.icon}</span><span class="we-txt"><b>${esc(data.title ?? k.title)}</b>${data.note ? `<small>${esc(data.note)}</small>` : ''}</span></div>`;
};
const compact = (kind) => (data) => {
  const k = KINDS[kind];
  return `<div class="we-mini"><span class="we-ico we-${k.hue}">${k.icon}</span><b>${esc(data.title ?? k.title)}</b></div>`;
};
const io = (id, { input = true, output = true } = {}) => [
  ...(input ? [{ id: `${id}:in`, side: 'left', type: 'input' }] : []),
  ...(output ? [{ id: `${id}:out`, side: 'right', type: 'output' }] : []),
];

const plain = (kind, opts) => ({
  render: (data, { node }) => ({
    html: `<div class="we-card">${head(kind, data)}</div>`,
    ports: io(node.id, opts),
    size: { width: 220, height: 64 },
  }),
  compact: compact(kind),
});

export const TEMPLATES = {
  trigger: plain('trigger', { input: false }),
  http: plain('http'),
  set: plain('set'),
  slack: plain('slack'),
  email: plain('email'),

  // An If: one row per outcome, each row marking its output.
  if: {
    render: (data, { node }) => ({
      html: `<div class="we-card">${head('if', data)}<div class="we-rows">` +
        `<div class="we-row" data-port="${node.id}:true"><span>true</span></div>` +
        `<div class="we-row" data-port="${node.id}:false"><span>false</span></div></div></div>`,
      ports: [
        { id: `${node.id}:in`, side: 'left', type: 'input' },
        { id: `${node.id}:true`, side: 'right', type: 'output', index: 0, label: { text: 'true' } },
        { id: `${node.id}:false`, side: 'right', type: 'output', index: 1, label: { text: 'false' } },
      ],
      size: { width: 220, height: 64 + 2 * 28 + 8 },
    }),
    compact: compact('if'),
  },

  // A Switch: its outputs ARE its rules. Add or drop a rule and the card, its
  // ports and their order follow — through SetNodeDataCommand, one undo step.
  switch: {
    render: (data, { node }) => {
      const rules = data.rules ?? [];
      return {
        html: `<div class="we-card">${head('switch', data)}<div class="we-rows">` +
          rules.map((r, i) => `<div class="we-row" data-port="${node.id}:r${i}"><span>${esc(r)}</span></div>`).join('') +
          `</div><div class="we-rule-tools"><button class="we-rule" data-act="add-rule" title="Add a rule">+ rule</button>` +
          (rules.length > 1 ? `<button class="we-rule" data-act="drop-rule" title="Remove the last rule">− rule</button>` : '') +
          `</div></div>`,
        ports: [
          { id: `${node.id}:in`, side: 'left', type: 'input' },
          ...rules.map((r, i) => ({ id: `${node.id}:r${i}`, side: 'right', type: 'output', index: i, label: { text: r } })),
        ],
        size: { width: 220, height: 64 + rules.length * 28 + 8 + 30 },
      };
    },
    compact: compact('switch'),
  },

  // An AI step: the flow runs left to right through it; its typed SLOTS hang
  // underneath. The Model slot takes exactly one link (gating), the others any.
  agent: {
    render: (data, { node }) => ({
      html: `<div class="we-card">${head('agent', data)}<div class="we-slots">` +
        `<span data-port="${node.id}:model">Model<em>*</em></span>` +
        `<span data-port="${node.id}:memory">Memory</span>` +
        `<span data-port="${node.id}:tool">Tool</span></div></div>`,
      ports: [
        ...io(node.id),
        { id: `${node.id}:model`, side: 'bottom', type: 'input', dataType: 'ai', gating: { maxConnections: 1 } },
        { id: `${node.id}:memory`, side: 'bottom', type: 'input', dataType: 'ai' },
        { id: `${node.id}:tool`, side: 'bottom', type: 'input', dataType: 'ai' },
      ],
      size: { width: 260, height: 104 },
    }),
    compact: compact('agent'),
  },
};

// The sub-nodes an AI step's slots take: one output, on TOP, into a slot.
for (const kind of ['model', 'memory', 'tool']) {
  TEMPLATES[kind] = {
    render: (data, { node }) => ({
      html: `<div class="we-card we-sub">${head(kind, data)}</div>`,
      ports: [{ id: `${node.id}:out`, side: 'top', type: 'output', dataType: 'ai' }],
      size: { width: 180, height: 56 },
    }),
    compact: compact(kind),
  };
}

/** Which slot kind a sub-node feeds, by node type. */
export const SLOT_OF = { model: 'model', memory: 'memory', tool: 'tool' };
