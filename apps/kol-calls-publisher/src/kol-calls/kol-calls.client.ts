import { Injectable } from '@nestjs/common';
import type {
  KolCallsMentionDto,
  KolCallsRankingDto,
  KolCallsSnapshotDto,
  PaginatedResponse,
} from './kol-calls.dto';

function baseUrl(): string {
  return (process.env.KOL_CALLS_URL ?? 'http://localhost:3050').replace(
    /\/$/,
    '',
  );
}

function apiKey(): string {
  return (process.env.KOL_CALLS_API_KEY ?? '').trim();
}

async function getJson<T>(path: string): Promise<T> {
  const headers: Record<string, string> = {};
  const key = apiKey();
  if (key !== '') {
    headers['x-api-key'] = key;
  }
  const res = await fetch(`${baseUrl()}${path}`, { headers });
  if (!res.ok) {
    throw new Error(`kol-calls GET ${path} failed: ${res.status}`);
  }
  return (await res.json()) as T;
}

/**
 * KolCallsClient — HTTP reader for the upstream kol-calls contract (P51).
 *
 * Paginated, keyed reads over mentions + snapshots; rankings read for
 * rating display. Sends `x-api-key` (KOL_CALLS_API_KEY) when set; empty
 * means keyless dev (upstream guard fails open). Transport failures
 * throw — callers (sync cron) catch per-batch and retry next tick.
 */
@Injectable()
export class KolCallsClient {
  public async listMentions(
    limit = 50,
    offset = 0,
  ): Promise<PaginatedResponse<KolCallsMentionDto>> {
    return getJson<PaginatedResponse<KolCallsMentionDto>>(
      `/api/mentions?limit=${limit}&offset=${offset}`,
    );
  }

  public async getMention(id: string): Promise<KolCallsMentionDto> {
    return getJson<KolCallsMentionDto>(
      `/api/mentions/${encodeURIComponent(id)}`,
    );
  }

  public async listSnapshots(
    limit = 50,
    offset = 0,
  ): Promise<PaginatedResponse<KolCallsSnapshotDto>> {
    return getJson<PaginatedResponse<KolCallsSnapshotDto>>(
      `/api/snapshots?limit=${limit}&offset=${offset}`,
    );
  }

  public async getSnapshot(mentionId: string): Promise<KolCallsSnapshotDto> {
    return getJson<KolCallsSnapshotDto>(
      `/api/snapshots/${encodeURIComponent(mentionId)}`,
    );
  }

  public async listRankings(
    window: string = '30d',
  ): Promise<ReadonlyArray<KolCallsRankingDto>> {
    return getJson<ReadonlyArray<KolCallsRankingDto>>(
      `/api/kol-rankings?window=${encodeURIComponent(window)}`,
    );
  }
}
