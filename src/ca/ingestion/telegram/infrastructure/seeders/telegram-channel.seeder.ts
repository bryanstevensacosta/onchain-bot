import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import type { AppConfig } from 'shared/common/config/app.config';
import { AddChannelUseCase } from 'ca/ingestion/telegram/application/handlers/add-channel.use-case';
import { StartListeningUseCase } from 'ca/ingestion/telegram/application/handlers/start-listening.use-case';
import { TelegramChannelRepository } from 'ca/ingestion/telegram/application/ports/telegram-channel.repository';
import { ResolvedChannelMetadataRepository } from 'ca/ingestion/telegram/application/ports/resolved-channel-metadata.repository';
import { ChannelId } from 'ca/ingestion/telegram/domain/value-objects/channel-id.vo';
import { TelegramListenerPort } from 'ca/ingestion/telegram/domain/ports/telegram-listener.port';
import { TELEGRAM_CHANNEL_SEED } from 'ca/ingestion/telegram/infrastructure/seeds/telegram-channels.seed';

/**
 * Idempotently registers the static seed list of Telegram channels on boot,
 * resolving display title/username from Telegram when not provided, and
 * optionally auto-starts the real-time listener on them.
 *
 * - Disabled when `app.ingestion.telegram.seed.enabled` is false.
 * - If env-supplied channels are configured, they take precedence over the
 *   in-code seed file; otherwise the in-code list is used.
 * - Channels already registered are skipped (CONFLICT) instead of throwing.
 * - When `app.ingestion.telegram.seed.autoStartListening` is true (default),
 *   starts the listener over the freshly seeded channels after registration.
 * - Runs after the rest of the app has wired (`OnApplicationBootstrap`)
 *   so the repository, use cases, and listener port are usable.
 */
@Injectable()
export class TelegramChannelSeeder implements OnApplicationBootstrap {
  private readonly logger = new Logger(TelegramChannelSeeder.name);

  constructor(
    private readonly config: ConfigService,
    private readonly channelRepo: TelegramChannelRepository,
    private readonly addChannel: AddChannelUseCase,
    private readonly startListening: StartListeningUseCase,
    private readonly listener: TelegramListenerPort,
    private readonly metadataCache: ResolvedChannelMetadataRepository,
  ) {}

  public async onApplicationBootstrap(): Promise<void> {
    const seedConfig =
      this.config.get<AppConfig>('app')?.ingestion?.telegram?.seed;
    if (!seedConfig?.enabled) {
      this.logger.debug('Seed disabled; skipping channel registration.');
      await this.runBackfillIfEnabled();
      return;
    }

    const channels =
      seedConfig.channels.length > 0
        ? seedConfig.channels
        : TELEGRAM_CHANNEL_SEED;

    if (channels.length === 0) {
      this.logger.debug('Seed list is empty; nothing to register.');
      await this.runBackfillIfEnabled();
      return;
    }

    const registeredIds: string[] = [];
    let added = 0;
    let skipped = 0;
    let failed = 0;

    for (const seed of channels) {
      try {
        ChannelId.fromString(seed.channelId);
      } catch (err) {
        failed += 1;
        this.logger.error(
          `Skipping invalid seed channelId: ${seed.channelId}`,
          err instanceof Error ? err.stack : String(err),
        );
        continue;
      }

      const id = ChannelId.fromString(seed.channelId);
      const existing = await this.channelRepo.findById(id);
      if (existing) {
        skipped += 1;
        registeredIds.push(seed.channelId);
        continue;
      }

      const { title, username } = await this.resolveMetadata(
        seed.channelId,
        seed.title,
        seed.username,
      );

      try {
        await this.addChannel.execute({
          channelId: seed.channelId,
          username: username ?? undefined,
          title,
        });
        added += 1;
        registeredIds.push(seed.channelId);
      } catch (err) {
        if (err instanceof DomainError && err.code === ErrorCode.CONFLICT) {
          skipped += 1;
          registeredIds.push(seed.channelId);
          continue;
        }
        failed += 1;
        this.logger.error(
          `Failed to seed channel ${seed.channelId}: ${
            err instanceof Error ? err.message : String(err)
          }`,
          err instanceof Error ? err.stack : undefined,
        );
      }
    }

    this.logger.log(
      `Telegram channel seed finished. added=${added} skipped=${skipped} failed=${failed} total=${channels.length}`,
    );

    if (seedConfig.autoStartListening && registeredIds.length > 0) {
      await this.startListeningSafely(registeredIds);
    }

    await this.runBackfillIfEnabled();
  }

  private async runBackfillIfEnabled(): Promise<void> {
    const backfillEnabled =
      this.config.get<AppConfig>('app')?.ingestion?.telegram?.backfill
        ?.enabled ?? true;
    if (backfillEnabled) {
      await this.backfillFallbackTitlesSafely();
    }
  }

  /**
   * Resolve title + username for a seed entry.
   *
   * Resolution order:
   *  1. explicit `seedTitle` (env- or code-supplied) — cached as 'seed'
   *  2. cached metadata from a previous successful MTProto call — no I/O
   *  3. live `TelegramListenerPort.resolveChannelMetadata` — cached on success
   *  4. hardcoded fallback `"Telegram channel <peerId>"` — NOT cached
   *     (next boot can still try the cache or MTProto again)
   */
  private async resolveMetadata(
    channelId: string,
    seedTitle?: string,
    seedUsername?: string,
  ): Promise<{ title: string; username: string | null }> {
    if (seedTitle && seedTitle.trim().length > 0) {
      const title = seedTitle.trim();
      const username = seedUsername?.trim() || null;
      await this.metadataCache
        .upsert({
          channelId,
          title,
          username,
          resolvedAt: new Date().toISOString(),
          source: 'seed',
        })
        .catch((err: unknown) => {
          this.logger.warn(
            `Failed to persist seed metadata for ${channelId}: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        });
      return { title, username };
    }

    try {
      const cached = await this.metadataCache.find(channelId);
      if (cached?.title) {
        this.logger.debug(
          `Using cached title for ${channelId} ("${cached.title}", source=${cached.source}).`,
        );
        return { title: cached.title, username: cached.username };
      }
    } catch (err) {
      this.logger.warn(
        `Metadata cache lookup failed for ${channelId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }

    try {
      const meta = await this.listener.resolveChannelMetadata(channelId);
      try {
        await this.metadataCache.upsert({
          channelId,
          title: meta.title,
          username: meta.username,
          resolvedAt: new Date().toISOString(),
          source: 'mtproto',
        });
      } catch (cacheErr) {
        this.logger.warn(
          `Failed to cache metadata for ${channelId}: ${
            cacheErr instanceof Error ? cacheErr.message : String(cacheErr)
          }`,
        );
      }
      return { title: meta.title, username: meta.username };
    } catch (err) {
      this.logger.warn(
        `Could not resolve title for ${channelId} via Telegram; falling back to peer id. (${
          err instanceof Error ? err.message : String(err)
        })`,
      );
      return { title: `Telegram channel ${channelId}`, username: null };
    }
  }

  /**
   * Walk the existing channel set and replace titles that are still on
   * the fallback form (`"Telegram channel <peerId>"`). For each one,
   * attempt to re-resolve from cache or MTProto and patch the in-memory
   * aggregate via `TelegramChannelRepository.updateTitle`.
   *
   * Safe to call when no MTProto session is available — it'll fail
   * per-channel and skip silently. This is the post-connect backfill
   * hook that fixes the titles that fell through during a prior cold
   * start.
   */
  private async backfillFallbackTitlesSafely(): Promise<void> {
    try {
      const channels = await this.channelRepo.findAll();
      if (channels.length === 0) return;
      let updated = 0;
      let skipped = 0;
      let failed = 0;
      for (const ch of channels) {
        const id = ch.channelId;
        if (!ch.title.startsWith('Telegram channel ')) {
          skipped += 1;
          continue;
        }
        try {
          const cached = await this.metadataCache.find(id.value);
          let nextTitle: string | null = null;
          let nextUsername: string | null | undefined;
          if (cached?.title && !cached.title.startsWith('Telegram channel ')) {
            nextTitle = cached.title;
            nextUsername = cached.username;
          } else {
            const meta = await this.listener
              .resolveChannelMetadata(id.value)
              .catch(() => null);
            if (meta?.title && !meta.title.startsWith('Telegram channel ')) {
              nextTitle = meta.title;
              nextUsername = meta.username;
              await this.metadataCache
                .upsert({
                  channelId: id.value,
                  title: meta.title,
                  username: meta.username,
                  resolvedAt: new Date().toISOString(),
                  source: 'mtproto',
                })
                .catch(() => undefined);
            }
          }
          if (nextTitle) {
            const ok = await this.channelRepo.updateTitle(id, nextTitle);
            if (ok) {
              updated += 1;
              if (
                nextUsername &&
                (!ch.username || ch.username.value !== nextUsername)
              ) {
                this.logger.debug(
                  `Backfill resolved new username for ${id.value} ("${nextUsername}") but username is immutable post-registration; manual re-add required.`,
                );
              }
            } else {
              failed += 1;
            }
          } else {
            skipped += 1;
          }
        } catch (err) {
          failed += 1;
          this.logger.warn(
            `Title backfill failed for ${id.value}: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        }
      }
      if (updated > 0 || failed > 0) {
        this.logger.log(
          `Title backfill finished. updated=${updated} skipped=${skipped} failed=${failed} total=${channels.length}`,
        );
      }
    } catch (err) {
      this.logger.warn(
        `Title backfill skipped: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  private async startListeningSafely(channelIds: string[]): Promise<void> {
    try {
      await this.startListening.execute({ channelIds });
      this.logger.log(
        `Auto-started Telegram listener on ${channelIds.length} channel(s).`,
      );
    } catch (err) {
      this.logger.error(
        `Auto-start listening failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
        err instanceof Error ? err.stack : undefined,
      );
    }
  }
}
