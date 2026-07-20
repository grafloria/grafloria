/**
 * MACHINE-CALIBRATED WALL-CLOCK BUDGETS for the layout perf specs.
 *
 * The problem these solve is a real one, not a nuisance: the layout perf specs
 * guard against CATASTROPHIC regressions — `engine.layout()` once took 16s at
 * 300 nodes and never returned at 2,000 — and their own headers say the caps
 * are "GENEROUS… the sharp assertions are behavioural". A generous absolute
 * cap is exactly right when the machine is idle and exactly wrong when it is
 * not: run the full engine suite in parallel and a 3s cap fails on a
 * 200ms operation queued behind fifteen other workers. That is a false red,
 * and a suite that cries wolf gets its failures ignored — which costs far more
 * than the regression the cap was meant to catch.
 *
 * Raising the caps is the wrong fix: a 3s budget raised to 30s stops detecting
 * a 10x regression, which is the whole point.
 *
 * So the budget is scaled by how fast THIS machine is running RIGHT NOW,
 * measured in-process immediately before use:
 *
 *   factor = measured reference time / reference time on an unloaded dev box
 *
 * A 2x-contended machine gets 2x the budget and still fails a 10x regression.
 * The factor is clamped so a pathologically slow environment cannot silently
 * disable the guard entirely, and never shrinks the budget below its authored
 * value on a fast machine — the numbers stay meaningful as written.
 *
 * The reference workload is deliberately pure CPU + allocation with no I/O and
 * no layout code in it: it must measure the MACHINE, not the thing under test,
 * or a genuine regression would inflate the budget that is supposed to catch
 * it.
 */

/** Reference cost on an unloaded dev machine, in ms (measured, not guessed). */
const REFERENCE_MS = 12;

/** Never trust a factor beyond this — past it, something else is wrong. */
const MAX_FACTOR = 6;

let cachedFactor: number | null = null;

/**
 * The POLICY, separated from the MEASUREMENT so it can be tested without
 * depending on how fast the machine running the test happens to be. (A test
 * that exercises the clamp only via `machineFactor()` passes whatever the
 * clamp does, because a healthy dev box never reaches it — that tooth was
 * written first and survived its own mutation.)
 *
 *  - below 1 → 1: a fast machine never SHRINKS an authored budget; the numbers
 *    in the specs keep meaning what they say.
 *  - above MAX_FACTOR → MAX_FACTOR: past this, the environment is broken in a
 *    way a bigger budget will not fix, and letting it grow without bound would
 *    silently switch the guard off.
 */
export function clampFactor(raw: number): number {
  if (!Number.isFinite(raw)) return 1;
  return Math.max(1, Math.min(MAX_FACTOR, raw));
}

/**
 * A deterministic CPU + allocation workload. Sized to run in ~10ms on a
 * modern unloaded machine: long enough to average out scheduler noise, short
 * enough to be free to call.
 */
function referenceWorkload(): number {
  let acc = 0;
  const bucket: number[] = [];
  for (let i = 0; i < 200_000; i++) {
    acc += Math.sqrt(i % 1024) * 1.0000001;
    if ((i & 1023) === 0) bucket.push(acc);
  }
  // Touch the array so the allocation cannot be optimised away.
  for (const v of bucket) acc += v % 7;
  return acc;
}

/**
 * How much slower this machine currently is than the reference box.
 * Measured once per process — contention during a suite is broadly constant,
 * and re-measuring per assertion would itself add load.
 */
export function machineFactor(): number {
  if (cachedFactor !== null) return cachedFactor;
  // Best of three: a single sample can catch one unlucky scheduling slice,
  // and we want the machine's CAPABILITY, not its worst moment.
  let best = Infinity;
  for (let i = 0; i < 3; i++) {
    const t0 = Date.now();
    referenceWorkload();
    best = Math.min(best, Date.now() - t0);
  }
  cachedFactor = clampFactor(best / REFERENCE_MS);
  return cachedFactor;
}

/**
 * Scale an authored wall-clock budget to this machine.
 *
 * Read `perfBudget(3000)` as "3 seconds on the reference machine" — the
 * authored number keeps meaning what it says, and the guard keeps its teeth.
 */
export function perfBudget(authoredMs: number): number {
  return Math.round(authoredMs * machineFactor());
}
