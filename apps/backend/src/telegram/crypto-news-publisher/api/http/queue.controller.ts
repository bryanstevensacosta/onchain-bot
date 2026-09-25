import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  NotFoundException,
  Param,
  Query,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from 'shared/common/config/app.config';
import { resolveIngestionServiceUrl } from 'shared/common/config/app.config';
import { LlmConfigRepository } from 'telegram/crypto-news-publisher/application/ports/llm-config.repository';
import { PublisherQueueRepository } from 'telegram/crypto-news-publisher/application/ports/publisher-queue.repository';
import {
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { CryptoNewsSourceDto } from 'telegram/crypto-news-integration/infrastructure/http/crypto-news-ingestion-client.service';
import type {
  QueueCountsView,
  QueueEntryView,
  QueueSourceView,
} from './queue-entry.view';
import { toQueueEntryView } from './queue-entry.mapper';

export type { QueueCountsView, QueueEntryView, QueueSourceView };

/**
 * REST API for the crypto-news publisher queue.
 *
 * Endpoints (all under `/crypto-news-publisher/queue`):
 *  - GET /           List the most-recent queue entries (default 50, max 500)
 *  - GET /counts     Return pending count + today's publish count + remaining cap
 *  - DELETE /:id     Delete a publisher queue entry
 *
 * Media lives in `QueueMediaController` (GET /:id/media, same prefix).
 */
@ApiTags('crypto-news-publisher')
@Controller(['crypto-news-publisher/queue', 'feed-publisher/queue'])
export class QueueController {
  /** UTC reset hour for the 24h window (4am UTC). */
  private static readonly RESET_HOUR_UTC = 4;

  private readonly logger = new Logger(QueueController.name);
  private readonly outputChannel: string;
  private readonly ingestionBaseUrl: string;

  public constructor(
    private readonly queueRepo: PublisherQueueRepository,
    private readonly llmConfigRepo: LlmConfigRepository,
    config: ConfigService,
  ) {
    const appCfg = config.get<AppConfig>('app');
    this.outputChannel = appCfg?.publishing?.cryptoNews?.outputChannel ?? '';
    this.ingestionBaseUrl =
      appCfg?.ingestion?.serviceUrl ?? resolveIngestionServiceUrl();
  }

  @Get()
  @ApiOperation({ summary: 'List the most-recent publisher queue entries' })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Max entries (1-500, default 50)',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    description: 'Filter by entry status',
  })
  @ApiResponse({ status: 200, description: 'Queue entries (newest first)' })
  public async list(
    @Query('limit') limit?: string,
    @Query('status') status?: string,
  ): Promise<ReadonlyArray<QueueEntryView>> {
    const parsed = parseInt(limit ?? '', 10);
    const n = Math.max(1, Math.min(500, Number.isFinite(parsed) ? parsed : 50));
    const entries = await this.queueRepo.findAllForDisplay(n);
    const allSources = await this.fetchSourcesFromIngestion();
    const sourceByChannelId = new Map(allSources.map((s) => [s.channelId, s]));
    const views = await Promise.all(
      entries.map((e) =>
        toQueueEntryView(e, sourceByChannelId, this.outputChannel),
      ),
    );
    if (status) {
      return views.filter((v) => v.status === status);
    }
    return views;
  }

  @Get('counts')
  @ApiOperation({ summary: 'Pending count plus daily publish cap usage' })
  @ApiResponse({ status: 200, description: 'Queue counters' })
  public async counts(): Promise<QueueCountsView> {
    const [pending, publishedToday, cfg] = await Promise.all([
      this.countPending(),
      this.queueRepo.countPublishedToday(QueueController.RESET_HOUR_UTC),
      this.llmConfigRepo.load(),
    ]);

    const dailyCap = cfg.dailyCap;
    const remaining = Math.max(0, dailyCap - publishedToday);

    return {
      pending,
      publishedToday,
      dailyCap,
      remaining,
    };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a publisher queue entry' })
  @ApiParam({ name: 'id', description: 'Queue entry id (uuid)' })
  @ApiResponse({ status: 204, description: 'Queue entry deleted' })
  @ApiResponse({ status: 404, description: 'Unknown queue entry id' })
  public async remove(@Param('id') id: string): Promise<void> {
    const entry = await this.queueRepo.findByIdForDisplay(id);
    if (!entry) {
      throw new NotFoundException(`Queue entry ${id} not found`);
    }
    await this.queueRepo.delete(id);
  }

  private async countPending(): Promise<number> {
    const entries = await this.queueRepo.findAllForDisplay(500);
    return entries.filter((e) => e.status === 'PENDING').length;
  }

  private async fetchSourcesFromIngestion(): Promise<
    ReadonlyArray<QueueSourceView>
  > {
    try {
      const response = await fetch(
        `${this.ingestionBaseUrl}/api/feed/sources`,
        { method: 'GET', headers: { 'Content-Type': 'application/json' } },
      );
      if (!response.ok) {
        this.logger.warn(
          `Ingestion-telegram returned ${response.status} for /api/feed/sources`,
        );
        return [];
      }
      const body: unknown = await response.json();
      const sources = Array.isArray(body)
        ? (body as ReadonlyArray<CryptoNewsSourceDto>)
        : body !== null &&
            typeof body === 'object' &&
            'data' in body &&
            Array.isArray(body.data)
          ? (body as { data: ReadonlyArray<CryptoNewsSourceDto> }).data
          : [];
      return sources.map((s) => ({
        channelId: s.channelId,
        handle: s.handle,
        title: s.title,
      }));
    } catch (err) {
      this.logger.warn(
        `Failed to fetch sources from ingestion-telegram: ${(err as Error).message}`,
      );
      return [];
    }
  }
}
