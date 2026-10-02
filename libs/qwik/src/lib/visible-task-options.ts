import type { OnVisibleTaskOptions } from '@builder.io/qwik';

/**
 * Every DOM-touching task in this library mounts on DOCUMENT READY rather than
 * on Qwik's default `intersection-observer` strategy.
 *
 * The default would defer `createDiagram()` until the canvas scrolls into
 * view, which sounds like free laziness but is the wrong trade here, for three
 * reasons:
 *
 *   1. It silently changes the contract the other wrappers set. React and Vue
 *      mount on mount, so `onInit$` would never fire for an off-screen diagram
 *      and `useGrafloria()` would hand a toolbar `undefined` with no
 *      explanation.
 *   2. The engine already has a BETTER answer to the same problem. `freeze()`
 *      / `autoFreeze`, the progressive mounter and custom-node culling defer
 *      work per entity, continuously, instead of gating the whole canvas on
 *      one boolean.
 *   3. An off-screen diagram that has never initialised cannot be exported,
 *      measured or driven imperatively — all things hosts legitimately do
 *      before a user ever scrolls to it.
 *
 * `document-ready` keeps the component server-renderable (the task is still
 * browser-only, which is the property that matters for SSR) while making mount
 * timing predictable.
 */
export const MOUNT_EAGERLY: OnVisibleTaskOptions = { strategy: 'document-ready' };
