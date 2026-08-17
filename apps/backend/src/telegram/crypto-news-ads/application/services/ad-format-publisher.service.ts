import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { existsSync } from 'node:fs';
import * as path from 'node:path';
import type { AppConfig } from 'shared/common/config/app.config';
import { AdMediaRepository } from 'telegram/crypto-news-ads/application/ports/ad-media.repository';
import { Ad } from 'telegram/crypto-news-ads/domain/entities/ad.entity';
import {
  TelegramPublisherPort,
  type SendResult,
  type TelegramInlineKeyboard,
} from 'telegram/shared';

/**
 * Build the inline keyboard for an ad from its explicitly configured
 * `buttons` (opt-in per ad — body anchors are NOT auto-extracted into
 * buttons). Each `{ text, url }` pair becomes one URL button. Buttons are
 * grouped in rows of 3, capped at 6 total, so a button-heavy ad cannot
 * blow out the message with a huge keyboard. Returns `null` when there
 * are no buttons, so the ad publishes without a keyboard (previous
 * behavior — an ad without configured buttons gets NO replyMarkup).
 */
function buildAdInlineKeyboard(
  buttons: Array<{ text: string; url: string }> | null,
): TelegramInlineKeyboard | null {
  if (buttons === null || buttons.length === 0) return null;
  const capped = buttons.slice(0, 6);
  const rows: Array<Array<{ text: string; url: string }>> = [];
  for (let i = 0; i < capped.length; i += 3) {
    rows.push(capped.slice(i, i + 3));
  }
  return rows;
}

/**
 * Format-and-send for crypto-news ads. Shared by the rotation publisher
 * (`PublishAdUseCase`) and the manual "publish now" flow: given an ad,
 * pick the Telegram Bot API method for the ad's format and publish to
 * the SAME crypto-news output channel. All formats publish with
 * `parseMode: 'HTML'` (the sanitizer converts raw URLs to `<a href>` and
 * strips anything outside the Telegram HTML allowlist).
 *
 * - `text`: pure text post via `sendMessage` — any `imageMediaId` is
 *   ignored (no media resolution, no disk access).
 * - `photo`: `sendPhoto` when the ad has a resolvable local image
 *   (`imageMediaId` → media row → file on disk), `sendMessage`
 *   otherwise. Missing media row or file degrades to text with a warn.
 * - `video`: `sendVideo` with `supportsStreaming: true`; missing media
 *   degrades to `sendMessage`.
 * - `album`: `sendMediaGroup` after resolving EVERY media id; if any
 *   id is missing the publish is skipped and routed to failure
 *   handling (the ad stays at the front of the rotation).
 */
@Injectable()
export class AdFormatPublisherService {
  private readonly logger = new Logger(AdFormatPublisherService.name);

  public constructor(
    private readonly publisher: TelegramPublisherPort,
    private readonly adMediaRepo: AdMediaRepository,
    private readonly config: ConfigService,
  ) {}

  /**
   * Pick the Telegram Bot API method for the ad's format and send it.
   * Never throws — media-degradation and album-missing paths return a
   * `SendResult` with `ok: false` so the caller decides on failure
   * handling.
   */
  public async publish(ad: Ad): Promise<SendResult> {
    const keyboard = buildAdInlineKeyboard(ad.buttons);
    const withKeyboard = keyboard === null ? {} : { replyMarkup: keyboard };
    switch (ad.format) {
      case 'video': {
        const videoPath = await this.resolveMediaPath(ad.videoMediaId, ad.id);
        if (videoPath === null) {
          return this.publisher.sendMessage('', ad.body, undefined, {
            parseMode: 'HTML',
            ...withKeyboard,
          });
        }
        return this.publisher.sendVideo('', ad.body, videoPath, {
          parseMode: 'HTML',
          supportsStreaming: true,
          ...withKeyboard,
        });
      }
      case 'album': {
        const albumPaths = await this.resolveAlbumPaths(ad);
        if (albumPaths === null) {
          return {
            ok: false,
            messageId: null,
            error: `ad ${ad.id} album media missing — skipping`,
          };
        }
        return this.publisher.sendMediaGroup('', ad.body, albumPaths, {
          parseMode: 'HTML',
          ...withKeyboard,
        });
      }
      case 'text': {
        // Pure text post — imageMediaId is deliberately ignored.
        return this.publisher.sendMessage('', ad.body, undefined, {
          parseMode: 'HTML',
          ...withKeyboard,
        });
      }
      case 'photo': {
        const mediaPath = await this.resolveMediaPath(ad.imageMediaId, ad.id);
        if (mediaPath === null) {
          return this.publisher.sendMessage('', ad.body, undefined, {
            parseMode: 'HTML',
            ...withKeyboard,
          });
        }
        return this.publisher.sendPhoto('', ad.body, mediaPath, {
          parseMode: 'HTML',
          ...withKeyboard,
        });
      }
      default: {
        return this.publisher.sendMessage('', ad.body, undefined, {
          parseMode: 'HTML',
          ...withKeyboard,
        });
      }
    }
  }

  /**
   * Resolve the absolute on-disk path for a media id, or `null` when
   * the id is absent, the media row is gone, or the file is missing
   * from disk. Any of those degrades the publish to `sendMessage` with
   * a warn — the publish loop must never crash on a stale media ref.
   */
  private async resolveMediaPath(
    mediaId: string | null,
    adId: string,
  ): Promise<string | null> {
    if (mediaId === null) {
      return null;
    }
    const media = await this.adMediaRepo.findById(mediaId);
    if (media === null) {
      this.logger.warn(
        `ad ${adId} has mediaId ${mediaId} but no media row — ` +
          `publishing as text`,
      );
      return null;
    }
    const appCfg = this.config.getOrThrow<AppConfig>('app');
    const absPath = path.join(appCfg.uploadsRoot, media.filePath);
    if (!existsSync(absPath)) {
      this.logger.warn(
        `ad ${adId} media file missing at ${absPath} — publishing as text`,
      );
      return null;
    }
    return absPath;
  }

  /**
   * Resolve the absolute on-disk paths for an album, or `null` when any
   * media id is missing (no row or no file). The album is skipped as a
   * whole — a partial album would look broken in Telegram.
   */
  private async resolveAlbumPaths(ad: Ad): Promise<string[] | null> {
    if (ad.albumMediaIds === null || ad.albumMediaIds.length === 0) {
      return null;
    }
    const appCfg = this.config.getOrThrow<AppConfig>('app');
    const paths: string[] = [];
    for (const mediaId of ad.albumMediaIds) {
      const media = await this.adMediaRepo.findById(mediaId);
      if (media === null) {
        this.logger.warn(
          `ad ${ad.id} album media ${mediaId} has no media row — ` +
            `skipping ad`,
        );
        return null;
      }
      const absPath = path.join(appCfg.uploadsRoot, media.filePath);
      if (!existsSync(absPath)) {
        this.logger.warn(
          `ad ${ad.id} album media file missing at ${absPath} — ` +
            `skipping ad`,
        );
        return null;
      }
      paths.push(absPath);
    }
    return paths;
  }
}
