/**
 * The teardown order rule (README 9.1, GF2): the kit's hook first, then the
 * caller's, and both run. `render()` and every dashboard wrapper compose their
 * two hooks through `teardownInOrder`, so this is the one place the rule is
 * pinned.
 */
import { teardownInOrder } from './teardown';

describe('teardownInOrder: the kit first, then the caller, and both run', () => {
  const host = {} as HTMLElement;

  it('runs the kit hook, then the caller hook, each once with the same arguments', () => {
    const calls: Array<[string, string, HTMLElement]> = [];
    const both = teardownInOrder<[string, HTMLElement]>(
      (id, h) => calls.push(['kit', id, h]),
      (id, h) => calls.push(['caller', id, h])
    )!;
    both('b', host);
    expect(calls).toEqual([
      ['kit', 'b', host],
      ['caller', 'b', host],
    ]);
  });

  it("a kit hook that throws still lets the caller's run, then the error surfaces", () => {
    const calls: string[] = [];
    const both = teardownInOrder<[string]>(
      () => {
        calls.push('kit');
        throw new Error('kit failed');
      },
      () => void calls.push('caller')
    )!;
    expect(() => both('b')).toThrow('kit failed');
    expect(calls).toEqual(['kit', 'caller']);
  });

  it('with one hook, that hook is the whole teardown; with none, there is nothing to call', () => {
    const kit = jest.fn();
    const caller = jest.fn();
    expect(teardownInOrder(kit, undefined)).toBe(kit);
    expect(teardownInOrder(undefined, caller)).toBe(caller);
    expect(teardownInOrder(undefined, undefined)).toBeUndefined();
  });
});
