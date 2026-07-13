// Accessibility-aware theming: audit a theme, and derive one that PASSES.
//
// Styling & theming, Card "design-token bridge + accessibility-aware theming".
//
// Two things live here, and they are the same thing twice:
//
//   auditThemeContrast(theme)   — every contrast pair a reader actually depends
//                                 on, checked against WCAG, as DATA.
//   deriveTheme({ from, mode }) — build the counterpart theme (dark from light,
//                                 high-contrast from either) and then RUN THAT
//                                 AUDIT on the result, repairing any pair that
//                                 fails.
//
// The derive utility is only trustworthy because the audit exists: a generated
// palette that was never checked is a guess. `deriveTheme` guarantees its output
// clears the level it was asked for, or it throws — which is what lets the
// built-in high-contrast themes be *validated* rather than asserted by hand.
//
// WHICH PAIRS. Not every combination — the ones a user reads:
//   text        label colour on the node surface, and on the canvas
//   selection   the selected node's stroke against its own fill, and against the
//               canvas (a selection ring you cannot see is a keyboard-navigation
//               dead end — this is the closest thing we have to a focus ring, and
//               it is what selection-follows-focus paints)
//   states      highlighted / error / hovered / disabled strokes vs their fills
//   links       the link stroke against the canvas background
//   ports       each port colour against the port fill
//   categories  every semantic colour the host can bind (Card "Theme-bound
//               properties") against the node surface it will sit on
//
// Non-text UI (strokes, rings, graphical objects) is held to WCAG 1.4.11's 3:1;
// text to 1.4.3's 4.5:1. `disabled` is exempt by 1.4.3 itself and is reported
// but never enforced.

import type { Theme } from '../types/theme.types';
import { WCAG, contrastRatio, ensureContrast, lightnessOf, withLightness } from './contrast';

/** One checked pair. */
export interface ContrastCheck {
  /** `text.primary on node.fill` — human-readable, stable enough to assert on. */
  id: string;
  /** Broad bucket, so callers can enforce selectively. */
  kind: 'text' | 'selection' | 'state' | 'link' | 'port' | 'category';
  foreground: string;
  background: string;
  /** Undefined when a colour could not be parsed (system colour, gradient, …). */
  ratio?: number;
  /** The WCAG minimum this pair is held to. */
  required: number;
  /** `false` only when we could measure it AND it fell short. */
  passes: boolean;
  /** WCAG lets disabled/inactive controls off; reported, never enforced. */
  exempt?: boolean;
}

export interface ContrastReport {
  theme: string;
  checks: ContrastCheck[];
  /** Non-exempt checks that failed. */
  failures: ContrastCheck[];
  /** True when nothing enforceable failed. */
  passes: boolean;
}

function check(
  id: string,
  kind: ContrastCheck['kind'],
  foreground: string,
  background: string,
  required: number,
  exempt = false
): ContrastCheck {
  const ratio = contrastRatio(foreground, background);
  return {
    id,
    kind,
    foreground,
    background,
    ratio,
    required,
    // An unmeasurable pair is not a failure (it is a system colour the OS
    // guarantees, or a paint server) — but it is never silently a pass either:
    // `ratio` stays undefined and the caller can see that.
    passes: ratio === undefined ? true : ratio >= required - 1e-9,
    ...(exempt ? { exempt } : {}),
  };
}

/**
 * Every contrast pair in a theme that a reader depends on.
 *
 * `textLevel` defaults to AA (4.5:1). Pass `WCAG.AAA_TEXT` to hold a theme to
 * AAA — which is what the high-contrast themes are built and tested against.
 */
export function auditThemeContrast(theme: Theme, textLevel: number = WCAG.AA_TEXT): ContrastReport {
  const c = theme.colors;
  const canvas = c.background.default;
  const surface = c.node.default.fill;
  const checks: ContrastCheck[] = [];

  // ---- text ---------------------------------------------------------------
  checks.push(check('text.primary on node.fill', 'text', c.text.primary, surface, textLevel));
  checks.push(check('text.primary on background', 'text', c.text.primary, canvas, textLevel));
  checks.push(check('text.secondary on background', 'text', c.text.secondary, canvas, textLevel));
  checks.push(check('text.disabled on background', 'text', c.text.disabled, canvas, textLevel, true));
  // The label a selected node carries still has to be readable on the SELECTED
  // fill — the pair a light-on-light selection tint quietly breaks.
  checks.push(
    check('text.primary on node.selected.fill', 'text', c.text.primary, c.node.selected.fill, textLevel)
  );
  checks.push(
    check('text.primary on node.highlighted.fill', 'text', c.text.primary, c.node.highlighted.fill, textLevel)
  );

  // ---- selection (our focus indicator) ------------------------------------
  checks.push(
    check(
      'node.selected.stroke on node.selected.fill',
      'selection',
      c.node.selected.stroke,
      c.node.selected.fill,
      WCAG.AA_NON_TEXT
    )
  );
  checks.push(
    check('node.selected.stroke on background', 'selection', c.node.selected.stroke, canvas, WCAG.AA_NON_TEXT)
  );
  checks.push(check('link.selected on background', 'selection', c.link.selected, canvas, WCAG.AA_NON_TEXT));

  // ---- other states -------------------------------------------------------
  checks.push(
    check(
      'node.highlighted.stroke on node.highlighted.fill',
      'state',
      c.node.highlighted.stroke,
      c.node.highlighted.fill,
      WCAG.AA_NON_TEXT
    )
  );
  checks.push(
    check('node.error.stroke on node.error.fill', 'state', c.node.error.stroke, c.node.error.fill, WCAG.AA_NON_TEXT)
  );
  checks.push(check('node.default.stroke on background', 'state', c.node.default.stroke, canvas, WCAG.AA_NON_TEXT));
  checks.push(
    check(
      'node.disabled.stroke on node.disabled.fill',
      'state',
      c.node.disabled.stroke,
      c.node.disabled.fill,
      WCAG.AA_NON_TEXT,
      true
    )
  );

  // ---- links --------------------------------------------------------------
  checks.push(check('link.default on background', 'link', c.link.default, canvas, WCAG.AA_NON_TEXT));
  checks.push(check('link.highlighted on background', 'link', c.link.highlighted, canvas, WCAG.AA_NON_TEXT));

  // ---- ports --------------------------------------------------------------
  const portFill = c.background.surface;
  for (const kind of ['input', 'output', 'bi'] as const) {
    checks.push(check(`port.${kind} on port fill`, 'port', c.port[kind], portFill, WCAG.AA_NON_TEXT));
  }

  // ---- the caller's semantic palette (Card "Theme-bound properties") -------
  // These are colours the host BINDS to nodes; if they fail on the node surface,
  // theme-bound properties are the thing that made the diagram unreadable.
  for (const [name, value] of Object.entries(theme.categories ?? {})) {
    if (!value) continue;
    checks.push(check(`category.${name} on node.fill`, 'category', value, surface, WCAG.AA_NON_TEXT));
  }

  const failures = checks.filter(item => !item.passes && !item.exempt);
  return {
    theme: theme.name,
    checks,
    failures,
    passes: failures.length === 0,
  };
}

/** Throw with a readable diff when a theme does not conform. Use in tests/CI. */
export function assertThemeContrast(theme: Theme, textLevel: number = WCAG.AA_TEXT): void {
  const report = auditThemeContrast(theme, textLevel);
  if (report.passes) return;

  const lines = report.failures.map(
    f => `  ${f.id}: ${f.ratio?.toFixed(2) ?? '?'}:1 (needs ${f.required}:1) — ${f.foreground} on ${f.background}`
  );
  throw new Error(`Theme "${theme.name}" fails WCAG contrast:\n${lines.join('\n')}`);
}

// ---------------------------------------------------------------------------
// Derivation
// ---------------------------------------------------------------------------

export interface DeriveThemeOptions {
  /** The theme to derive FROM (normally a hand-tuned light theme). */
  from: Theme;
  /**
   * What to build:
   *   'dark'           — the dark counterpart (flip the surfaces, keep the hues)
   *   'high-contrast'  — same colour scheme, pushed to AAA text / strong strokes
   */
  mode: 'dark' | 'high-contrast';
  /** Name of the result. Defaults to `"<from> (Dark)"` / `"<from> (High Contrast)"`. */
  name?: string;
  /** Text level the result is repaired to. Default AA; the HC themes use AAA. */
  textLevel?: number;
}

/**
 * The light↔dark flip: same hue, same saturation, MIRRORED HSL LIGHTNESS.
 *
 * Two wrong ways this could have been done, both of which we tried:
 *
 *   `255 - c` (channel inversion) rotates the hue — a blue node border comes back
 *   yellow. Useless.
 *
 *   Mirroring RELATIVE LUMINANCE (`L' = 1 - L`, blending toward white/black to
 *   reach it) keeps the hue but destroys the SATURATION: to lift the light
 *   theme's deep red `#b91c1c` to the mirrored luminance you must blend it almost
 *   all the way to white, and it lands as `#faf0f0` — a pale pink. Every semantic
 *   category came back as a different shade of near-white, i.e. indistinguishable.
 *   (Found by actually printing the derived theme, not by reading the code.)
 *
 * HSL lightness is the axis that means "light↔dark" and nothing else, so flipping
 * it — and only it — is the operation this actually wanted all along.
 *
 * Clamped away from the poles: a pure `#ffffff` mirrors to `#000000`, and a theme
 * built out of absolute black has nowhere left to go for elevation.
 */
const DARK_L_FLOOR = 0.07;
const DARK_L_CEILING = 0.96;

function flipLightness(hex: string): string {
  const l = lightnessOf(hex);
  if (l === undefined) return hex;
  return withLightness(hex, Math.min(DARK_L_CEILING, Math.max(DARK_L_FLOOR, 1 - l)));
}

/**
 * A SURFACE in the derived dark theme: flipped, then floated above the canvas.
 *
 * Flipping alone collapses surfaces together — a light theme's `#ffffff` canvas
 * and `#f9fafb` node fill both mirror to the floor and become the same colour, so
 * the nodes vanish into the background. Real dark themes separate surfaces by
 * ELEVATION (higher = lighter), which is what `step` is: the surface is
 * guaranteed to sit at least that far above the canvas in lightness.
 */
function darkSurface(hex: string, canvasLightness: number, step: number): string {
  const flipped = flipLightness(hex);
  const l = lightnessOf(flipped) ?? 0;
  const lifted = Math.max(l, canvasLightness + step);
  return withLightness(flipped, Math.min(DARK_L_CEILING, lifted));
}

/** Push a colour away from `background` until it clears `minimum`. */
function intensify(hex: string, background: string, minimum: number): string {
  return ensureContrast(hex, background, minimum);
}

/**
 * Auto-derive a theme from another one, then PROVE it conforms.
 *
 * The generation step is deliberately dumb (flip lightness for 'dark', keep the
 * palette for 'high-contrast'); the value is in the second step, which walks the
 * SAME audit the caller can run and repairs every enforceable failure with
 * `ensureContrast`. The result is asserted before it is returned, so a derived
 * theme that could not be repaired is a loud error, never a subtly unreadable
 * diagram.
 *
 * Derived alongside the surfaces: the STATE colours (selected / highlighted /
 * hovered / disabled / error), the SECONDARY text, and the semantic category
 * palette — i.e. everything a theme swap has to move together for the diagram to
 * stay coherent.
 */
export function deriveTheme(options: DeriveThemeOptions): Theme {
  const { from, mode } = options;
  const textLevel = options.textLevel ?? (mode === 'high-contrast' ? WCAG.AAA_TEXT : WCAG.AA_TEXT);
  const dark = mode === 'dark';
  const strokeMin = mode === 'high-contrast' ? WCAG.AA_TEXT : WCAG.AA_NON_TEXT;

  /** Foreground colours (strokes, text, semantic hues): flip, keep the hue. */
  const fg = (hex: string): string => (dark ? flipLightness(hex) : hex);

  const canvas = dark ? flipLightness(from.colors.background.default) : from.colors.background.default;
  const canvasL = lightnessOf(canvas) ?? 0;

  /** Backgrounds/fills: flip AND float above the canvas, or they merge into it. */
  const bg = (hex: string, step = 0.06): string => (dark ? darkSurface(hex, canvasL, step) : hex);

  const surface = bg(from.colors.node.default.fill);
  const portFill = bg(from.colors.background.surface);

  // A state's fill is floated a little higher than a plain node's, so a selected
  // node reads as raised even before its stroke is considered.
  const nodeState = (state: { fill: string; stroke: string }) => {
    const fill = bg(state.fill, 0.1);
    return { fill, stroke: intensify(fg(state.stroke), fill, strokeMin) };
  };

  const colors: Theme['colors'] = {
    background: {
      default: canvas,
      surface: portFill,
      elevated: bg(from.colors.background.elevated, 0.12),
    },
    text: {
      primary: ensureContrast(fg(from.colors.text.primary), surface, textLevel),
      secondary: ensureContrast(fg(from.colors.text.secondary), canvas, textLevel),
      disabled: fg(from.colors.text.disabled),
      inverse: fg(from.colors.text.inverse),
    },
    node: {
      default: { fill: surface, stroke: intensify(fg(from.colors.node.default.stroke), canvas, strokeMin) },
      selected: nodeState(from.colors.node.selected),
      highlighted: nodeState(from.colors.node.highlighted),
      hovered: nodeState(from.colors.node.hovered),
      // Disabled is WCAG-exempt: keep it visually recessive rather than forcing it.
      disabled: { fill: bg(from.colors.node.disabled.fill), stroke: fg(from.colors.node.disabled.stroke) },
      error: nodeState(from.colors.node.error),
    },
    link: {
      default: intensify(fg(from.colors.link.default), canvas, strokeMin),
      selected: intensify(fg(from.colors.link.selected), canvas, strokeMin),
      highlighted: intensify(fg(from.colors.link.highlighted), canvas, strokeMin),
      hovered: intensify(fg(from.colors.link.hovered), canvas, strokeMin),
      disabled: fg(from.colors.link.disabled),
    },
    port: {
      input: intensify(fg(from.colors.port.input), portFill, strokeMin),
      output: intensify(fg(from.colors.port.output), portFill, strokeMin),
      bi: intensify(fg(from.colors.port.bi), portFill, strokeMin),
    },
    primary: intensify(fg(from.colors.primary), canvas, strokeMin),
    secondary: intensify(fg(from.colors.secondary), canvas, strokeMin),
    success: intensify(fg(from.colors.success), canvas, strokeMin),
    warning: intensify(fg(from.colors.warning), canvas, strokeMin),
    error: intensify(fg(from.colors.error), canvas, strokeMin),
    info: intensify(fg(from.colors.info), canvas, strokeMin),
  };

  // The semantic palette rides along: a category colour that stops being legible
  // on the new surface is exactly the failure theme-bound properties exist to
  // prevent.
  const categories: Record<string, string> = {};
  for (const [name, value] of Object.entries(from.categories ?? {})) {
    if (value) categories[name] = intensify(fg(value), surface, WCAG.AA_NON_TEXT);
  }

  // High contrast also THICKENS: a 1px hairline is not an accessible border no
  // matter how well it contrasts.
  const numbers =
    mode === 'high-contrast'
      ? { ...(from.numbers ?? {}), hairline: 2, regular: 3, emphasis: 4, heavy: 5 }
      : { ...(from.numbers ?? {}) };

  const theme: Theme = {
    ...from,
    name: options.name ?? `${from.name} (${mode === 'dark' ? 'Dark' : 'High Contrast'})`,
    colors,
    ...(Object.keys(categories).length ? { categories } : {}),
    ...(Object.keys(numbers).length ? { numbers } : {}),
    nodes: {
      ...from.nodes,
      default: {
        ...from.nodes.default,
        fill: colors.node.default.fill,
        stroke: colors.node.default.stroke,
        strokeWidth:
          mode === 'high-contrast' ? Math.max(2, from.nodes.default.strokeWidth) : from.nodes.default.strokeWidth,
      },
    },
    links: {
      ...from.links,
      default: {
        ...from.links.default,
        stroke: colors.link.default,
        strokeWidth:
          mode === 'high-contrast' ? Math.max(3, from.links.default.strokeWidth) : from.links.default.strokeWidth,
      },
    },
    ports: { ...from.ports, colors: { ...colors.port } },
  };

  // The whole point: a derived theme that does not conform is a bug, not a theme.
  assertThemeContrast(theme, textLevel);
  return theme;
}
