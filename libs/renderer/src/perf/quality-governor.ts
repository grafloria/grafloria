// Wave 8 (Performance & scale) — Card 7: the adaptive quality governor.
//
// The renderer already picks a level of detail from the ZOOM (`getLODLevel(zoom)`).
// That is the right primary signal — a node 4px tall does not need its label — but
// it is blind to the thing that actually hurts: the frame budget. A 10k-node scene
// at zoom 1 is expensive; the same scene on a slow laptop is worse; and neither the
// zoom nor the node count knows which machine it is running on.
//
// So the governor watches FRAME TIME and biases the tier down when the budget is
// blown, back up when there is headroom to spare. Zoom says what the picture NEEDS;
// the governor says what this machine can AFFORD.
//
// ---------------------------------------------------------------------------
// THE ONLY HARD PART: NOT OSCILLATING
// ---------------------------------------------------------------------------
//
// A naive governor ("frame was slow → drop detail; frame was fast → restore it")
// is worse than no governor at all. Dropping detail makes the next frame fast,
// which restores the detail, which makes the frame slow again — and the user gets a
// diagram that visibly flickers between two levels of detail every other frame.
// That is far more distracting than a consistently simpler picture.
//
// Three mechanisms, each earning its keep:
//
//   1. ASYMMETRIC RESPONSE. Step down FAST (the user is suffering right now) and up
//      SLOWLY (they are not suffering; there is no hurry). Recovery requires a long
//      run of comfortably-fast frames, not one lucky one.
//   2. A DEAD BAND. The step-up threshold is well below the step-down threshold, so
//      the frame time that a lower tier produces cannot by itself trigger a step
//      back up. Without this the system is a bistable switch by construction.
//   3. MEDIAN, NOT LAST. Decisions use the median of a rolling window, so a single
//      GC pause cannot drop the whole scene a tier, and a single lucky frame cannot
//      raise it.

/** How many tiers below the zoom-derived one we are currently rendering. */
export type QualityBias = 0 | 1 | 2;

export interface GovernorOptions {
  /** The frame budget. 16.7ms = 60fps. */
  budgetMs?: number;
  /**
   * Step DOWN when the median frame exceeds budget × this. Default 1.0 — the budget
   * IS the line; there is no point having a budget you are content to miss.
   */
  downFactor?: number;
  /**
   * Step UP only when the median frame is below budget × this. Default 0.55 — the
   * DEAD BAND. A tier that renders at 0.9× budget is doing its job; restoring detail
   * would put us straight back over it, which is the oscillation this exists to
   * prevent.
   */
  upFactor?: number;
  /** Frames in the rolling window. */
  window?: number;
  /** Consecutive fast windows required before restoring a tier. Recovery is patient. */
  recoveryWindows?: number;
  /** Worst tier the governor may impose. */
  maxBias?: QualityBias;
}

const DEFAULTS: Required<GovernorOptions> = {
  budgetMs: 16.7,
  downFactor: 1.0,
  upFactor: 0.55,
  window: 12,
  recoveryWindows: 3,
  maxBias: 2,
};

export interface GovernorState {
  bias: QualityBias;
  /** Median frame time over the window — what the decision is actually made on. */
  medianMs: number;
  /** Frames recorded so far in the current window. */
  samples: number;
  /** Consecutive fast windows accumulated toward a step back up. */
  recoveryStreak: number;
  /** Why the governor last changed its mind — surfaced in the HUD, because an
   *  invisible governor is indistinguishable from a bug. */
  lastDecision: 'steady' | 'stepped-down' | 'stepped-up';
}

export class QualityGovernor {
  private readonly options: Required<GovernorOptions>;
  private frames: number[] = [];
  private bias: QualityBias = 0;
  private recoveryStreak = 0;
  private lastDecision: GovernorState['lastDecision'] = 'steady';
  private lastMedian = 0;

  constructor(options: GovernorOptions = {}) {
    this.options = { ...DEFAULTS, ...options };
  }

  /** Feed the governor one frame time (ms). Returns the bias to render the NEXT frame at. */
  record(frameMs: number): QualityBias {
    this.frames.push(frameMs);
    if (this.frames.length < this.options.window) {
      this.lastDecision = 'steady';
      return this.bias;
    }

    const median = medianOf(this.frames);
    this.lastMedian = median;
    this.frames = [];

    const { budgetMs, downFactor, upFactor, maxBias, recoveryWindows } = this.options;

    if (median > budgetMs * downFactor && this.bias < maxBias) {
      // Suffering NOW. Drop a tier immediately, and reset any progress toward
      // recovery — a scene that just blew the budget has not earned its detail back.
      this.bias = (this.bias + 1) as QualityBias;
      this.recoveryStreak = 0;
      this.lastDecision = 'stepped-down';
      return this.bias;
    }

    if (median < budgetMs * upFactor && this.bias > 0) {
      // Comfortably fast — but be patient. Restoring detail on the first fast window
      // is how a governor becomes a flicker generator.
      this.recoveryStreak++;
      if (this.recoveryStreak >= recoveryWindows) {
        this.bias = (this.bias - 1) as QualityBias;
        this.recoveryStreak = 0;
        this.lastDecision = 'stepped-up';
        return this.bias;
      }
    } else {
      // In the dead band (or already at full detail): hold, and forget any partial
      // progress toward stepping up. Recovery must be a RUN of fast windows, not an
      // accumulation of scattered ones.
      this.recoveryStreak = 0;
    }

    this.lastDecision = 'steady';
    return this.bias;
  }

  /** The bias to apply right now. */
  getBias(): QualityBias {
    return this.bias;
  }

  getState(): GovernorState {
    return {
      bias: this.bias,
      medianMs: this.lastMedian,
      samples: this.frames.length,
      recoveryStreak: this.recoveryStreak,
      lastDecision: this.lastDecision,
    };
  }

  /**
   * Apply the bias to a zoom-derived tier.
   *
   * `tiers` must be ordered richest → poorest, which is the order the LOD config
   * declares them in. The governor can only ever make the picture SIMPLER than the
   * zoom asked for — never richer. A governor that could upgrade detail beyond what
   * the zoom wants would draw labels on 4px nodes to fill spare budget, which is
   * not a feature.
   */
  effectiveTier(zoomTier: string, tiers: readonly string[]): string {
    const index = tiers.indexOf(zoomTier);
    if (index < 0) return zoomTier; // unknown tier: never silently retier it
    const target = Math.min(index + this.bias, tiers.length - 1);
    return tiers[target];
  }

  /** Forget everything — e.g. after a diagram swap, where past frames say nothing. */
  reset(): void {
    this.frames = [];
    this.bias = 0;
    this.recoveryStreak = 0;
    this.lastDecision = 'steady';
    this.lastMedian = 0;
  }
}

function medianOf(values: number[]): number {
  const v = [...values].sort((a, b) => a - b);
  return v.length % 2 ? v[v.length >> 1] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2;
}
