/**
 * Snapshot FDV ATH domain type (dexter fdv-ath, plan todo 16).
 *
 * The all-time-high FDV of a token over its OWN persisted snapshot
 * history: `{ fdvUsd, at }` (max FDV + the ISO timestamp of the row
 * that set it) or `null` when no history row carries a usable FDV
 * (cold-start). Resolved live per call, never persisted — same
 * lifecycle as `launchpad`/`venue`.
 *
 * RETENTION LIMIT (janitor window): the history behind this max is
 * pruned by `SnapshotHistoryJanitorService` to the last
 * `SNAPSHOT_HISTORY_RETENTION_DAYS` (90) days — ATH is the max over
 * the surviving window, NOT over all time. Cold-start honesty: the
 * in-flight snapshot's own FDV is NEVER substituted (read happens
 * BEFORE the current row is persisted, so a first-seen token always
 * resolves `null`).
 */
export interface SnapshotFdvAth {
  readonly fdvUsd: number;
  readonly at: string;
}

export function toFdvAthOrNull(raw: unknown): SnapshotFdvAth | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const candidate = raw as Record<string, unknown>;
  const { fdvUsd, at } = candidate;
  if (typeof fdvUsd !== 'number' || !Number.isFinite(fdvUsd)) return null;
  if (typeof at !== 'string' || Number.isNaN(Date.parse(at))) return null;
  return { fdvUsd, at };
}
