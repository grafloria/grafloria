// POOL PHASES — named stages that run across every lane of a pool ("Order",
// "Fulfil", "Bill"): columns along a horizontal pool's lanes, rows down a
// vertical pool's. A pool with phases carries a header band for their names (on
// top of a horizontal pool, on the left of a vertical one); its lanes tile the
// rest. Phases are not groups: their spans follow from the pool's frame and the
// phases' sizes (pixels, or a share by weight), as lanes' do.

import type { GroupModel, GroupRect, PoolPhase } from '../models/GroupModel';

/** A phase header band's thickness when the pool declares none. */
export const PHASE_HEADER_SIZE = 28;
/** The narrowest a phase can be made. */
export const MIN_PHASE_SIZE = 80;

/** A phase where it lies: `start`–`end` along the lanes, in world units. */
export interface PhaseBand {
  id: string;
  name: string;
  start: number;
  end: number;
}

/** The phase header band's thickness: 0 for a pool without phases. */
export function phaseHeaderSizeOf(pool: GroupModel): number {
  const cfg = pool.laneConfig;
  if (cfg?.role !== 'pool' || !(cfg.phases?.length)) return 0;
  return cfg.phaseHeaderSize ?? PHASE_HEADER_SIZE;
}

/**
 * A pool's phases laid along its lanes, in order (none for a pool without
 * phases). Pinned phases take their size; the rest share what is left by
 * weight; with every phase pinned, the last takes what the pool has over or
 * under — as lanes do across the pool.
 */
export function phaseBands(pool: GroupModel): PhaseBand[] {
  const cfg = pool.laneConfig;
  const phases: PoolPhase[] = cfg?.role === 'pool' ? cfg.phases ?? [] : [];
  if (phases.length === 0) return [];
  const horizontal = cfg!.orientation === 'horizontal';
  const r = pool.getOuterBounds();
  const header = cfg!.headerSize ?? 0;
  const start = (horizontal ? r.x : r.y) + header;
  const span = (horizontal ? r.width : r.height) - header;
  const fixed = phases.reduce((s, p) => s + (p.fixedSize ?? 0), 0);
  const flexible = phases.filter((p) => p.fixedSize === undefined);
  const weight = flexible.reduce((s, p) => s + (p.weight ?? 1), 0) || 1;
  const flex = Math.max(0, span - fixed);
  const last = phases[phases.length - 1]!;
  let at = start;
  return phases.map((p) => {
    const size =
      flexible.length === 0 && p === last
        ? Math.max(MIN_PHASE_SIZE, start + span - at)
        : p.fixedSize !== undefined ? p.fixedSize : (flex * (p.weight ?? 1)) / weight;
    const band = { id: p.id, name: p.name, start: at, end: at + size };
    at += size;
    return band;
  });
}

/** The band a pool's phase names sit in, or null for a pool without phases. */
export function phaseHeaderRect(pool: GroupModel): GroupRect | null {
  const size = phaseHeaderSizeOf(pool);
  if (!size) return null;
  const r = pool.getOuterBounds();
  const header = pool.laneConfig?.headerSize ?? 0;
  return pool.laneConfig?.orientation === 'horizontal'
    ? { x: r.x + header, y: r.y, width: r.width - header, height: size }
    : { x: r.x, y: r.y + header, width: size, height: r.height - header };
}

/** The phase a point along the lanes (its x on a horizontal pool, its y on a vertical one) falls in. */
export function phaseAt(pool: GroupModel, along: number): PhaseBand | undefined {
  const bands = phaseBands(pool);
  return bands.find((b) => along >= b.start && along < b.end) ?? (bands.length && along >= bands[bands.length - 1]!.end ? bands[bands.length - 1] : undefined);
}
