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
 * @deprecated DEPRECATED: Seed-based crypto-news registration is being phased out
 *
 * This seeder is kept for backward compatibility but should not be used for new deployments.
 *
 * NEW APPROACH (DB-driven):
 * - ingestion-service fetches active source IDs directly from backend DB via HTTP
 * - GET /api/crypto-news/sources/active/ids returns sources with isActive=true
 * - No seed files needed in ingestion-service
 * - Channel list refreshes automatically every 5 minutes
 *
 * Migration path:
 * 1. Add sources via backend API: POST /api/crypto-news/sources
 * 2. Verify in DB: SELECT * FROM crypto_news_sources WHERE is_active = true
 * 3. ingestion-service picks them up automatically
 * 4. This seeder can be disabled by setting INGESTION_TELEGRAM_NEWS_SEED_ENABLED=false
 *
 * ---
 *
 * OLD BEHAVIOR (deprecated):
 *
 * Idempotently registers the static seed list of Telegram crypto-news
 * channels on application bootstrap.
 *
 * - Disabled when `app.ingestion.telegram.newsSeed.enabled` is false.
 * - If env-supplied channels are configured, they take precedence over
 *   the in-code seed file; otherwise the in-code list is used.
 * - Channels already registered are skipped (CONFLICT) instead of
 *   throwing.
 * - Does NOT auto-start listening. The IngestionCoordinator (in
 *   telegram/ingestion/shared/) subscribes after both KOL and news
 *   seeders complete.
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
      this.logger.debug('News seed disabled; skipping registration.');
      return { added: 0, skipped: 0, failed: 0 };
    }

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
