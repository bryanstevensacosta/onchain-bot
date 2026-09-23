import { useMutation, useQueryClient } from '@tanstack/react-query';
import { httpGet, httpPatch } from '@/shared/api';
import { ENDPOINTS } from '@/shared/api/endpoints';
import { kolKeys } from '@/entities/kol';
import {
  mapFeedKolToView,
  type FeedKolSource,
} from '@/entities/kol/api/kol-queries';
import type { KolLifecycleStatus } from '@/entities/kol/model/types';

/**
 * Lifecycle via the feed API (item 8): ACTIVE/DORMANT map to the toggle
 * endpoint (`PATCH /sources/:channelId/toggle` flips `isActive`; the client
 * reads current state first and toggles only when needed).
 *
 * 501-tolerance case: `BLACKLISTED` has NO feed equivalent — the client
 * throws a plain Error with the feed hint instead of calling a dead route.
 * (The /kols page never offers BLACKLISTED, so this path is defensive.)
 */
export async function setKolLifecycle(
  kolId: string,
  status: KolLifecycleStatus,
): Promise<{ id: string; lifecycleStatus: KolLifecycleStatus }> {
  if (status === 'BLACKLISTED') {
    throw new Error(
      'BLACKLISTED has no feed equivalent — manage blocks in ingestion-telegram directly (PATCH /api/feed/sources/:channelId/toggle only flips active/inactive)',
    );
  }
  const rows = await httpGet<ReadonlyArray<FeedKolSource>>(ENDPOINTS.kols.list);
  const current = rows.find((r) => r.channelId === kolId);
  if (!current) {
    throw new Error(`KOL not found in feed sources: ${kolId}`);
  }
  const wantActive = status === 'ACTIVE';
  let view = mapFeedKolToView(current);
  if (current.isActive !== wantActive) {
    const toggled = await httpPatch<Record<string, never>, FeedKolSource>(
      ENDPOINTS.kols.toggle(kolId),
      {},
    );
    // Toggle response is `{channelId, isActive}` — re-read the row for title/handle.
    const refreshed = (
      await httpGet<ReadonlyArray<FeedKolSource>>(ENDPOINTS.kols.list)
    ).find((r) => r.channelId === kolId) ?? {
      ...toggled,
      handle: current.handle,
      title: current.title,
      lifecycleStatus: toggled.isActive ? 'ACTIVE' : 'INACTIVE',
    };
    view = mapFeedKolToView(refreshed);
  }
  return { id: view.id, lifecycleStatus: view.lifecycleStatus };
}

export function useSetKolLifecycle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      kolId,
      status,
    }: {
      kolId: string;
      status: KolLifecycleStatus;
    }) => setKolLifecycle(kolId, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: kolKeys.all });
      qc.invalidateQueries({ queryKey: ['kol-reputation'] });
    },
  });
}
