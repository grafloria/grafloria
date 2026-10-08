// The Kanban studio's sample board: a product team shipping "Atlas 2.0".
// Plain data — the page turns it into dashboard() sections and cards. Times are
// OFFSETS from now (due dates in days, comments and activity in minutes), so the
// board reads the same whatever day it is opened: one card overdue, two due soon.

export const BOARD_NAME = 'Atlas 2.0 launch';
export const BOARD_ABOUT = 'Everything between today and the Atlas 2.0 launch: design, engineering, research and the launch campaign. Cards move left to right; In progress and In review keep work-in-progress limits so nothing stalls.';
export const WORKSPACE = 'Northwind Product';

export const LABELS = [
  { id: 'design',   name: 'Design',      color: '#9f8fef' },
  { id: 'eng',      name: 'Engineering', color: '#579dff' },
  { id: 'mkt',      name: 'Marketing',   color: '#fea362' },
  { id: 'bug',      name: 'Bug',         color: '#f87168' },
  { id: 'research', name: 'Research',    color: '#4bce97' },
  { id: 'docs',     name: 'Docs',        color: '#e2b203' },
];

export const MEMBERS = [
  { id: 'nh', name: 'Nadia Haddad', color: '#6e5dc6', handle: 'nadia' },
  { id: 'os', name: 'Omar Saleh',   color: '#0c66e4', handle: 'omar' },
  { id: 'lb', name: 'Lena Brandt',  color: '#c25100', handle: 'lena' },
  { id: 'km', name: 'Kenji Mori',   color: '#1f845a', handle: 'kenji' },
  { id: 'ao', name: 'Ama Owusu',    color: '#ae2e24', handle: 'ama' },
];
/** The person using the board — "my cards", "q" and new comments are theirs. */
export const ME = 'nh';

/** `wip`: the most cards the list takes; the board refuses one more. */
export const LISTS = [
  { id: 'backlog', name: 'Backlog' },
  { id: 'todo',    name: 'To do' },
  { id: 'doing',   name: 'In progress', wip: 4 },
  { id: 'review',  name: 'In review',   wip: 3 },
  { id: 'done',    name: 'Done' },
];

const items = (done, ...texts) => texts.map((t, i) => ({ t, done: i < done }));
const c = (who, minutesAgo, text) => ({ who, at: -minutesAgo, text });

export const CARDS = {
  backlog: [
    { title: 'Explore an offline mode for field teams', labels: ['research'], desc: 'Sales keeps hearing it from site managers. Size the sync problem before anyone writes code.\n\nOpen questions: conflict rules, how long a device can stay offline, what we do with attachments.', comments: [c('ao', 2880, 'Three of the last five enterprise calls asked for this.'), c('os', 1500, 'Sync is the hard part — happy to pair on a spike.')], members: ['ao'], watching: true },
    { title: 'Pricing page A/B test plan', labels: ['mkt'], members: ['lb'] },
    { title: 'Audit colour contrast in the chart palette', labels: ['design', 'bug'], checklist: items(0, 'Light theme', 'Dark theme', 'High-contrast mode'), members: ['nh'] },
    { title: 'Move CI to the new runners', labels: ['eng'], attachments: [{ name: 'runner-benchmarks.csv', kind: 'sheet', at: -4320 }] },
  ],
  todo: [
    { title: 'Write the launch blog post', labels: ['mkt', 'docs'], due: { in: 6 }, checklist: items(1, 'Outline', 'First draft', 'Screenshots', 'Legal review'), members: ['lb'], attachments: [{ name: 'launch-post-outline.docx', kind: 'doc', at: -720 }] },
    { title: 'Onboarding checklist for new workspaces', labels: ['design'], cover: { art: 'ui-mock' }, comments: [c('km', 600, 'First pass of the flow is in Figma.'), c('nh', 420, 'Love it. Can we drop step 3?'), c('km', 300, 'Done — down to four steps.')], members: ['km', 'nh'] },
    { title: 'Rate-limit the public API', labels: ['eng'], due: { in: 9 }, desc: 'Token bucket per key; 429 with Retry-After. Dashboards for the top 20 keys.', members: ['os'] },
  ],
  doing: [
    { title: 'Redesign the board settings panel', labels: ['design'], cover: { color: 'linear-gradient(135deg, #6e5dc6, #e774bb)' }, due: { in: 2 }, checklist: items(3, 'Audit current settings', 'Wireframes', 'Visual design', 'Prototype', 'Usability test'), comments: [c('nh', 240, 'Wireframes are on the card.'), c('km', 180, 'The danger zone needs more room.'), c('lb', 90, 'Copy for the toggles is in the doc.'), c('nh', 30, 'Prototype tomorrow.')], members: ['nh', 'km'], attachments: [{ name: 'settings-wireframes.fig', kind: 'design', at: -300 }], watching: true },
    { title: 'Fix: CSV export drops the last column', labels: ['bug', 'eng'], due: { in: -1 }, desc: 'Repro: export any board with 7+ custom fields. The last column header is written, the values are not.', comments: [c('os', 60, 'Off-by-one in the field iterator. PR coming.')], members: ['os'] },
    { title: 'Customer interviews', labels: ['research'], checklist: items(8, ...Array.from({ length: 12 }, (_, i) => `Interview ${i + 1}`)), members: ['ao'] },
  ],
  review: [
    { title: 'Keyboard shortcuts cheat sheet', labels: ['docs'], attachments: [{ name: 'shortcuts-v2.pdf', kind: 'doc', at: -200 }, { name: 'shortcuts-poster.png', kind: 'image', at: -150 }], members: ['lb'] },
    { title: 'Search ranking v2', labels: ['eng'], cover: { art: 'chart', size: 'full' }, due: { in: 1 }, desc: 'Boost exact title matches; decay by age after 90 days.', comments: [c('os', 900, 'Offline eval: +11% on top-3 clicks.'), c('km', 800, 'Ship it behind a flag first?'), c('os', 700, 'Flag is ready.'), c('ao', 500, 'Two interviewees mentioned search unprompted.'), c('lb', 400, 'Changelog line drafted.'), c('nh', 200, 'Approved from design.'), c('km', 100, 'Rolling out to 10% today.')], members: ['os', 'km'] },
  ],
  done: [
    { title: 'Set up the public status page', labels: ['eng'], due: { in: -4, done: true }, complete: true, members: ['os'] },
    { title: 'Brand refresh: new icon set', labels: ['design'], cover: { art: 'icons' }, attachments: Array.from({ length: 6 }, (_, i) => ({ name: `icon-set-${i + 1}.svg`, kind: 'image', at: -10000 + i * 30 })), members: ['nh'], complete: true },
    { title: 'Press kit', labels: ['mkt'], checklist: items(3, 'Logos', 'Screenshots', 'Founder quotes'), members: ['lb', 'ao'], complete: true },
  ],
};

/** The board's history before the page opened (newest first). */
export const ACTIVITY = [
  { who: 'km', at: -100, text: 'commented on Search ranking v2' },
  { who: 'os', at: -60, text: 'commented on Fix: CSV export drops the last column' },
  { who: 'nh', at: -30, text: 'commented on Redesign the board settings panel' },
  { who: 'lb', at: -150, text: 'attached shortcuts-poster.png to Keyboard shortcuts cheat sheet' },
  { who: 'os', at: -1440, text: 'moved Search ranking v2 from In progress to In review' },
  { who: 'nh', at: -2880, text: 'marked Brand refresh: new icon set as complete' },
].sort((a, b) => b.at - a.at);

/** Recent boards in the app bar's menu — the same workspace, other projects. */
export const RECENT = [
  { name: 'Atlas 2.0 launch', backdrop: 'dusk' },
  { name: 'Customer research', backdrop: 'coast' },
  { name: 'Q4 roadmap', backdrop: 'aurora' },
  { name: 'Hiring pipeline', backdrop: 'desert' },
];

/** Board backgrounds: generated scenes, then plain colours. */
export const BACKDROPS = [
  { key: 'dusk', name: 'Dusk', image: 'kanban-studio-backdrop.svg' },
  { key: 'aurora', name: 'Aurora', image: 'kanban-studio-aurora.svg' },
  { key: 'coast', name: 'Coast', image: 'kanban-studio-coast.svg' },
  { key: 'desert', name: 'Desert', image: 'kanban-studio-desert.svg' },
  { key: 'blue', name: 'Blue', color: '#0c66e4' },
  { key: 'green', name: 'Green', color: '#216e4e' },
  { key: 'orange', name: 'Orange', color: '#a54800' },
  { key: 'purple', name: 'Purple', color: '#5e4db2' },
  { key: 'pink', name: 'Pink', color: '#943d73' },
  { key: 'slate', name: 'Slate', color: '#3b4a5f' },
];
