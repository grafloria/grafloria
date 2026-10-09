// The step catalogue of the workflow-editor demo: ONE node template per step
// type — `(data, ctx) → { html, ports, size }` — plus a compact form for far
// zoom. Each KIND has a shape that says what it does:
//
//   trigger  — a "D": rounded where nothing comes in, a bolt, TRIGGER above its name
//   action   — an icon card (HTTP, edit fields, message, email)
//   if       — a decision: the condition as a code pill, two coloured branches
//              (true / false) on its right edge, each branch carrying its output
//   switch   — a router: the key it routes on, then one numbered rule per output
//   agent    — a wide card whose typed SLOTS (Model, Memory, Tool) hang underneath
//   model, memory, tool — round sub-nodes that plug UP into a slot
//
// Every element that stands for a port is marked `data-port`, so the library puts
// the port level with it (no hidden copy of the card, no measuring here). Port
// ids are `<node id>:<name>`: unique across the diagram.

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** What the "+" menu offers, and how each kind looks. */
export const KINDS = {
  trigger: { icon: '⚡', title: 'On form submit', hue: 'amber' },
  http: { icon: '⇅', title: 'HTTP request', hue: 'blue' },
  set: { icon: '✎', title: 'Edit fields', hue: 'slate' },
  if: { icon: '?', title: 'If', hue: 'green' },
  switch: { icon: '⇶', title: 'Switch', hue: 'violet' },
  slack: { icon: '#', title: 'Send a message', hue: 'pink' },
  email: { icon: '✉', title: 'Send email', hue: 'teal' },
  agent: { icon: '✦', title: 'AI agent', hue: 'indigo' },
  model: { icon: '◎', title: 'Chat model', hue: 'indigo' },
  memory: { icon: '◫', title: 'Window memory', hue: 'indigo' },
  tool: { icon: '⚙', title: 'Calculator', hue: 'indigo' },
};

/** What a "+" can add (sub-nodes plug into an AI step's slots, not into the flow). */
export const MENU = ['http', 'set', 'if', 'switch', 'slack', 'email', 'agent'];

const titleOf = (kind, data) => esc(data.title ?? KINDS[kind].title);
const ico = (kind) => `<span class="we-ico we-${KINDS[kind].hue}"><i>${KINDS[kind].icon}</i></span>`;
const head = (kind, data) =>
  `<div class="we-head">${ico(kind)}<span class="we-txt"><b>${titleOf(kind, data)}</b>${data.note ? `<small>${esc(data.note)}</small>` : ''}</span></div>`;
const compact = (kind) => (data) => `<div class="we-mini we-mini-${kind}">${ico(kind)}<b>${titleOf(kind, data)}</b></div>`;
const io = (id, { input = true, output = true } = {}) => [
  ...(input ? [{ id: `${id}:in`, side: 'left', type: 'input' }] : []),
  ...(output ? [{ id: `${id}:out`, side: 'right', type: 'output' }] : []),
];
/** AI slots and the sub-nodes that fill them use diamond ports, as AI wiring does in most flow tools. */
const DIAMOND = { shape: 'diamond', size: 12 };

const action = (kind) => ({
  render: (data, { node }) => ({
    html: `<div class="we-card we-action">${head(kind, data)}</div>`,
    ports: io(node.id),
    size: { width: 220, height: 64 },
  }),
  compact: compact(kind),
});

export const TEMPLATES = {
  http: action('http'),
  set: action('set'),
  slack: action('slack'),
  email: action('email'),

  // A trigger starts the flow: round on the side nothing can come in from.
  trigger: {
    render: (data, { node }) => ({
      html: `<div class="we-card we-trigger"><div class="we-head">${ico('trigger')}<span class="we-txt">` +
        `<em class="we-eyebrow">Trigger</em><b>${titleOf('trigger', data)}</b>${data.note ? `<small>${esc(data.note)}</small>` : ''}</span></div></div>`,
      ports: io(node.id, { input: false }),
      size: { width: 230, height: 72 },
    }),
    compact: compact('trigger'),
  },

  // An If is a DECISION: the condition it tests, then its two outcomes as
  // coloured branches on the right edge — each branch is where its output leaves.
  if: {
    render: (data, { node }) => ({
      html: `<div class="we-card we-if">${head('if', data)}` +
        `<div class="we-cond"><code>${esc(data.condition ?? 'condition')}</code></div>` +
        `<div class="we-branches">` +
        `<span class="we-branch we-true" data-port="${node.id}:true">✓ true</span>` +
        `<span class="we-branch we-false" data-port="${node.id}:false">✕ false</span>` +
        `</div></div>`,
      ports: [
        { id: `${node.id}:in`, side: 'left', type: 'input' },
        { id: `${node.id}:true`, side: 'right', type: 'output', index: 0, label: { text: 'true' } },
        { id: `${node.id}:false`, side: 'right', type: 'output', index: 1, label: { text: 'false' } },
      ],
      size: { width: 240, height: 152 },
    }),
    compact: compact('if'),
  },

  // A Switch ROUTES: the key it reads, then one numbered rule per output. Add or
  // drop a rule and the card, its ports and their order follow — through
  // SetNodeDataCommand, in one undo step.
  switch: {
    render: (data, { node }) => {
      const rules = data.rules ?? [];
      return {
        html: `<div class="we-card we-switch">${head('switch', data)}` +
          `<div class="we-cond">route by <code>${esc(data.key ?? 'value')}</code></div><div class="we-rows">` +
          rules.map((r, i) => `<div class="we-row" data-port="${node.id}:r${i}"><span class="we-n">${i}</span><span class="we-eq">= ${esc(r)}</span></div>`).join('') +
          `</div><div class="we-rule-tools"><button class="we-rule" data-act="add-rule" title="Add a rule">+ rule</button>` +
          (rules.length > 1 ? `<button class="we-rule" data-act="drop-rule" title="Remove the last rule">− rule</button>` : '') +
          `</div></div>`,
        ports: [
          { id: `${node.id}:in`, side: 'left', type: 'input' },
          ...rules.map((r, i) => ({ id: `${node.id}:r${i}`, side: 'right', type: 'output', index: i, label: { text: r } })),
        ],
        size: { width: 240, height: 64 + 30 + rules.length * 30 + 8 + 34 },
      };
    },
    compact: compact('switch'),
  },

  // An AI step: the flow runs through it left to right; its typed SLOTS hang
  // underneath, each a diamond port. The Model slot takes exactly one link.
  agent: {
    render: (data, { node }) => ({
      html: `<div class="we-card we-agent">${head('agent', data)}<div class="we-slots">` +
        `<span class="we-slot" data-port="${node.id}:model">Model<em>*</em></span>` +
        `<span class="we-slot" data-port="${node.id}:memory">Memory</span>` +
        `<span class="we-slot" data-port="${node.id}:tool">Tool</span></div></div>`,
      ports: [
        ...io(node.id),
        { id: `${node.id}:model`, side: 'bottom', type: 'input', dataType: 'ai', shape: DIAMOND, gating: { maxConnections: 1 } },
        { id: `${node.id}:memory`, side: 'bottom', type: 'input', dataType: 'ai', shape: DIAMOND },
        { id: `${node.id}:tool`, side: 'bottom', type: 'input', dataType: 'ai', shape: DIAMOND },
      ],
      size: { width: 280, height: 112 },
    }),
    compact: compact('agent'),
  },
};

// The sub-nodes an AI step's slots take: a round badge, its name beneath, and a
// diamond output on top that plugs UP into a slot. The badge is marked
// `data-run-shape`, so a run's status ring hugs the circle, not the caption.
for (const kind of ['model', 'memory', 'tool']) {
  TEMPLATES[kind] = {
    render: (data, { node }) => ({
      html: `<div class="we-sub"><span class="we-orb we-${KINDS[kind].hue}" data-port="${node.id}:out" data-run-shape>${KINDS[kind].icon}</span>` +
        `<b>${titleOf(kind, data)}</b>${data.note ? `<small>${esc(data.note)}</small>` : ''}</div>`,
      ports: [{ id: `${node.id}:out`, side: 'top', type: 'output', dataType: 'ai', shape: DIAMOND }],
      size: { width: 150, height: 104 },
    }),
    compact: (data) => `<div class="we-sub we-sub-mini"><span class="we-orb we-${KINDS[kind].hue}">${KINDS[kind].icon}</span></div>`,
  };
}

/** Which slot kind a sub-node feeds, by node type. */
export const SLOT_OF = { model: 'model', memory: 'memory', tool: 'tool' };
