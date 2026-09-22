import { httpGet } from '@/shared/api';
import { ENDPOINTS } from '@/shared/api/endpoints';
import type { KolView } from '../model/types';

/**
 * Raw row shape from `GET /api/feed/sources?type=kol` (ingestion-telegram
 * SourcesController.getSources). Note: no `lastIngestedAt` in the payload
 * (ingestion owns that column now) and lifecycle is `ACTIVE | INACTIVE`.
 */
export interface FeedKolSource {
  readonly channelId: string;
  readonly handle: string | null;
  readonly title: string;
  readonly type?: string;
  readonly isActive: boolean;
  readonly lifecycleStatus: string;
}

export function mapFeedKolToView(row: FeedKolSource): KolView {
  return {
    id: row.channelId,
    handle: row.handle,
    title: row.title,
    isActive: row.isActive,
    lifecycleStatus: row.lifecycleStatus === 'ACTIVE' ? 'ACTIVE' : 'DORMANT',
    // Feed list endpoint omits lastIngestedAt — page renders `—` via
    // formatRelativeTime(null), same as KOLs never ingested.
    lastIngestedAt: null,
  };
}

export const kolKeys = {
  all: ['kols'] as const,
  list: () => [...kolKeys.all, 'list'] as const,
  detail: (id: string) => [...kolKeys.all, 'detail', id] as const,
};

export async function fetchKols(): Promise<ReadonlyArray<KolView>> {
  const rows = await httpGet<ReadonlyArray<FeedKolSource>>(ENDPOINTS.kols.list);
  return rows.map(mapFeedKolToView);
}

export async function fetchKol(id: string): Promise<KolView> {
  // No single-get route in the feed API — detail = list + find.
  const kols = await fetchKols();
  const found = kols.find((k) => k.id === id);
  if (!found) {
    throw new Error(`KOL not found in feed sources: ${id}`);
  }
  return found;
}
