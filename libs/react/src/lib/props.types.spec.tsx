/**
 * Public prop types a reader leans on. A COMPILE-TIME test: ts-jest checks this
 * file under `strict`, so a positive line that stops compiling fails the suite,
 * and every `@ts-expect-error` must find its error.
 *
 * `tokenBridge` was typed `unknown`: a real bridge compiled, but so did a typo'd
 * object, a number, a string — nothing told a reader they passed the wrong thing
 * (the Vue twin was worse: inferred `undefined`, so the real bridge failed).
 */
import { shadcnBridge, type TokenBridge } from '@grafloria/renderer';
import type { GrafloriaFlowProps } from './grafloria-flow';

describe('GrafloriaFlowProps types', () => {
  it('tokenBridge takes a TokenBridge, and only a TokenBridge', () => {
    const ok: GrafloriaFlowProps['tokenBridge'] = shadcnBridge();
    const custom: GrafloriaFlowProps = { tokenBridge: { 'node-fill': 'var(--card)' } };
    // @ts-expect-error a number is not a bridge
    const bad: GrafloriaFlowProps = { tokenBridge: 42 };
    // @ts-expect-error a token mapped to a non-string is not a bridge
    const bad2: GrafloriaFlowProps = { tokenBridge: { 'node-fill': 1 } };
    const same: TokenBridge | undefined = ok;
    expect([ok, custom, bad, bad2, same].length).toBe(5);
  });
});
