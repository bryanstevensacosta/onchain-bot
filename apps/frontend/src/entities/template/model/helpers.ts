import type { KolRankingRow, TemplateCallRow } from './types';

export const TEMPLATE_AVATAR_PLACEHOLDER = 'placeholder-avatar';

export function trackingLabelFor(
  row: Pick<TemplateCallRow, 'tracking' | 'timesCalled'>,
): string {
  if (row.tracking && row.tracking.trim().length > 0) {
    return row.tracking;
  }
  const n = row.timesCalled ?? 1;
  if (n <= 1) {
    return 'First time';
  }
  return `${n}x from last call`;
}

export function timeAgo(iso: string | null, nowMs = Date.now()): string {
  if (!iso) {
    return '—';
  }
  const t = Date.parse(iso);
  if (Number.isNaN(t)) {
    return '—';
  }
  const diffSec = Math.max(0, Math.floor((nowMs - t) / 1000));
  if (diffSec < 60) {
    return `${diffSec}s ago`;
  }
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) {
    return `${diffMin}m ago`;
  }
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) {
    return `${diffH}h ago`;
  }
  const diffD = Math.floor(diffH / 24);
  return `${diffD}d ago`;
}

export function formatMc(mc: number | null): string {
  if (mc === null || mc === undefined || Number.isNaN(mc)) {
    return '—';
  }
  if (mc >= 1_000_000_000) {
    return `$${(mc / 1_000_000_000).toFixed(2)}B`;
  }
  if (mc >= 1_000_000) {
    return `$${(mc / 1_000_000).toFixed(2)}M`;
  }
  if (mc >= 1_000) {
    return `$${(mc / 1_000).toFixed(1)}K`;
  }
  return `$${mc.toFixed(0)}`;
}

/**
 * P16: template stores kolSourceIds, empty = all sources.
 */
export function filterCallsBySources<T extends { kolId: string }>(
  rows: ReadonlyArray<T>,
  kolSourceIds: ReadonlyArray<string>,
): Array<T> {
  if (kolSourceIds.length === 0) {
    return [...rows];
  }
  const allowed = new Set(kolSourceIds);
  return rows.filter((row) => allowed.has(row.kolId));
}

/**
 * P17: horizontal performance ranking of 10 → 5 left + 5 right.
 */
export function splitRankingHalves<T>(rows: ReadonlyArray<T>): {
  left: Array<T>;
  right: Array<T>;
} {
  const top10 = rows.slice(0, 10);
  return {
    left: top10.slice(0, 5),
    right: top10.slice(5, 10),
  };
}

export function togglePerfSort(
  sort: 'perf_desc' | 'perf_asc',
): 'perf_desc' | 'perf_asc' {
  return sort === 'perf_desc' ? 'perf_asc' : 'perf_desc';
}

export function sortRankings(
  rows: ReadonlyArray<KolRankingRow>,
  sort: 'perf_desc' | 'perf_asc' | 'calls_desc',
): Array<KolRankingRow> {
  const copy = [...rows];
  switch (sort) {
    case 'perf_asc':
      return copy.sort(
        (a, b) => a.totalX - b.totalX || a.caller.localeCompare(b.caller),
      );
    case 'calls_desc':
      return copy.sort(
        (a, b) =>
          b.callsCount - a.callsCount || a.caller.localeCompare(b.caller),
      );
    case 'perf_desc':
    default:
      return copy.sort(
        (a, b) => b.totalX - a.totalX || a.caller.localeCompare(b.caller),
      );
  }
}

/**
 * Avatar contract (P19/P4): kol-system/ingestion exposes
 * `GET /api/kol-avatar/:channelId` + `avatarUrl` on the source
 * projection. Until the backend is ready, code against the contract
 * with a placeholder fallback (never a broken <img>).
 */
export function avatarSrcFor(
  avatarUrl: string | null,
  channelId: string,
): string {
  if (avatarUrl && avatarUrl.trim().length > 0) {
    return avatarUrl;
  }
  if (channelId && channelId.trim().length > 0) {
    return `/ingestion-api/kol-avatar/${encodeURIComponent(channelId)}`;
  }
  return TEMPLATE_AVATAR_PLACEHOLDER;
}
