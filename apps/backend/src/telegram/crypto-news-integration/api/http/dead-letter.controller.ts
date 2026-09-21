import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { DeadLetterService } from 'telegram/crypto-news-integration/application/services/dead-letter.service';
import type { DeadLetterQueueEntry } from 'telegram/crypto-news-integration/domain/entities/dead-letter-queue-entry.entity';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ListDeadLetterQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  public limit?: number;
}

export interface DeadLetterView {
  readonly id: string;
  readonly channelId: string;
  readonly messageId: number;
  readonly failureReason: string;
  readonly failedAt: string;
  readonly retryCount: number;
  readonly status: string;
}

export function toDeadLetterView(entry: DeadLetterQueueEntry): DeadLetterView {
  return {
    id: entry.id,
    channelId: entry.channelId,
    messageId: entry.messageId,
    failureReason: entry.failureReason,
    failedAt: entry.failedAt.toISOString(),
    retryCount: entry.retryCount,
    status: entry.status,
  };
}

/**
 * REST API for the crypto-news dead-letter queue (manual on-demand retry).
 *
 * Endpoints (under `/crypto-news/dead-letter`):
 *  - GET    /                        List captured failures (newest first)
 *  - POST   /:id/retry               Re-enqueue a PENDING entry (→ RETRIED)
 *
 * There is NO automatic retry anywhere — the operator decides per entry.
 * Unknown id → 404 (NotFoundException from the service).
 */
@Controller('crypto-news/dead-letter')
export class DeadLetterController {
  public constructor(private readonly deadLetters: DeadLetterService) {}

  @Get()
  public async list(
    @Query() query: ListDeadLetterQuery,
  ): Promise<DeadLetterView[]> {
    const entries = await this.deadLetters.list(query?.limit ?? 50);
    return entries.map(toDeadLetterView);
  }

  @Post(':id/retry')
  public async retry(@Param('id') id: string): Promise<DeadLetterView> {
    const entry = await this.deadLetters.retry(id);
    return toDeadLetterView(entry);
  }
}
