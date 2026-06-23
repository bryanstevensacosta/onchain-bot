/**
 * Aggregated counts surfaced on the dashboard. Cheap to compute (single
 * round-trip to each source BC) and cheap to transfer (a handful of
 * integers), unlike the previous approach of fetching the latest 100
 * items of each list just to call `.length`.
 */
export interface DashboardKpis {
  readonly activeKols: number;
  readonly totalKols: number;
  readonly totalCanonicalCalls: number;
  readonly approvedDecisions: number;
  readonly rejectedDecisions: number;
  readonly publishedCalls: number;
}
