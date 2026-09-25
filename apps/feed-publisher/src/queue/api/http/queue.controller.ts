import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { QueueManager } from '../../application/services/queue-manager.service';
import { QueueHealthState } from '../../application/state/queue-health.state';
import type { PublisherQueueEntry } from '../../domain/publisher-queue-entry.entity';
import { ListQueueQueryDto } from '../input/queue.input';

export interface QueueEntryView {
  readonly id: string;
  readonly contentType: string;
  readonly channelId: string;
  readonly messageId: number;
  readonly status: string;
  readonly attempts: number;
  readonly queuedAt: string;
  readonly publishedAt: string | null;
  readonly telegramMessageId: string | null;
  readonly lastError: string | null;
  readonly blockedReason: string | null;
}

export interface QueueStatsView {
  readonly pending: number;
  readonly scheduled: number;
  readonly publishing: number;
  readonly published: number;
  readonly failed: number;
  readonly blocked: number;
  readonly total: number;
  readonly lastTickAt: string | null;
  readonly lastProcessedAt: string | null;
  readonly consecutiveFailures: number;
}

function toView(entry: PublisherQueueEntry): QueueEntryView {
  return {
    id: entry.id,
    contentType: entry.contentType,
    channelId: entry.channelId,
    messageId: entry.messageId,
    status: entry.status,
    attempts: entry.attempts,
    queuedAt: entry.queuedAt.toISOString(),
    publishedAt: entry.publishedAt ? entry.publishedAt.toISOString() : null,
    telegramMessageId: entry.telegramMessageId,
    lastError: entry.lastError,
    blockedReason: entry.blockedReason,
  };
}

/**
 * Unified-queue control (`/api/queue`).
 *
 * GET /stats (pending counter for the plan acceptance probe) ·
 * GET / (?limit, ?status, newest-first) · DELETE /:id (204, 404 unknown).
 * Raw content is never rendered here — list views expose metadata only.
 */
@ApiTags('feed-publisher-queue')
@Controller('api/queue')
export class QueueController {
  public constructor(
    private readonly manager: QueueManager,
    private readonly health: QueueHealthState,
  ) {}

  @Get('stats')
  @ApiOperation({ summary: 'Unified queue depth + drain health' })
  @ApiResponse({ status: 200, description: 'Queue stats' })
  public async getStats(): Promise<QueueStatsView> {
    const counts = await this.manager.counts();
    return {
      ...counts,
      lastTickAt: this.health.lastTickAt,
      lastProcessedAt: this.health.lastProcessedAt,
      consecutiveFailures: this.health.consecutiveFailures,
    };
  }

  @Get()
  @ApiOperation({ summary: 'List queue entries (newest first)' })
  @ApiResponse({ status: 200, description: 'Queue entries' })
  public async list(
    @Query() query: ListQueueQueryDto,
  ): Promise<QueueEntryView[]> {
    const entries = await this.manager.list({
      limit: query.limit ?? 50,
      status: query.status,
    });
    return entries.map(toView);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Drop a queue entry by id' })
  @ApiResponse({ status: 204, description: 'Entry removed' })
  @ApiResponse({ status: 404, description: 'Unknown entry id' })
  public async remove(@Param('id') id: string): Promise<void> {
    const removed = await this.manager.remove(id);
    if (!removed) {
      throw new NotFoundException(`Queue entry not found: ${id}`);
    }
  }
}
