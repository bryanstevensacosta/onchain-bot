import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import type { AppConfig } from 'shared/common/config/app.config';
import { RegisterNewsSourceUseCase } from 'telegram/ingestion/crypto-news/application/handlers/register-news-source.use-case';
import { CryptoNewsSourceRepository } from 'telegram/ingestion/crypto-news/application/ports/crypto-news-source.repository';
import { CryptoNewsMetadataResolver } from 'telegram/ingestion/crypto-news/application/services/crypto-news-metadata-resolver.service';
import { TelegramListenerPort } from 'telegram/ingestion/shared/domain/ports/telegram-listener.port';
import { CRYPTO_NEWS_SEED } from 'telegram/ingestion/crypto-news/infrastructure/seeds/crypto-news.seed';

/**
 * @deprecated DEPRECATED (2026-09-05): Backend seeder is DISCONNECTED
 *
 * ⚠️ **This seeder NO LONGER writes to backend DB** ⚠️
 *
 * **NEW ARCHITECTURE (Opción A - Ingestion-service as sole owner):**
 * - Ingestion-service OWNS crypto-news sources (reads/writes from its own DB)
 * - Backend NO LONGER seeds sources to its own DB
 * - Ingestion-service seeds sources on its own bootstrap (via its own CryptoNewsSeeder)
 * - Backend GET /crypto-news/sources/active/ids is DEPRECATED (kept for backward compat)
 *
 * **Migration:**
 * 1. Disable backend seeder: `INGESTION_TELEGRAM_NEWS_SEED_ENABLED=false` (default should be false)
 * 2. Enable ingestion-service seeder: `SEED_CRYPTO_NEWS_ENABLED=true` in ingestion-service
 * 3. Add new sources via ingestion-service: POST {INGESTION_SERVICE_URL}/api/crypto-news/sources
 *
 * **Why deprecated:**
 * - Eliminates circular dependency (backend → ingestion → backend)
 * - Single source of truth (ingestion-service DB)
 * - Ingestion-service can start independently
 * - No DB replication/sync needed
 *
 * ---
 *
 * OLD BEHAVIOR (no longer active):
 * Idempotently registered the static seed list of Telegram crypto-news
 * channels to BACKEND DB on application bootstrap. Now disconnected.
 */
@Injectable()
export class CryptoNewsSeeder {
  private readonly logger = new Logger(CryptoNewsSeeder.name);
  private needsManualJoin = 0;

  // Property-injected so the constructor can stay 4-positional-args
  // (the existing seeder spec instantiates via `new` without DI).
  @Inject(CryptoNewsMetadataResolver)
  private readonly metadataResolver: CryptoNewsMetadataResolver;

  constructor(
    private readonly config: ConfigService,
    private readonly sourceRepo: CryptoNewsSourceRepository,
    private readonly registerSource: RegisterNewsSourceUseCase,
    private readonly listener: TelegramListenerPort,
  ) {}

  public async seed(): Promise<{
    added: number;
    skipped: number;
    failed: number;
  }> {
    const seedConfig =
      this.config.get<AppConfig>('app')?.ingestion?.telegram?.newsSeed;
    if (!seedConfig?.enabled) {
      this.logger.warn(
        '[DEPRECATED] Backend crypto-news seeder is disabled (RECOMMENDED). ' +
          'Ingestion-service is now the sole owner of crypto-news sources.',
      );
      return { added: 0, skipped: 0, failed: 0 };
    }

    // DEPRECATED: Backend seeder should NOT run. Warn and skip.
    this.logger.warn(
      '[DEPRECATED] Backend crypto-news seeder is ENABLED but should be DISABLED. ' +
        'Backend NO LONGER writes sources to its DB. ' +
        'Set INGESTION_TELEGRAM_NEWS_SEED_ENABLED=false and use ingestion-service seeder instead.',
    );

    return { added: 0, skipped: 0, failed: 0 };

    /* ────────────────────────────────────────────────────────────────────
     * OLD CODE (DISCONNECTED - DO NOT RE-ENABLE)
     * ────────────────────────────────────────────────────────────────────
     *
     * This code wrote sources to backend DB. It is now COMPLETELY DISABLED.
     * Ingestion-service seeds sources to its own DB.
     *
     * The code below is kept for reference only and will be removed in
     * future cleanup. DO NOT uncomment or re-enable.
     *
     * ────────────────────────────────────────────────────────────────────

    const channels =
      seedConfig.channels.length > 0 ? seedConfig.channels : CRYPTO_NEWS_SEED;

    if (channels.length === 0) {
      this.logger.debug('News seed list is empty; nothing to register.');
      return { added: 0, skipped: 0, failed: 0 };
    }

    let added = 0;
    let skipped = 0;
    let failed = 0;

    for (const seed of channels) {
      try {
        const existing = await this.sourceRepo.findByChannelId(seed.channelId);
        if (existing) {
          // Activate any pre-existing source that was registered before
          // this fix shipped, so the listener subscribes to it.
          if (!existing.isActive) {
            existing.activate();
            await this.sourceRepo.save(existing);
          }
          skipped += 1;
          continue;
        }

        const { title, handle } = await this.resolveTitleAndHandle(
          seed.channelId,
          seed.title,
          seed.handle,
        );

        try {
          const source = await this.registerSource.execute({
            channelId: seed.channelId,
            handle,
            title,
          });
          // CryptoNewsSource.create() initializes isActive=false; the
          // seeder activates the source so IngestionCoordinator picks it
          // up via findActive() and the listener subscribes.
          source.activate();
          await this.sourceRepo.save(source);
          added += 1;
        } catch (err) {
          if (err instanceof DomainError && err.code === ErrorCode.CONFLICT) {
            skipped += 1;
            continue;
          }
          failed += 1;
          this.logger.error(
            `Failed to seed crypto-news channel ${seed.channelId}: ${
              err instanceof Error ? err.message : String(err)
            }`,
            err instanceof Error ? err.stack : undefined,
          );
        }
      } catch (err) {
        failed += 1;
        this.logger.error(
          `Skipping invalid crypto-news seed ${seed.channelId}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    const summary = `Telegram crypto-news seed complete: added=${added} skipped=${skipped} failed=${failed} total=${channels.length}`;
    this.logger.log(summary);
    if (this.needsManualJoin > 0) {
      this.logger.log(
        `${this.needsManualJoin} crypto-news channel(s) need manual join.`,
      );
    }

    return { added, skipped, failed };

     * ──────────────────────────────────────────────────────────────────── */
  }

  private async resolveTitleAndHandle(
    channelId: string,
    seedTitle?: string,
    seedHandle?: string,
  ): Promise<{ title: string; handle: string | null }> {
    if (seedTitle && seedTitle.trim().length > 0) {
      return { title: seedTitle.trim(), handle: seedHandle?.trim() || null };
    }
    const resolved = await this.metadataResolver.resolve(channelId);
    if (resolved.needsManualJoin) {
      this.needsManualJoin += 1;
    }
    return { title: resolved.title, handle: resolved.handle };
  }
}
