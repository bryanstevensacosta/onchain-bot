import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import type { AppConfig } from 'shared/common/config/app.config';
import { RegisterKolUseCase } from 'telegram-kol/identity/application/handlers/register-kol.use-case';
import { StartKolIngestionUseCase } from 'telegram-kol/ingestion/application/handlers/start-kol-ingestion.use-case';
import { KolRepository } from 'telegram-kol/identity/application/ports/kol.repository';
import { ResolvedKolMetadataRepository } from 'telegram-kol/identity/application/ports/resolved-kol-metadata.repository';
import { KolId } from 'telegram-kol/identity/domain/value-objects/kol-id.vo';
import { KolListenerPort } from 'telegram-kol/ingestion/domain/ports/kol-listener.port';
import { KOL_SEED } from 'telegram-kol/identity/infrastructure/seeds/kol.seed';

/**
 * Idempotently registers the static seed list of Telegram KOLs on boot,
 * resolving display title/handle from Telegram when not provided, and
 * optionally auto-starts the real-time listener on them.
 *
 * - Disabled when `app.ingestion.telegram.seed.enabled` is false.
 * - If env-supplied KOLs are configured, they take precedence over the
 *   in-code seed file; otherwise the in-code list is used.
 * - KOLs already registered are skipped (CONFLICT) instead of throwing.
 * - When `app.ingestion.telegram.seed.autoStartListening` is true (default),
 *   starts the listener over the freshly seeded KOLs after registration.
 * - Runs after the rest of the app has wired (`OnApplicationBootstrap`)
 *   so the repository, use cases, and listener port are usable.
 */
@Injectable()
export class KolSeeder implements OnApplicationBootstrap {
  private readonly logger = new Logger(KolSeeder.name);

  constructor(
    private readonly config: ConfigService,
    private readonly kolRepo: KolRepository,
    private readonly registerKol: RegisterKolUseCase,
    private readonly startListening: StartKolIngestionUseCase,
    private readonly listener: KolListenerPort,
    private readonly metadataCache: ResolvedKolMetadataRepository,
  ) {}

  public async onApplicationBootstrap(): Promise<void> {
    const seedConfig =
      this.config.get<AppConfig>('app')?.ingestion?.telegram?.seed;
    if (!seedConfig?.enabled) {
      this.logger.debug('Seed disabled; skipping kol registration.');
      await this.runBackfillIfEnabled();
      return;
    }

    const kols =
      seedConfig.channels.length > 0 ? seedConfig.channels : KOL_SEED;

    if (kols.length === 0) {
      this.logger.debug('Seed list is empty; nothing to register.');
      await this.runBackfillIfEnabled();
      return;
    }

    const registeredIds: string[] = [];
    let added = 0;
    let skipped = 0;
    let failed = 0;
    let notAKol = 0;

    for (const seed of kols) {
      try {
        KolId.fromString(seed.kolId);
      } catch (err) {
        failed += 1;
        this.logger.error(
          `Skipping invalid seed kolId: ${seed.kolId}`,
          err instanceof Error ? err.stack : String(err),
        );
        continue;
      }

      const id = KolId.fromString(seed.kolId);
      const existing = await this.kolRepo.findById(id);
      if (existing) {
        skipped += 1;
        registeredIds.push(seed.kolId);
        continue;
      }

      const { title, handle, kind } = await this.resolveMetadata(
        seed.kolId,
        seed.title,
        seed.handle,
      );

      if (kind !== 'channel') {
        notAKol += 1;
        this.logger.warn(
          `Skipping seed ${seed.kolId}: resolved as kind="${kind}" (not a broadcast channel). ` +
            `Kol IDs from this seed list must reference channels/groups, not user accounts. ` +
            `Title fallback was "${title}".`,
        );
        continue;
      }

      try {
        await this.registerKol.execute({
          kolId: seed.kolId,
          handle: handle ?? undefined,
          title,
        });
        added += 1;
        registeredIds.push(seed.kolId);
      } catch (err) {
        if (err instanceof DomainError && err.code === ErrorCode.CONFLICT) {
          skipped += 1;
          registeredIds.push(seed.kolId);
          continue;
        }
        failed += 1;
        this.logger.error(
          `Failed to seed kol ${seed.kolId}: ${
            err instanceof Error ? err.message : String(err)
          }`,
          err instanceof Error ? err.stack : undefined,
        );
      }
    }

    this.logger.log(
      `Telegram kol seed finished. added=${added} skipped=${skipped} failed=${failed} notAKol=${notAKol} total=${kols.length}`,
    );

    if (seedConfig.autoStartListening) {
      const existing = await this.kolRepo.findAll();
      const subscribed = new Set<string>(registeredIds);
      for (const k of existing) {
        if (k.isActive) {
          subscribed.add(k.kolId.value);
        }
      }
      if (subscribed.size > 0) {
        await this.startListeningSafely(Array.from(subscribed));
      } else {
        this.logger.warn('Auto-start listening skipped: no active kols in DB.');
      }
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

  private async resolveMetadata(
    kolId: string,
    seedTitle?: string,
    seedHandle?: string,
  ): Promise<{
    title: string;
    handle: string | null;
    kind: 'channel' | 'user' | 'unknown';
  }> {
    if (seedTitle && seedTitle.trim().length > 0) {
      const title = seedTitle.trim();
      const handle = seedHandle?.trim() || null;
      await this.metadataCache
        .upsert({
          kolId,
          title,
          handle,
          resolvedAt: new Date().toISOString(),
          source: 'seed',
        })
        .catch((err: unknown) => {
          this.logger.warn(
            `Failed to persist seed metadata for ${kolId}: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        });
      return { title, handle, kind: 'channel' };
    }

    try {
      const cached = await this.metadataCache.find(kolId);
      if (cached?.title) {
        this.logger.debug(
          `Using cached title for ${kolId} ("${cached.title}", source=${cached.source}).`,
        );
        return {
          title: cached.title,
          handle: cached.handle,
          kind: 'channel',
        };
      }
    } catch (err) {
      this.logger.warn(
        `Metadata cache lookup failed for ${kolId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }

    try {
      const meta = await this.listener.resolveKolMetadata(kolId);
      try {
        await this.metadataCache.upsert({
          kolId,
          title: meta.title,
          handle: meta.handle,
          resolvedAt: new Date().toISOString(),
          source: 'mtproto',
        });
      } catch (cacheErr) {
        this.logger.warn(
          `Failed to cache metadata for ${kolId}: ${
            cacheErr instanceof Error ? cacheErr.message : String(cacheErr)
          }`,
        );
      }
      return {
        title: meta.title,
        handle: meta.handle,
        kind: meta.kind,
      };
    } catch (err) {
      this.logger.warn(
        `Could not resolve title for ${kolId} via Telegram; falling back to peer id. (${
          err instanceof Error ? err.message : String(err)
        })`,
      );
      return {
        title: `Telegram channel ${kolId}`,
        handle: null,
        kind: 'user',
      };
    }
  }

  private async backfillFallbackTitlesSafely(): Promise<void> {
    try {
      const kols = await this.kolRepo.findAll();
      if (kols.length === 0) return;
      let updated = 0;
      let skipped = 0;
      let failed = 0;
      for (const k of kols) {
        const id = k.kolId;
        if (!k.title.startsWith('Telegram channel ')) {
          skipped += 1;
          continue;
        }
        try {
          const cached = await this.metadataCache.find(id.value);
          let nextTitle: string | null = null;
          let nextHandle: string | null | undefined;
          if (cached?.title && !cached.title.startsWith('Telegram channel ')) {
            nextTitle = cached.title;
            nextHandle = cached.handle;
          } else {
            const meta = await this.listener
              .resolveKolMetadata(id.value)
              .catch(() => null);
            if (meta?.title && !meta.title.startsWith('Telegram channel ')) {
              nextTitle = meta.title;
              nextHandle = meta.handle;
              await this.metadataCache
                .upsert({
                  kolId: id.value,
                  title: meta.title,
                  handle: meta.handle,
                  resolvedAt: new Date().toISOString(),
                  source: 'mtproto',
                })
                .catch(() => undefined);
            }
          }
          if (nextTitle) {
            const ok = await this.kolRepo.updateTitle(id, nextTitle);
            if (ok) {
              updated += 1;
              if (nextHandle && (!k.handle || k.handle.value !== nextHandle)) {
                this.logger.debug(
                  `Backfill resolved new handle for ${id.value} ("${nextHandle}") but handle is immutable post-registration; manual re-add required.`,
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
          `Title backfill finished. updated=${updated} skipped=${skipped} failed=${failed} total=${kols.length}`,
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

  private async startListeningSafely(kolIds: string[]): Promise<void> {
    try {
      await this.startListening.execute({ kolIds });
      this.logger.log(
        `Auto-started Telegram listener on ${kolIds.length} kol(s).`,
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
