/**
 * The budget POLICY, tested independently of this machine's speed.
 *
 * The first version of these tests drove the clamp through `machineFactor()`
 * and passed with the clamp deleted — a healthy dev box measures ~1.75x and
 * never reaches the ceiling, so the assertion could not see the difference.
 * Testing the pure function is what gives the mutation something to kill.
 */
import { clampFactor, perfBudget, machineFactor } from './perf-budget';

describe('perf budget policy', () => {
  it('never shrinks an authored budget, however fast the machine', () => {
    expect(clampFactor(0.1)).toBe(1);
    expect(clampFactor(0.999)).toBe(1);
    expect(clampFactor(1)).toBe(1);
  });

  it('scales with contention in the useful middle', () => {
    expect(clampFactor(2)).toBe(2);
    expect(clampFactor(3.5)).toBe(3.5);
  });

  it('CLAMPS at the ceiling — a broken environment cannot disable the guard', () => {
    expect(clampFactor(50)).toBe(6);
    expect(clampFactor(1_000_000)).toBe(6);
  });

  it('treats a non-finite measurement as "no contention" rather than infinite budget', () => {
    expect(clampFactor(Number.POSITIVE_INFINITY)).toBe(1);
    expect(clampFactor(Number.NaN)).toBe(1);
  });

  it('perfBudget applies the policy to the authored number', () => {
    expect(perfBudget(3000)).toBeGreaterThanOrEqual(3000);
    expect(perfBudget(3000)).toBeLessThanOrEqual(3000 * 6);
  });

  it('the live measurement lands inside the policy', () => {
    const f = machineFactor();
    expect(f).toBeGreaterThanOrEqual(1);
    expect(f).toBeLessThanOrEqual(6);
  });
});
