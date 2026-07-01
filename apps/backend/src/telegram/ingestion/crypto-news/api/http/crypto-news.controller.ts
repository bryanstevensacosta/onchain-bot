import { Controller, Get, Param, Query } from '@nestjs/common';
import { CryptoNewsMessageRepository } from 'telegram/ingestion/crypto-news/application/ports/crypto-news-message.repository';
import { CryptoNewsSourceRepository } from 'telegram/ingestion/crypto-news/application/ports/crypto-news-source.repository';
import { TelegramMtprotoListenerAdapter } from 'telegram/ingestion/shared/api/mtproto/telegram-mtproto-listener.adapter';

interface CryptoNewsMessageView {
  readonly id: string;
  readonly channelId: string;
  readonly messageId: number;
  readonly title: string | null;
  readonly content: string;
  readonly publishedAt: string;
  readonly ingestedAt: string;
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
  constructor(
    private readonly messageRepo: CryptoNewsMessageRepository,
    private readonly sourceRepo: CryptoNewsSourceRepository,
    private readonly listener: TelegramMtprotoListenerAdapter,
  ) {}

  @Get('messages')
  public async listMessages(
    @Query('limit') limit?: string,
    @Query('channelId') channelId?: string,
  ): Promise<ReadonlyArray<CryptoNewsMessageView>> {
    const n = Math.max(1, Math.min(500, parseInt(limit ?? '50', 10) || 50));
    const messages = channelId
      ? await this.messageRepo.findByChannelId(channelId, n)
      : await this.messageRepo.findRecent(n);
    return messages.map((m) => ({
      id: m.id,
      channelId: m.channelId,
      messageId: m.messageId,
      title: m.title,
      content: m.content,
      publishedAt: m.publishedAt.toISOString(),
      ingestedAt: m.ingestedAt.toISOString(),
    }));
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
   * On-demand historical backfill for one crypto-news source.
   * Fetches up to `limit` recent messages and routes them through the
   * news storage pipeline.
   */
  @Get('backfill/:channelId')
  public async backfill(
    @Param('channelId') channelId: string,
    @Query('limit') limit?: string,
  ): Promise<{ fetched: number; channelId: string }> {
    const n = Math.max(1, Math.min(100, parseInt(limit ?? '20', 10) || 20));
    const messages = await this.listener.backfill(channelId, n);
    return { fetched: messages.length, channelId };
  }
}
