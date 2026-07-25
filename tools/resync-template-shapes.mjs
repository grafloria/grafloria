// Re-sync the SHAPE of every generated master from its domain type registry.
//
// The masters under `libs/engine/src/templates/generated/` were emitted before
// ShapeMapper learned the extended figure library, so 60 of 80 carry
// `shape.type: "rect"` — a Data node drew as a rectangle instead of a
// parallelogram, a Document as a rectangle instead of a wavy-bottom page, and
// so on. The SOURCE was right all along: `types/domain/*.ts` declares
// `defaultStyle.shape: 'parallelogram' | 'document' | 'trapezoid' | …`, and
// ShapeMapper maps those correctly. Only the checked-in output is stale.
//
// This rewrites JUST the `"shape": { "type": … }` value, matching each template
// to its domain entry by display name. HTML templates, ports and data schemas
// are left exactly as they are — a full regeneration would churn all of them.
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
  // BPMN events are CIRCLES (the type icon inside is a separate, missing layer)
  'bpmn::Error Event': 'circle', 'bpmn::Message Event': 'circle', 'bpmn::Timer Event': 'circle',
  // Chen notation: every attribute is an ellipse; the entity stays a rectangle
  'erd::Key Attribute': 'ellipse', 'erd::Partial Key': 'ellipse',
  'erd::Composite Attribute': 'ellipse', 'erd::Derived Attribute': 'ellipse',
  'erd::Optional Attribute': 'ellipse', 'erd::Multivalued Attribute': 'ellipse',
  // UML activity: merge is a diamond, an object is a rectangle (already right)
  'uml::Merge': 'diamond',
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
    const src = readFileSync(path, 'utf8');
    const name = (src.match(/"name":\s*"([^"]+)"/) || [])[1];
    const current = (src.match(/"shape":\s*\{[^}]*?"type":\s*"([^"]+)"/s) || [])[1];
    if (!name || !current) continue;

    const key = `${dir}::${name}`;
    const want = OVERRIDES[key] ?? SHAPE_MAP[shapes.get(key) ?? ''] ?? null;
    if (!want) { unmatched.push(`${dir}/${name}`); continue; }  // no source + no override → leave as authored
    if (want === current) { kept++; continue; }

    const next = src.replace(/("shape":\s*\{[^}]*?"type":\s*")([^"]+)(")/s, `$1${want}$3`);
    if (!dry) writeFileSync(path, next);
    console.log(`  ${dir}/${name}: ${current} → ${want}`);
    changed++;
  }
}

console.log(`\n${dry ? '[dry] ' : ''}shape re-sync: ${changed} corrected, ${kept} already right, ${unmatched.length} unmatched`);
if (unmatched.length) console.log('  unmatched (no domain entry):', unmatched.join(', '));
