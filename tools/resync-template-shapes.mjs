// Re-sync the SHAPE / LABEL PLACEMENT / SIZE / PAINTS of every generated
// master from its domain type registry + the notation tables below.
//
// The masters under `libs/engine/src/templates/generated/` were emitted before
// ShapeMapper learned the extended figure library, so 60 of 80 carry
// `shape.type: "rect"` — a Data node drew as a rectangle instead of a
// parallelogram, a Document as a rectangle instead of a wavy-bottom page, and
// so on. The SOURCE was right all along: `types/domain/*.ts` declares
// `defaultStyle.shape: 'parallelogram' | 'document' | 'trapezoid' | …`, and
// ShapeMapper maps those correctly. Only the checked-in output is stale.
//
// The stencil-fidelity audit (glyph-caption class) added three more DATA
// tables, so master fixes stay a re-runnable sync instead of hand-edits in 20
// files:
//   LABEL_BELOW — masters whose caption paints BELOW the silhouette
//                 (`structure.labelPlacement: 'below'`, the Visio/BPMN
//                 convention for glyph-sized shapes),
//   SIZES       — masters whose generated default size is not the notation's
//                 (a UML join is a bar, not a 120×80 box),
//   PAINTS      — masters whose fill/strokeWidth must match their notation
//                 (a UML final node's bulls-eye is winding-rendered from FILL).
//
// Everything else (HTML templates, ports, data schemas) is left exactly as it
// is — a full regeneration would churn all of them.
//
//     node tools/resync-template-shapes.mjs [--dry]

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOMAIN = join(root, 'libs/engine/src/types/domain');
const GENERATED = join(root, 'libs/engine/src/templates/generated');
const dry = process.argv.includes('--dry');

// ShapeMapper's table, as the renderer's registry actually implements it.
const SHAPE_MAP = {
  rectangle: 'rect', 'rounded-rectangle': 'rect', rect: 'rect',
  circle: 'circle', ellipse: 'ellipse', oval: 'ellipse',
  diamond: 'diamond', decision: 'diamond', hexagon: 'hexagon',
  parallelogram: 'parallelogram', data: 'parallelogram', 'input-output': 'parallelogram',
  'parallelogram-top': 'parallelogram-top', 'parallelogram-alt': 'parallelogram-top',
  trapezoid: 'trapezoid', 'manual-operation': 'trapezoid', 'trapezoid-bottom': 'trapezoid-bottom',
  triangle: 'triangle', 'triangle-down': 'triangle-down',
  document: 'document', note: 'note', comment: 'comment',
  package: 'package', folder: 'folder', component: 'component',
  cylinder: 'cylinder', cylinder3d: 'cylinder3d', database: 'database',
  cube: 'cube', cloud: 'cloud', actor: 'actor', 'use-case-actor': 'use-case-actor',
  stadium: 'stadium', pill: 'pill', terminal: 'terminal', terminator: 'terminator',
  'predefined-process': 'predefined-process', subroutine: 'subroutine',
  'predefined-process-alt': 'predefined-process-alt',
};

// Masters whose domain entry declares NO shape, but whose notation demands a
// specific one. Each is the standard symbol (Visio / ISO 5807 / Chen / BPMN).
const OVERRIDES = {
  'flowchart::Predefined Process': 'predefined-process', // double side bars
  'flowchart::Terminal': 'stadium',                      // rounded terminator
  // BPMN events are CIRCLES; timer/message/error carry their trigger glyph as a
  // centred panel badge (stencil-kit applyNotationPanel), the intermediate
  // event is the notation's DOUBLE ring.
  'bpmn::Error Event': 'circle', 'bpmn::Message Event': 'circle', 'bpmn::Timer Event': 'circle',
  'bpmn::Intermediate Event': 'event-intermediate',
  // BPMN gateways: identity is the inner MARKER (exclusive ✕ / inclusive ◯ /
  // parallel ＋), painted by the renderer's gateway-* notation shapes.
  'bpmn::Exclusive Gateway': 'gateway-xor',
  'bpmn::Inclusive Gateway': 'gateway-or',
  'bpmn::Parallel Gateway': 'gateway-and',
  // Chen notation: every attribute is an ellipse; the entity stays a rectangle
  'erd::Key Attribute': 'ellipse', 'erd::Partial Key': 'ellipse',
  'erd::Composite Attribute': 'ellipse', 'erd::Derived Attribute': 'ellipse',
  'erd::Optional Attribute': 'ellipse', 'erd::Multivalued Attribute': 'ellipse',
  // UML activity: merge is a diamond, an object is a rectangle (already right)
  'uml::Merge': 'diamond',
  // A «signal» is a CLASSIFIER — UML 2 draws it as a rectangle card with the
  // stereotype in its name compartment. The generated trapezoid (the
  // send-signal ACTION pentagon's cousin) spilled the card's rows outside its
  // slanted sides.
  'uml::Signal': 'rect',
  // Final node / final state are BULLS-EYES (ring + solid dot) — as plain
  // circles they were pixel-identical to the initial node's filled disc.
  'uml::Final Node': 'final-node',
  'uml::Final State': 'final-node',
  // Group B notation silhouettes (renderer notation-shapes.ts): the domain
  // registry still declares plain figures for these, so without a pin a re-run
  // would REGRESS them to rectangles/ellipses.
  'flowchart::Delay': 'delay',
  'flowchart::Display': 'display',
  'flowchart::OR': 'or-junction',
  'flowchart::Summing Junction': 'summing-junction',
  'erd::Multivalued Attribute': 'double-ellipse',
  'erd::Weak Entity': 'double-rect',
  'erd::Weak Relationship': 'double-diamond',
  'uml::Fork': 'sync-bar',
  'uml::Join': 'sync-bar',
};

// Masters whose caption paints BELOW the silhouette (`labelPlacement: 'below'`).
// The glyph-caption class from the master-sheet audit: each of these silhouettes
// is a NOTATION GLYPH (event circle, gateway diamond, connector dot, sync bar,
// junction) — a caption inside it clips into garbage ("onnect" in an 18px
// circle, "xclusiv iatewa" in a diamond, a name struck through an 8px bar).
// Keyed `${dir}::${template.id}`.
const LABEL_BELOW = new Set([
  'flowchart::flowchart-connector',
  'flowchart::flowchart-or',
  'flowchart::flowchart-summing-junction',
  'bpmn::bpmn-exclusive-gateway',
  'bpmn::bpmn-inclusive-gateway',
  'bpmn::bpmn-parallel-gateway',
  'bpmn::bpmn-start-event',
  'bpmn::bpmn-end-event',
  'bpmn::bpmn-intermediate-event',
  'bpmn::bpmn-timer-event',
  'bpmn::bpmn-message-event',
  'bpmn::bpmn-error-event',
  'uml::uml-decision',
  'uml::uml-initial-node',
  'uml::uml-final-node',
  'uml::uml-initial-state',
  'uml::uml-final-state',
  'uml::uml-fork',
  'uml::uml-join',
  'uml::uml-activation',
  'uml::uml-port',
  'erd::erd-discriminator',
]);

// Default sizes the notation demands, keyed `${dir}::${template.id}`.
const SIZES = {
  // A join is a synchronisation BAR like the fork (100×10), not a 120×80 box —
  // the old box painted the 8px bar in the middle and struck the caption
  // through it.
  'uml::uml-join': { width: 100, height: 10 },
  // BPMN events are uniform glyph circles; timer/message/error were generated
  // at task size (120×80) and drew as lost 80px balloons next to their 36px
  // siblings.
  'bpmn::bpmn-timer-event': { width: 36, height: 36 },
  'bpmn::bpmn-message-event': { width: 36, height: 36 },
  'bpmn::bpmn-error-event': { width: 36, height: 36 },
  // A «signal» classifier card is a header compartment + member rows — the
  // generated 100×60 could not hold both (rows painted over/past the edges).
  // 120×80 matches every other classifier card (class, interface, enum…).
  'uml::uml-signal': { width: 120, height: 80 },
  // A sequence-diagram activation is a narrow bar ON a lifeline — but the
  // generated 15×80 was a sliver whose inside caption never had a chance.
  // 12×60 is the notation's bar; the caption paints below it (LABEL_BELOW).
  'uml::uml-activation': { width: 12, height: 60 },
};

// Shape paints the notation demands, keyed `${dir}::${template.id}`.
const PAINTS = {
  // The double ring reads as TWO lines only when the strokes are thinner than
  // the ring gap (the generated 3px stroke fused them into one fat ring).
  'bpmn::bpmn-intermediate-event': { strokeWidth: 1.5 },
  // The bulls-eye is winding-rendered from FILL; a 4px stroke on each of its
  // three circles floods the empty gap between ring and dot.
  'uml::uml-final-node': { strokeWidth: 1 },
  'uml::uml-final-state': { strokeWidth: 1, fill: '#475569' },
  // UML draws fork and join as the SAME solid synchronisation bar; the
  // generated join was a hollow outline next to the fork's solid black.
  'uml::uml-join': { fill: '#000000', stroke: '#000000', strokeWidth: 1 },
};

/** label → declared shape, read straight out of the domain registries. */
function domainShapes() {
  const byLabel = new Map();
  for (const file of readdirSync(DOMAIN).filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts') && f !== 'index.ts')) {
    const src = readFileSync(join(DOMAIN, file), 'utf8');
    const key = file.replace('.ts', '');
    // Slice the file at every `label:` — an entry owns everything up to the
    // NEXT label, so a `shape:` found inside that slice is unambiguously its
    // own. (A single spanning regex either over-matches across entries or, with
    // a guard, silently drops the ones whose keys are ordered differently.)
    const marks = [...src.matchAll(/\blabel:\s*'([^']+)'/g)];
    for (let i = 0; i < marks.length; i++) {
      const from = marks[i].index;
      const to = i + 1 < marks.length ? marks[i + 1].index : src.length;
      const shape = (src.slice(from, to).match(/\bshape:\s*'([^']+)'/) || [])[1];
      if (shape) byLabel.set(`${key}::${marks[i][1]}`, shape);
    }
  }
  return byLabel;
}

const shapes = domainShapes();
let changed = 0, kept = 0, unmatched = [];

for (const dir of readdirSync(GENERATED).filter((d) => !d.includes('.'))) {
  for (const file of readdirSync(join(GENERATED, dir)).filter((f) => f.endsWith('.template.ts'))) {
    const path = join(GENERATED, dir, file);
    const orig = readFileSync(path, 'utf8');
    let src = orig;
    const name = (src.match(/"name":\s*"([^"]+)"/) || [])[1];
    const id = (src.match(/"id":\s*"([^"]+)"/) || [])[1];
    const current = (src.match(/"shape":\s*\{[^}]*?"type":\s*"([^"]+)"/s) || [])[1];
    if (!name || !id || !current) continue;

    const nameKey = `${dir}::${name}`;
    const idKey = `${dir}::${id}`;

    // ── 1. shape type (domain registry + notation overrides) ────────────────
    const want = OVERRIDES[nameKey] ?? SHAPE_MAP[shapes.get(nameKey) ?? ''] ?? null;
    if (!want) {
      unmatched.push(`${dir}/${name}`); // no source + no override → leave as authored
    } else if (want !== current) {
      src = src.replace(/("shape":\s*\{[^}]*?"type":\s*")([^"]+)(")/s, `$1${want}$3`);
      console.log(`  ${dir}/${name}: shape ${current} → ${want}`);
    }

    // ── 2. label placement (glyph-sized masters caption BELOW) ──────────────
    const wantBelow = LABEL_BELOW.has(idKey);
    const hasBelow = /"labelPlacement":\s*"below",\n/.test(src);
    if (wantBelow && !hasBelow) {
      // Insert as a structure key right before the "html" block (every
      // generated master has one, directly after "shape").
      src = src.replace(/\n(\s*)"html":/, `\n$1"labelPlacement": "below",\n$1"html":`);
      console.log(`  ${dir}/${name}: labelPlacement → below`);
    } else if (!wantBelow && hasBelow) {
      src = src.replace(/\s*"labelPlacement":\s*"below",(?=\n)/, '');
      console.log(`  ${dir}/${name}: labelPlacement cleared`);
    }

    // ── 3. default size (notation geometry) ─────────────────────────────────
    const size = SIZES[idKey];
    if (size) {
      // First "size" block in the file is the structure's (ports' nested
      // rendering size comes later).
      src = src.replace(
        /("size":\s*\{\s*"width":\s*)(\d+)(,\s*"height":\s*)(\d+)/,
        (m, a, w, b, h) => {
          if (Number(w) !== size.width || Number(h) !== size.height) {
            console.log(`  ${dir}/${name}: size ${w}x${h} → ${size.width}x${size.height}`);
          }
          return `${a}${size.width}${b}${size.height}`;
        }
      );
    }

    // ── 4. shape paints (fill / strokeWidth the notation demands) ───────────
    const paint = PAINTS[idKey];
    if (paint) {
      src = src.replace(/("shape":\s*\{[^}]*?\})/s, (block) => {
        let out = block;
        if (paint.fill) out = out.replace(/("fill":\s*")[^"]*(")/, `$1${paint.fill}$2`);
        if (paint.stroke) out = out.replace(/("stroke":\s*")[^"]*(")/, `$1${paint.stroke}$2`);
        if (paint.strokeWidth !== undefined) out = out.replace(/("strokeWidth":\s*)[\d.]+/, `$1${paint.strokeWidth}`);
        if (out !== block) console.log(`  ${dir}/${name}: paints → ${JSON.stringify(paint)}`);
        return out;
      });
    }

    if (src === orig) { kept++; continue; }
    if (!dry) writeFileSync(path, src);
    changed++;
  }
}

console.log(`\n${dry ? '[dry] ' : ''}shape re-sync: ${changed} corrected, ${kept} already right, ${unmatched.length} unmatched`);
if (unmatched.length) console.log('  unmatched (no domain entry):', unmatched.join(', '));
