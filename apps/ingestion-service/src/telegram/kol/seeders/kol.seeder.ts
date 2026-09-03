import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TelegramListenerPort } from '../../shared/ports/telegram-listener.port';
import { KOL_SEED, type SeedKol } from '../seeds/kol.seed';

/**
 * @deprecated DEPRECATED: Use BackendChannelProviderService instead
 * 
 * This seeder is kept for backward compatibility only and will be removed in a future version.
 * The new DB-driven approach fetches active KOL channels from the backend via HTTP:
 * - GET /api/telegram-kol/identity/kols/active/ids
 * 
 * Migration path:
 * 1. Add KOLs via backend API: POST /api/telegram-kol/identity/kols
 * 2. Verify KOLs appear in backend DB with isActive=true and lifecycleStatus='ACTIVE'
 * 3. ingestion-service automatically picks them up via BackendChannelProviderService
 * 4. This seeder is no longer invoked by TelegramModule
 * 
 * ---
 * 
 * OLD BEHAVIOR (deprecated):
 * 
 * Idempotently registers the static seed list of Telegram KOLs for ingestion.
 *
 * Adapted from backend's KolSeeder for the centralized ingestion service.
 * Simplified to only track channel metadata for joining/monitoring — does NOT
 * persist KOL aggregates (that remains in backend).
 *
 * - Disabled when `INGESTION_TELEGRAM_SEED_ENABLED` is false.
 * - If env-supplied KOLs are configured, they take precedence over the
 *   in-code seed file; otherwise the in-code list is used.
 * - Joins channels and resolves metadata without backend database operations.
 */
@Injectable()
export class KolSeeder {
  private readonly logger = new Logger(KolSeeder.name);
  private needsManualJoin = 0;
  private readonly registeredChannels = new Set<string>();

  constructor(
    private readonly config: ConfigService,
    @Inject(TelegramListenerPort)
    private readonly listener: TelegramListenerPort,
  ) {}

  public async seed(): Promise<{
    added: number;
    skipped: number;
    failed: number;
    notAKol: number;
  }> {
    const enabled = this.config.get<boolean>(
      'INGESTION_TELEGRAM_SEED_ENABLED',
      false,
    );
    if (!enabled) {
      this.logger.debug('Seed disabled; skipping kol registration.');
      return { added: 0, skipped: 0, failed: 0, notAKol: 0 };
    }

    // Parse env-supplied channels if present
    const envChannels = this.parseEnvChannels();
    const kols = envChannels.length > 0 ? envChannels : KOL_SEED;

    if (kols.length === 0) {
      this.logger.debug('Seed list is empty; nothing to register.');
      return { added: 0, skipped: 0, failed: 0, notAKol: 0 };
    }

    let added = 0;
    let skipped = 0;
    let failed = 0;
    let notAKol = 0;

    for (const seed of kols) {
      // Validate kolId format
      if (!seed.kolId || !/^-?\d+$/.test(seed.kolId)) {
        failed += 1;
        this.logger.error(`Skipping invalid seed kolId: ${seed.kolId}`);
        continue;
      }

      // Skip if already registered
      if (this.registeredChannels.has(seed.kolId)) {
        skipped += 1;
        continue;
      }

      const { title, handle, kind } = await this.resolveMetadata(
        seed.kolId,
        seed.title,
        seed.handle,
      );

      if (kind === 'unknown' || kind === 'user') {
        notAKol += 1;
        this.logger.warn(
          `Skipping seed ${seed.kolId}: resolved as kind="${kind}" (not a broadcast channel). ` +
            `KOL IDs from this seed list must reference channels/groups, not user accounts. ` +
            `Title fallback was "${title}".`,
        );
        continue;
      }

      try {
        // Mark as registered for this session
        this.registeredChannels.add(seed.kolId);
        added += 1;
        this.logger.debug(
          `Registered KOL channel ${seed.kolId} (${handle || 'no handle'}, "${title}")`,
        );
      } catch (err) {
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

    return { added, skipped, failed, notAKol };
  }

  /**
   * Returns the list of successfully registered channel IDs.
   */
  public getRegisteredChannels(): string[] {
    return Array.from(this.registeredChannels);
  }

  private parseEnvChannels(): SeedKol[] {
    const envValue = this.config.get<string>(
      'INGESTION_TELEGRAM_SEED_CHANNELS',
    );
    if (!envValue || envValue.trim().length === 0) {
      return [];
    }

    const channels: SeedKol[] = [];
    const entries = envValue.split(',').map((s) => s.trim());

    for (const entry of entries) {
      if (entry.length === 0) continue;

      // Format: "kolId|handle|title" or just "kolId"
      const parts = entry.split('|').map((s) => s.trim());
      if (parts.length === 1) {
        channels.push({ kolId: parts[0] });
      } else if (parts.length >= 2) {
        channels.push({
          kolId: parts[0],
          handle: parts[1] || undefined,
          title: parts[2] || undefined,
        });
      }
    }

    return channels;
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
    // If seed provides title, use it directly
    if (seedTitle && seedTitle.trim().length > 0) {
      const title = seedTitle.trim();
      const handle = seedHandle?.trim() || null;
      return { title, handle, kind: 'channel' };
    }

    // Attempt to resolve via MTProto
    try {
      const meta = await this.listener.resolveChannelMetadata(kolId);
      return {
        title: meta.title,
        handle: meta.handle,
        kind: meta.kind,
      };
    } catch (err) {
      // Failed to resolve — try joining the channel
      const joinResult = await this.listener
        .joinChannel(kolId)
        .catch(() => null);

      if (joinResult?.joined) {
        // Join successful — retry metadata
        try {
          const meta = await this.listener.resolveChannelMetadata(kolId);
          return { title: meta.title, handle: meta.handle, kind: meta.kind };
        } catch {
          // Still failed after join
        }
      }

      // Log reason for join failure
      const reason =
        joinResult?.error ?? (err instanceof Error ? err.message : 'Unknown');

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

      // Return placeholder
      return { title: `Telegram channel ${kolId}`, handle: null, kind: 'user' };
    }
  }
}
