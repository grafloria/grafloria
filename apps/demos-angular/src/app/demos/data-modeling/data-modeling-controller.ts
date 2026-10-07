// The Data modeling studio's behaviour — translated line for line from the
// setup() of demos/diagrams/data-modeling.html. It owns the engine side: the
// schema and its one undoable step, the board as a projection of it (cards,
// grips, group zones, notes, crow's-foot lines), the foreign key a grip drag
// makes, the keys, the inline editors and popovers on the cards, and the query
// runner. The framework component owns the markup around the board — toolbar,
// side panel, import dialog — reads this controller's public fields, calls its
// actions, and re-renders when it calls bump(). Framework-free: the same file
// sits next to the data-modeling demo in the React, Vue, Angular and Qwik apps.
//
// Library workarounds, as on the JS page:
//   • The table cards are the page's own HTML trees that keep the kit's class
//     names (.axk-entity / .axk-row …), so bindJoinGuidance tints their rows.
//   • The page draws its own crow's-foot end marks ('custom' arrow paths): the
//     built-in 'crow-foot' joins its prongs AT the card, an arrowhead.
//   • A drop on another grip makes the engine draw its own link; that step is
//     undone at once and the page records its own key — ONE undo step.
//   • Tables are re-added after any new group or note: the model paints, and
//     decides what covers a grip, in insertion order.
//   • A capture-phase window keydown listener owns Delete (and T / G / N and
//     the clipboard guard) before the engine's own bubble-phase one.
//   • Sample table ids equal their names (join guidance matches by node id);
//     rows are told apart by class names (the html layer keeps no data-*).
//   • Monaco is reached through monaco.editor.getEditors() for word wrap and
//     for scrolling the DDL to the selected table.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NodeModel, PortModel, LinkModel, Command } from '@grafloria/engine';
import { attachCanvasPlugins, bindJoinGuidance } from '@grafloria/element';
import {
  DIALECTS, COMMON_TYPES, ON_DELETE, generateDDL, parseDDL, seedSQL, layoutTables,
  type Dialect, type Schema, type Table, type Group, type Note, type Rel, type ColRef,
} from './data-modeling-sql';
import { ENGINES, loadEngine, isLoaded, runScript, type EngineKind, type RunResult } from './data-modeling-db';
import {
  GEO, ZONE, ZONE_COLORS, ZONE_HEX, NOTE_W, rowY, tableSize, sampleSchema,
  tableContent, zoneContent, noteContent, portId, parsePortId,
} from './data-modeling-cards';

export { DIALECTS, ENGINES, ON_DELETE };

// Dialect icons: path data from Simple Icons (CC0) — sqlite, postgresql, mysql.
export const ICON: Record<string, string> = {
  sqlite: 'M21.678.521c-1.032-.92-2.28-.55-3.513.544a8.71 8.71 0 0 0-.547.535c-2.109 2.237-4.066 6.38-4.674 9.544.237.48.422 1.093.544 1.561a13.044 13.044 0 0 1 .164.703s-.019-.071-.096-.296l-.05-.146a1.689 1.689 0 0 0-.033-.08c-.138-.32-.518-.995-.686-1.289-.143.423-.27.818-.376 1.176.484.884.778 2.4.778 2.4s-.025-.099-.147-.442c-.107-.303-.644-1.244-.772-1.464-.217.804-.304 1.346-.226 1.478.152.256.296.698.422 1.186.286 1.1.485 2.44.485 2.44l.017.224a22.41 22.41 0 0 0 .056 2.748c.095 1.146.273 2.13.5 2.657l.155-.084c-.334-1.038-.47-2.399-.41-3.967.09-2.398.642-5.29 1.661-8.304 1.723-4.55 4.113-8.201 6.3-9.945-1.993 1.8-4.692 7.63-5.5 9.788-.904 2.416-1.545 4.684-1.931 6.857.666-2.037 2.821-2.912 2.821-2.912s1.057-1.304 2.292-3.166c-.74.169-1.955.458-2.362.629-.6.251-.762.337-.762.337s1.945-1.184 3.613-1.72C21.695 7.9 24.195 2.767 21.678.521m-18.573.543A1.842 1.842 0 0 0 1.27 2.9v16.608a1.84 1.84 0 0 0 1.835 1.834h9.418a22.953 22.953 0 0 1-.052-2.707c-.006-.062-.011-.141-.016-.2a27.01 27.01 0 0 0-.473-2.378c-.121-.47-.275-.898-.369-1.057-.116-.197-.098-.31-.097-.432 0-.12.015-.245.037-.386a9.98 9.98 0 0 1 .234-1.045l.217-.028c-.017-.035-.014-.065-.031-.097l-.041-.381a32.8 32.8 0 0 1 .382-1.194l.2-.019c-.008-.016-.01-.038-.018-.053l-.043-.316c.63-3.28 2.587-7.443 4.8-9.791.066-.069.133-.128.198-.194Z',
  postgresql: 'M23.5594 14.7228a.5269.5269 0 0 0-.0563-.1191c-.139-.2632-.4768-.3418-1.0074-.2321-1.6533.3411-2.2935.1312-2.5256-.0191 1.342-2.0482 2.445-4.522 3.0411-6.8297.2714-1.0507.7982-3.5237.1222-4.7316a1.5641 1.5641 0 0 0-.1509-.235C21.6931.9086 19.8007.0248 17.5099.0005c-1.4947-.0158-2.7705.3461-3.1161.4794a9.449 9.449 0 0 0-.5159-.0816 8.044 8.044 0 0 0-1.3114-.1278c-1.1822-.0184-2.2038.2642-3.0498.8406-.8573-.3211-4.7888-1.645-7.2219.0788C.9359 2.1526.3086 3.8733.4302 6.3043c.0409.818.5069 3.334 1.2423 5.7436.4598 1.5065.9387 2.7019 1.4334 3.582.553.9942 1.1259 1.5933 1.7143 1.7895.4474.1491 1.1327.1441 1.8581-.7279.8012-.9635 1.5903-1.8258 1.9446-2.2069.4351.2355.9064.3625 1.39.3772a.0569.0569 0 0 0 .0004.0041 11.0312 11.0312 0 0 0-.2472.3054c-.3389.4302-.4094.5197-1.5002.7443-.3102.064-1.1344.2339-1.1464.8115-.0025.1224.0329.2309.0919.3268.2269.4231.9216.6097 1.015.6331 1.3345.3335 2.5044.092 3.3714-.6787-.017 2.231.0775 4.4174.3454 5.0874.2212.5529.7618 1.9045 2.4692 1.9043.2505 0 .5263-.0291.8296-.0941 1.7819-.3821 2.5557-1.1696 2.855-2.9059.1503-.8707.4016-2.8753.5388-4.1012.0169-.0703.0357-.1207.057-.1362.0007-.0005.0697-.0471.4272.0307a.3673.3673 0 0 0 .0443.0068l.2539.0223.0149.001c.8468.0384 1.9114-.1426 2.5312-.4308.6438-.2988 1.8057-1.0323 1.5951-1.6698zM2.371 11.8765c-.7435-2.4358-1.1779-4.8851-1.2123-5.5719-.1086-2.1714.4171-3.6829 1.5623-4.4927 1.8367-1.2986 4.8398-.5408 6.108-.13-.0032.0032-.0066.0061-.0098.0094-2.0238 2.044-1.9758 5.536-1.9708 5.7495-.0002.0823.0066.1989.0162.3593.0348.5873.0996 1.6804-.0735 2.9184-.1609 1.1504.1937 2.2764.9728 3.0892.0806.0841.1648.1631.2518.2374-.3468.3714-1.1004 1.1926-1.9025 2.1576-.5677.6825-.9597.5517-1.0886.5087-.3919-.1307-.813-.5871-1.2381-1.3223-.4796-.839-.9635-2.0317-1.4155-3.5126zm6.0072 5.0871c-.1711-.0428-.3271-.1132-.4322-.1772.0889-.0394.2374-.0902.4833-.1409 1.2833-.2641 1.4815-.4506 1.9143-1.0002.0992-.126.2116-.2687.3673-.4426a.3549.3549 0 0 0 .0737-.1298c.1708-.1513.2724-.1099.4369-.0417.156.0646.3078.26.3695.4752.0291.1016.0619.2945-.0452.4444-.9043 1.2658-2.2216 1.2494-3.1676 1.0128zm2.094-3.988-.0525.141c-.133.3566-.2567.6881-.3334 1.003-.6674-.0021-1.3168-.2872-1.8105-.8024-.6279-.6551-.9131-1.5664-.7825-2.5004.1828-1.3079.1153-2.4468.079-3.0586-.005-.0857-.0095-.1607-.0122-.2199.2957-.2621 1.6659-.9962 2.6429-.7724.4459.1022.7176.4057.8305.928.5846 2.7038.0774 3.8307-.3302 4.7363-.084.1866-.1633.3629-.2311.5454zm7.3637 4.5725c-.0169.1768-.0358.376-.0618.5959l-.146.4383a.3547.3547 0 0 0-.0182.1077c-.0059.4747-.054.6489-.115.8693-.0634.2292-.1353.4891-.1794 1.0575-.11 1.4143-.8782 2.2267-2.4172 2.5565-1.5155.3251-1.7843-.4968-2.0212-1.2217a6.5824 6.5824 0 0 0-.0769-.2266c-.2154-.5858-.1911-1.4119-.1574-2.5551.0165-.5612-.0249-1.9013-.3302-2.6462.0044-.2932.0106-.5909.019-.8918a.3529.3529 0 0 0-.0153-.1126 1.4927 1.4927 0 0 0-.0439-.208c-.1226-.4283-.4213-.7866-.7797-.9351-.1424-.059-.4038-.1672-.7178-.0869.067-.276.1831-.5875.309-.9249l.0529-.142c.0595-.16.134-.3257.213-.5012.4265-.9476 1.0106-2.2453.3766-5.1772-.2374-1.0981-1.0304-1.6343-2.2324-1.5098-.7207.0746-1.3799.3654-1.7088.5321a5.6716 5.6716 0 0 0-.1958.1041c.0918-1.1064.4386-3.1741 1.7357-4.4823a4.0306 4.0306 0 0 1 .3033-.276.3532.3532 0 0 0 .1447-.0644c.7524-.5706 1.6945-.8506 2.802-.8325.4091.0067.8017.0339 1.1742.081 1.939.3544 3.2439 1.4468 4.0359 2.3827.8143.9623 1.2552 1.9315 1.4312 2.4543-1.3232-.1346-2.2234.1268-2.6797.779-.9926 1.4189.543 4.1729 1.2811 5.4964.1353.2426.2522.4522.2889.5413.2403.5825.5515.9713.7787 1.2552.0696.087.1372.1714.1885.245-.4008.1155-1.1208.3825-1.0552 1.717-.0123.1563-.0423.4469-.0834.8148-.0461.2077-.0702.4603-.0994.7662zm.8905-1.6211c-.0405-.8316.2691-.9185.5967-1.0105a2.8566 2.8566 0 0 0 .135-.0406 1.202 1.202 0 0 0 .1342.103c.5703.3765 1.5823.4213 3.0068.1344-.2016.1769-.5189.3994-.9533.6011-.4098.1903-1.0957.333-1.7473.3636-.7197.0336-1.0859-.0807-1.1721-.151zm.5695-9.2712c-.0059.3508-.0542.6692-.1054 1.0017-.055.3576-.112.7274-.1264 1.1762-.0142.4368.0404.8909.0932 1.3301.1066.887.216 1.8003-.2075 2.7014a3.5272 3.5272 0 0 1-.1876-.3856c-.0527-.1276-.1669-.3326-.3251-.6162-.6156-1.1041-2.0574-3.6896-1.3193-4.7446.3795-.5427 1.3408-.5661 2.1781-.463zm.2284 7.0137a12.3762 12.3762 0 0 0-.0853-.1074l-.0355-.0444c.7262-1.1995.5842-2.3862.4578-3.4385-.0519-.4318-.1009-.8396-.0885-1.2226.0129-.4061.0666-.7543.1185-1.0911.0639-.415.1288-.8443.1109-1.3505.0134-.0531.0188-.1158.0118-.1902-.0457-.4855-.5999-1.938-1.7294-3.253-.6076-.7073-1.4896-1.4972-2.6889-2.0395.5251-.1066 1.2328-.2035 2.0244-.1859 2.0515.0456 3.6746.8135 4.8242 2.2824a.908.908 0 0 1 .0667.1002c.7231 1.3556-.2762 6.2751-2.9867 10.5405zm-8.8166-6.1162c-.025.1794-.3089.4225-.6211.4225a.5821.5821 0 0 1-.0809-.0056c-.1873-.026-.3765-.144-.5059-.3156-.0458-.0605-.1203-.178-.1055-.2844.0055-.0401.0261-.0985.0925-.1488.1182-.0894.3518-.1226.6096-.0867.3163.0441.6426.1938.6113.4186zm7.9305-.4114c.0111.0792-.049.201-.1531.3102-.0683.0717-.212.1961-.4079.2232a.5456.5456 0 0 1-.075.0052c-.2935 0-.5414-.2344-.5607-.3717-.024-.1765.2641-.3106.5611-.352.297-.0414.6111.0088.6356.1851z',
  mysql: 'M16.405 5.501c-.115 0-.193.014-.274.033v.013h.014c.054.104.146.18.214.273.054.107.1.214.154.32l.014-.015c.094-.066.14-.172.14-.333-.04-.047-.046-.094-.08-.14-.04-.067-.126-.1-.18-.153zM5.77 18.695h-.927a50.854 50.854 0 00-.27-4.41h-.008l-1.41 4.41H2.45l-1.4-4.41h-.01a72.892 72.892 0 00-.195 4.41H0c.055-1.966.192-3.81.41-5.53h1.15l1.335 4.064h.008l1.347-4.064h1.095c.242 2.015.384 3.86.428 5.53zm4.017-4.08c-.378 2.045-.876 3.533-1.492 4.46-.482.716-1.01 1.073-1.583 1.073-.153 0-.34-.046-.566-.138v-.494c.11.017.24.026.386.026.268 0 .483-.075.647-.222.197-.18.295-.382.295-.605 0-.155-.077-.47-.23-.944L6.23 14.615h.91l.727 2.36c.164.536.233.91.205 1.123.4-1.064.678-2.227.835-3.483zm12.325 4.08h-2.63v-5.53h.885v4.85h1.745zm-3.32.135l-1.016-.5c.09-.076.177-.158.255-.25.433-.506.648-1.258.648-2.253 0-1.83-.718-2.746-2.155-2.746-.704 0-1.254.232-1.65.697-.43.508-.646 1.256-.646 2.245 0 .972.19 1.686.574 2.14.35.41.877.615 1.583.615.264 0 .506-.033.725-.098l1.325.772.36-.622zM15.5 17.588c-.225-.36-.337-.94-.337-1.736 0-1.393.424-2.09 1.27-2.09.443 0 .77.167.977.5.224.362.336.936.336 1.723 0 1.404-.424 2.108-1.27 2.108-.445 0-.77-.167-.978-.5zm-1.658-.425c0 .47-.172.856-.516 1.156-.344.3-.803.45-1.384.45-.543 0-1.064-.172-1.573-.515l.237-.476c.438.22.833.328 1.19.328.332 0 .593-.073.783-.22a.754.754 0 00.3-.615c0-.33-.23-.61-.648-.845-.388-.213-1.163-.657-1.163-.657-.422-.307-.632-.636-.632-1.177 0-.45.157-.81.47-1.085.315-.278.72-.415 1.22-.415.512 0 .98.136 1.4.41l-.213.476a2.726 2.726 0 00-1.064-.23c-.283 0-.502.068-.654.206a.685.685 0 00-.248.524c0 .328.234.61.666.85.393.215 1.187.67 1.187.67.433.305.648.63.648 1.168zm9.382-5.852c-.535-.014-.95.04-1.297.188-.1.04-.26.04-.274.167.055.053.063.14.11.214.08.134.218.313.346.407.14.11.28.216.427.31.26.16.555.255.81.416.145.094.293.213.44.313.073.05.12.14.214.172v-.02c-.046-.06-.06-.147-.105-.214-.067-.067-.134-.127-.2-.193a3.223 3.223 0 00-.695-.675c-.214-.146-.682-.35-.77-.595l-.013-.014c.146-.013.32-.066.46-.106.227-.06.435-.047.67-.106.106-.027.213-.06.32-.094v-.06c-.12-.12-.21-.283-.334-.395a8.867 8.867 0 00-1.104-.823c-.21-.134-.476-.22-.697-.334-.08-.04-.214-.06-.26-.127-.12-.146-.19-.34-.275-.514a17.69 17.69 0 01-.547-1.163c-.12-.262-.193-.523-.34-.763-.69-1.137-1.437-1.826-2.586-2.5-.247-.14-.543-.2-.856-.274-.167-.008-.334-.02-.5-.027-.11-.047-.216-.174-.31-.235-.38-.24-1.364-.76-1.644-.072-.18.434.267.862.422 1.082.115.153.26.328.34.5.047.116.06.235.107.356.106.294.207.622.347.897.073.14.153.287.247.413.054.073.146.107.167.227-.094.136-.1.334-.154.5-.24.757-.146 1.693.194 2.25.107.166.362.534.703.393.3-.12.234-.5.32-.835.02-.08.007-.133.048-.187v.015c.094.188.188.367.274.555.206.328.566.668.867.895.16.12.287.328.487.402v-.02h-.015c-.043-.058-.1-.086-.154-.133a3.445 3.445 0 01-.35-.4 8.76 8.76 0 01-.747-1.218c-.11-.21-.202-.436-.29-.643-.04-.08-.04-.2-.107-.24-.1.146-.247.273-.32.453-.127.288-.14.642-.188 1.01-.027.007-.014 0-.027.014-.214-.052-.287-.274-.367-.46-.2-.475-.233-1.238-.06-1.785.047-.14.247-.582.167-.716-.042-.127-.174-.2-.247-.303a2.478 2.478 0 01-.24-.427c-.16-.374-.24-.788-.414-1.162-.08-.173-.22-.354-.334-.513-.127-.18-.267-.307-.368-.52-.033-.073-.08-.194-.027-.274.014-.054.042-.075.094-.09.088-.072.335.022.422.062.247.1.455.194.662.334.094.066.195.193.315.226h.14c.214.047.455.014.655.073.355.114.675.28.962.46a5.953 5.953 0 012.085 2.286c.08.154.115.295.188.455.14.33.313.663.455.982.14.315.275.636.476.897.1.14.502.213.682.286.133.06.34.115.46.188.23.14.454.3.67.454.11.076.443.243.463.378z',
};

export const SAMPLE_QUERY = `-- Who spends the most? Customers joined to their orders.
SELECT c.full_name,
       COUNT(o.id)  AS orders,
       SUM(o.total) AS spent
FROM customers AS c
JOIN orders AS o ON o.customer_id = c.id
GROUP BY c.full_name
ORDER BY spent DESC;`;

export const IMPORT_SAMPLE = `-- Paste CREATE TABLE statements and press Import.
CREATE TABLE authors (
  id        SERIAL PRIMARY KEY,
  name      VARCHAR(120) NOT NULL,
  email     VARCHAR(255) UNIQUE,
  born_on   DATE
);

CREATE TABLE books (
  id        SERIAL PRIMARY KEY,
  author_id INTEGER NOT NULL REFERENCES authors (id) ON DELETE CASCADE,
  title     VARCHAR(200) NOT NULL,
  isbn      CHAR(13) UNIQUE,
  published BOOLEAN NOT NULL DEFAULT FALSE,
  price     NUMERIC(8,2)
);`;

/** What the result box says before the first run. */
export const RESULT_IDLE = 'Press ▶ Run: the schema is created in a fresh in-memory database, a few rows are added to every table, then your query runs.';

/** The elements the component hands over: the studio, the board, an EMPTY layer for
 *  the board's popovers, the toolbar and side panel, and the three code boxes (each
 *  with an optional empty `host` for the editor — required on a Qwik page). */
export interface StudioEls {
  studio: HTMLElement;
  board: HTMLElement;
  layer: HTMLElement;
  sqlTa: HTMLTextAreaElement; sqlHost?: HTMLElement;
  runTa: HTMLTextAreaElement; runHost?: HTMLElement;
  impTa: HTMLTextAreaElement; impHost?: HTMLElement;
}
/** The gallery's mountCodeEditor, handed in by the component (its import path differs per app). */
export type CodeMount = (ta: HTMLTextAreaElement, options: { language: string; readOnly?: boolean; host?: HTMLElement }) => Promise<any>;

/** One foreign key in the Relationships tab. */
export interface RelView {
  id: string; ft: string; fc: string; tt: string; tc: string; card: string; onDelete: string;
  sub: string; warn: string; editing: boolean; selected: boolean; name: string;
}
export interface ResultCell { text: string; cls: string; title: string }
/** The result box: idle, loading an engine, an error, or the query's rows. */
export type ResultView =
  | { kind: 'idle' }
  | { kind: 'loading'; lib: string; host: string }
  | { kind: 'error'; title: string; msg: string }
  | { kind: 'rows'; head: string; rest: string; columns: string[]; rows: ResultCell[][] };
export type Pane = 'sql' | 'rels' | 'run';

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as Record<string, string>)[c]);
const IDENT = /^[A-Za-z_][A-Za-z0-9_$]*$/;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const dark = () => matchMedia('(prefers-color-scheme: dark)').matches;
const isTyping = (el: any) => !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName || ''));
/** Let a frame (or n ms) pass — the JS page's ctx.tick. */
const tick = (ms = 0) => new Promise<void>((r) => requestAnimationFrame(() => (ms ? setTimeout(r, ms) : r())));
const noop = (): any => undefined;

export class DataModelingController {
  // ---- what the template reads ----------------------------------------------
  /** The page's view state: dialect, search, pane, the open / selected key, the run engine. */
  view = { dialect: 'sqlite' as Dialect, q: '', pane: 'sql' as Pane, editRel: null as string | null, selRel: null as string | null, runEngine: null as EngineKind | null, searchAt: -1 };
  sideOpen = true;
  canUndo = false;
  canRedo = false;
  search = '';
  searchCount = '';
  sql = '';
  sqlHead = { label: 'SQLite', rest: '' };
  relCount = 0;
  rels: RelView[] = [];
  /** The engine Run uses (null on MySQL until one is picked). */
  runEng: EngineKind | null = 'sqlite';
  mysqlNote = false;
  runGoDisabled = false;
  runHint = '';
  status = { cls: '', text: '' };
  result: ResultView = { kind: 'idle' };
  query = SAMPLE_QUERY;
  impOpen = false;
  impText = IMPORT_SAMPLE;
  impMode: 'replace' | 'add' = 'replace';
  impMsg = '';
  impBad = false;
  toastMsg = '';
  toastShow = false;

  /** Re-render the component; set by the framework. */
  bump: () => void = () => {};
  /** The gallery's mountCodeEditor; set by the framework before init(). */
  mountCode: CodeMount = async () => null;

  // ---- actions the template calls (wired by init) ----------------------------
  addTable: () => Promise<string | null> = async () => null;
  addGroup: () => Promise<string | null> = async () => null;
  addNote: () => Promise<string | null> = async () => null;
  undo: () => void = noop;
  redo: () => void = noop;
  fit: () => void = noop;
  setDialect: (d: Dialect) => void = noop;
  showPane: (p: Pane) => void = noop;
  setSide: (open: boolean) => void = noop;
  copySQL: () => void = noop;
  /** The search box's text changed. */
  setSearch: (value: string) => void = noop;
  /** A key in the search box: Enter jumps to the next match, Escape clears. */
  searchKey: (key: string) => void = noop;
  /** A click anywhere in the Relationships list (the JS page's delegation). */
  relsClick: (target: EventTarget | null) => void = noop;
  /** A Cardinality / On delete pick. */
  relChange: (rid: string, field: 'card' | 'onDelete', value: string) => void = noop;
  pickEngine: (kind: EngineKind) => void = noop;
  runOn: (kind: EngineKind) => void = noop;
  runQuery: () => Promise<unknown> = async () => null;
  sampleQuery: () => void = noop;
  setQuery: (text: string) => void = noop;
  openImport: () => void = noop;
  closeImport: () => void = noop;
  setImpText: (text: string) => void = noop;
  setImpMode: (mode: 'replace' | 'add') => void = noop;
  importGo: () => Promise<boolean> = async () => false;
  exportDDL: () => void = noop;

  private offs: Array<() => void> = [];
  private gen = 0;

  /** Unmount: listeners off, the popovers and the measuring twin removed. */
  destroy(): void {
    this.gen++;
    for (const off of this.offs.splice(0)) { try { off(); } catch { /* already gone */ } }
  }

  /**
   * Mount on a fresh instance (the board's render()), then settle the camera.
   * Resolves true once the studio has painted its schema (false when a newer
   * init or destroy() overtook this one). Safe to call again.
   */
  async init(api: any, els: StudioEls): Promise<boolean> {
    this.destroy();
    const gen = this.gen;
    const ui = this;
    const offs = this.offs;
    const { studio, board, layer, sqlTa, runTa, impTa } = els;
    const listen = (target: EventTarget, type: string, fn: (e: any) => void, opts?: boolean | AddEventListenerOptions) => {
      target.addEventListener(type, fn, opts);
      offs.push(() => target.removeEventListener(type, fn, opts));
    };
    const keep = (off: unknown) => { if (typeof off === 'function') offs.push(off as () => void); };

    // Keys first: our Delete / T / G / N / clipboard guard run before the engine's
    // own (capture phase on window — the engine listens in the bubble phase).
    listen(window, 'keydown', (e: KeyboardEvent) => onKey(e), true);

    const model = api.getModel(), engine = api.getEngine();
    // Every drop is decided by the page (see "connections" below): no snapping to
    // the nearest port, and an existing key line is not re-plugged by dragging it.
    engine.setInteractionConfig({ enableSmartAutoConnect: false, enableLinkReconnection: false, connectionLineStyle: 'bezier', highlightValidTargets: true });
    // A schema reads at every zoom: keep every level-of-detail tier fully drawn.
    try {
      const cfg = model.getLODConfig();
      const all = new Set<unknown>();
      for (const t of cfg.tiers) for (const f of t.features) all.add(f);
      for (const t of cfg.tiers) for (const f of all) t.features.add(f);
      model.setLODConfig(cfg);
    } catch { /* an engine without LOD config draws everything anyway */ }

    // ---- the schema, the view, and the one undoable step ----------------------
    let S: Schema = { tables: [], rels: [], groups: [], notes: [] };
    this.view = { dialect: 'sqlite', q: '', pane: 'sql', editRel: null, selRel: null, runEngine: null, searchAt: -1 };
    const view = this.view;

    // A schema edit: swap the whole schema for its next version (and back).
    class SchemaEdit extends Command {
      before: Schema; after: Schema;
      constructor(label: string, before: Schema, after: Schema) { super(label); this.before = before; this.after = after; }
      execute() { applySchema(this.after); }
      undo() { applySchema(this.before); }
      serialize() { return { id: this.id, name: this.name, timestamp: this.timestamp, data: { kind: 'schema-edit' } }; }
    }

    // ---- lookups ---------------------------------------------------------------
    const tableOf = (id: string, s = S) => s.tables.find((t) => t.id === id);
    const groupOf = (id: string, s = S) => s.groups.find((g) => g.id === id);
    const noteOf = (id: string, s = S) => s.notes.find((n) => n.id === id);
    const colOf = (ref: ColRef, s = S) => tableOf(ref.t, s)?.columns.find((c) => c.id === ref.c);
    const kindOf = (id: string) => (tableOf(id) ? 'table' : groupOf(id) ? 'zone' : noteOf(id) ? 'note' : null);
    const sameRef = (a: ColRef, b: ColRef) => a.t === b.t && a.c === b.c;
    const refName = (ref: ColRef, s = S) => `${tableOf(ref.t, s)?.name}.${colOf(ref, s)?.name}`;
    const hiddenMembers = (s = S) => new Set(s.groups.filter((g) => g.hidden).flatMap((g) => g.members || []));
    const hiddenGroupOf = (tid: string, s = S) => s.groups.find((g) => g.hidden && (g.members || []).includes(tid));
    /** A fresh id: `base`, else base_2, base_3 … — unique across every kind of thing in `s`. */
    const freshId = (s: Schema, base: string) => {
      const used = new Set([...s.tables.map((t) => t.id), ...s.groups.map((g) => g.id), ...s.notes.map((n) => n.id), ...s.rels.map((r) => r.id)]);
      const b = String(base).replace(/[^A-Za-z0-9_]/g, '_') || 'x';
      if (!used.has(b)) return b;
      let k = 2;
      while (used.has(`${b}_${k}`)) k++;
      return `${b}_${k}`;
    };
    /** The next free `<prefix><n>` (r8, g4, n2 …) across every id in `s`. */
    const freshSeq = (s: Schema, prefix: string) => {
      const ids = [...s.tables.map((t) => t.id), ...s.groups.map((g) => g.id), ...s.notes.map((n) => n.id), ...s.rels.map((r) => r.id)];
      let max = 0;
      for (const id of ids) { const m = new RegExp(`^${prefix}(\\d+)$`).exec(id); if (m) max = Math.max(max, Number(m[1])); }
      return `${prefix}${max + 1}`;
    };
    const freshCol = (s: Schema) => {
      let max = 0;
      for (const t of s.tables) for (const c of t.columns) max = Math.max(max, Number(/^c(\d+)$/.exec(c.id)?.[1] ?? 0));
      return `c${max + 1}`;
    };
    const freshName = (names: string[], base: string) => {
      const used = new Set(names.map((n) => n.toLowerCase()));
      if (!used.has(base.toLowerCase())) return base;
      let k = 2;
      while (used.has(`${base}_${k}`.toLowerCase())) k++;
      return `${base}_${k}`;
    };

    // A note's height follows its text: measured in a hidden twin of the card.
    let noteMeasure: HTMLDivElement | null = null;
    offs.push(() => noteMeasure?.remove());
    const noteHeight = (n: Note) => {
      if (!noteMeasure) {
        noteMeasure = document.createElement('div');
        noteMeasure.style.cssText = 'position:absolute;left:-10000px;top:0;visibility:hidden;pointer-events:none;';
        document.body.appendChild(noteMeasure);
      }
      noteMeasure.style.width = (n.w || NOTE_W) + 'px';
      const [title, ...rest] = String(n.text || '').split('\n');
      noteMeasure.innerHTML = `<div class="dm-note" style="height:auto"><div class="dm-nhead"><span class="dm-ntitle"></span></div><div class="dm-ntext"></div></div>`;
      noteMeasure.querySelector('.dm-ntitle')!.textContent = title || 'Note';
      noteMeasure.querySelector('.dm-ntext')!.textContent = rest.join('\n');
      return Math.ceil((noteMeasure.firstChild as HTMLElement).getBoundingClientRect().height) + 2;
    };

    // ---- the board as a projection of the schema -------------------------------
    type Want = { kind: 'table'; id: string; data: Table } | { kind: 'zone'; id: string; data: Group } | { kind: 'note'; id: string; data: Note };
    const zoneMembers = new Map<string, string[]>();   // visible zone id → ids of the tables / notes inside it
    const zonePos = new Map<string, { x: number; y: number }>();   // zone id → its last known position (to follow a drag)
    const contentKey = new Map<string, string>();    // node id → the html it last painted
    const styleKey = new Map<string, string>();      // link id → the style it last wore
    let quiet = 0;                   // > 0 while the PAGE moves zones (no member follow)

    const portsList = (node: any): any[] => Array.from(node.getPorts().values ? node.getPorts().values() : node.getPorts());
    const nodeRect = (id: string) => { const n = model.getNode(id); return n ? { x: n.position.x, y: n.position.y, w: n.size.width, h: n.size.height } : null; };
    const removeNodeWithLinks = (id: string) => {
      for (const l of model.getLinks().filter((x: any) => x.sourceNodeId === id || x.targetNodeId === id)) model.removeLink(l.id);
      model.removeNode(id);
      contentKey.delete(id);
    };

    const sizeOf = (w: Want) => {
      if (w.kind === 'table') return tableSize(w.data);
      if (w.kind === 'zone') return { w: w.data.w, h: w.data.hidden ? ZONE.HIDDEN_H : w.data.h };
      return { w: w.data.w || NOTE_W, h: noteHeight(w.data) };
    };
    type PortSpec = { id: string; side: string; x: number; y: number; grip?: boolean };
    const portsOf = (w: Want, size: { w: number; h: number }): PortSpec[] => {
      if (w.kind === 'table') return w.data.columns.flatMap((c, i) => [
        { id: portId(w.id, c.id, 'l'), side: 'left', x: 0, y: rowY(i), grip: true },
        { id: portId(w.id, c.id, 'r'), side: 'right', x: size.w, y: rowY(i), grip: true },
      ]);
      // A folded group carries two anchors for the keys that point into it.
      if (w.kind === 'zone' && w.data.hidden) return [
        { id: portId(w.id, 'zone', 'l'), side: 'left', x: 0, y: ZONE.HIDDEN_H / 2 },
        { id: portId(w.id, 'zone', 'r'), side: 'right', x: size.w, y: ZONE.HIDDEN_H / 2 },
      ];
      return [];
    };
    const makePort = (p: PortSpec) => new PortModel({
      id: p.id, type: 'bi', side: p.side,
      shape: { shape: 'square', width: 6, height: 15 },
      layout: { strategy: 'absolute', args: { units: 'px', x: p.x, y: p.y } },
      style: { rx: 3 },
      visible: p.grip ? undefined : false,
      isConnectableStart: !!p.grip, isConnectableEnd: !!p.grip,
    } as any);
    const colorOfTable = (tid: string) => {
      for (const [gid, ids] of zoneMembers) if (ids.includes(tid)) return groupOf(gid)?.color ?? '';
      return '';
    };
    const tableMatches = (t: { name: string; columns: Array<{ name: string; type: string }> }, q: string) => !!q && (t.name.toLowerCase().includes(q) || t.columns.some((c) => c.name.toLowerCase().includes(q) || String(c.type).toLowerCase().includes(q)));
    const contentOf = (w: Want, fk: Set<string>) => {
      if (w.kind === 'table') return tableContent(w.data, { fk, q: view.q, color: colorOfTable(w.id) });
      if (w.kind === 'zone') {
        const g = w.data;
        const count = g.hidden ? (g.members || []).length : (zoneMembers.get(g.id) || []).filter((id) => kindOf(id) === 'table').length;
        const match = g.hidden && (g.members || []).some((id) => tableMatches(tableOf(id) ?? { name: '', columns: [] }, view.q));
        return zoneContent(g, { count, match });
      }
      return noteContent(w.data);
    };
    const setContent = (node: any, w: Want, fk: Set<string>) => {
      const html = { content: contentOf(w, fk), interactive: true, padding: 0 };
      const kit = w.kind === 'table'
        ? { id: w.id, name: w.data.name, columns: w.data.columns.map((c) => ({ name: c.name, type: c.type, pk: !!c.pk, fk: fk.has(c.id) })) }
        : null;
      const key = JSON.stringify([html, kit]);
      if (contentKey.get(node.id) === key) return;
      contentKey.set(node.id, key);
      node.setMetadata('html', html);
      // The kit's join guidance reads the columns from here (same contract as erDiagram cards).
      if (kit) node.setMetadata('kitEntity', kit);
    };
    const wantOf = (id: string): Want | null => {
      const k = kindOf(id);
      return k === 'table' ? { kind: k, id, data: tableOf(id)! } : k === 'zone' ? { kind: k, id, data: groupOf(id)! } : k === 'note' ? { kind: k, id, data: noteOf(id)! } : null;
    };
    const fkSet = () => new Set(S.rels.map((r) => r.from.c));
    const paintAll = () => {
      const fk = fkSet();
      for (const n of model.getNodes()) { const w = wantOf(n.id); if (w) setContent(n, w, fk); }
    };

    function buildNode(w: Want, fk: Set<string>) {
      const size = sizeOf(w);
      const node: any = new NodeModel({ id: w.id, type: 'rect', position: { x: w.data.x, y: w.data.y }, size: { width: size.w, height: size.h } } as any);
      node.ports.clear();
      node.setMetadata('shape', { type: 'rect', fill: 'none', stroke: 'none' });
      node.style = { ...node.style, fill: 'transparent', stroke: 'transparent', strokeWidth: 0 };
      node.setBehavior({ resizable: false, rotatable: false, cloneable: false, connectable: w.kind === 'table' });
      for (const p of portsOf(w, size)) node.addPort(makePort(p));
      setContent(node, w, fk);
      return node;
    }
    function updateNode(node: any, w: Want, fk: Set<string>) {
      const size = sizeOf(w);
      if (Math.abs(node.position.x - w.data.x) > 0.5 || Math.abs(node.position.y - w.data.y) > 0.5) node.setPosition(w.data.x, w.data.y);
      if (node.size.width !== size.w || node.size.height !== size.h) node.setSize(size.w, size.h);
      const want = portsOf(w, size), keepIds = new Set(want.map((p) => p.id));
      for (const p of portsList(node)) {
        if (keepIds.has(p.id)) continue;
        for (const l of model.getLinks().filter((x: any) => x.sourcePortId === p.id || x.targetPortId === p.id)) model.removeLink(l.id);
        node.removePort(p.id);
      }
      for (const p of want) {
        const have = node.getPort(p.id);
        if (!have) { node.addPort(makePort(p)); continue; }
        const a = have.layout && have.layout.args;
        if (a && (a.x !== p.x || a.y !== p.y)) {
          // Re-seat the grip on its row under the SAME id, so its line stays attached.
          a.x = p.x; a.y = p.y;
          have.setOffset({ ...(have.offset ?? { x: 0, y: 0 }) });
        }
      }
      node.setBehavior({ connectable: w.kind === 'table' });
      setContent(node, w, fk);
    }

    type Rect = { x: number; y: number; w: number; h: number };
    /** Which side each end of a key leaves from: facing each other, or both right when stacked. */
    const pickSides = (sr: Rect, tr: Rect, self: boolean) => {
      if (self) return ['r', 'r'];
      if (tr.x >= sr.x + sr.w + 24) return ['r', 'l'];
      if (tr.x + tr.w <= sr.x - 24) return ['l', 'r'];
      return tr.x + tr.w / 2 >= sr.x + sr.w / 2 - 1 ? ['r', 'r'] : ['l', 'l'];
    };
    const linkColor = () => (dark() ? '#7d88a2' : '#8a93a8');
    // ER end marks as raw paths (origin = the port, the mark drawn back along the
    // line). The built-in 'crow-foot' joins its prongs AT the card — an arrowhead;
    // standard notation spreads the toes on the card.
    const MARK = {
      many: (color: string) => ({ type: 'custom', path: 'M -11 0 L 0 -6.5 M -11 0 L 0 0 M -11 0 L 0 6.5', size: 11, filled: false, color, mark: 'many' }),
      one: (color: string) => ({ type: 'custom', path: 'M -7 -6.5 L -7 6.5', size: 11, filled: false, color, mark: 'one' }),
      zeroOrOne: (color: string) => ({ type: 'custom', path: 'M -6 -6.5 L -6 6.5 M -10 0 a 3.6 3.6 0 1 0 -7.2 0 a 3.6 3.6 0 1 0 7.2 0', size: 11, filled: false, color, mark: 'zero-or-one' }),
    };
    function linkSpec(r: Rel) {
      const fc = colOf(r.from), tc = colOf(r.to);
      if (!fc || !tc) return null;
      const gFrom = hiddenGroupOf(r.from.t), gTo = hiddenGroupOf(r.to.t);
      if (gFrom && gFrom === gTo) return null;   // both ends folded into the same group
      const srcNode = gFrom ? gFrom.id : r.from.t, tgtNode = gTo ? gTo.id : r.to.t;
      const sr = nodeRect(srcNode), tr = nodeRect(tgtNode);
      if (!sr || !tr) return null;
      const [ss, ts] = pickSides(sr, tr, srcNode === tgtNode);
      const color = linkColor();
      return {
        src: gFrom ? portId(gFrom.id, 'zone', ss) : portId(r.from.t, r.from.c, ss), srcNode,
        tgt: gTo ? portId(gTo.id, 'zone', ts) : portId(r.to.t, r.to.c, ts), tgtNode,
        style: {
          stroke: color, strokeWidth: 1.6, strokeDasharray: gFrom || gTo ? '5 4' : 'none',
          // Crow's foot at the referencing (many) end, its toes ON the card; at the
          // referenced end a bar when the key is NOT NULL, ring-and-bar when it may be NULL.
          arrowTail: r.card === '1:1' ? MARK.one(color) : MARK.many(color),
          arrowHead: fc.nn || fc.pk ? MARK.one(color) : MARK.zeroOrOne(color),
        },
      };
    }
    function syncLinks() {
      const specs = new Map<string, NonNullable<ReturnType<typeof linkSpec>>>();
      for (const r of S.rels) { const sp = linkSpec(r); if (sp) specs.set(r.id, sp); }
      for (const l of [...model.getLinks()]) if (!specs.has(l.id)) { model.removeLink(l.id); styleKey.delete(l.id); }
      for (const [id, sp] of specs) {
        let l = model.getLink(id);
        if (!l) {
          l = new LinkModel(sp.src, sp.tgt, 'bezier' as any);
          l.id = id;   // the relationship's id — as LinkModel.fromJSON restores one
          l.sourceNodeId = sp.srcNode; l.targetNodeId = sp.tgtNode;
          l.updateStyle(sp.style as any);
          styleKey.set(id, JSON.stringify(sp.style));
          model.addLink(l);
          continue;
        }
        // Same link object, new ends: a key stays one selectable line while it re-sides.
        if (l.sourcePortId !== sp.src) l.reconnectSource(sp.src, sp.srcNode);
        if (l.targetPortId !== sp.tgt) l.reconnectTarget(sp.tgt, sp.tgtNode);
        const key = JSON.stringify(sp.style);
        if (styleKey.get(id) !== key) { l.updateStyle(sp.style); styleKey.set(id, key); }
      }
    }

    /** Zones wrap what sits inside them (a table belongs to the smallest zone holding its centre). */
    function refitZones() {
      quiet++;
      try {
        const zones = S.groups.filter((g) => !g.hidden && model.getNode(g.id));
        const rects = new Map(zones.map((g) => [g.id, nodeRect(g.id)!]));
        const members = new Map<string, string[]>(zones.map((g) => [g.id, []]));
        for (const n of model.getNodes()) {
          const k = kindOf(n.id);
          if (k !== 'table' && k !== 'note') continue;
          const cx = n.position.x + n.size.width / 2, cy = n.position.y + n.size.height / 2;
          let best: string | null = null, area = Infinity;
          for (const g of zones) {
            const r = rects.get(g.id)!;
            if (cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h && r.w * r.h < area) { best = g.id; area = r.w * r.h; }
          }
          if (best) members.get(best)!.push(n.id);
        }
        for (const g of zones) {
          const ids = members.get(g.id)!;
          if (!ids.length) continue;
          let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
          for (const id of ids) { const r = nodeRect(id)!; x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y); x1 = Math.max(x1, r.x + r.w); y1 = Math.max(y1, r.y + r.h); }
          const x = x0 - ZONE.PAD, y = y0 - ZONE.HEAD, w = Math.max(x1 - x0 + 2 * ZONE.PAD, 220), h = y1 - y0 + ZONE.HEAD + ZONE.PAD;
          const node = model.getNode(g.id);
          if (Math.abs(node.position.x - x) > 0.5 || Math.abs(node.position.y - y) > 0.5) node.setPosition(x, y);
          if (node.size.width !== w || node.size.height !== h) node.setSize(w, h);
        }
        zoneMembers.clear();
        for (const [k, v] of members) zoneMembers.set(k, v);
        for (const g of S.groups) { const n = model.getNode(g.id); if (n) zonePos.set(g.id, { x: n.position.x, y: n.position.y }); }
      } finally { quiet--; }
    }

    // Drag a zone (or undo its move) and the tables inside it come along.
    keep(model.on('node:changed', (node: any) => {
      if (!node || kindOf(node.id) !== 'zone') return;
      const prev = zonePos.get(node.id), cur = { x: node.position.x, y: node.position.y };
      zonePos.set(node.id, cur);
      if (quiet || !prev) return;
      const dx = cur.x - prev.x, dy = cur.y - prev.y;
      if (!dx && !dy) return;
      const dragging = new Set<string>(api.getDraggingNodeIds?.() ?? []);   // a table dragged WITH the zone moves once
      quiet++;
      try {
        for (const id of zoneMembers.get(node.id) ?? []) {
          if (dragging.has(id)) continue;
          const m = model.getNode(id);
          if (m) m.setPosition(m.position.x + dx, m.position.y + dy);
        }
      } finally { quiet--; }
    }));

    function reconcile() {
      const fk = fkSet();
      quiet++;
      try {
        const hidden = hiddenMembers();
        const want: Want[] = [
          ...S.groups.map((g): Want => ({ kind: 'zone', id: g.id, data: g })),
          ...S.notes.map((n): Want => ({ kind: 'note', id: n.id, data: n })),
          ...S.tables.filter((t) => !hidden.has(t.id)).map((t): Want => ({ kind: 'table', id: t.id, data: t })),
        ];
        const wantIds = new Set(want.map((w) => w.id));
        for (const n of [...model.getNodes()]) if (!wantIds.has(n.id)) removeNodeWithLinks(n.id);
        // Zones and notes stay BEHIND every table: the model paints — and decides
        // what covers a grip — in insertion order, so a zone or note arriving while
        // tables exist means the tables are re-added after it.
        const ids: string[] = model.getNodes().map((n: any) => n.id);
        const firstTable = ids.findIndex((id) => kindOf(id) === 'table');
        const lastBack = ids.reduce((m, id, i) => (kindOf(id) !== 'table' ? i : m), -1);
        const newBack = want.some((w) => w.kind !== 'table' && !model.getNode(w.id));
        if (firstTable !== -1 && (newBack || lastBack > firstTable)) {
          for (const id of ids) if (kindOf(id) === 'table') removeNodeWithLinks(id);
        }
        for (const w of want) {
          const node = model.getNode(w.id);
          if (node) updateNode(node, w, fk); else model.addNode(buildNode(w, fk));
        }
      } finally { quiet--; }
      refitZones();
      syncLinks();
      paintAll();   // a table's dot takes the colour of the zone it landed in
      api.renderNow();
    }

    function applySchema(snap: Schema) {
      S = clone(snap);
      reconcile();
      refreshPanels();
    }

    /** Positions live on the board between edits; fold them back into the schema. */
    function syncFromModel() {
      const r1 = (v: number) => Math.round(v * 10) / 10;
      for (const t of S.tables) { const n = model.getNode(t.id); if (n) { t.x = r1(n.position.x); t.y = r1(n.position.y); } }
      for (const g of S.groups) {
        const n = model.getNode(g.id);
        if (!n) continue;
        g.x = r1(n.position.x); g.y = r1(n.position.y);
        if (!g.hidden) { g.w = n.size.width; g.h = n.size.height; }
      }
      for (const no of S.notes) { const n = model.getNode(no.id); if (n) { no.x = r1(n.position.x); no.y = r1(n.position.y); } }
    }
    /** Drop anything that points at what is gone. */
    function tidy(s: Schema) {
      s.rels = s.rels.filter((r) => colOf(r.from, s) && colOf(r.to, s));
      const ids = new Set(s.tables.map((t) => t.id));
      for (const g of s.groups) if (g.hidden) g.members = (g.members || []).filter((id) => ids.has(id));
    }
    /**
     * THE edit path: every change to the schema is one SchemaEdit on the engine's
     * command stack — so it is one Ctrl/⌘+Z, in order with the engine's own moves.
     */
    async function commit(label: string, mutate: (s: Schema) => void | false): Promise<boolean> {
      syncFromModel();
      const before = clone(S), after = clone(S);
      if (mutate(after) === false) return false;
      tidy(after);
      if (JSON.stringify(before) === JSON.stringify(after)) return false;
      await engine.commandManager.execute(new SchemaEdit(label, before, after));
      return true;
    }

    // After ANY step (an edit, a drag, an undo): zones re-wrap, keys re-pick their sides.
    let afterQueued = false;
    const scheduleAfter = () => {
      if (afterQueued) return;
      afterQueued = true;
      setTimeout(function after() {
        if (gen !== ui.gen) return;
        if (converting) { setTimeout(after, 10); return; }   // a drawn link is being turned into a key
        afterQueued = false;
        refitZones();
        syncLinks();
        paintAll();
        api.renderNow();
        syncHistory();
      }, 0);
    };
    for (const ev of ['command:executed', 'command:undone', 'command:redone']) keep(engine.eventBus.on(ev, scheduleAfter));

    // ---- small board helpers ---------------------------------------------------
    let toastTimer = 0;
    offs.push(() => clearTimeout(toastTimer));
    const toast = (msg: string, ms = 2600) => {
      ui.toastMsg = msg;
      ui.toastShow = true;
      clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => { ui.toastShow = false; ui.bump(); }, ms);
      ui.bump();
    };
    const viewCenter = () => { const r = board.getBoundingClientRect(); return api.viewport.clientToWorld(r.left + r.width / 2, r.top + r.height / 2, r); };
    /** A spot near `near` where a w×h box overlaps nothing on the board. */
    function freeSpot(w: number, h: number, near: { x: number; y: number }) {
      const boxes = model.getNodes().map((n: any) => nodeRect(n.id)!);
      const clear = (x: number, y: number) => !boxes.some((b: Rect) => x < b.x + b.w + 32 && x + w + 32 > b.x && y < b.y + b.h + 32 && y + h + 32 > b.y);
      const x0 = near.x - w / 2, y0 = near.y - h / 2;
      for (let ring = 0; ring < 40; ring++) {
        for (let k = -ring; k <= ring; k++) {
          for (const [dx, dy] of [[k, -ring], [k, ring], [-ring, k], [ring, k]]) {
            const x = x0 + dx * 60, y = y0 + dy * 48;
            if (clear(x, y)) return { x: Math.round(x), y: Math.round(y) };
          }
        }
      }
      return { x: Math.round(x0), y: Math.round(y0) };
    }
    /** Pan (no zoom change) so the node sits in view. */
    function reveal(id: string) {
      const n = model.getNode(id);
      if (!n) return;
      const r = board.getBoundingClientRect();
      const a = api.viewport.worldToClient(n.position.x, n.position.y, r);
      const b = api.viewport.worldToClient(n.position.x + n.size.width, n.position.y + n.size.height, r);
      if (a.x >= r.left + 16 && b.x <= r.right - 16 && a.y >= r.top + 16 && b.y <= r.bottom - 16) return;
      api.viewport.panByScreenDelta((a.x + b.x) / 2 - (r.left + r.width / 2), (a.y + b.y) / 2 - (r.top + r.height / 2));
      api.renderNow();
    }
    const selectOnly = (id: string | null) => {
      model.clearSelection?.();
      for (const l of model.getLinks()) if (l.state === 'selected') l.setState('default');
      const n = id && model.getNode(id);
      if (n) model.selectNode(n);
      api.renderNow();
    };
    const fit = () => { api.fitView(48); api.renderNow(); };

    // ---- the edits (each one undoable step) ------------------------------------
    /** T: a table with an id column, at a free spot — inside the selected group, if one is. */
    async function addTable() {
      const sel = model.getSelectedNodes().map((n: any) => n.id);
      const zone = sel.map((id: string) => groupOf(id)).find((g: Group | undefined) => g && !g.hidden) as Group | undefined;
      let id: string | null = null;
      await commit('Add table', (s) => {
        const name = freshName(s.tables.map((t) => t.name), 'table');
        id = freshId(s, name);
        const t: Table = { id, name, x: 0, y: 0, columns: [{ id: freshCol(s), name: 'id', type: 'uuid', pk: true, uq: false, nn: true }] };
        const size = tableSize(t);
        let at;
        if (zone) {
          // Under the group's last table, and the frame grown to hold it, so the
          // new table's centre lands inside — that is what makes it a member.
          const G = groupOf(zone.id, s)!;
          const filled = (zoneMembers.get(zone.id) || []).some((m) => kindOf(m) === 'table');
          at = filled ? { x: Math.round(G.x + ZONE.PAD), y: Math.round(G.y + G.h - ZONE.PAD + 28) } : { x: Math.round(G.x + ZONE.PAD), y: Math.round(G.y + ZONE.HEAD) };
          G.h = Math.max(G.h, at.y + size.h + ZONE.PAD - G.y);
          G.w = Math.max(G.w, size.w + 2 * ZONE.PAD);
        } else at = freeSpot(size.w, size.h, viewCenter());
        Object.assign(t, at);
        s.tables.push(t);
      });
      if (!id) return null;
      selectOnly(id);
      reveal(id);
      await sleep(0);
      editTableName(id);
      return id;
    }

    const validIdent = (name: string) => {
      if (!IDENT.test(name)) { toast(`"${name}" is not a plain SQL name — use letters, digits and _ (not starting with a digit)`); return false; }
      return true;
    };
    async function renameTable(tid: string, name: string) {
      name = name.trim();
      const t = tableOf(tid);
      if (!t || !name || name === t.name || !validIdent(name)) return false;
      if (S.tables.some((x) => x.id !== tid && x.name.toLowerCase() === name.toLowerCase())) { toast(`There is already a table called ${name}`); return false; }
      return commit('Rename table', (s) => { tableOf(tid, s)!.name = name; });
    }
    async function deleteTables(ids: string[], label = 'Delete table') {
      return commit(label, (s) => {
        s.tables = s.tables.filter((t) => !ids.includes(t.id));
      });
    }
    async function addColumn(tid: string) {
      let cid: string | null = null;
      await commit('Add column', (s) => {
        const t = tableOf(tid, s)!;
        cid = freshCol(s);
        t.columns.push({ id: cid, name: freshName(t.columns.map((c) => c.name), 'column'), type: 'text', pk: false, uq: false, nn: false });
      });
      if (cid) { await sleep(0); editColumnName(tid, cid); }
      return cid;
    }
    async function renameColumn(tid: string, cid: string, name: string) {
      name = name.trim();
      const t = tableOf(tid)!, c = colOf({ t: tid, c: cid });
      if (!c || !name || name === c.name || !validIdent(name)) return false;
      if (t.columns.some((x) => x.id !== cid && x.name.toLowerCase() === name.toLowerCase())) { toast(`${t.name} already has a column called ${name}`); return false; }
      return commit('Rename column', (s) => { colOf({ t: tid, c: cid }, s)!.name = name; });
    }
    async function setType(tid: string, cid: string, type: string) {
      type = String(type).trim().toLowerCase();
      if (!type) return false;
      return commit('Change type', (s) => { colOf({ t: tid, c: cid }, s)!.type = type; });
    }
    async function toggleFlag(tid: string, cid: string, flag: 'pk' | 'uq' | 'nn') {
      const t = tableOf(tid), c = colOf({ t: tid, c: cid });
      if (!t || !c) return false;
      const single = t.columns.filter((x) => x.pk).length === 1;
      if (flag !== 'pk' && c.pk && single) { toast(`${c.name} is the primary key — already unique and not null`); return false; }
      return commit(flag === 'pk' ? 'Toggle primary key' : flag === 'uq' ? 'Toggle UNIQUE' : 'Toggle NOT NULL', (s) => {
        const col = colOf({ t: tid, c: cid }, s)!;
        col[flag] = !col[flag];
        if (flag === 'pk' && col.pk) col.nn = true;
      });
    }
    async function deleteColumn(tid: string, cid: string) {
      const name = refName({ t: tid, c: cid });
      const keys = S.rels.filter((r) => sameRef(r.from, { t: tid, c: cid }) || sameRef(r.to, { t: tid, c: cid })).length;
      const ok = await commit('Delete column', (s) => {
        const t = tableOf(tid, s)!;
        t.columns = t.columns.filter((c) => c.id !== cid);
      });
      if (ok) toast(`Deleted ${name}${keys ? ` and ${keys} foreign key${keys > 1 ? 's' : ''}` : ''} — Ctrl/⌘+Z brings it back`);
      return ok;
    }

    /**
     * A foreign key: `from` (the referencing column) → `to` (the referenced one).
     * The referenced column must be unique, so it becomes UNIQUE if it was not;
     * the referencing column takes the referenced column's type.
     */
    async function createFK(from: ColRef, to: ColRef) {
      const fc = colOf(from), tc = colOf(to);
      if (!fc || !tc || sameRef(from, to)) return false;
      if (S.rels.some((r) => sameRef(r.from, from) && sameRef(r.to, to))) { toast(`${refName(from)} → ${refName(to)} already exists`); return false; }
      const notes: string[] = [];
      let rid: string | null = null;
      const ok = await commit('Add foreign key', (s) => {
        const F = colOf(from, s)!, T = colOf(to, s)!, tt = tableOf(to.t, s)!;
        const old = s.rels.find((r) => sameRef(r.from, from));
        if (old) { notes.push(`it replaces → ${refName(old.to, s)}`); s.rels = s.rels.filter((r) => r !== old); }
        const want = T.type === 'serial' ? 'integer' : T.type === 'bigserial' ? 'bigint' : T.type;
        if (F.type !== want) { notes.push(`${F.name} is now ${want} to match`); F.type = want; }
        if (!T.pk && !T.uq) { T.uq = true; notes.push(`${tt.name}.${T.name} is now UNIQUE so it can be referenced`); }
        rid = freshSeq(s, 'r');
        s.rels.push({ id: rid, from: { ...from }, to: { ...to }, card: 'N:1', onDelete: 'NO ACTION' });
      });
      if (ok) toast(`Foreign key ${refName(from)} → ${refName(to)} added${notes.length ? ' — ' + notes.join('; ') : ''}`, 3600);
      return ok ? rid : false;
    }
    async function updateRel(rid: string, patch: Partial<Rel>) {
      return commit('Edit foreign key', (s) => { Object.assign(s.rels.find((r) => r.id === rid)!, patch); });
    }
    async function deleteRel(rid: string) {
      const r = S.rels.find((x) => x.id === rid);
      const label = r ? `${refName(r.from)} → ${refName(r.to)}` : '';
      const ok = await commit('Delete foreign key', (s) => { s.rels = s.rels.filter((x) => x.id !== rid); });
      if (ok) toast(`Deleted ${label} — Ctrl/⌘+Z brings it back`);
      return ok;
    }

    /** G: a group around the selected tables, or an empty one in free space. */
    async function addGroup() {
      const sel: string[] = model.getSelectedNodes().map((n: any) => n.id).filter((id: string) => kindOf(id) === 'table' || kindOf(id) === 'note');
      let gid: string | null = null;
      await commit('Add group', (s) => {
        gid = freshSeq(s, 'g');
        const used = new Set(s.groups.map((g) => g.color));
        const color = ZONE_COLORS.find((c) => !used.has(c)) ?? ZONE_COLORS[s.groups.length % ZONE_COLORS.length];
        const name = freshName(s.groups.map((g) => g.name), 'New group');
        let rect;
        if (sel.length) {
          const rs = sel.map((id) => nodeRect(id)!);
          // The new frame's header band must not land on a table that stays outside
          // it: if it would, the selection steps down far enough to clear it.
          const top0 = Math.min(...rs.map((r) => r.y)), left0 = Math.min(...rs.map((r) => r.x)), right0 = Math.max(...rs.map((r) => r.x + r.w));
          let shift = 0;
          for (const n of model.getNodes()) {
            if (sel.includes(n.id) || kindOf(n.id) !== 'table') continue;
            const r = nodeRect(n.id)!;
            const bandTop = top0 - ZONE.HEAD;
            if (r.x < right0 + ZONE.PAD && r.x + r.w > left0 - ZONE.PAD && r.y < top0 && r.y + r.h > bandTop) shift = Math.max(shift, r.y + r.h + 16 - bandTop);
          }
          if (shift) {
            for (const id of sel) { const it = tableOf(id, s) ?? noteOf(id, s); if (it) it.y += shift; }
            for (const r of rs) r.y += shift;
          }
          const x0 = Math.min(...rs.map((r) => r.x)), y0 = Math.min(...rs.map((r) => r.y));
          const x1 = Math.max(...rs.map((r) => r.x + r.w)), y1 = Math.max(...rs.map((r) => r.y + r.h));
          rect = { x: x0 - ZONE.PAD, y: y0 - ZONE.HEAD, w: x1 - x0 + 2 * ZONE.PAD, h: y1 - y0 + ZONE.HEAD + ZONE.PAD };
        } else {
          const at = freeSpot(ZONE.EMPTY_W, ZONE.EMPTY_H, viewCenter());
          rect = { ...at, w: ZONE.EMPTY_W, h: ZONE.EMPTY_H };
        }
        s.groups.push({ id: gid, name, color, ...rect, hidden: false });
      });
      if (gid) { selectOnly(gid); reveal(gid); toast(sel.length ? 'Grouped — drag the group by its header to move its tables together' : 'Drag tables into the group; drag its header to move them together'); }
      return gid;
    }
    async function toggleHide(gid: string) {
      const g = groupOf(gid);
      if (!g) return false;
      if (!g.hidden) {
        const members = (zoneMembers.get(gid) || []).filter((id) => kindOf(id) === 'table');
        if (!members.length) { toast(`${g.name} has no tables to hide`); return false; }
        return commit('Hide group', (s) => {
          const G = groupOf(gid, s)!;
          Object.assign(G, { hidden: true, members, hiddenAt: { x: G.x, y: G.y } });
        });
      }
      return commit('Show group', (s) => {
        const G = groupOf(gid, s)!;
        const dx = G.x - (G.hiddenAt?.x ?? G.x), dy = G.y - (G.hiddenAt?.y ?? G.y);
        for (const id of G.members || []) { const t = tableOf(id, s); if (t) { t.x += dx; t.y += dy; } }
        G.hidden = false;
        delete G.members; delete G.hiddenAt;
      });
    }
    async function renameGroup(gid: string, name: string) {
      name = name.trim();
      if (!name || name === groupOf(gid)?.name) return false;
      return commit('Rename group', (s) => { groupOf(gid, s)!.name = name; });
    }
    const recolorGroup = (gid: string, color: string) => commit('Recolour group', (s) => { groupOf(gid, s)!.color = color; });
    const ungroup = (gid: string) => commit('Ungroup', (s) => {
      const G = groupOf(gid, s)!;
      if (G.hidden) { const dx = G.x - G.hiddenAt!.x, dy = G.y - G.hiddenAt!.y; for (const id of G.members || []) { const t = tableOf(id, s); if (t) { t.x += dx; t.y += dy; } } }
      s.groups = s.groups.filter((g) => g.id !== gid);
    });
    const deleteGroupAndTables = (gid: string) => {
      const g = groupOf(gid)!;
      const ids = g.hidden ? (g.members || []) : (zoneMembers.get(gid) || []);
      return commit('Delete group and its tables', (s) => {
        s.groups = s.groups.filter((x) => x.id !== gid);
        s.tables = s.tables.filter((t) => !ids.includes(t.id));
        s.notes = s.notes.filter((n) => !ids.includes(n.id));
      });
    };

    /** N: a note at a free spot, ready to type in. */
    async function addNote() {
      let nid: string | null = null;
      await commit('Add note', (s) => {
        nid = freshSeq(s, 'n');
        const n: Note = { id: nid, text: 'New note\nDouble-click to write here.', w: NOTE_W, x: 0, y: 0 };
        Object.assign(n, freeSpot(NOTE_W, 90, viewCenter()));
        s.notes.push(n);
      });
      if (nid) { selectOnly(nid); reveal(nid); await sleep(0); editNote(nid); }
      return nid;
    }
    const setNoteText = (nid: string, text: string) => commit('Edit note', (s) => { noteOf(nid, s)!.text = text; });

    /** Delete (or Backspace): whatever is selected, one step. A zone goes, its tables stay. */
    async function deleteSelection() {
      const ids: string[] = model.getSelectedNodes().map((n: any) => n.id);
      const links: string[] = model.getLinks().filter((l: any) => l.state === 'selected').map((l: any) => l.id);
      if (!ids.length && !links.length) return false;
      const tables = ids.filter((id) => kindOf(id) === 'table');
      const dropped = S.rels.filter((r) => links.includes(r.id) || tables.includes(r.from.t) || tables.includes(r.to.t)).length;
      const ok = await commit('Delete', (s) => {
        for (const id of ids) {
          if (kindOf(id) === 'zone') {
            const G = groupOf(id, s);
            if (G?.hidden) { const dx = G.x - G.hiddenAt!.x, dy = G.y - G.hiddenAt!.y; for (const m of G.members || []) { const t = tableOf(m, s); if (t) { t.x += dx; t.y += dy; } } }
          }
        }
        s.tables = s.tables.filter((t) => !ids.includes(t.id));
        s.groups = s.groups.filter((g) => !ids.includes(g.id));
        s.notes = s.notes.filter((n) => !ids.includes(n.id));
        s.rels = s.rels.filter((r) => !links.includes(r.id));
      });
      if (ok) {
        const what = [tables.length && `${tables.length} table${tables.length > 1 ? 's' : ''}`, dropped && `${dropped} foreign key${dropped > 1 ? 's' : ''}`,
          ids.some((id) => !tables.includes(id)) && 'the selection'].filter(Boolean).join(' and ');
        toast(`Deleted ${what || 'the selection'} — Ctrl/⌘+Z brings it back`);
      }
      return ok;
    }

    // ---- inline editing: a real input pinned over the cell's screen rect ------
    // (The board's own popovers live in the component's empty layer element.)
    const cellOf = (nodeId: string, sel: string) => board.querySelector(`[data-node-id="${CSS.escape(nodeId)}"] ${sel}`);
    let editor: { el: HTMLInputElement | HTMLTextAreaElement; finish: (ok: boolean) => void } | null = null;
    const closeEditor = (ok = true) => editor?.finish(ok);
    offs.push(() => closeEditor(false));
    function openEditor(cell: Element | null, value: string, onCommit: (v: string) => void, opts: { multiline?: boolean; label?: string; minW?: number; onTab?: (back: boolean) => void } = {}) {
      closeEditor(true);
      closePops();
      if (!cell) return null;
      const r = cell.getBoundingClientRect();
      const el = document.createElement(opts.multiline ? 'textarea' : 'input');
      el.className = 'dm-edit';
      el.value = value;
      el.spellcheck = false;
      el.setAttribute('autocomplete', 'off');
      el.setAttribute('aria-label', opts.label || 'Edit');
      const h = opts.multiline ? Math.max(60, r.height) : 24;
      el.style.left = Math.round(r.left - 5) + 'px';
      el.style.top = Math.round(opts.multiline ? r.top : r.top + (r.height - h) / 2) + 'px';
      el.style.width = Math.round(Math.max(r.width + 18, opts.minW ?? 120)) + 'px';
      el.style.height = Math.round(h) + 'px';
      layer.appendChild(el);
      let done = false;
      const finish = (ok: boolean) => {
        if (done) return;
        done = true;
        editor = null;
        const v = el.value;
        el.remove();
        if (ok && v !== value) onCommit(v);
      };
      el.addEventListener('keydown', (e: Event) => {
        const k = e as KeyboardEvent;
        k.stopPropagation();
        if (k.key === 'Escape') { k.preventDefault(); finish(false); }
        else if (k.key === 'Enter' && (!opts.multiline || k.metaKey || k.ctrlKey)) { k.preventDefault(); finish(true); }
        else if (k.key === 'Tab' && opts.onTab) { k.preventDefault(); finish(true); opts.onTab(k.shiftKey); }
      });
      el.addEventListener('blur', () => finish(true));
      for (const t of ['pointerdown', 'mousedown', 'click', 'dblclick', 'wheel']) el.addEventListener(t, (e) => e.stopPropagation());
      editor = { el, finish };
      setTimeout(() => { if (editor?.el === el) { el.focus(); el.select(); } }, 0);
      return el;
    }
    const editTableName = (tid: string) => openEditor(cellOf(tid, '.dm-tname'), tableOf(tid)?.name ?? '', (v) => renameTable(tid, v), { label: 'Table name', minW: 140 });
    function editColumnName(tid: string, cid: string): HTMLElement | null {
      const c = colOf({ t: tid, c: cid });
      if (!c) return null;
      return openEditor(cellOf(tid, `.dm-c-${cid} .dm-cname`), c.name, (v) => renameColumn(tid, cid, v), {
        label: 'Column name',
        // Tab walks the rows, Shift+Tab walks back.
        onTab: (back) => setTimeout(() => {
          const cols = tableOf(tid)?.columns ?? [];
          const i = cols.findIndex((x) => x.id === cid) + (back ? -1 : 1);
          if (cols[i]) editColumnName(tid, cols[i].id);
        }, 30),
      });
    }
    const editGroupName = (gid: string) => openEditor(cellOf(gid, '.dm-ztitle'), groupOf(gid)?.name ?? '', (v) => renameGroup(gid, v), { label: 'Group name', minW: 160 });
    function editNote(nid: string) {
      const n = noteOf(nid), el = cellOf(nid, '.dm-note');
      if (!n || !el) return null;
      return openEditor(el, n.text, (v) => setNoteText(nid, v.trim() || 'Note'), { multiline: true, label: 'Note text — first line is the title; Ctrl/⌘+Enter saves' });
    }

    // ---- popovers: the type menu and the group menu ----------------------------
    const pop = (id: string) => { const el = document.createElement('div'); el.className = 'dm-pop'; el.id = id; el.hidden = true; layer.appendChild(el); offs.push(() => el.remove()); return el; };
    const typePop = pop('dm-typemenu'), zonePop = pop('dm-zonemenu');
    for (const p of [typePop, zonePop]) for (const t of ['pointerdown', 'mousedown', 'wheel']) p.addEventListener(t, (e) => e.stopPropagation());
    const closePops = () => { typePop.hidden = true; zonePop.hidden = true; };
    const placePop = (el: HTMLElement, r: DOMRect) => {
      el.hidden = false;
      const w = el.offsetWidth, h = el.offsetHeight;
      el.style.left = Math.round(Math.min(Math.max(8, r.left), innerWidth - w - 8)) + 'px';
      el.style.top = Math.round(r.bottom + 4 + h > innerHeight - 8 ? Math.max(8, r.top - h - 4) : r.bottom + 4) + 'px';
    };
    listen(document, 'pointerdown', (e: PointerEvent) => {
      if (!(e.target instanceof Node)) return;
      if (!typePop.hidden && !typePop.contains(e.target)) typePop.hidden = true;
      if (!zonePop.hidden && !zonePop.contains(e.target)) zonePop.hidden = true;
    }, true);
    const TYPE_NOTE: Record<string, string> = { uuid: 'identifier', integer: 'whole number', bigint: 'big whole number', serial: 'auto-numbered', 'decimal(10,2)': 'money',
      real: 'floating point', 'varchar(255)': 'short text', text: 'long text', boolean: 'true / false', date: 'calendar day', timestamp: 'date + time', json: 'document' };
    let typeCtx: { tid: string; cid: string } | null = null;
    function openTypeMenu(tid: string, cid: string, cell: Element | null) {
      closeEditor(true);
      closePops();
      const c = colOf({ t: tid, c: cid });
      if (!c || !cell) return;
      typeCtx = { tid, cid };
      typePop.innerHTML = `<input aria-label="Type" placeholder="filter, or a custom type" value="${esc(c.type)}">
        <div class="opts">${COMMON_TYPES.map((t) => `<button class="opt${t === c.type ? ' on' : ''}" data-type="${esc(t)}">${esc(t)}<small>${esc(TYPE_NOTE[t] ?? '')}</small></button>`).join('')}</div>`;
      placePop(typePop, cell.getBoundingClientRect());
      const input = typePop.querySelector('input')!;
      input.addEventListener('input', () => {
        const q = input.value.trim().toLowerCase();
        for (const b of Array.from(typePop.querySelectorAll<HTMLElement>('[data-type]'))) b.hidden = !!q && !b.dataset['type']!.includes(q) && q !== c.type;
      });
      input.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Escape') { e.preventDefault(); closePops(); }
        else if (e.key === 'Enter') { e.preventDefault(); const v = input.value.trim(); closePops(); if (v) setType(tid, cid, v); }
      });
      setTimeout(() => { input.focus(); input.select(); }, 0);
    }
    typePop.addEventListener('click', (e) => {
      const b = (e.target as Element).closest?.('[data-type]') as HTMLElement | null;
      if (!b || !typeCtx) return;
      closePops();
      setType(typeCtx.tid, typeCtx.cid, b.dataset['type']!);
    });
    let zoneCtx: string | null = null;
    function openZoneMenu(gid: string, anchor: Element) {
      closeEditor(true);
      closePops();
      const g = groupOf(gid);
      if (!g) return;
      zoneCtx = gid;
      zonePop.innerHTML = `<button data-zact="rename">Rename…</button>
        <div class="swatches">${ZONE_COLORS.map((c) => `<button class="dm-zc-${c}${c === g.color ? ' on' : ''}" data-color="${c}" title="${c}" aria-label="Colour ${c}"></button>`).join('')}</div>
        <div class="sep"></div>
        <button data-zact="hide">${g.hidden ? 'Show its tables' : 'Hide its tables'}</button>
        <button data-zact="ungroup">Ungroup (keep the tables)</button>
        <button data-zact="delete" class="danger">Delete the group and its tables</button>`;
      placePop(zonePop, anchor.getBoundingClientRect());
    }
    zonePop.addEventListener('click', (e) => {
      const b = (e.target as Element).closest?.('button') as HTMLElement | null;
      if (!b || !zoneCtx) return;
      const gid = zoneCtx;
      closePops();
      if (b.dataset['color']) recolorGroup(gid, b.dataset['color']);
      else if (b.dataset['zact'] === 'rename') setTimeout(() => editGroupName(gid), 0);
      else if (b.dataset['zact'] === 'hide') toggleHide(gid);
      else if (b.dataset['zact'] === 'ungroup') ungroup(gid).then((ok) => ok && toast('Ungrouped — the tables stay where they are'));
      else if (b.dataset['zact'] === 'delete') deleteGroupAndTables(gid).then((ok) => ok && toast('Deleted the group and its tables — Ctrl/⌘+Z brings them back'));
    });

    // ---- clicks on the cards: switches act, names and types open editors -------
    const colIdOfRow = (row: Element) => /(?:^|\s)dm-c-(\S+)/.exec(row.className)?.[1] ?? null;
    // Small switches take the press; names and types still drag the card (a click opens their editor).
    const SWITCH = '.dm-badge, .dm-key, .dm-cdel, .dm-tdel, .dm-add, .dm-zbtn, .dm-ndel';
    let press: { x: number; y: number; at: number } | null = null;
    const claimPress = (e: PointerEvent | MouseEvent) => {
      const t = e.target instanceof Element ? e.target : null;
      if (e.type === 'pointerdown') press = { x: e.clientX, y: e.clientY, at: performance.now() };
      // A switch is pressed, not dragged: keep the press away from the canvas.
      if (t && t.closest(SWITCH)) e.stopPropagation();
    };
    listen(board, 'pointerdown', claimPress, true);
    listen(board, 'mousedown', claimPress, true);
    listen(board, 'click', (e: MouseEvent) => {
      const t = e.target instanceof Element ? e.target : null;
      const p = press;
      press = null;
      if (!t) return;
      // A click at the end of a drag is not a click on what the pointer ended over.
      if (p && performance.now() - p.at < 4000 && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 4) return;
      const group = t.closest('[data-node-id]');
      if (!group) return;
      const id = group.getAttribute('data-node-id')!;
      const row = t.closest('.dm-row');
      const cid = (row ? colIdOfRow(row) : null) as string;
      let handled = true;
      if (t.closest('.dm-uq')) toggleFlag(id, cid, 'uq');
      else if (t.closest('.dm-nn')) toggleFlag(id, cid, 'nn');
      else if (t.closest('.dm-key')) toggleFlag(id, cid, 'pk');
      else if (t.closest('.dm-cdel')) deleteColumn(id, cid);
      else if (t.closest('.dm-ctype')) openTypeMenu(id, cid, t.closest('.dm-ctype'));
      else if (t.closest('.dm-cname')) editColumnName(id, cid);
      else if (t.closest('.dm-tdel')) {
        const n = S.rels.filter((r) => r.from.t === id || r.to.t === id).length, name = tableOf(id)?.name;
        deleteTables([id]).then((ok) => ok && toast(`Deleted ${name}${n ? ` and ${n} foreign key${n > 1 ? 's' : ''}` : ''} — Ctrl/⌘+Z brings it back`));
      }
      else if (t.closest('.dm-tname')) editTableName(id);
      else if (t.closest('.dm-add')) addColumn(id);
      else if (t.closest('.dm-zmenu')) openZoneMenu(id, t.closest('.dm-zmenu')!);
      else if (t.closest('.dm-zeye')) toggleHide(id);
      else if (t.closest('.dm-ztitle')) editGroupName(id);
      else if (t.closest('.dm-ndel')) commit('Delete note', (s) => { s.notes = s.notes.filter((n) => n.id !== id); });
      else handled = false;
      if (handled) { e.stopPropagation(); e.preventDefault(); }
    }, true);
    listen(board, 'dblclick', (e: MouseEvent) => {
      const note = e.target instanceof Element ? e.target.closest('.dm-note') : null;
      if (!note) return;
      e.stopPropagation();
      e.preventDefault();
      editNote(note.closest('[data-node-id]')!.getAttribute('data-node-id')!);
    }, true);

    // The row under the pointer lights its two grips.
    const gripStyle = document.createElement('style');
    gripStyle.id = 'dm-grip-hover';
    document.head.appendChild(gripStyle);
    offs.push(() => gripStyle.remove());
    listen(board, 'pointerover', (e: PointerEvent) => {
      const row = e.target instanceof Element ? e.target.closest('.dm-row') : null;
      const g = row && row.closest('[data-node-id]');
      const css = g ? `#dm-board rect.port[data-port-id^="${g.getAttribute('data-node-id')}::${colIdOfRow(row!)}::"] { opacity: 1; }` : '';
      if (gripStyle.textContent !== css) gripStyle.textContent = css;
    });
    listen(board, 'pointerleave', () => { gripStyle.textContent = ''; });

    // ---- foreign keys by dragging a grip ---------------------------------------
    // The engine runs the drag (wire preview, valid-target glow, the kit's join
    // guidance tints). Where it ends decides the key:
    //   • on another grip → the engine makes its own link; the page swaps it for a
    //     foreign key (undoing the engine's step, so the key is ONE undo step);
    //   • anywhere on a row of a table → that column; on a header → its primary key.
    const guidance = bindJoinGuidance(api, {
      resolvePort: (pid: string) => { const p = parsePortId(pid); const c = p && colOf(p); return c ? { nodeId: p!.t, column: c.name } : null; },
    } as any);
    offs.push(() => guidance.dispose());
    function rowAt(wx: number, wy: number): ColRef | null {
      const nodes = model.getNodes().filter((n: any) => kindOf(n.id) === 'table').reverse();
      for (const n of nodes) {
        const { x, y } = n.position, w = n.size.width, h = n.size.height;
        if (wx < x - 12 || wx > x + w + 12 || wy < y || wy > y + h) continue;
        const t = tableOf(n.id)!;
        const i = Math.floor((wy - y - 1 - GEO.HEAD) / GEO.ROW);
        if (i >= 0 && i < t.columns.length) return { t: t.id, c: t.columns[i].id };
        const pks = t.columns.filter((c) => c.pk);
        return pks.length === 1 ? { t: t.id, c: pks[0].id } : null;
      }
      return null;
    }
    function dropKey(src: ColRef | null, dst: ColRef | null) {
      if (!src || !dst || !tableOf(src.t) || !tableOf(dst.t)) return;
      const a = { t: src.t, c: src.c }, b = { t: dst.t, c: dst.c };
      const ca = colOf(a), cb = colOf(b);
      if (!ca || !cb || sameRef(a, b)) return;
      // The dragged column becomes the foreign key — unless a primary key was
      // dragged onto a column that is not one: a key is always the referenced end.
      const flip = ca.pk && !cb.pk;
      createFK(flip ? b : a, flip ? a : b);
    }
    let connFrom: ColRef | null = null, lastUp: { x: number; y: number; at: number } | null = null;
    let pendingLink: { from: ColRef | null; to: ColRef | null } | null = null, converting = false;
    listen(window, 'pointerup', (e: PointerEvent) => { lastUp = { x: e.clientX, y: e.clientY, at: performance.now() }; }, true);
    keep(engine.eventBus.on('connection:start', (p: any) => { connFrom = parsePortId(p?.sourcePort?.id); pendingLink = null; }));
    keep(engine.eventBus.on('connection:complete', (p: any) => {
      pendingLink = { from: connFrom ?? parsePortId(p?.sourcePortId), to: parsePortId(p?.targetPortId) };
      connFrom = null;
    }));
    keep(engine.eventBus.on('command:executed', (e: any) => {
      const command = e?.command;
      if (!pendingLink || !command || command instanceof SchemaEdit || command.name !== 'Add Link') return;
      const { from, to } = pendingLink;
      pendingLink = null;
      // A microtask: the draft link must be undone before anything else (the
      // after-step sync would otherwise sweep it away and strand its history entry).
      converting = true;
      queueMicrotask(async () => {
        try { await engine.undo(); } finally { converting = false; }
        dropKey(from, to);
      });
    }));
    keep(engine.eventBus.on('connection:cancel', () => {
      const from = connFrom;
      connFrom = null;
      // Escape (no pointer release just now) abandons the drag: no key.
      if (!from || !lastUp || performance.now() - lastUp.at > 250) return;
      const r = board.getBoundingClientRect();
      const w = api.viewport.clientToWorld(lastUp.x, lastUp.y, r);
      const to = rowAt(w.x, w.y);
      if (to) setTimeout(() => dropKey(from, to), 0);
    }));

    // ---- keys: T / G / N, Delete, and no engine clipboard ------------------------
    // (Registered at the top of init in the CAPTURE phase on window: it runs
    // before the engine's own window listener, so Delete is ours first.)
    function onKey(e: KeyboardEvent) {
      if (isTyping(e.target) || isTyping(document.activeElement)) return;
      if (ui.impOpen) { if (e.key === 'Escape') closeImport(); return; }
      if (e.key === 'Escape') { closePops(); return; }
      const mod = e.ctrlKey || e.metaKey;
      if ((e.key === 'Delete' || e.key === 'Backspace') && !mod) {
        if (!model.getSelectedNodes().length && !model.getLinks().some((l: any) => l.state === 'selected')) return;
        // Ours, not the engine's: a deleted table must leave the SCHEMA, as one undoable step.
        e.preventDefault();
        e.stopImmediatePropagation();
        deleteSelection();
        return;
      }
      if (mod && ['v', 'x', 'd'].includes(e.key.toLowerCase())) {
        // The engine's clipboard would clone cards outside the schema.
        e.stopImmediatePropagation();
        e.preventDefault();
        toast('Copy and paste of cards is not part of this studio — T adds a table');
        return;
      }
      if (mod || e.altKey || e.repeat) return;
      const k = e.key.toLowerCase();
      if (k === 't') { e.preventDefault(); addTable(); }
      else if (k === 'g') { e.preventDefault(); addGroup(); }
      else if (k === 'n') { e.preventDefault(); addNote(); }
    }

    keep(api.on('selection:change', ({ nodes, edges }: any) => {
      view.selRel = edges && edges.length === 1 ? edges[0].id : null;
      renderRels();
      if (nodes && nodes.length === 1 && kindOf(nodes[0].id) === 'table') revealDDL(nodes[0].id);
    }));

    // ---- toolbar ---------------------------------------------------------------
    function setDialect(d: Dialect) {
      view.dialect = d;
      refreshSQL();
      renderRun();
    }
    function syncHistory() {
      ui.canUndo = engine.commandManager.canUndo();
      ui.canRedo = engine.commandManager.canRedo();
      ui.bump();
    }
    for (const el of Array.from(studio.querySelectorAll('.dm-bar, #dm-side'))) for (const t of ['pointerdown', 'wheel']) listen(el, t, (e: Event) => e.stopPropagation());

    // ---- search: matching tables and columns light up, the rest fade -----------
    const searchHits = () => (view.q ? S.tables.filter((t) => tableMatches(t, view.q)) : []);
    function updateSearchCount() {
      const hits = searchHits();
      const cols = hits.reduce((n, t) => n + t.columns.filter((c) => c.name.toLowerCase().includes(view.q) || String(c.type).toLowerCase().includes(view.q)).length, 0);
      ui.searchCount = !view.q ? '' : hits.length ? `${hits.length} table${hits.length === 1 ? '' : 's'}${cols ? ` · ${cols} col${cols === 1 ? '' : 's'}` : ''}` : 'no match';
      ui.bump();
    }
    function applySearch(value: string) {
      ui.search = value;
      view.q = value.trim().toLowerCase();
      view.searchAt = -1;
      paintAll();
      api.renderNow();
      updateSearchCount();
    }
    function searchKey(key: string) {
      if (key === 'Enter') {
        const hits = searchHits();
        if (!hits.length) return;
        view.searchAt = (view.searchAt + 1) % hits.length;
        const t = hits[view.searchAt];
        const g = hiddenGroupOf(t.id);
        if (g) { toast(`${t.name} is in the hidden group ${g.name} — showing it`); toggleHide(g.id).then(() => { selectOnly(t.id); reveal(t.id); }); }
        else { selectOnly(t.id); reveal(t.id); }
      } else if (key === 'Escape') { applySearch(''); (document.activeElement as HTMLElement | null)?.blur?.(); }
    }

    // ---- side panel tabs ----------------------------------------------------------
    const mainEl = studio.querySelector('.dm-main') as HTMLElement;
    /** Run `fn` once the framework has drawn the side panel as `sideOpen` says. */
    const whenSideDrawn = (fn: () => void) => {
      let n = 0;
      const step = () => {
        if (gen !== ui.gen) return;
        if (mainEl.classList.contains('side-off') === !ui.sideOpen || ++n > 60) fn();
        else requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };
    function showPane(p: Pane, { open = true } = {}) {
      if (open && !ui.sideOpen) setSide(true, false);
      view.pane = p;
      ui.bump();
      if (p === 'run') mountQueryEditor();
    }
    // The side panel folds away for room; a narrow studio starts with it folded.
    function setSide(open: boolean, remember = true) {
      if (ui.sideOpen === open) return;
      ui.sideOpen = open;
      ui.bump();
      if (remember) { try { localStorage.setItem('dm-side-open', open ? '1' : '0'); } catch { /* private mode */ } }
      whenSideDrawn(() => fit());
    }
    {
      let pref: string | null = null;
      try { pref = localStorage.getItem('dm-side-open'); } catch { /* private mode */ }
      ui.sideOpen = !(pref === '0' || (pref === null && studio.getBoundingClientRect().width < 900));
    }

    // ---- SQL: the DDL, regenerated on every change, coloured, read-only ---------
    let sqlEd: any = null;
    function refreshSQL() {
      const text = generateDDL(S, view.dialect);
      // The canonical textarea takes the text IN the event, as the JS page writes
      // it (the framework's re-render then finds it equal: a no-op).
      ui.sql = text;
      sqlTa.value = text;
      sqlEd?.setValue(text);
      ui.sqlHead = { label: DIALECTS[view.dialect].label, rest: ` · ${S.tables.length} table${S.tables.length === 1 ? '' : 's'} · ${S.rels.length} foreign key${S.rels.length === 1 ? '' : 's'}` };
      ui.bump();
    }
    /** The Monaco instance mountCodeEditor put inside `el`'s box, when Monaco arrived. */
    const monacoIn = (el: Element | null) => (window as any).monaco?.editor?.getEditors?.().find((e: any) => el?.contains(e.getDomNode())) ?? null;
    // Long FOREIGN KEY lines wrap in the narrow panel instead of running off it.
    const wrapLines = (box: Element | null) => { try { monacoIn(box)?.updateOptions({ wordWrap: 'on', wrappingIndent: 'indent', fontSize: 12, lineNumbersMinChars: 3, folding: false }); } catch { /* an older Monaco */ } };
    ui.mountCode(sqlTa, { language: 'sql', readOnly: true, host: els.sqlHost }).then((ed) => {
      if (gen !== ui.gen || !ed) return;
      sqlEd = ed; ed.setValue(sqlTa.value); wrapLines(sqlTa.parentElement);
    });
    /** Scroll the DDL to a table's CREATE TABLE (when one table is selected). */
    function revealDDL(tid: string) {
      const t = tableOf(tid);
      const ed = t && monacoIn(sqlTa.parentElement);
      if (!ed) return;
      const lines = sqlTa.value.split('\n');
      const i = lines.findIndex((l) => l.startsWith(`CREATE TABLE "${t!.name}"`) || l.startsWith('CREATE TABLE `' + t!.name + '`'));
      if (i >= 0) ed.revealLineNearTop(i + 1);
    }
    function copySQL() {
      const done = () => toast('Copied the DDL');
      try { navigator.clipboard.writeText(sqlTa.value).then(done, () => toast('The browser blocked the clipboard — select the SQL and copy it')); } catch { toast('The browser blocked the clipboard'); }
    }

    // ---- Relationships: every foreign key, editable ----------------------------
    function renderRels() {
      ui.relCount = S.rels.length;
      const order = new Map(S.tables.map((t, i) => [t.id, i]));
      const rels = S.rels.filter((r) => colOf(r.from) && colOf(r.to)).sort((a, b) => order.get(a.from.t)! - order.get(b.from.t)!);
      ui.rels = rels.map((r): RelView => {
        const fc = colOf(r.from)!;
        const warn = r.onDelete === 'SET NULL' && (fc.nn || fc.pk) ? `SET NULL needs ${fc.name} to allow NULL — switch its NN off, or pick another rule.` : '';
        return {
          id: r.id, ft: tableOf(r.from.t)!.name, fc: fc.name, tt: tableOf(r.to.t)!.name, tc: colOf(r.to)!.name,
          card: r.card, onDelete: r.onDelete, sub: `${r.card === '1:1' ? 'one to one' : 'many to one'} · ON DELETE ${r.onDelete}`,
          warn, editing: view.editRel === r.id, selected: view.selRel === r.id, name: refName(r.from),
        };
      });
      ui.bump();
    }
    function focusRel(rid: string) {
      const r = S.rels.find((x) => x.id === rid);
      if (!r) return;
      model.clearSelection?.();
      for (const l of model.getLinks()) l.setState(l.id === rid ? 'selected' : 'default');
      view.selRel = rid;
      reveal(hiddenGroupOf(r.from.t)?.id ?? r.from.t);
      api.renderNow();
      renderRels();
    }
    function relsClick(target: EventTarget | null) {
      const el = target instanceof Element ? target : null;
      const item = el?.closest('[data-rel]') as HTMLElement | null;
      if (!el || !item || el.closest('.dm-rel-edit')) return;
      const rid = item.dataset['rel']!, act = (el.closest('[data-ract]') as HTMLElement | null)?.dataset['ract'];
      if (act === 'del') deleteRel(rid);
      else if (act === 'edit') { view.editRel = view.editRel === rid ? null : rid; renderRels(); }
      else focusRel(rid);
    }

    // ---- Run SQL: a real database, loaded on demand ----------------------------
    let runEd: any = null, runMounted = false, running = false;
    const runStatus: Partial<Record<EngineKind, { cls: string; text: string }>> = {};   // engine → { cls, text } of its last run
    let lastRun: any = null;
    function mountQueryEditor() {
      if (runMounted) return;
      runMounted = true;
      ui.mountCode(runTa, { language: 'sql', host: els.runHost }).then((ed) => { if (gen !== ui.gen) return; runEd = ed; wrapLines(runTa.parentElement); });
    }
    const effectiveEngine = (): EngineKind | null => view.runEngine ?? (view.dialect === 'mysql' ? null : view.dialect as EngineKind);
    function setStatus(cls: string, text: string) {
      ui.status = { cls, text };
      ui.bump();
    }
    function renderRun() {
      const eng = effectiveEngine();
      ui.runEng = eng;
      ui.mysqlNote = view.dialect === 'mysql' && !view.runEngine;
      ui.runGoDisabled = !eng || running;
      ui.runHint = eng ? `${S.tables.length} tables, a few rows each, then your query` : '';
      ui.bump();
      if (running) return;
      if (!eng) setStatus('', 'Pick SQLite or PostgreSQL to run this schema.');
      else if (runStatus[eng]) setStatus(runStatus[eng]!.cls, runStatus[eng]!.text);
      else setStatus('', isLoaded(eng) ? `${ENGINES[eng].label} is loaded and ready.` : `Not loaded yet — ${ENGINES[eng].lib} (${ENGINES[eng].size}) downloads from ${ENGINES[eng].host} the first time you run.`);
    }
    const errView = (title: string, msg: string): ResultView => ({ kind: 'error', title, msg });
    function resultView(res: RunResult): ResultView {
      const MAX = 200, n = res.rows.length;
      const cell = (v: unknown): ResultCell => (v === null || v === undefined ? { text: 'NULL', cls: 'null', title: '' }
        : typeof v === 'number' || typeof v === 'bigint' || (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v)) ? { text: String(v), cls: 'num', title: '' } : { text: String(v), cls: '', title: String(v) });
      return {
        kind: 'rows', head: `${n} row${n === 1 ? '' : 's'}`, rest: ` · ${Math.max(1, Math.round(res.ms))} ms${n > MAX ? ` · showing the first ${MAX}` : ''}`,
        columns: res.columns, rows: res.rows.slice(0, MAX).map((r) => r.map(cell)),
      };
    }
    async function runQuery() {
      showPane('run');
      const kind = effectiveEngine();
      if (!kind) { renderRun(); lastRun = { ok: false, phase: 'engine', error: 'MySQL has no in-browser engine' }; return lastRun; }
      if (running) return null;
      running = true;
      renderRun();
      const E = ENGINES[kind];
      try {
        let eng;
        if (!isLoaded(kind)) {
          setStatus('loading', `Loading the database engine… ${E.lib}, ${E.size} from ${E.host}`);
          ui.result = { kind: 'loading', lib: E.lib, host: E.host };
          ui.bump();
        }
        try { eng = await loadEngine(kind); } catch (e: any) {
          runStatus[kind] = { cls: 'error', text: `The ${E.label} engine did not load — try again` };
          setStatus('error', runStatus[kind]!.text);
          ui.result = errView(`${E.lib} did not load`, e.message || String(e));
          lastRun = { ok: false, phase: 'engine', error: e.message || String(e) };
          return lastRun;
        }
        setStatus('loading', `Running on ${eng.version}…`);
        const ddl = generateDDL(S, kind), seed = seedSQL(S, kind);
        try {
          const res = await runScript(eng, { ddl, seed: seed.sql, query: runTa.value });
          runStatus[kind] = { cls: 'ready', text: `${eng.version} · a fresh database with ${S.tables.length} tables and ${seed.rows} sample rows` };
          ui.result = resultView(res);
          lastRun = { ok: true, engine: kind, ...res };
        } catch (e: any) {
          const phase = e.phase || 'query';
          runStatus[kind] = { cls: 'error', text: `${eng.version} · ${phase === 'query' ? 'the query failed' : phase === 'seed' ? 'the sample rows failed' : 'the schema failed'}` };
          ui.result = errView(phase === 'query' ? 'Your query failed' : phase === 'seed' ? 'The sample rows did not insert' : `The ${E.label} schema did not build`, e.message || String(e));
          lastRun = { ok: false, phase, error: e.message || String(e) };
        }
        setStatus(runStatus[kind]!.cls, runStatus[kind]!.text);
        return lastRun;
      } finally {
        running = false;
        renderRun();
      }
    }
    function sampleQuery() {
      ui.query = SAMPLE_QUERY;
      if (runEd) runEd.setValue(SAMPLE_QUERY); else runTa.value = SAMPLE_QUERY;
      ui.bump();
    }

    // ---- Import: CREATE TABLE statements → cards and lines ---------------------
    let impMounted = false;
    function openImport() {
      ui.impOpen = true;
      ui.impMsg = '';
      ui.impBad = false;
      ui.bump();
      if (!impMounted) { impMounted = true; ui.mountCode(impTa, { language: 'sql', host: els.impHost }).then(() => { if (gen === ui.gen) wrapLines(impTa.parentElement); }); }
    }
    function closeImport() { ui.impOpen = false; ui.bump(); }
    async function importDDL(text: string, mode: string) {
      const res = parseDDL(text);
      if (!res.tables.length) {
        ui.impBad = true;
        ui.impMsg = res.warnings[0] ? `Nothing imported — ${res.warnings[0]}` : 'No CREATE TABLE statement found.';
        ui.bump();
        return false;
      }
      let made = 0, keys = 0;
      const ok = await commit('Import DDL', (s) => {
        let origin = { x: 0, y: 0 };
        if (mode === 'replace') { s.tables = []; s.rels = []; s.groups = []; s.notes = []; }
        else {
          let right = -Infinity, top = Infinity;
          for (const t of s.tables) { right = Math.max(right, t.x + tableSize(t).w); top = Math.min(top, t.y); }
          for (const g of s.groups) { right = Math.max(right, g.x + g.w); top = Math.min(top, g.y); }
          if (isFinite(right)) origin = { x: right + 140, y: top };
        }
        let next = Number(freshCol(s).slice(1));
        const idOf = new Map<string, Table>();
        const fresh: Table[] = [];
        for (const pt of res.tables) {
          const name = freshName(s.tables.map((t) => t.name), pt.name);
          const t: Table = { id: freshId(s, name), name, x: 0, y: 0, columns: pt.columns.map((c) => ({ id: `c${next++}`, name: c.name, type: c.type, pk: !!c.pk, uq: !!c.uq && !c.pk, nn: !!c.nn })) };
          s.tables.push(t);
          fresh.push(t);
          idOf.set(pt.name, t);
        }
        for (const r of res.rels) {
          const ft = idOf.get(r.from[0]), tt = idOf.get(r.to[0]);
          const fc = ft?.columns.find((c) => c.name === r.from[1]), tc = tt?.columns.find((c) => c.name === r.to[1]);
          if (!fc || !tc) continue;
          s.rels.push({ id: freshSeq(s, 'r'), from: { t: ft!.id, c: fc.id }, to: { t: tt!.id, c: tc.id }, card: r.card, onDelete: r.onDelete });
          keys++;
        }
        layoutTables(fresh, s.rels, tableSize, origin);
        made = fresh.length;
      });
      if (!ok) return false;
      closeImport();
      fit();
      const w = res.warnings.length;
      toast(`Imported ${made} table${made === 1 ? '' : 's'} and ${keys} foreign key${keys === 1 ? '' : 's'}${w ? ` — ${w} note${w > 1 ? 's' : ''}: ${res.warnings[0]}` : ''}${res.skipped ? ` · ${res.skipped} other statement${res.skipped > 1 ? 's' : ''} skipped` : ''}`, 4200);
      return true;
    }

    // ---- Export: the DDL as schema.<dialect>.sql --------------------------------
    function exportDDL() {
      const text = generateDDL(S, view.dialect), name = `schema.${view.dialect}.sql`;
      const url = URL.createObjectURL(new Blob([text], { type: 'application/sql' }));
      const a = document.createElement('a');
      a.href = url; a.download = name; a.style.display = 'none';
      layer.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      toast(`Downloaded ${name}`);
    }

    // ---- minimap, zoom controls, dotted ground ---------------------------------
    const hexA = (hex: string | undefined, a: number) => { const n = parseInt(String(hex || '#94a3b8').slice(1), 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; };
    const plugins: any = attachCanvasPlugins(api, {
      background: { variant: 'dots', gap: 22, size: 1.2, color: dark() ? 'rgba(160,170,200,.16)' : 'rgba(110,120,150,.30)' },
      minimap: {
        placement: 'bottom-right', width: 168, height: 108,
        nodeColor: (n: any) => { const k = kindOf(n.id); return k === 'zone' ? hexA(ZONE_HEX[groupOf(n.id)?.color ?? ''], 0.3) : k === 'note' ? '#f1d77c' : dark() ? '#5a6480' : '#9aa4bd'; },
        maskColor: dark() ? 'rgba(139,156,242,.14)' : 'rgba(59,82,217,.10)', maskStroke: dark() ? '#8b9cf2' : '#3b52d9',
        panelBackground: dark() ? '#151a26' : '#ffffff', panelBorder: dark() ? '#272e3e' : '#e3e7f0',
      },
      controls: { placement: 'bottom-left' },
    } as any);
    offs.push(() => plugins?.dispose?.());

    function refreshPanels() {
      refreshSQL();
      const sel = model.getSelectedNodes();
      if (sel.length === 1 && kindOf(sel[0].id) === 'table') setTimeout(() => revealDDL(sel[0].id), 0);
      renderRels();
      renderRun();
      if (view.q) updateSearchCount();
      syncHistory();
    }

    // ---- the actions the template calls ----------------------------------------
    this.addTable = addTable;
    this.addGroup = addGroup;
    this.addNote = addNote;
    this.undo = () => engine.undo();
    this.redo = () => engine.redo();
    this.fit = fit;
    this.setDialect = setDialect;
    this.showPane = (p) => showPane(p);
    this.setSide = (open) => setSide(open);
    this.copySQL = copySQL;
    this.setSearch = applySearch;
    this.searchKey = searchKey;
    this.relsClick = relsClick;
    this.relChange = (rid, field, value) => { updateRel(rid, { [field]: value }); };
    this.pickEngine = (k) => { view.runEngine = k; renderRun(); };
    this.runOn = (k) => { view.runEngine = k; renderRun(); runQuery(); };
    this.runQuery = runQuery;
    this.sampleQuery = sampleQuery;
    this.setQuery = (text) => { ui.query = text; ui.bump(); };
    this.openImport = openImport;
    this.closeImport = closeImport;
    this.setImpText = (text) => { ui.impText = text; ui.bump(); };
    this.setImpMode = (mode) => { ui.impMode = mode; ui.bump(); };
    // The textarea and the radios are canonical (read at the press, as the JS page does).
    this.importGo = () => importDDL(impTa.value, (studio.querySelector('input[name="imp-mode"]:checked') as HTMLInputElement | null)?.value ?? 'replace');
    this.exportDDL = exportDDL;

    // ---- the starting state (also what the camera resets to) --------------------
    closeEditor(false);
    closePops();
    closeImport();
    ui.search = ''; view.q = ''; ui.searchCount = '';
    Object.assign(view, { editRel: null, selRel: null, runEngine: null, searchAt: -1 });
    ui.query = runTa.value = SAMPLE_QUERY;
    ui.impText = impTa.value = IMPORT_SAMPLE;
    ui.result = { kind: 'idle' };
    selectOnly(null);
    setDialect('sqlite');
    applySchema(sampleSchema());
    engine.commandManager.clear();
    showPane('sql', { open: false });
    fit();
    syncHistory();
    await tick();
    // The board may have changed size while the page settled (a folded panel,
    // the framework's first renders): frame the schema on the board as it now is.
    await new Promise<void>((r) => whenSideDrawn(r));
    await tick(30);
    if (gen !== this.gen) return false;
    fit();
    return true;
  }
}
