import { Injectable, Logger, Optional } from '@nestjs/common';
import {
  KolIngestionClientPort,
  KolSource,
} from '../../domain/ports/ingestion-client.port';

/**
 * Resolves caller avatar URLs from the KOL source catalog
 * (Tramo 1, todo 13, P19 consumer).
 *
 * Matches a caller (channelId or handle, `@` tolerated) against
 * `GET /api/feed/sources?type=kol` rows; unknown callers and feed outages
 * fall back to `/api/kol-avatar/<caller>` — servable as the placeholder
 * (200) by ingestion-telegram. One feed read per `resolveMany` call.
 * Never throws.
 */
@Injectable()
export class KolAvatarResolverService {
  private readonly logger = new Logger(KolAvatarResolverService.name);

  public constructor(
    @Optional() private readonly client?: KolIngestionClientPort,
  ) {}

  public async resolveOne(caller: string): Promise<string> {
    return (await this.resolveMany([caller]))[caller] as string;
  }

  public async resolveMany(
    callers: ReadonlyArray<string>,
  ): Promise<Record<string, string>> {
    const sources = await this.safeListSources();
    const out: Record<string, string> = {};
    for (const caller of callers) {
      out[caller] = this.match(sources, caller) ?? this.fallback(caller);
    }
    return out;
  }

  private match(
    sources: ReadonlyArray<KolSource>,
    caller: string,
  ): string | null {
    const wantId = caller.trim();
    const wantHandle = normalizeHandle(caller);
    for (const source of sources) {
      if (source.channelId === wantId && source.avatarUrl) {
        return source.avatarUrl;
      }
      const handle = normalizeHandle(source.handle);
      if (handle && handle === wantHandle && source.avatarUrl) {
        return source.avatarUrl;
      }
    }
    return null;
  }

  private fallback(caller: string): string {
    return `/api/kol-avatar/${encodeURIComponent(caller)}`;
  }

  private async safeListSources(): Promise<KolSource[]> {
    if (!this.client) {
      return [];
    }
    try {
      return await this.client.listKolSources();
    } catch (error) {
      this.logger.warn(
        `KOL sources read failed (${error instanceof Error ? error.message : String(error)}) — placeholder avatars`,
      );
      return [];
    }
  }
}

function normalizeHandle(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim().replace(/^@+/, '').toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}
