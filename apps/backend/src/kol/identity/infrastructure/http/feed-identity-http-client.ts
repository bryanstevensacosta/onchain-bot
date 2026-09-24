import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kol } from 'kol/identity/domain/entities/kol.entity';
import { KolId } from 'kol/identity/domain/value-objects/kol-id.vo';
import { KolHandle } from 'kol/identity/domain/value-objects/kol-handle.vo';
import { KolRepository } from 'kol/identity/application/ports/kol.repository';
import { kolIdentityGone } from 'kol/identity/application/errors/kol-identity-gone.error';

/**
 * Raw row shape served by ingestion-telegram
 * `GET /api/feed/sources?type=kol` (SourcesController.getSources).
 *
 * NOTE: the feed list endpoint does NOT expose `last_ingested_at`
 * (it returns channelId/handle/title/type/isActive/lifecycleStatus/addedAt/updatedAt).
 * Reads therefore hydrate `lastIngestedAt: null` — the write path for that
 * column lives in ingestion-telegram now (its coordinator persists it on
 * every routed message). See `FeedIdentityHttpClient.mapToDomain`.
 */
export interface FeedKolSourceDto {
  readonly channelId: string;
  readonly handle: string | null;
  readonly title: string;
  readonly type?: string;
  readonly isActive: boolean;
  readonly lifecycleStatus: string;
  readonly addedAt?: string;
  readonly updatedAt?: string;
}

/**
 * FeedIdentityHttpClient — HTTP implementation of the `KolRepository` READ
 * port (item 8 of the telegram-feed-unification plan).
 *
 * - READS (`findById`/`findAll`/`findActive`) go to ingestion-telegram:
 *   `GET {INGESTION_TELEGRAM_URL}/api/feed/sources?type=kol`.
 * - WRITES (`save`/`delete`/`updateTitle`) throw 501 (`kolIdentityGone`):
 *   identity writes are owned by ingestion-telegram now. The only former
 *   in-pipeline write (`last_ingested_at` in `KolIngestionOrchestratorUseCase`)
 *   is a documented no-op there — the feed PATCH endpoint only accepts
 *   title/handle, so there is no feed write to forward it to.
 *
 * Fail-open by design (mirrors `CryptoNewsIngestionClient`): network errors,
 * non-2xx, or unexpected shapes degrade to `[]`/`null` with a warn log and
 * NEVER break boot — `MessageRoutingService` then idles with zero channels,
 * same as today's cold-start-0 path.
 */
@Injectable()
export class FeedIdentityHttpClient extends KolRepository {
  private readonly logger = new Logger(FeedIdentityHttpClient.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeout: number = 10000; // 10 seconds

  constructor(private readonly config: ConfigService) {
    super();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const appConfig = this.config.get('app');

    this.baseUrl =
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      appConfig?.ingestion?.serviceUrl || 'http://localhost:3031';
    const rawApiKey =
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      appConfig?.ingestion?.apiKey;
    this.apiKey =
      typeof rawApiKey === 'string' && rawApiKey.trim().length > 0
        ? rawApiKey.trim()
        : '';

    this.logger.log(
      `FeedIdentityHttpClient initialized with baseUrl: ${this.baseUrl}`,
    );
  }

  public async findById(id: KolId): Promise<Kol | null> {
    const all = await this.fetchKolSources();
    const row = all.find((s) => s.channelId === id.value);
    if (!row) {
      return null;
    }
    return this.mapToDomain(row);
  }

  public async findAll(): Promise<ReadonlyArray<Kol>> {
    const rows = await this.fetchKolSources();
    const kols: Kol[] = [];
    for (const row of rows) {
      try {
        const kol = this.mapToDomain(row);
        if (kol) {
          kols.push(kol);
        }
      } catch (err) {
        this.logger.warn(
          `Skipping feed kol row that failed to map (${row.channelId}): ${(err as Error).message}`,
        );
      }
    }
    return kols;
  }

  public async findActive(): Promise<ReadonlyArray<Kol>> {
    const all = await this.findAll();
    return all.filter(
      (kol) => kol.isActive && kol.lifecycleStatus === 'ACTIVE',
    );
  }

  public async save(): Promise<void> {
    throw kolIdentityGone('KolRepository.save');
  }

  public async delete(): Promise<void> {
    throw kolIdentityGone('KolRepository.delete');
  }

  public async updateTitle(): Promise<boolean> {
    throw kolIdentityGone('KolRepository.updateTitle');
  }

  /**
   * Fetch KOL rows from the feed API. Fail-open: any transport or shape
   * problem yields `[]` (callers degrade, boot never breaks).
   */
  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.apiKey.length > 0) {
      headers['x-api-key'] = this.apiKey;
    }
    return headers;
  }

  /**
   * Fetch KOL rows from the feed API. Fail-open: any transport or shape
   * problem yields `[]` (callers degrade, boot never breaks).
   */
  private async fetchKolSources(): Promise<FeedKolSourceDto[]> {
    try {
      const url = `${this.baseUrl}/api/feed/sources?type=kol`;
      this.logger.debug(`Fetching KOL sources from feed API: ${url}`);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(url, {
        method: 'GET',
        headers: this.buildHeaders(),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        this.logger.warn(
          `Feed API returned ${response.status} for /api/feed/sources?type=kol — degrading to []`,
        );
        return [];
      }

      const body: unknown = await response.json();
      if (Array.isArray(body)) {
        return body as FeedKolSourceDto[];
      }
      this.logger.warn(
        'Feed API returned an unexpected body shape (not an array) — treating as empty',
      );
      return [];
    } catch (error) {
      this.logger.warn(
        `Failed to fetch KOL sources from feed API (fail-open []): ${(error as Error).message}`,
      );
      return [];
    }
  }

  /**
   * Map one feed row to the `Kol` domain aggregate.
   *
   * - Lifecycle: feed knows `ACTIVE | INACTIVE`; `INACTIVE` maps to the
   *   domain `DORMANT` (paused). `BLACKLISTED` has no feed equivalent —
   *   rows can never arrive blacklisted from this API.
   * - Handle: parsed defensively (`KolHandle.fromString` strips `@`);
   *   invalid handles degrade to `null` instead of killing the row.
   * - `lastIngestedAt`: always `null` (feed list endpoint omits it;
   *   ingestion-telegram owns that column now).
   */
  private mapToDomain(row: FeedKolSourceDto): Kol | null {
    const id = KolId.fromString(row.channelId);
    let handle: KolHandle | null = null;
    if (row.handle) {
      try {
        handle = KolHandle.fromString(row.handle);
      } catch {
        handle = null;
      }
    }
    const lifecycleStatus =
      row.lifecycleStatus === 'ACTIVE' ? 'ACTIVE' : 'DORMANT';
    let addedAt: Date;
    try {
      addedAt = row.addedAt ? new Date(row.addedAt) : new Date();
    } catch {
      addedAt = new Date();
    }
    return Kol.reconstitute({
      id,
      handle,
      title: row.title,
      isActive: row.isActive,
      lifecycleStatus,
      lastIngestedAt: null,
      addedAt,
    });
  }
}
