import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import type { AppConfig } from 'shared/common/config/app.config';
import { RegisterKolUseCase } from 'kol/identity/application/handlers/register-kol.use-case';
import { KolRepository } from 'kol/identity/application/ports/kol.repository';
import { ResolvedKolMetadataRepository } from 'kol/identity/application/ports/resolved-kol-metadata.repository';
import { KolId } from 'kol/identity/domain/value-objects/kol-id.vo';
import { TelegramListenerPort } from 'telegram/ingestion/shared/domain/ports/telegram-listener.port';
import { KOL_SEED } from 'telegram/ingestion/kol/seeds/kol.seed';

/**
 * @deprecated DEPRECATED: Seed-based KOL registration is being phased out
 *
 * This seeder is kept for backward compatibility but should not be used for new deployments.
 *
 * NEW APPROACH (DB-driven):
 * - ingestion-service fetches active KOL IDs directly from backend DB via HTTP
 * - GET /api/telegram-kol/identity/kols/active/ids returns KOLs with isActive=true
 * - No seed files needed in ingestion-service
 * - Channel list refreshes automatically every 5 minutes
 *
 * Migration path:
 * 1. Add KOLs via backend API: POST /api/telegram-kol/identity/kols
 * 2. Verify in DB: SELECT * FROM kols WHERE is_active = true
 * 3. ingestion-service picks them up automatically
 * 4. This seeder can be disabled by setting INGESTION_TELEGRAM_SEED_ENABLED=false
 *
 * ---
 *
 * OLD BEHAVIOR (deprecated):
 *
 * Idempotently registers the static seed list of Telegram KOLs.
 *
 * - Disabled when `app.ingestion.telegram.seed.enabled` is false.
 * - If env-supplied KOLs are configured, they take precedence over the
 *   in-code seed file; otherwise the in-code list is used.
 * - KOLs already registered are skipped (CONFLICT) instead of throwing.
 *
 * Moved from `kol/identity/` to `telegram/ingestion/kol/` in the
 * crypto-news-ingestion refactor. Auto-start listening is no longer
 * triggered here — `IngestionCoordinator` (in `telegram/ingestion/shared/`)
 * handles subscription and routing after both KOL and news seeders run.
 */
@Injectable()
export class KolSeeder {
  private readonly logger = new Logger(KolSeeder.name);
  private needsManualJoin = 0;

  constructor(
    private readonly config: ConfigService,
    private readonly kolRepo: KolRepository,
    private readonly registerKol: RegisterKolUseCase,
    private readonly listener: TelegramListenerPort,
    private readonly metadataCache: ResolvedKolMetadataRepository,
  ) {}

  public async seed(): Promise<{
    added: number;
    skipped: number;
    failed: number;
    notAKol: number;
  }> {
    const seedConfig =
      this.config.get<AppConfig>('app')?.ingestion?.telegram?.seed;
    if (!seedConfig?.enabled) {
      this.logger.debug('Seed disabled; skipping kol registration.');
      await this.runBackfillIfEnabled();
      return { added: 0, skipped: 0, failed: 0, notAKol: 0 };
    }

    const kols =
      seedConfig.channels.length > 0 ? seedConfig.channels : KOL_SEED;

    if (kols.length === 0) {
      this.logger.debug('Seed list is empty; nothing to register.');
      await this.runBackfillIfEnabled();
      return { added: 0, skipped: 0, failed: 0, notAKol: 0 };
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

      if (kind === 'unknown') {
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

    const summary = `Telegram kol seed complete: added=${added} skipped=${skipped} failed=${failed} notAKol=${notAKol} total=${kols.length}`;
    this.logger.log(summary);
    if (this.needsManualJoin > 0) {
      this.logger.log(
        `${this.needsManualJoin} KOL(s) registered with placeholder titles — join the channels with the Telegram account to resolve real metadata on next boot.`,
      );
    }

    await this.runBackfillIfEnabled();
    return { added, skipped, failed, notAKol };
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
      const meta = await this.listener.resolveChannelMetadata(kolId);
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
      // Falló la resolución → intentar unirse al canal
      const joinResult = await this.listener
        .joinChannel(kolId)
        .catch(() => null);
      if (joinResult?.joined) {
        // Join exitoso → reintentar metadata
        const meta = await this.listener.resolveChannelMetadata(kolId);
        try {
          await this.metadataCache.upsert({
            kolId,
            title: meta.title,
            handle: meta.handle,
            resolvedAt: new Date().toISOString(),
            source: 'mtproto',
          });
        } catch {
          /* ignore */
        }
        return { title: meta.title, handle: meta.handle, kind: meta.kind };
      }
      // No se pudo unir — log específico del motivo
      const reason =
        joinResult?.error ?? (err instanceof Error ? err.message : 'Unknown');
      // PeerUser means the MTProto account isn't a member — suppress individual warnings,
      // count them and emit a single summary at the end
      if (
        reason.includes('PeerUser') ||
        reason.includes('USER_NOT_PARTICIPANT')
      ) {
        this.needsManualJoin += 1;
      } else {
        this.logger.warn(
          `Could not resolve or join channel ${kolId}: ${reason}` +
            (reason.includes('private')
              ? '. This channel requires an invite link.'
              : ''),
        );
      }
      return { title: `Telegram channel ${kolId}`, handle: null, kind: 'user' };
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
              .resolveChannelMetadata(id.value)
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
}
