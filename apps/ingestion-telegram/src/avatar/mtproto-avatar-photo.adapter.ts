import { Injectable, Logger } from '@nestjs/common';
import type { TelegramClient } from 'telegram';
import { KolAvatarPhotoPort } from './kol-avatar-photo.port';
import { TelegramClientManager } from 'core/infrastructure/services/telegram-client-manager.service';
import { TelegramPeerResolver } from 'core/infrastructure/services/telegram-peer-resolver';
import { FloodWaitHandlerService } from 'core/infrastructure/services/flood-wait-handler.service';

/**
 * MTProto profile-photo fetch for KOL avatars (Tramo 1, todo 13, P19 + P29).
 *
 * P29: no own limiter — the download runs inside the existing
 * `FloodWaitHandlerService.withRetry('kol-avatar', …)` anti-ban guard, and
 * `KolAvatarService` serializes calls so Telegram never sees a burst.
 * Refresh (explicit manual only, no periodic loop) reuses this same path.
 *
 * Null-safe by design: no client (tests/dev without session), empty photo,
 * or any Telegram error resolves to `null` (placeholder downstream) and is
 * logged at warn for a deferred explicit retry — never thrown.
 */
@Injectable()
export class MtprotoAvatarPhotoAdapter extends KolAvatarPhotoPort {
  private readonly logger = new Logger(MtprotoAvatarPhotoAdapter.name);

  public constructor(
    private readonly clients: TelegramClientManager,
    private readonly peers: TelegramPeerResolver,
    private readonly flood: FloodWaitHandlerService,
  ) {
    super();
  }

  public override async fetchChannelPhoto(
    channelId: string,
  ): Promise<Buffer | null> {
    const client: TelegramClient | null = this.clients.getClient();
    if (!client) {
      return null;
    }
    try {
      return await this.flood.withRetry('kol-avatar', async () => {
        const entity = await this.peers.resolvePeerAsChannel(client, channelId);
        const photo = await (
          client as unknown as {
            downloadProfilePhoto: (entity: unknown) => Promise<unknown>;
          }
        ).downloadProfilePhoto(entity);
        if (!Buffer.isBuffer(photo) || photo.length === 0) {
          return null;
        }
        return Buffer.from(photo);
      });
    } catch (error) {
      this.logger.warn(
        `Avatar fetch failed for ${channelId} (${error instanceof Error ? error.message : String(error)}) — placeholder served, retry via POST /api/kol-avatar/${channelId}/refresh`,
      );
      return null;
    }
  }
}
