import { Injectable, Logger } from '@nestjs/common';
import type { TelegramClient } from 'telegram';
import { MetadataPhotoPort } from './metadata-photo.port';
import { TelegramClientManager } from 'core/infrastructure/services/telegram-client-manager.service';
import { TelegramPeerResolver } from 'core/infrastructure/services/telegram-peer-resolver';
import { FloodWaitHandlerService } from 'core/infrastructure/services/flood-wait-handler.service';

/**
 * MTProto profile-photo fetch for channel metadata (P58, absorbed from
 * `MtprotoAvatarPhotoAdapter` — same behavior, new owner).
 *
 * P29: no own limiter — the download runs inside the existing
 * `FloodWaitHandlerService.withRetry('metadata-photo', …)` anti-ban guard,
 * and `MetadataService` serializes calls so Telegram never sees a burst.
 * Refresh (explicit manual only, no periodic loop) reuses this same path.
 *
 * Null-safe by design: no client (tests/dev without session), empty photo,
 * or any Telegram error resolves to `null` (placeholder downstream) and is
 * logged at warn for a deferred explicit retry — never thrown.
 */
@Injectable()
export class MtprotoMetadataPhotoAdapter extends MetadataPhotoPort {
  private readonly logger = new Logger(MtprotoMetadataPhotoAdapter.name);

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
      return await this.flood.withRetry('metadata-photo', async () => {
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
        `Metadata photo fetch failed for ${channelId} (${error instanceof Error ? error.message : String(error)}) — placeholder served, retry via POST /api/metadata/${channelId}/refresh`,
      );
      return null;
    }
  }
}
