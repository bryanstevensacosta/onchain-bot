import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  KolIngestedMessage,
  KolIngestionClientPort,
  KolSource,
} from '../../domain/ports/ingestion-client.port';
import {
  RawKolSourceDto,
  toKolSource,
} from './dto/kol-source.dto';
import {
  RawKolMessageDto,
  toKolMessage,
} from './dto/raw-kol-message.dto';

export const DEFAULT_INGESTION_BASE_URL = 'http://localhost:3031';

/**
 * HTTP adapter over the ingestion-telegram feed API.
 *
 * Read-only: KOL sources via `GET /api/feed/sources?type=kol`,
 * recent KOL messages via `GET /api/feed/messages?type=kol`.
 * Base URL resolves from `INGESTION_TELEGRAM_URL` (ConfigService first,
 * then `process.env`), defaulting to `http://localhost:3031`.
 */
@Injectable()
export class IngestionHttpClientAdapter extends KolIngestionClientPort {
  private readonly logger = new Logger(IngestionHttpClientAdapter.name);
  private readonly baseUrl: string;

  constructor(private readonly config: ConfigService) {
    super();
    const fromConfig = config?.get<string>('INGESTION_TELEGRAM_URL');
    const raw =
      (typeof fromConfig === 'string' && fromConfig.trim().length > 0
        ? fromConfig
        : process.env['INGESTION_TELEGRAM_URL']
      )?.trim() || DEFAULT_INGESTION_BASE_URL;
    this.baseUrl = raw.replace(/\/+$/, '');
  }

  override async listKolSources(): Promise<KolSource[]> {
    const url = `${this.baseUrl}/api/feed/sources?type=kol`;
    const body = await this.getJson(url);
    const rows = extractRows(body, ['sources', 'items', 'data']);
    const out: KolSource[] = [];
    for (const row of rows) {
      const mapped = toKolSource(row as RawKolSourceDto);
      if (mapped) {
        out.push(mapped);
      }
    }
    return out;
  }

  override async fetchRecentKolMessages(
    limit: number,
    channelId?: string,
  ): Promise<KolIngestedMessage[]> {
    const params = new URLSearchParams({ type: 'kol', limit: String(limit) });
    if (channelId) {
      params.set('channelId', channelId);
    }
    const url = `${this.baseUrl}/api/feed/messages?${params.toString()}`;
    const body = await this.getJson(url);
    const rows = extractRows(body, ['messages', 'items', 'data']);
    const out: KolIngestedMessage[] = [];
    for (const row of rows) {
      const mapped = toKolMessage(row as RawKolMessageDto);
      if (mapped) {
        out.push(mapped);
      }
    }
    return out;
  }

  private async getJson(url: string): Promise<unknown> {
    let response: Response;
    try {
      response = await fetch(url, { headers: { Accept: 'application/json' } });
    } catch (error) {
      this.logger.warn(
        `Feed request failed: ${url} (${error instanceof Error ? error.message : String(error)})`,
      );
      return null;
    }
    if (!response.ok) {
      this.logger.warn(`Feed request HTTP ${response.status}: ${url}`);
      return null;
    }
    try {
      return (await response.json()) as unknown;
    } catch (error) {
      this.logger.warn(
        `Feed response is not JSON: ${url} (${error instanceof Error ? error.message : String(error)})`,
      );
      return null;
    }
  }
}

function extractRows(body: unknown, keys: string[]): unknown[] {
  if (Array.isArray(body)) {
    return body;
  }
  if (body && typeof body === 'object') {
    for (const key of keys) {
      const value = (body as Record<string, unknown>)[key];
      if (Array.isArray(value)) {
        return value;
      }
    }
  }
  return [];
}
