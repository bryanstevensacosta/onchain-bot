import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CryptoNewsIngestedMessage,
  CryptoNewsIngestionClientPort,
  CryptoNewsSource,
} from '../../domain/ports/ingestion-client.port';
import {
  RawCryptoNewsSourceDto,
  toCryptoNewsSource,
} from './dto/crypto-news-source.dto';
import {
  RawCryptoNewsMessageDto,
  toCryptoNewsMessage,
} from './dto/raw-crypto-news-message.dto';

export const DEFAULT_INGESTION_BASE_URL = 'http://localhost:3031';

/**
 * HTTP adapter over the ingestion-telegram feed API.
 *
 * Read-only: crypto-news sources via `GET /api/feed/sources?type=crypto-news`,
 * recent crypto-news messages via `GET /api/feed/messages?type=crypto-news`.
 * Base URL resolves from `INGESTION_TELEGRAM_URL` (ConfigService first,
 * then `process.env`), defaulting to `http://localhost:3031`.
 * Sends `x-api-key` (`INGESTION_TELEGRAM_API_KEY`) from day one (P30).
 */
@Injectable()
export class IngestionHttpClientAdapter extends CryptoNewsIngestionClientPort {
  private readonly logger = new Logger(IngestionHttpClientAdapter.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(private readonly config: ConfigService) {
    super();
    const fromConfig = config?.get<string>('INGESTION_TELEGRAM_URL');
    const raw =
      (typeof fromConfig === 'string' && fromConfig.trim().length > 0
        ? fromConfig
        : process.env['INGESTION_TELEGRAM_URL']
      )?.trim() || DEFAULT_INGESTION_BASE_URL;
    this.baseUrl = raw.replace(/\/+$/, '');
    const keyFromConfig = config?.get<string>('INGESTION_TELEGRAM_API_KEY');
    this.apiKey =
      (typeof keyFromConfig === 'string' && keyFromConfig.trim().length > 0
        ? keyFromConfig
        : process.env['INGESTION_TELEGRAM_API_KEY']
      )?.trim() || '';
  }

  override async listCryptoNewsSources(): Promise<CryptoNewsSource[]> {
    const url = `${this.baseUrl}/api/feed/sources?type=crypto-news`;
    const body = await this.getJson(url);
    const rows = extractRows(body, ['sources', 'items', 'data']);
    const out: CryptoNewsSource[] = [];
    for (const row of rows) {
      const mapped = toCryptoNewsSource(row as RawCryptoNewsSourceDto);
      if (mapped) {
        out.push(mapped);
      }
    }
    return out;
  }

  override async fetchRecentCryptoNewsMessages(
    limit: number,
    channelId?: string,
  ): Promise<CryptoNewsIngestedMessage[]> {
    const params = new URLSearchParams({
      type: 'crypto-news',
      limit: String(limit),
    });
    if (channelId) {
      params.set('channelId', channelId);
    }
    const url = `${this.baseUrl}/api/feed/messages?${params.toString()}`;
    const body = await this.getJson(url);
    const rows = extractRows(body, ['messages', 'items', 'data']);
    const out: CryptoNewsIngestedMessage[] = [];
    for (const row of rows) {
      const mapped = toCryptoNewsMessage(row as RawCryptoNewsMessageDto);
      if (mapped) {
        out.push(mapped);
      }
    }
    return out;
  }

  private async getJson(url: string): Promise<unknown> {
    let response: Response;
    const headers: Record<string, string> = {
      Accept: 'application/json',
    };
    if (this.apiKey.length > 0) {
      headers['x-api-key'] = this.apiKey;
    }
    try {
      response = await fetch(url, { headers });
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
