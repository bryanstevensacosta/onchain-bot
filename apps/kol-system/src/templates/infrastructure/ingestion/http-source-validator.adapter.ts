import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SourceValidatorPort } from '../../domain/ports/source-validator.port';

/**
 * Validates template `kolSourceIds` against the owning ingestion-telegram
 * feed (`GET {INGESTION_TELEGRAM_URL}/api/feed/sources?type=kol`, P16).
 * Fail-open: an unreachable feed accepts everything so the pipeline keeps
 * running (same philosophy as the enrichment silent-null fallback).
 */
@Injectable()
export class HttpSourceValidatorAdapter extends SourceValidatorPort {
  private readonly logger = new Logger(HttpSourceValidatorAdapter.name);

  public constructor(private readonly config: ConfigService) {
    super();
  }

  public async validateSources(channelIds: ReadonlyArray<string>): Promise<{
    valid: ReadonlyArray<string>;
    unknownIds: ReadonlyArray<string>;
  }> {
    if (channelIds.length === 0) return { valid: [], unknownIds: [] };
    try {
      const base =
        this.config.get<string>('INGESTION_TELEGRAM_URL') ??
        process.env.INGESTION_TELEGRAM_URL ??
        'http://localhost:3031';
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      try {
        const res = await fetch(`${base}/api/feed/sources?type=kol`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`feed responded ${res.status}`);
        const sources = (await res.json()) as Array<{ channelId?: string }>;
        const known = new Set(
          sources.map((source) => source.channelId).filter(Boolean),
        );
        return {
          valid: channelIds.filter((id) => known.has(id)),
          unknownIds: channelIds.filter((id) => !known.has(id)),
        };
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      this.logger.warn(
        `Source feed unreachable, accepting all ids: ${(err as Error).message}`,
      );
      return { valid: [...channelIds], unknownIds: [] };
    }
  }
}
