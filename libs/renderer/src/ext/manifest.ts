/**
 * ============================================================================
 * Card 7 — the declarative extension manifest + semver engine-compat gate
 * ============================================================================
 *
 * A manifest is a plugin's contract, and it is deliberately DECLARATIVE: the
 * host can answer "what does this add?" and "may it run here?" by reading it,
 * WITHOUT importing a line of the plugin's code. That is what makes lazy loading
 * safe (`registerLazy` validates the manifest and stops) and what makes the
 * capability grant enforceable (you cannot ask for privileges at runtime that
 * your manifest did not declare).
 *
 * `contributes` is documentation + discovery (a palette can list a plugin's
 * shapes before it loads). `capabilities` is the ENFORCED grant.
 *
 * The semver matcher below is intentionally small — `^`, `~`, `>=`, `x`-ranges
 * and exact pins — rather than a dependency on `semver`. `libs/renderer` has no
 * runtime deps and this wave is not the place to add one.
 */

import type { CapabilityName } from './capabilities';

/** What a plugin says it adds. Discovery/UX only — not a security boundary. */
export interface ExtensionContributions {
  shapes?: string[];
  routers?: string[];
  connectors?: string[];
  anchors?: string[];
  connectionPoints?: string[];
  markers?: string[];
  linkTemplates?: string[];
  labelTemplates?: string[];
  tools?: string[];
  panels?: string[];
  animations?: string[];
  templates?: string[];
}

export interface ExtensionManifest<C extends CapabilityName = CapabilityName> {
  /** Reverse-DNS recommended: `acme.flowchart-shapes`. Must be unique per host. */
  id: string;
  /** The plugin's own semver. */
  version: string;
  /** Human-facing. */
  name?: string;
  description?: string;
  /**
   * The host API range this plugin supports, e.g. `{ grafloria: '^1.0.0' }`.
   * Checked against `EXTENSION_API_VERSION` and REJECTED on mismatch.
   */
  engines?: { grafloria?: string };
  /**
   * The ENFORCED privilege grant. `activate()` receives exactly these and
   * nothing else.
   */
  capabilities: readonly C[];
  /** Declarative inventory, for discovery before load. */
  contributes?: ExtensionContributions;
}

const ID_RE = /^[a-z0-9][a-z0-9._-]*$/i;
const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)(?:-[0-9a-z.-]+)?(?:\+[0-9a-z.-]+)?$/i;

const VALID_CAPABILITIES: readonly CapabilityName[] = [
  'shapes',
  'links',
  'routers',
  'templates',
  'animations',
  'tools',
  'panels',
];

/** Throw with a precise reason. A malformed manifest must never half-load. */
export function validateManifest(manifest: ExtensionManifest<CapabilityName>): void {
  if (!manifest || typeof manifest !== 'object') {
    throw new Error('[ExtensionHost] manifest is required');
  }
  if (!manifest.id || !ID_RE.test(manifest.id)) {
    throw new Error(
      `[ExtensionHost] invalid extension id '${String(manifest.id)}' — expected ` +
        `letters/digits/dot/dash/underscore, e.g. 'acme.flowchart-shapes'`
    );
  }
  if (!manifest.version || !SEMVER_RE.test(manifest.version)) {
    throw new Error(
      `[ExtensionHost] extension '${manifest.id}' has an invalid version ` +
        `'${String(manifest.version)}' — expected semver, e.g. '1.2.0'`
    );
  }
  if (!Array.isArray(manifest.capabilities)) {
    throw new Error(
      `[ExtensionHost] extension '${manifest.id}' must declare a 'capabilities' array ` +
        `(use [] for a plugin that registers nothing)`
    );
  }
  for (const capability of manifest.capabilities) {
    if (!VALID_CAPABILITIES.includes(capability)) {
      throw new Error(
        `[ExtensionHost] extension '${manifest.id}' declares unknown capability ` +
          `'${String(capability)}'. Known: ${VALID_CAPABILITIES.join(', ')}`
      );
    }
  }
}

/** Reject a plugin built against an incompatible host API. */
export function assertEngineCompatible(
  manifest: ExtensionManifest<CapabilityName>,
  apiVersion: string
): void {
  const range = manifest.engines?.grafloria;
  if (!range) return; // No claim = no gate. The plugin takes its chances.
  if (!satisfies(apiVersion, range)) {
    throw new Error(
      `[ExtensionHost] extension '${manifest.id}' requires grafloria '${range}', ` +
        `but this host is '${apiVersion}'. Refusing to register.`
    );
  }
}

interface Version {
  major: number;
  minor: number;
  patch: number;
}

function parse(version: string): Version | null {
  const match = SEMVER_RE.exec(version.trim());
  if (!match) return null;
  return { major: +match[1], minor: +match[2], patch: +match[3] };
}

function compare(a: Version, b: Version): number {
  return a.major - b.major || a.minor - b.minor || a.patch - b.patch;
}

/**
 * A deliberately small semver range matcher. Supports:
 *   *  / x            any
 *   1.2.3             exact
 *   ^1.2.3            >=1.2.3 <2.0.0   (and ^0.2.3 → >=0.2.3 <0.3.0)
 *   ~1.2.3            >=1.2.3 <1.3.0
 *   >=1.2.3, >1.2.3, <=1.2.3, <1.2.3
 *   1.x / 1.2.x
 *   " || "            union of any of the above
 */
export function satisfies(version: string, range: string): boolean {
  const target = parse(version);
  if (!target) return false;

  return range
    .split('||')
    .map((part) => part.trim())
    .some((part) => satisfiesOne(target, part));
}

function satisfiesOne(target: Version, range: string): boolean {
  if (range === '*' || range === 'x' || range === '') return true;

  // x-ranges: 1.x, 1.2.x
  if (/^\d+(\.\d+)?\.?x$/i.test(range) || /^\d+$/.test(range)) {
    const parts = range.toLowerCase().replace(/\.?x$/, '').split('.').filter(Boolean);
    const major = Number(parts[0]);
    if (Number.isNaN(major) || target.major !== major) return false;
    if (parts.length > 1 && target.minor !== Number(parts[1])) return false;
    return true;
  }

  const operatorMatch = /^(>=|<=|>|<|\^|~)?\s*(.+)$/.exec(range);
  if (!operatorMatch) return false;
  const operator = operatorMatch[1] ?? '';
  const base = parse(operatorMatch[2]);
  if (!base) return false;

  const cmp = compare(target, base);

  switch (operator) {
    case '':
      return cmp === 0;
    case '>=':
      return cmp >= 0;
    case '>':
      return cmp > 0;
    case '<=':
      return cmp <= 0;
    case '<':
      return cmp < 0;
    case '~':
      // >=base, same major.minor
      return cmp >= 0 && target.major === base.major && target.minor === base.minor;
    case '^':
      if (cmp < 0) return false;
      // ^0.x is special: the minor acts as the breaking-change axis.
      if (base.major === 0) {
        return base.minor === 0
          ? target.major === 0 && target.minor === 0 && target.patch === base.patch
          : target.major === 0 && target.minor === base.minor;
      }
      return target.major === base.major;
    default:
      return false;
  }
}
