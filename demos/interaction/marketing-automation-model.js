// marketing-automation-model.js — the framework-free half of the Marketing
// automation studio demo (marketing-automation.html).
//
//   • the step catalogue (what a visitor can insert) and the sample automation
//   • the tree edits: insert at a slot, delete (children re-attach), add / remove
//     a branch path — all mutate a plain JSON state, so a snapshot of it IS the
//     undo history and the Save file
//   • the guided top-down layout: a tidy tree — steps stacked on one spine, a
//     Branch fanning its paths out in columns centred under it
//   • the Test flow planner: which path one sample contact takes, and the log
//
// Nothing here touches the DOM or the diagram engine; the page draws what this
// computes.

export const clone = (o) => JSON.parse(JSON.stringify(o));

// ---- the catalogue ------------------------------------------------------------
// `group` is the section of the "+" menu; `named` means the card title is the
// visitor's own name for the step (Delay and Lead score titles are derived).
export const KINDS = {
  trigger:  { label: 'Trigger',            icon: 'flag',  tone: 'indigo' },
  email:    { label: 'Send email',         icon: 'mail',  tone: 'sky',    group: 'Actions', named: true, desc: 'Send a marketing email' },
  slack:    { label: 'Send Slack message', icon: 'slack', tone: 'plum',   group: 'Actions', named: true, desc: 'Post to a team channel' },
  task:     { label: 'Create task',        icon: 'task',  tone: 'green',  group: 'Actions', named: true, desc: 'Give someone a to-do' },
  score:    { label: 'Adjust lead score',  icon: 'gauge', tone: 'orange', group: 'Actions', desc: 'Add or remove points' },
  audience: { label: 'Add to audience',    icon: 'users', tone: 'pink',   group: 'Actions', named: true, desc: 'Sync to an ads audience' },
  webhook:  { label: 'Webhook',            icon: 'bolt',  tone: 'slate',  group: 'Actions', named: true, desc: 'Call another system' },
  delay:    { label: 'Delay',              icon: 'clock', tone: 'violet', group: 'Timing', desc: 'Wait before the next step' },
  branch:   { label: 'Branch',             icon: 'fork',  tone: 'amber',  group: 'Logic', named: true, desc: 'Split by a contact property' },
};
export const MENU_GROUPS = ['Actions', 'Timing', 'Logic'];

// What a Branch can split on, and the values each property takes.
export const BRANCH_PROPS = {
  lifecycleStage:    { label: 'Lifecycle stage', values: [['customer', 'Customer'], ['opportunity', 'Opportunity'], ['lead', 'Lead'], ['subscriber', 'Subscriber']] },
  repliedToFollowUp: { label: 'Replied to the last email', values: [['yes', 'Yes'], ['no', 'No']] },
  openedLastEmail:   { label: 'Opened the last email', values: [['yes', 'Yes'], ['no', 'No']] },
  companySize:       { label: 'Company size', values: [['1-50', '1–50 people'], ['51-500', '51–500 people'], ['500+', '500+ people']] },
  country:           { label: 'Country', values: [['US', 'United States'], ['DE', 'Germany'], ['EG', 'Egypt'], ['IN', 'India']] },
};

// The trigger's criteria — each one set shows as a removable chip on the card.
export const CRITERIA = {
  formId:    { label: 'Form ID',            chip: (v) => `Form · ${v}`,  fallback: 'contact-us' },
  pageUrl:   { label: 'Page URL',           chip: (v) => `Page · ${v}`,  fallback: '/pricing' },
  utmSource: { label: 'UTM source',         chip: (v) => `UTM · ${v}`,   fallback: 'newsletter' },
  minScore:  { label: 'Minimum lead score', chip: (v) => `Score ≥ ${v}`, fallback: 10 },
};
export const TRIGGER_EVENTS = { form: 'A contact submits a form', webinar: 'A contact registers for a webinar', page: 'A contact views a page' };

export const EMAIL_TEMPLATES = ['Webinar replay', 'Nurture · 3 ideas', 'Case study · Northwind', 'Pricing overview', 'Product update'];
export const TASK_OWNERS = ['Deal owner', 'Account manager', 'Marketing ops', 'Contact owner'];
export const AUDIENCES = ['Webinar retargeting', 'Lookalike · trial users', 'Newsletter subscribers'];
export const NETWORKS = ['LinkedIn Ads', 'Google Ads', 'Meta Ads'];
export const DELAY_UNITS = ['minutes', 'hours', 'days', 'weeks'];

// The people the Test flow can run through the automation.
export const CONTACTS = [
  { id: 'maya',  name: 'Maya Chen',    initials: 'MC', company: 'Northwind Labs', stage: 'lead',        replied: true,  opened: true,  size: '51-500', country: 'US', score: 34, utm: 'linkedin', blurb: 'Lead · replies to the follow-up' },
  { id: 'omar',  name: 'Omar Haddad',  initials: 'OH', company: 'Delta Freight',  stage: 'lead',        replied: false, opened: false, size: '1-50',   country: 'EG', score: 28, utm: 'linkedin', blurb: 'Lead · never replies' },
  { id: 'priya', name: 'Priya Nair',   initials: 'PN', company: 'Brightpath',     stage: 'customer',    replied: true,  opened: true,  size: '500+',   country: 'IN', score: 61, utm: 'linkedin', blurb: 'Customer' },
  { id: 'lucas', name: 'Lucas Moreau', initials: 'LM', company: 'Atelier Nord',   stage: 'opportunity', replied: false, opened: true,  size: '51-500', country: 'DE', score: 47, utm: 'linkedin', blurb: 'Opportunity · open deal' },
];
export function contactValue(c, property) {
  switch (property) {
    case 'lifecycleStage': return c.stage;
    case 'repliedToFollowUp': return c.replied ? 'yes' : 'no';
    case 'openedLastEmail': return c.opened ? 'yes' : 'no';
    case 'companySize': return c.size;
    case 'country': return c.country;
    default: return undefined;
  }
}

// ---- the sample: a webinar follow-up ---------------------------------------
export function sampleAutomation() {
  const step = (id, kind, title, props, next = null, extra = {}) => ({ id, kind, title, props, next, ...extra });
  const steps = [
    step('trigger', 'trigger', 'When this happens',
      { event: 'webinar', formId: 'webinar-q4-tour', pageUrl: '', utmSource: 'linkedin', minScore: 20 }, 'email1'),
    step('email1', 'email', 'Send the webinar replay',
      { template: 'Webinar replay', subject: 'Your replay + the slides from today', sender: 'Dana Ruiz · Lumenly' }, 'stage'),
    step('stage', 'branch', 'Check lifecycle stage', { property: 'lifecycleStage' }, null, { arms: [
      { id: 'a-cust', label: 'Customer', value: 'customer', next: 'slackCs' },
      { id: 'a-opp', label: 'Opportunity', value: 'opportunity', next: 'slackDeal' },
      { id: 'a-lead', label: 'Lead', value: 'lead', next: 'wait1' },
      { id: 'a-other', label: 'Other', value: '*', isDefault: true, next: 'taskReview' },
    ] }),
    step('slackCs', 'slack', 'Tell Customer Success',
      { channel: '#customer-success', message: '{{contact.name}} watched the Q4 tour: a good moment for an expansion chat.' }),
    step('slackDeal', 'slack', 'Ping the deal owner',
      { channel: '#sales-deals', message: '{{contact.name}} has an open deal and just attended the product tour.' }, 'taskCall'),
    step('taskCall', 'task', 'Book a follow-up call', { owner: 'Deal owner', due: 2 }),
    step('wait1', 'delay', '', { amount: 1, unit: 'days' }, 'email2'),
    step('email2', 'email', 'Send “3 ideas” follow-up',
      { template: 'Nurture · 3 ideas', subject: '3 ideas from the tour you can try this week', sender: 'Dana Ruiz · Lumenly' }, 'wait3'),
    step('wait3', 'delay', '', { amount: 3, unit: 'days' }, 'replied'),
    step('replied', 'branch', 'Replied to the email?', { property: 'repliedToFollowUp' }, null, { arms: [
      { id: 'a-yes', label: 'Yes', value: 'yes', next: 'score' },
      { id: 'a-no', label: 'No', value: 'no', next: 'audience' },
    ] }),
    step('score', 'score', '', { amount: 15, reason: 'Replied to the nurture email' }),
    step('audience', 'audience', 'Retarget on LinkedIn', { audience: 'Webinar retargeting', network: 'LinkedIn Ads' }),
    step('taskReview', 'task', 'Review lifecycle stage', { owner: 'Marketing ops', due: 1 }),
  ];
  return {
    title: 'Webinar follow-up · Q4 product tour',
    description: 'Sends every registrant the replay, then follows up by funnel stage: customers go to Customer Success, open deals go to sales, and leads get a two-touch nurture that ends in a score bump or a retargeting audience.',
    rootId: 'trigger',
    seq: 1,
    steps: Object.fromEntries(steps.map((s) => [s.id, s])),
  };
}
export function blankAutomation() {
  return {
    title: 'Untitled automation',
    description: '',
    rootId: 'trigger',
    seq: 1,
    steps: { trigger: { id: 'trigger', kind: 'trigger', title: 'When this happens', props: { event: 'form', formId: '', pageUrl: '', utmSource: '', minScore: '' }, next: null } },
  };
}

// ---- titles + chips (what a card shows) ------------------------------------
const plural = (n, unit) => `${n} ${Number(n) === 1 ? unit.replace(/s$/, '') : unit}`;
export function stepTitle(s) {
  if (s.kind === 'delay') return `Wait ${plural(s.props.amount, s.props.unit)}`;
  if (s.kind === 'score') {
    const n = Number(s.props.amount) || 0;
    return n >= 0 ? `Add ${plural(n, 'points')}` : `Remove ${plural(-n, 'points')}`;
  }
  return s.title || KINDS[s.kind].label;
}
export function triggerChips(s) {
  const out = [];
  for (const [key, c] of Object.entries(CRITERIA)) {
    const v = s.props[key];
    if (v !== '' && v != null) out.push({ key, text: c.chip(v) });
  }
  return out;
}

// ---- tree queries -------------------------------------------------------------
/** Where a step hangs: the step (and, under a Branch, the path) that points at it. */
export function slotOf(state, id) {
  for (const s of Object.values(state.steps)) {
    if (s.kind === 'branch') { for (const a of s.arms) if (a.next === id) return { parentId: s.id, armId: a.id }; }
    else if (s.next === id) return { parentId: s.id, armId: null };
  }
  return null;
}
export function slotTarget(state, slot) {
  const p = state.steps[slot.parentId];
  if (!p) return null;
  if (slot.armId) return p.arms.find((a) => a.id === slot.armId)?.next ?? null;
  return p.next;
}
function setSlotTarget(state, slot, id) {
  const p = state.steps[slot.parentId];
  if (slot.armId) p.arms.find((a) => a.id === slot.armId).next = id;
  else p.next = id;
}
export function slotExists(state, slot) {
  const p = state.steps[slot.parentId];
  if (!p) return false;
  if (slot.armId) return p.kind === 'branch' && p.arms.some((a) => a.id === slot.armId);
  return p.kind !== 'branch';
}
/** Every step id below (and including) `id`. */
export function subtreeIds(state, id, out = []) {
  while (id) {
    const s = state.steps[id];
    if (!s) break;
    out.push(id);
    if (s.kind === 'branch') { for (const a of s.arms) subtreeIds(state, a.next, out); break; }
    id = s.next;
  }
  return out;
}
/** Steps in reading order: the spine first, each Branch's paths left to right. */
export function orderedIds(state) { return subtreeIds(state, state.rootId); }

// ---- edits (mutate the state in place) -----------------------------------------
const newId = (state, kind) => { let id; do { id = `${kind}-${state.seq++}`; } while (state.steps[id]); return id; };

export function defaultStep(kind) {
  switch (kind) {
    case 'email': return { title: 'Send a follow-up email', props: { template: 'Product update', subject: 'A quick update for you', sender: 'Dana Ruiz · Lumenly' } };
    case 'slack': return { title: 'Notify the team', props: { channel: '#marketing', message: '{{contact.name}} reached this step.' } };
    case 'task': return { title: 'Follow up with the contact', props: { owner: 'Contact owner', due: 2 } };
    case 'score': return { title: '', props: { amount: 10, reason: '' } };
    case 'audience': return { title: 'Add to an ads audience', props: { audience: 'Webinar retargeting', network: 'LinkedIn Ads' } };
    case 'webhook': return { title: 'Send to the CRM', props: { url: 'https://hooks.example.com/crm', method: 'POST' } };
    case 'delay': return { title: '', props: { amount: 1, unit: 'days' } };
    case 'branch': return { title: 'Opened the last email?', props: { property: 'openedLastEmail' } };
    default: throw new Error(`unknown step kind ${kind}`);
  }
}

/**
 * Insert a new step where `slot` points. The steps that were below the slot
 * hang under the new step — under a new Branch, on its FIRST path.
 */
export function insertStep(state, slot, kind) {
  const id = newId(state, kind);
  const below = slotTarget(state, slot);
  const d = defaultStep(kind);
  const step = { id, kind, title: d.title, props: d.props, next: null };
  if (kind === 'branch') {
    const vals = BRANCH_PROPS[d.props.property].values;
    step.arms = vals.map(([value, label], i) => ({ id: newId(state, 'arm'), label, value, next: i === 0 ? below : null }));
  } else {
    step.next = below;
  }
  state.steps[id] = step;
  setSlotTarget(state, slot, id);
  return id;
}

/**
 * Delete a step. A plain step's children re-attach to its parent. A Branch
 * keeps ONE path in its place (`keepArmId`) or, with no path named, takes its
 * whole subtree with it. Returns the removed ids.
 */
export function deleteStep(state, id, keepArmId = null) {
  const s = state.steps[id];
  if (!s || s.kind === 'trigger') return [];
  const slot = slotOf(state, id);
  if (!slot) return [];
  const removed = [id];
  if (s.kind === 'branch') {
    const keep = s.arms.find((a) => a.id === keepArmId) || null;
    for (const a of s.arms) if (a !== keep) removed.push(...subtreeIds(state, a.next));
    setSlotTarget(state, slot, keep ? keep.next : null);
  } else {
    setSlotTarget(state, slot, s.next);
  }
  for (const r of removed) delete state.steps[r];
  return removed;
}

/** A new, empty path on a Branch: the next value of its property it does not use yet. */
export function addArm(state, branchId) {
  const b = state.steps[branchId];
  const used = new Set(b.arms.map((a) => a.value));
  const free = (BRANCH_PROPS[b.props.property]?.values || []).find(([v]) => !used.has(v));
  const n = b.arms.filter((a) => !a.isDefault).length + 1;
  const arm = { id: newId(state, 'arm'), label: free ? free[1] : `Path ${n}`, value: free ? free[0] : `value-${n}`, next: null };
  const at = b.arms.findIndex((a) => a.isDefault);
  if (at === -1) b.arms.push(arm); else b.arms.splice(at, 0, arm);
  return arm.id;
}
export function removeArm(state, branchId, armId) {
  const b = state.steps[branchId];
  if (!b || b.arms.length <= 1) return [];
  const arm = b.arms.find((a) => a.id === armId);
  if (!arm) return [];
  const removed = subtreeIds(state, arm.next);
  for (const r of removed) delete state.steps[r];
  b.arms = b.arms.filter((a) => a !== arm);
  return removed;
}
/** Split on another property: the paths take that property's values, in order. */
export function setBranchProperty(state, branchId, property) {
  const b = state.steps[branchId];
  b.props.property = property;
  const vals = BRANCH_PROPS[property]?.values || [];
  let i = 0;
  for (const a of b.arms) {
    if (a.isDefault) continue;
    const v = vals[i++];
    if (v) { a.value = v[0]; a.label = v[1]; }
  }
}

/** Is this the shape of a saved automation? (Load refuses anything else.) */
export function isAutomation(x) {
  if (!x || typeof x !== 'object' || !x.steps || typeof x.steps !== 'object') return false;
  const root = x.steps[x.rootId];
  if (!root || root.kind !== 'trigger') return false;
  return Object.values(x.steps).every((s) => s && KINDS[s.kind] && s.props && (s.kind !== 'branch' || Array.isArray(s.arms)));
}

// ---- the guided layout -------------------------------------------------------
// World units. The spine's "+" sits half-way down GAP_V; under a Branch a path
// line drops BUS to the shared horizontal, CHIP more to its name chip, PLUS
// more to its "+", then ARM_TOP to the first card of the path.
export const G = {
  CARD_W: 240, CARD_H: 62, TRIGGER_W: 264,
  GAP_V: 60, BUS: 30, CHIP: 28, PLUS: 32, ARM_TOP: 28, STUB: 38,
  GAP_H: 34, EMPTY_W: 140, ADD_GAP: 22, END: 24,
  NOTE_W: 304, NOTE_GAP: 56,
};
export const widthOf = (s) => (s.kind === 'trigger' ? G.TRIGGER_W : G.CARD_W);

/**
 * Lay the tree out top-down. `heightOf(step)` is the card height (the page
 * measures the trigger, whose chips wrap). Returns world boxes for every step,
 * for the invisible end anchors (the "+" at the end of every path) and the
 * "add a path" anchors, plus one entry per line.
 */
export function computeLayout(state, heightOf) {
  const S = state.steps;
  const armInfo = new Map();
  // Extents of a chain (a step and everything hanging below it) about its centre.
  function extents(id) {
    if (!id) return { L: G.EMPTY_W / 2, R: G.EMPTY_W / 2 };
    let L = 0, R = 0;
    while (id) {
      const s = S[id];
      const w = widthOf(s);
      L = Math.max(L, w / 2); R = Math.max(R, w / 2);
      if (s.kind === 'branch') {
        const ex = s.arms.map((a) => extents(a.next));
        const xs = [];
        let cursor = 0;
        ex.forEach((e) => { const x = cursor + e.L; xs.push(x); cursor = x + e.R + G.GAP_H; });
        // The Branch sits over the middle of its first and last path.
        const mid = (xs[0] + xs[xs.length - 1]) / 2;
        const lastRight = xs[xs.length - 1] + ex[ex.length - 1].R;
        const addX = lastRight + G.ADD_GAP + G.END / 2;
        armInfo.set(id, { offs: xs.map((x) => x - mid), addOff: addX - mid });
        L = Math.max(L, mid - (xs[0] - ex[0].L));
        R = Math.max(R, addX + G.END / 2 - mid);
        break;
      }
      id = s.next;
    }
    return { L, R };
  }
  const boxes = {}, anchors = [], edges = [];
  const anchorBox = (cx, cy) => ({ x: cx - G.END / 2, y: cy - G.END / 2, w: G.END, h: G.END });
  function place(id, cx, y) {
    while (id) {
      const s = S[id];
      const w = widthOf(s), h = heightOf(s);
      boxes[id] = { x: cx - w / 2, y, w, h };
      const bottom = y + h;
      if (s.kind === 'branch') {
        const info = armInfo.get(id);
        const plusY = bottom + G.BUS + G.CHIP + G.PLUS;
        const top = plusY + G.ARM_TOP;
        s.arms.forEach((a, i) => {
          const acx = cx + info.offs[i];
          const slot = { parentId: id, armId: a.id };
          if (a.next) {
            edges.push({ id: `ln:${id}>${a.next}`, kind: 'arm', from: id, to: a.next, armId: a.id, label: a.label, slot });
            place(a.next, acx, top);
          } else {
            const eid = `end:${id}:${a.id}`;
            boxes[eid] = anchorBox(acx, plusY);
            anchors.push({ id: eid, role: 'end', slot });
            edges.push({ id: `ln:${id}>${eid}`, kind: 'arm', from: id, to: eid, armId: a.id, label: a.label, slot, toEnd: true });
          }
        });
        const aid = `add:${id}`;
        boxes[aid] = anchorBox(cx + info.addOff, plusY);
        anchors.push({ id: aid, role: 'add', branchId: id });
        edges.push({ id: `ln:${id}>${aid}`, kind: 'add', from: id, to: aid, branchId: id });
        return;
      }
      const slot = { parentId: id, armId: null };
      if (s.next) {
        edges.push({ id: `ln:${id}>${s.next}`, kind: 'spine', from: id, to: s.next, slot });
        y = bottom + G.GAP_V;
        id = s.next;
      } else {
        const eid = `end:${id}:`;
        boxes[eid] = anchorBox(cx, bottom + G.STUB);
        anchors.push({ id: eid, role: 'end', slot });
        edges.push({ id: `ln:${id}>${eid}`, kind: 'stub', from: id, to: eid, slot });
        return;
      }
    }
  }
  const ext = extents(state.rootId);
  place(state.rootId, 0, 0);
  return { boxes, anchors, edges, extents: ext };
}

/**
 * A line's route, from the boxes it joins (any box getter — the page passes the
 * boxes MID-ANIMATION too, so lines, chips and "+" buttons ride along).
 * Orthogonal: straight down the spine; down / across / down under a Branch.
 */
export function routeOf(e, box) {
  const a = box(e.from), b = box(e.to);
  const ax = a.x + a.w / 2, bx = b.x + b.w / 2;
  if (e.kind === 'add') {
    const y = a.y + a.h / 2;
    return [{ x: a.x + a.w, y }, { x: bx, y }, { x: bx, y: b.y }];
  }
  const y0 = a.y + a.h, y1 = b.y;
  if (Math.abs(bx - ax) < 0.5) return [{ x: ax, y: y0 }, { x: bx, y: y1 }];
  const turn = e.kind === 'arm' ? y0 + G.BUS : (y0 + y1) / 2;
  return [{ x: ax, y: y0 }, { x: ax, y: turn }, { x: bx, y: turn }, { x: bx, y: y1 }];
}
/** Where a path's name chip and its "+" sit on an arm line. */
export function armMarks(e, box) {
  const a = box(e.from), b = box(e.to);
  const bx = b.x + b.w / 2;
  const chipY = a.y + a.h + G.BUS + G.CHIP;
  return { chip: { x: bx, y: chipY }, plus: e.toEnd ? null : { x: bx, y: b.y - G.ARM_TOP } };
}
export function polyLength(pts) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return L;
}
/** 0..1 along a polyline to the point nearest `p` (the label position a chip needs). */
export function fractionAt(pts, p) {
  const total = polyLength(pts) || 1;
  let best = Infinity, at = 0, run = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const dx = b.x - a.x, dy = b.y - a.y, LL = dx * dx + dy * dy || 1;
    const u = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / LL));
    const d = Math.hypot(a.x + u * dx - p.x, a.y + u * dy - p.y);
    const seg = Math.sqrt(LL);
    if (d < best) { best = d; at = run + u * seg; }
    run += seg;
  }
  return Math.max(0.02, Math.min(0.98, at / total));
}
/** The point `t` (0..1) of the way along a polyline. */
export function pointAlong(pts, t) {
  const total = polyLength(pts);
  let want = total * Math.max(0, Math.min(1, t));
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    if (want <= seg || i === pts.length - 1) {
      const u = seg ? Math.min(1, want / seg) : 0;
      return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
    }
    want -= seg;
  }
  return { ...pts[pts.length - 1] };
}

// ---- the Test flow planner -----------------------------------------------------
const UNIT_MIN = { minutes: 1, hours: 60, days: 1440, weeks: 10080 };
export function clockText(min) {
  const day = Math.floor(min / 1440), m = min % 1440;
  return `Day ${day} · ${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
const fill = (text, c) => String(text || '').replace(/\{\{\s*contact\.name\s*\}\}/g, c.name);

/**
 * The run one contact takes: every step it reaches (with the line it arrived
 * on), what happened there, and the simulated clock. A Branch takes the path
 * whose value matches the contact's property; else its "Other" path.
 */
export function planRun(state, contact) {
  const c = { ...contact };
  const S = state.steps;
  const events = [];
  let clock = 9 * 60;   // Day 0, 09:00
  const root = S[state.rootId];
  const p = root.props;
  const why = [];
  if (p.utmSource && p.utmSource !== c.utm) why.push(`UTM source is “${c.utm}”, the trigger wants “${p.utmSource}”`);
  if (p.minScore !== '' && p.minScore != null && Number(c.score) < Number(p.minScore)) why.push(`lead score ${c.score} is below ${p.minScore}`);
  if (why.length) {
    events.push({ id: root.id, via: null, kind: 'trigger', ok: false, clock, text: `${c.name} is not enrolled: ${why.join('; ')}.` });
    return { events, enrolled: false, contact: c };
  }
  const what = p.event === 'page' ? `viewed ${p.pageUrl || 'a page'}` : p.event === 'form' ? `submitted the “${p.formId || 'contact'}” form` : `registered for “${p.formId || 'the webinar'}”`;
  events.push({ id: root.id, via: null, kind: 'trigger', ok: true, clock, text: `${c.name} ${what} — enrolled.` });
  let prev = root.id, id = root.next, via = id ? `ln:${root.id}>${id}` : `ln:${root.id}>end:${root.id}:`;
  let guard = 0;
  while (id && guard++ < 500) {
    const s = S[id];
    const ev = { id, via, kind: s.kind, clock, text: '' };
    const sp = s.props;
    switch (s.kind) {
      case 'email': ev.text = `Sent “${sp.subject}” from ${sp.sender}.`; break;
      case 'slack': ev.text = `Posted in ${sp.channel}: “${fill(sp.message, c)}”`; break;
      case 'task': ev.text = `Created the task “${stepTitle(s)}” for the ${String(sp.owner).toLowerCase()}, due in ${plural(sp.due, 'days')}.`; break;
      case 'audience': ev.text = `Added to “${sp.audience}” on ${sp.network}.`; break;
      case 'webhook': ev.text = `${sp.method} ${sp.url} → 200 OK.`; break;
      case 'score': {
        const before = Number(c.score) || 0, n = Number(sp.amount) || 0;
        c.score = before + n;
        ev.text = `Lead score ${before} → ${c.score} (${n >= 0 ? '+' : ''}${n}).`;
        break;
      }
      case 'delay': {
        const mins = (Number(sp.amount) || 0) * (UNIT_MIN[sp.unit] || 1440);
        clock += mins;
        ev.clock = clock;
        ev.wait = `+${plural(sp.amount, sp.unit)}`;
        ev.text = `Waited ${plural(sp.amount, sp.unit)} (fast-forwarded).`;
        break;
      }
      case 'branch': {
        const prop = BRANCH_PROPS[sp.property];
        const v = contactValue(c, sp.property);
        const vLabel = prop?.values.find(([x]) => x === v)?.[1] ?? v;
        const arm = s.arms.find((a) => !a.isDefault && a.value === v) || s.arms.find((a) => a.isDefault) || null;
        ev.armId = arm ? arm.id : null;
        ev.text = arm
          ? `${prop ? prop.label : sp.property} is “${vLabel}” → took the ${arm.label} path.`
          : `${prop ? prop.label : sp.property} is “${vLabel}” and no path matches — ${c.name} leaves the flow.`;
        events.push(ev);
        if (!arm) return { events, enrolled: true, contact: c };
        prev = id;
        via = arm.next ? `ln:${id}>${arm.next}` : `ln:${id}>end:${id}:${arm.id}`;
        if (!arm.next) {
          events.push({ id: `end:${id}:${arm.id}`, via, kind: 'end', clock, text: 'Reached the end of this path.' });
          return { events, enrolled: true, contact: c };
        }
        id = arm.next;
        continue;
      }
      default: break;
    }
    events.push(ev);
    prev = id;
    if (s.next) { via = `ln:${id}>${s.next}`; id = s.next; }
    else { via = `ln:${id}>end:${id}:`; id = null; }
  }
  events.push({ id: `end:${prev}:`, via, kind: 'end', clock, text: 'Reached the end of this path.' });
  return { events, enrolled: true, contact: c };
}
