import type { KolSource } from '../../../domain/ports/ingestion-client.port';

/**
 * Raw KOL source row as served by `GET /api/feed/sources?type=kol`.
 * Unknown extra fields are tolerated; only the typed subset is kept.
 */
export interface RawKolSourceDto {
  channelId?: unknown;
  channel_id?: unknown;
  peerId?: unknown;
  title?: unknown;
  handle?: unknown;
  username?: unknown;
  type?: unknown;
  avatarUrl?: unknown;
  avatar_url?: unknown;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function toKolSource(raw: RawKolSourceDto): KolSource | null {
  const channelId =
    asString(raw.channelId) ?? asString(raw.channel_id) ?? asString(raw.peerId);
  if (!channelId) {
    return null;
  }
  return {
    channelId,
    title: asString(raw.title),
    handle: asString(raw.handle) ?? asString(raw.username),
    type: asString(raw.type) ?? 'kol',
    avatarUrl: asString(raw.avatarUrl) ?? asString(raw.avatar_url),
  };
}
