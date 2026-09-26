/**
 * SchedulingTarget (Tramo 2, todo 6, P38).
 *
 * Every scheduling post fans out to one delivery target at a time.
 * Each target owns its `publishDelayMs` wait and its `dailyCap` cutoff,
 * enforced independently: a wait or a full day on one target never
 * blocks the sibling target.
 */
export const SCHEDULING_TARGETS = ['telegram', 'threads'] as const;

export type SchedulingTarget = (typeof SCHEDULING_TARGETS)[number];

export function isSchedulingTarget(raw: string): raw is SchedulingTarget {
  return (SCHEDULING_TARGETS as ReadonlyArray<string>).includes(raw);
}

/**
 * UTC calendar day key (`yyyy-mm-dd`) for the per-target daily-cap
 * counters. UTC keeps staging/prod comparable regardless of host TZ.
 */
export function dayKeyFor(at: Date): string {
  const year = at.getUTCFullYear();
  const month = String(at.getUTCMonth() + 1).padStart(2, '0');
  const day = String(at.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
