/**
 * The ACCESSIBILITY layer (wave 6).
 *
 * Framework-free, like the rest of `libs/renderer`. The Angular canvas is a
 * thin host: it constructs these controllers, hands them a container element
 * and the engine, and forwards key events. All the policy lives here.
 *
 *  - `semantics`          — roles, roledescriptions and accessible names. Pure
 *                           functions the RENDERER calls while building the
 *                           VNode tree, so the semantics survive SSR + export.
 *  - `graph-topology`     — entry points, terminals, cycles, components,
 *                           incident-edge ordering. The structural facts.
 *  - `diagram-outline`    — the outline model + natural-language summary.
 *  - `outline-view`       — the hidden, AT-navigable DOM text mirror.
 *  - `live-region`        — the managed, de-duplicated aria-live region.
 *  - `focus-containment`  — focus never rests on off-screen geometry.
 *  - `reduced-motion`     — the reduced-motion stylesheet, and the code that
 *                           actually INJECTS it (it used to be a dead file).
 */

export * from './semantics';
export * from './graph-topology';
export * from './diagram-outline';
export * from './outline-view';
export * from './live-region';
export * from './focus-containment';
export * from './reduced-motion';
