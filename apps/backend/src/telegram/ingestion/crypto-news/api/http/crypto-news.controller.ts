import * as fs from 'node:fs';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import type { Request, Response } from 'express';
import { Repository } from 'typeorm';
import { CryptoNewsMessageRepository } from 'telegram/ingestion/crypto-news/application/ports/crypto-news-message.repository';
import { CryptoNewsSourceRepository } from 'telegram/ingestion/crypto-news/application/ports/crypto-news-source.repository';
import {
  RegisterNewsSourceInput,
  RegisterNewsSourceUseCase,
} from 'telegram/ingestion/crypto-news/application/handlers/register-news-source.use-case';
import { CryptoNewsMetadataResolver } from 'telegram/ingestion/crypto-news/application/services/crypto-news-metadata-resolver.service';
import { TelegramMtprotoListenerAdapter } from 'telegram/ingestion/shared/api/mtproto/telegram-mtproto-listener.adapter';
import { TelegramMediaAttachment } from 'telegram/ingestion/shared/domain/ports/telegram-listener.port';
import { CryptoNewsMedia } from 'telegram/ingestion/crypto-news/domain/value-objects/crypto-news-media.vo';
import { StoreNewsMessageUseCase } from 'telegram/ingestion/crypto-news/application/handlers/store-news-message.use-case';
import { CryptoNewsMessageMediaEntity } from 'telegram/ingestion/crypto-news/infrastructure/persistence/typeorm/entities/crypto-news-message-media.entity';
import {
  detectMediaMimeType,
  serveMediaFile,
} from 'shared/common/http/media-serving';
import type { AppConfig } from 'shared/common/config/app.config';

export interface CryptoNewsMediaView {
  readonly id: string;
  readonly index: number;
  readonly type: string;
  readonly url: string;
  readonly mimeType: string | null;
}

interface CryptoNewsMessageView {
  readonly id: string;
  readonly channelId: string;
  readonly messageId: number;
  readonly title: string | null;
  readonly content: string;
  readonly publishedAt: string;
  readonly ingestedAt: string;
  readonly media: ReadonlyArray<CryptoNewsMediaView>;
  readonly linkPreviewUrl: string | null;
  readonly linkPreviewTitle: string | null;
  readonly linkPreviewDescription: string | null;
  readonly linkPreviewSiteName: string | null;
  readonly formattingEntities: ReadonlyArray<{
    offset: number;
    length: number;
    type: string;
    url?: string | null;
  }> | null;
  readonly groupedId: string | null;
}

interface CryptoNewsSourceView {
  readonly channelId: string;
  readonly handle: string | null;
  readonly title: string;
  readonly isActive: boolean;
  readonly lifecycleStatus: string;
  readonly addedAt: string;
}

@Controller('crypto-news')
export class CryptoNewsController {
  private readonly logger = new Logger(CryptoNewsController.name);

  constructor(
    private readonly messageRepo: CryptoNewsMessageRepository,
    private readonly sourceRepo: CryptoNewsSourceRepository,
    private readonly listener: TelegramMtprotoListenerAdapter,
    @InjectRepository(CryptoNewsMessageMediaEntity)
    private readonly mediaEntityRepo: Repository<CryptoNewsMessageMediaEntity>,
    private readonly registerSource: RegisterNewsSourceUseCase,
    private readonly metadataResolver: CryptoNewsMetadataResolver,
    private readonly storeNewsMessage: StoreNewsMessageUseCase,
    private readonly config: ConfigService,
  ) {}

  @Get('messages')
  public async listMessages(
    @Query('limit') limit?: string,
    @Query('channelId') channelId?: string,
    @Query('hours') hours?: string,
  ): Promise<ReadonlyArray<CryptoNewsMessageView>> {
    const n = Math.max(1, Math.min(500, parseInt(limit ?? '50', 10) || 50));
    const cfgHours =
      this.config.get<AppConfig>('app')?.cryptoNewsMediaRetentionHours ?? 48;
    const h = hours
      ? Math.max(1, Math.min(8760, parseInt(hours, 10) || cfgHours))
      : cfgHours;
    const since = new Date(Date.now() - h * 3600 * 1000);
    const messages = channelId
      ? await this.messageRepo.findByChannelId(channelId, n, since)
      : await this.messageRepo.findRecent(n, since);
    return Promise.all(
      messages.map(async (m) => ({
        id: m.id,
        channelId: m.channelId,
        messageId: m.messageId,
        title: m.title,
        content: m.content,
        publishedAt: m.publishedAt.toISOString(),
        ingestedAt: m.ingestedAt.toISOString(),
        media: await this.loadMediaForMessage(m.id),
        linkPreviewUrl: m.linkPreviewUrl,
        linkPreviewTitle: m.linkPreviewTitle,
        linkPreviewDescription: m.linkPreviewDescription,
        linkPreviewSiteName: m.linkPreviewSiteName,
        groupedId: m.groupedId,
        formattingEntities: (() => {
          if (!m.formattingEntities) return null;
          try {
            return JSON.parse(m.formattingEntities) as Array<{
              offset: number;
              length: number;
              type: string;
              url?: string | null;
            }>;
          } catch {
            return null;
          }
        })(),
      })),
    );
  }

  @Get('messages/:id')
  public async getMessage(
    @Param('id') id: string,
  ): Promise<CryptoNewsMessageView | null> {
    const msg = await this.messageRepo.findById(id);
    if (!msg) return null;
    return {
      id: msg.id,
      channelId: msg.channelId,
      messageId: msg.messageId,
      title: msg.title,
      content: msg.content,
      publishedAt: msg.publishedAt.toISOString(),
      ingestedAt: msg.ingestedAt.toISOString(),
      media: await this.loadMediaForMessage(msg.id),
      linkPreviewUrl: msg.linkPreviewUrl,
      linkPreviewTitle: msg.linkPreviewTitle,
      linkPreviewDescription: msg.linkPreviewDescription,
      linkPreviewSiteName: msg.linkPreviewSiteName,
      groupedId: msg.groupedId,
      formattingEntities: (() => {
        if (!msg.formattingEntities) return null;
        try {
          return JSON.parse(msg.formattingEntities) as Array<{
            offset: number;
            length: number;
            type: string;
            url?: string | null;
          }>;
        } catch {
          return null;
        }
      })(),
    };
  }

  /**
   * Look up media entity rows for a given message id and map them to
   * the public view shape. The domain `CryptoNewsMessage.media` VO does
   * NOT carry the DB-assigned UUID (only `CryptoNewsMessageMediaEntity`
   * does), so the controller must hit the entity repo directly to
   * surface a stable `id`/`url` pair in the view.
   *
   * Returns `[]` when no rows exist (messages without photos) and also
   * when the entity repo is not wired (in-memory mode in tests/dev
   * without DB) — the catch is intentional: missing table → empty
   * `media` in the view rather than a 500.
   */
  private async loadMediaForMessage(
    messageId: string,
  ): Promise<ReadonlyArray<CryptoNewsMediaView>> {
    try {
      const rows = await this.mediaEntityRepo.find({
        where: { messageId },
        order: { index: 'ASC' },
      });
      return rows.map((row) => CryptoNewsController.toMediaView(row));
    } catch (err) {
      this.logger.debug(
        `No media entity repo available for message=${messageId}: ${
          (err as Error).message
        }`,
      );
      return [];
    }
  }

  private static toMediaView(
    mediaEntity: CryptoNewsMessageMediaEntity,
  ): CryptoNewsMediaView {
    return {
      id: mediaEntity.id,
      index: mediaEntity.index,
      type: mediaEntity.type,
      url: `/crypto-news/media/${mediaEntity.id}`,
      mimeType: mediaEntity.mimeType,
    };
  }

  @Get('sources')
  public async listSources(): Promise<ReadonlyArray<CryptoNewsSourceView>> {
    const sources = await this.sourceRepo.findAll();
    return sources.map((s) => ({
      channelId: s.channelId,
      handle: s.handle,
      title: s.title,
      isActive: s.isActive,
      lifecycleStatus: s.lifecycleStatus,
      addedAt: s.addedAt.toISOString(),
    }));
  }

  /**
   * Register a Telegram channel as a crypto-news source.
   *
   * Body: `{ channelId: string; handle?: string; title?: string }`.
   * `title` is optional — when absent (or empty) the controller delegates
   * to `CryptoNewsMetadataResolver` which probes Telegram for the
   * channel's real title + handle (and joins the channel on miss).
   *
   * After registration the source is activated in-line (mirrors the
   * seeder) so the listener picks it up immediately on the next
   * `findActive()` sweep. CONFLICT (duplicate channelId) and VALIDATION
   * (non-numeric channelId / empty title) errors propagate unchanged and
   * are translated to HTTP 409 / 400 by `DomainErrorFilter`.
   */
  @Post('sources')
  @HttpCode(HttpStatus.CREATED)
  public async addSource(
    @Body() input: { channelId: string; handle?: string; title?: string },
  ): Promise<CryptoNewsSourceView> {
    const channelId = input.channelId;
    const trimmedTitle = input.title?.trim();

    let resolvedTitle: string;
    let resolvedHandle: string | null;

    if (trimmedTitle && trimmedTitle.length > 0) {
      // Caller-supplied title wins; skip resolver to honour the override.
      resolvedTitle = trimmedTitle;
      resolvedHandle = input.handle ?? null;
    } else {
      const resolved = await this.metadataResolver.resolve(channelId);
      resolvedTitle = resolved.title;
      resolvedHandle = input.handle ?? resolved.handle;
    }

    const source = await this.registerSource.execute({
      channelId,
      handle: resolvedHandle,
      title: resolvedTitle,
    } satisfies RegisterNewsSourceInput);

    // Mirror CryptoNewsSeeder: activate + persist so findActive() picks it up.
    source.activate();
    await this.sourceRepo.save(source);

    return {
      channelId: source.channelId,
      handle: source.handle,
      title: source.title,
      isActive: source.isActive,
      lifecycleStatus: source.lifecycleStatus,
      addedAt: source.addedAt.toISOString(),
    };
  }

  /**
   * On-demand historical backfill for one crypto-news source.
   * Fetches up to `limit` recent messages and routes them through the
   * news storage pipeline (dev/test only; production uses live polling).
   */
  @Get('backfill/:channelId')
  public async backfill(
    @Param('channelId') channelId: string,
    @Query('limit') limit?: string,
  ): Promise<{
    fetched: number;
    stored: number;
    skipped: number;
    channelId: string;
  }> {
    const n = Math.max(1, Math.min(100, parseInt(limit ?? '20', 10) || 20));
    const messages = await this.listener.backfill(channelId, n);
    let stored = 0;
    let skipped = 0;
    for (const raw of messages) {
      try {
        await this.storeNewsMessage.execute({
          channelId: raw.peerId,
          messageId: raw.messageId,
          title: null,
          content: raw.text,
          occurredAt: raw.occurredAt,
          ...(raw.media !== undefined
            ? { media: this.toMediaVO(raw.media) }
            : {}),
          ...(raw.entities !== undefined ? { entities: raw.entities } : {}),
        });
        stored += 1;
      } catch (err) {
        const msg = (err as Error).message;
        if (msg.includes('already exists') || msg.includes('unique')) {
          skipped += 1;
        } else {
          this.logger.warn(
            `backfill store failed for ${raw.peerId}/${raw.messageId}: ${msg}`,
          );
          skipped += 1;
        }
      }
    }
    return { fetched: messages.length, stored, skipped, channelId };
  }

  private toMediaVO(rawMedia: ReadonlyArray<TelegramMediaAttachment>) {
    return rawMedia
      .filter((m) => m.filePath !== undefined && m.filePath !== '')
      .map((m) =>
        CryptoNewsMedia.create({
          index: m.index ?? 0,
          type: m.type,
          filePath: m.filePath as string,
          mimeType: m.mimeType,
          fileSize: m.fileSize ?? null,
        }),
      );
  }

  /**
   * Serve a single crypto-news media attachment by its DB-assigned UUID.
   * 200 + binary body when the row exists and the on-disk file is readable,
   * 206 Partial Content for `Range` requests (browser `<video>` seeking).
   * 404 when the row is unknown or the file is missing on disk — never 500
   * for a stale path (the file lifecycle is decoupled from the DB row).
   * `Cache-Control: public, max-age=86400, immutable` so the dashboard's
   * `<img loading="lazy">` hits don't re-fetch on every navigation.
   */
  @Get('media/:mediaId')
  public async getMedia(
    @Param('mediaId') mediaId: string,
    @Req() req: Request,
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    const media = await this.messageRepo.findMediaById(mediaId);
    if (!media) {
      res.status(404).json({ error: 'Media not found' });
      return;
    }

    let fileBuffer: Buffer;
    try {
      fileBuffer = await fs.promises.readFile(media.filePath);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        this.logger.warn(
          `Media file missing on disk: id=${mediaId} path=${media.filePath}`,
        );
        res.status(404).json({ error: 'Media file missing on disk' });
        return;
      }
      throw err;
    }

    const mimeType = detectMediaMimeType(
      media.filePath,
      media.mimeType,
      fileBuffer,
    );

    serveMediaFile(
      res,
      req,
      fileBuffer,
      mimeType,
      'public, max-age=86400, immutable',
    );
  }
}
