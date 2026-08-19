import { Injectable, Inject, forwardRef, Logger } from '@nestjs/common';
import { Api } from 'telegram';
import type { TelegramMediaAttachment } from 'telegram/ingestion/shared/domain/ports/telegram-listener.port';
import { FloodWaitHandlerService } from 'telegram/ingestion/shared/infrastructure/services/flood-wait-handler.service';
import { TelegramClientManager } from 'telegram/ingestion/shared/infrastructure/services/telegram-client-manager.service';
import { TelegramPeerResolver } from 'telegram/ingestion/shared/infrastructure/services/telegram-peer-resolver';
import { CryptoNewsMediaDownloader } from 'telegram/ingestion/crypto-news/application/ports/crypto-news-media-downloader.port';
import {
  coerceToLong,
  safeToString,
  isRefreshableDownloadError,
} from 'telegram/ingestion/shared/api/mtproto/telegram-mtproto.utils';

@Injectable()
export class TelegramMediaDownloadService {
  private readonly logger = new Logger(TelegramMediaDownloadService.name);

  constructor(
    private readonly floodWaitHandler: FloodWaitHandlerService,
    @Inject(forwardRef(() => CryptoNewsMediaDownloader))
    private readonly mediaDownloader: CryptoNewsMediaDownloader,
    private readonly peerResolver: TelegramPeerResolver,
    private readonly clientManager: TelegramClientManager,
  ) {}

  async downloadAndSave(
    peerId: string,
    msgId: number,
    attachment: TelegramMediaAttachment,
    rawMedia: Api.TypeMessageMedia | undefined,
  ): Promise<ReadonlyArray<TelegramMediaAttachment> | undefined> {
    if (!rawMedia) {
      this.logger.warn(
        `downloadAndSave(${peerId}:${msgId}) — msg.media is null`,
      );
      return undefined;
    }

    // gramjs.downloadMedia handles MessageMediaWebPage internally
    const buffer = await this.floodWaitHandler.withRetry(
      `media-download:${peerId}:${msgId}`,
      () => this.clientManager.getClient()!.downloadMedia(rawMedia, {}),
    );
    if (buffer === undefined || buffer instanceof Buffer === false) {
      throw new Error('downloadMedia returned no data');
    }
    const downloaded = await this.mediaDownloader.saveToDisk(
      peerId,
      msgId,
      0,
      attachment,
      buffer,
    );
    return [
      {
        ...attachment,
        mimeType: downloaded.mimeType,
        filePath: downloaded.filePath,
        fileSize: downloaded.fileSize,
        index: 0,
      },
    ];
  }

  async downloadWithRefresh(
    peerId: string,
    msgId: number,
    attachment: TelegramMediaAttachment,
    msg: { id: number; media?: unknown },
    originalError: unknown,
  ): Promise<ReadonlyArray<TelegramMediaAttachment> | undefined> {
    try {
      const client = this.clientManager.getClient();
      if (!client || !isRefreshableDownloadError(originalError))
        return undefined;

      this.logger.warn(
        `Refreshing message ${peerId}:${msgId} after download error`,
      );
      const peer = await this.peerResolver.resolvePeerAsChannel(client, peerId);
      const refreshed = await this.floodWaitHandler.withRetry(
        `media-refresh:${peerId}:${msgId}`,
        () => client.getMessages(peer, { ids: [msgId] }),
      );
      const fresh = (Array.isArray(refreshed) ? refreshed[0] : refreshed) as
        | {
            media?: {
              photo?: {
                sizes?: unknown[];
                id?: unknown;
                accessHash?: unknown;
                fileReference?: unknown;
              };
            };
          }
        | undefined;
      const freshPhoto = fresh?.media?.photo;
      if (freshPhoto?.sizes && freshPhoto.sizes.length > 0) {
        const freshFileRef = Buffer.isBuffer(freshPhoto.fileReference)
          ? freshPhoto.fileReference
          : Buffer.from(
              Array.isArray(freshPhoto.fileReference)
                ? freshPhoto.fileReference
                : [],
            );
        const freshPhotoMedia = new Api.MessageMediaPhoto({
          photo: new Api.Photo({
            id: coerceToLong(
              typeof freshPhoto.id === 'bigint'
                ? freshPhoto.id
                : safeToString(freshPhoto.id),
            ),
            accessHash: coerceToLong(
              typeof freshPhoto.accessHash === 'bigint'
                ? freshPhoto.accessHash
                : safeToString(freshPhoto.accessHash),
            ),
            fileReference: freshFileRef,
            date: attachment.date ?? 0,
            sizes: freshPhoto.sizes as never,
            dcId: attachment.dcId ?? 0,
          }),
        });
        const buffer = await this.floodWaitHandler.withRetry(
          `media-download-retry:${peerId}:${msgId}`,
          () => client.downloadMedia(freshPhotoMedia, {}),
        );
        if (buffer instanceof Buffer && buffer.length > 0) {
          const downloaded = await this.mediaDownloader.saveToDisk(
            peerId,
            msgId,
            0,
            attachment,
            buffer,
          );
          return [
            {
              ...attachment,
              mimeType: downloaded.mimeType,
              filePath: downloaded.filePath,
              fileSize: downloaded.fileSize,
              index: 0,
            },
          ];
        }
      }
    } catch {
      // refresh also failed — fall through
    }
    return undefined;
  }
}
