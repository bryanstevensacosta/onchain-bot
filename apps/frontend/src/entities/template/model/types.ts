export type RankingWindow = '30d' | '7d' | '1d';

export type RankingsSort = 'perf_desc' | 'perf_asc' | 'calls_desc';

export interface TemplateView {
  readonly id: string;
  readonly name: string;
  readonly active: boolean;
  readonly kolSourceIds: ReadonlyArray<string>;
  readonly minVisibleScore: number;
  readonly gemMinScore: number;
  readonly gemPatterns: ReadonlyArray<string>;
  readonly rankingStrategy: string;
  readonly rankingLimit: number;
  readonly botId: string | null;
  readonly channelTarget: string | null;
  readonly adminVerifiedAt: string | null;
  readonly canPublish: boolean;
}

/**
 * One enriched mention row for the template calls table.
 * All market/tracking fields are optional: the kol-system template
 * rankings endpoint is thin (mentionId/kolId/score/rank…), so the UI
 * joins what it can and renders `—` for the rest (never crashes).
 */
export interface TemplateCallRow {
  readonly mentionId: string;
  readonly kolId: string;
  readonly kolHandle: string | null;
  readonly kolTitle: string | null;
  readonly kolUrl: string | null;
  readonly avatarUrl: string | null;
  readonly ticker: string | null;
  readonly chain: string | null;
  readonly address: string | null;
  readonly score: number | null;
  readonly mcAt: number | null;
  readonly timesCalled: number | null;
  readonly tracking: string | null;
  readonly scoredAt: string | null;
  readonly breakdown: ReadonlyArray<{
    factor: string;
    delta: number;
    note: string;
  }>;
}

export interface KolRankingRow {
  readonly caller: string;
  readonly window: RankingWindow;
  readonly totalX: number;
  readonly callsCount: number;
  readonly strongCalls: number;
  readonly display: string;
}

export interface KolSourceOption {
  readonly channelId: string;
  readonly handle: string | null;
  readonly title: string;
  readonly avatarUrl: string | null;
  readonly url: string | null;
}
