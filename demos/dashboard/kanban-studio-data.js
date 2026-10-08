// The Kanban studio's sample board: a product team shipping "Atlas 2.0".
// Plain data — the page turns it into dashboard() sections and cards. Due dates
// are OFFSETS in days from today, so the board always reads the same way
// (one card overdue, two due soon) whatever day it is opened.

export const BOARD_NAME = 'Atlas 2.0 launch';

export const LABELS = [
  { id: 'design',   name: 'Design',      color: '#9f8fef' },
  { id: 'eng',      name: 'Engineering', color: '#579dff' },
  { id: 'mkt',      name: 'Marketing',   color: '#fea362' },
  { id: 'bug',      name: 'Bug',         color: '#f87168' },
  { id: 'research', name: 'Research',    color: '#4bce97' },
  { id: 'docs',     name: 'Docs',        color: '#e2b203' },
];

export const MEMBERS = [
  { id: 'nh', name: 'Nadia Haddad', color: '#6e5dc6' },
  { id: 'os', name: 'Omar Saleh',   color: '#0c66e4' },
  { id: 'lb', name: 'Lena Brandt',  color: '#c25100' },
  { id: 'km', name: 'Kenji Mori',   color: '#1f845a' },
  { id: 'ao', name: 'Ama Owusu',    color: '#ae2e24' },
];

/** `wip`: the most cards the list takes; the board refuses one more. */
export const LISTS = [
  { id: 'backlog', name: 'Backlog' },
  { id: 'todo',    name: 'To do' },
  { id: 'doing',   name: 'In progress', wip: 4 },
  { id: 'review',  name: 'In review',   wip: 3 },
  { id: 'done',    name: 'Done' },
];

const items = (done, ...texts) => texts.map((t, i) => ({ t, done: i < done }));

export const CARDS = {
  backlog: [
    { title: 'Explore an offline mode for field teams', labels: ['research'], desc: 'Sales keeps hearing it from site managers. Size the sync problem before anyone writes code.', comments: 2, members: ['ao'] },
    { title: 'Pricing page A/B test plan', labels: ['mkt'], members: ['lb'] },
    { title: 'Audit colour contrast in the chart palette', labels: ['design', 'bug'], checklist: items(0, 'Light theme', 'Dark theme', 'High-contrast mode'), members: ['nh'] },
    { title: 'Move CI to the new runners', labels: ['eng'], attachments: 1 },
  ],
  todo: [
    { title: 'Write the launch blog post', labels: ['mkt', 'docs'], due: { in: 6 }, checklist: items(1, 'Outline', 'First draft', 'Screenshots', 'Legal review'), members: ['lb'] },
    { title: 'Onboarding checklist for new workspaces', labels: ['design'], cover: '#9f8fef', comments: 3, members: ['km', 'nh'] },
    { title: 'Rate-limit the public API', labels: ['eng'], due: { in: 9 }, desc: 'Token bucket per key; 429 with Retry-After. Dashboards for the top 20 keys.', members: ['os'] },
  ],
  doing: [
    { title: 'Redesign the board settings panel', labels: ['design'], cover: 'linear-gradient(135deg, #6e5dc6, #e774bb)', due: { in: 2 }, checklist: items(3, 'Audit current settings', 'Wireframes', 'Visual design', 'Prototype', 'Usability test'), comments: 4, members: ['nh', 'km'] },
    { title: 'Fix: CSV export drops the last column', labels: ['bug', 'eng'], due: { in: -1 }, comments: 1, members: ['os'] },
    { title: 'Customer interviews', labels: ['research'], checklist: items(8, ...Array.from({ length: 12 }, (_, i) => `Interview ${i + 1}`)), members: ['ao'] },
  ],
  review: [
    { title: 'Keyboard shortcuts cheat sheet', labels: ['docs'], attachments: 2, members: ['lb'] },
    { title: 'Search ranking v2', labels: ['eng'], due: { in: 1 }, comments: 7, desc: 'Boost exact title matches; decay by age after 90 days.', members: ['os', 'km'] },
  ],
  done: [
    { title: 'Set up the public status page', labels: ['eng'], due: { in: -4, done: true }, members: ['os'] },
    { title: 'Brand refresh: new icon set', labels: ['design'], cover: 'linear-gradient(135deg, #1f845a, #4bce97)', attachments: 6, members: ['nh'] },
    { title: 'Press kit', labels: ['mkt'], checklist: items(3, 'Logos', 'Screenshots', 'Founder quotes'), members: ['lb', 'ao'] },
  ],
};

/** Titles for cards added from a list's "+" — real enough to read like a board. */
export const NEW_CARD_TITLES = [
  'Draft the release notes',
  'Book the launch-day war room',
  'Update the API changelog',
  'Record a two-minute demo video',
  'Translate the landing page',
];
