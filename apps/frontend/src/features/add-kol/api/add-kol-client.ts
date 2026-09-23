import { httpPost } from '@/shared/api';
import { ENDPOINTS } from '@/shared/api/endpoints';
import type { KolView } from '@/entities/kol/model/types';
import type { FeedKolSource } from '@/entities/kol/api/kol-queries';
import { mapFeedKolToView } from '@/entities/kol/api/kol-queries';

/**
 * Register a KOL channel in the feed catalog (ingestion-telegram
 * `POST /api/feed/sources` with `type: 'kol'`). Title/handle auto-resolve
 * server-side from Telegram when omitted — same UX as the old AddKolModal.
 * Duplicate channelId → 409, surfaced inline by the modal.
 */
export async function addKol(kolId: string): Promise<KolView> {
  const created = await httpPost<
    { channelId: string; type: 'kol' },
    FeedKolSource
  >(ENDPOINTS.kols.add, { channelId: kolId, type: 'kol' });
  return mapFeedKolToView(created);
}
