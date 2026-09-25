import { httpGet, httpPatch } from '@/shared/api';
import { ENDPOINTS } from '@/shared/api/endpoints';
import type {
  KolRankingRow,
  KolSourceOption,
  RankingWindow,
  RankingsSort,
  TemplateCallRow,
  TemplateView,
} from '../model/types';

interface TemplateRankingsResponse {
  readonly templateId: string;
  readonly strategy: string;
  readonly ranked: ReadonlyArray<{
    readonly mentionId: string;
    readonly kolId: string;
    readonly score: number;
    readonly rankScore: number;
    readonly rank: number;
    readonly strategy: string;
    readonly scoredAt: string;
    readonly ticker?: string | null;
    readonly chain?: string | null;
    readonly address?: string | null;
    readonly mcAt?: number | null;
    readonly timesCalled?: number | null;
    readonly tracking?: string | null;
    readonly breakdown?: ReadonlyArray<{
      factor: string;
      delta: number;
      note: string;
    }>;
  }>;
}

type KolRankingsResponse = Array<KolRankingRow>;

interface FeedSourceRow {
  readonly channelId: string;
  readonly handle: string | null;
  readonly title: string;
  readonly avatarUrl?: string | null;
  readonly url?: string | null;
  readonly isActive?: boolean;
}

function channelUrl(row: FeedSourceRow): string | null {
  if (row.url && row.url.length > 0) {
    return row.url;
  }
  const handle = row.handle?.replace(/^@/, '');
  if (handle && handle.length > 0) {
    return `https://t.me/${handle}`;
  }
  return null;
}

export const templateKeys = {
  all: ['template-dashboard'] as const,
  templates: () => [...templateKeys.all, 'templates'] as const,
  detail: (id: string) => [...templateKeys.all, 'detail', id] as const,
  calls: (id: string) => [...templateKeys.all, 'calls', id] as const,
  sources: () => [...templateKeys.all, 'kol-sources'] as const,
  kolRankings: (window: RankingWindow, sort: RankingsSort) =>
    [...templateKeys.all, 'kol-rankings', window, sort] as const,
};

export async function fetchTemplates(): Promise<ReadonlyArray<TemplateView>> {
  return httpGet<ReadonlyArray<TemplateView>>(ENDPOINTS.kolSystem.templates);
}

export async function fetchTemplate(id: string): Promise<TemplateView> {
  return httpGet<TemplateView>(ENDPOINTS.kolSystem.template(id));
}

export async function fetchTemplateCalls(
  templateId: string,
): Promise<ReadonlyArray<TemplateCallRow>> {
  const res = await httpGet<TemplateRankingsResponse>(
    ENDPOINTS.kolSystem.templateRankings(templateId),
  );
  return res.ranked.map((call) => ({
    mentionId: call.mentionId,
    kolId: call.kolId,
    kolHandle: null,
    kolTitle: null,
    kolUrl: null,
    avatarUrl: null,
    ticker: call.ticker ?? null,
    chain: call.chain ?? null,
    address: call.address ?? null,
    score: call.score ?? null,
    mcAt: call.mcAt ?? null,
    timesCalled: call.timesCalled ?? null,
    tracking: call.tracking ?? null,
    scoredAt: call.scoredAt ?? null,
    breakdown: call.breakdown ?? [],
  }));
}

export async function fetchKolSources(): Promise<
  ReadonlyArray<KolSourceOption>
> {
  const rows = await httpGet<ReadonlyArray<FeedSourceRow>>(ENDPOINTS.kols.list);
  return rows.map((row) => ({
    channelId: row.channelId,
    handle: row.handle,
    title: row.title,
    avatarUrl: row.avatarUrl ?? null,
    url: channelUrl(row),
  }));
}

export async function fetchKolRankings(
  window: RankingWindow,
  sort: RankingsSort,
): Promise<ReadonlyArray<KolRankingRow>> {
  return httpGet<KolRankingsResponse>(
    ENDPOINTS.kolSystem.kolRankings(window, sort),
  );
}

export async function updateTemplateSources(
  templateId: string,
  kolSourceIds: ReadonlyArray<string>,
): Promise<TemplateView> {
  return httpPatch<ReadonlyArray<string>, TemplateView>(
    ENDPOINTS.kolSystem.templateSources(templateId),
    [...kolSourceIds],
  );
}
