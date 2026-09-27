import { Injectable, Logger } from '@nestjs/common';
import { ThreadsQueueEntry } from '../domain/threads-queue-entry.entity';
import { ThreadsQueueRepository } from '../ports/threads-queue.repository';
import { ThreadsKeyword } from '../domain/threads-keyword.entity';

export interface EnqueueThreadsMessageDto {
  readonly channelId: string;
  readonly messageId: number;
  readonly content: string;
  readonly matchedKeywords: ThreadsKeyword[];
}

/**
 * Enqueue use-case (backend parity): idempotent by (channelId, messageId),
 * THREADS_MAX_QUEUE_DEPTH=100, NEVER rejects by length.
 */
@Injectable()
export class EnqueueThreadsMessageUseCase {
  public static readonly THREADS_MAX_QUEUE_DEPTH = 100;

  private readonly logger = new Logger(EnqueueThreadsMessageUseCase.name);

  public constructor(private readonly queueRepo: ThreadsQueueRepository) {}

  public async execute(
    message: EnqueueThreadsMessageDto,
  ): Promise<ThreadsQueueEntry | null> {
    if (!message.channelId?.trim()) {
      throw new Error('EnqueueThreadsMessageUseCase: missing channelId');
    }
    const duplicate = await this.queueRepo.findByChannelIdAndMessageId(
      message.channelId,
      message.messageId,
    );
    if (duplicate !== null) {
      if (duplicate.status === 'PENDING' || duplicate.status === 'PUBLISHED') {
        this.logger.debug(
          `message ${message.channelId}:${message.messageId} already ${duplicate.status} — skipping`,
        );
        return duplicate;
      }
      if (duplicate.status === 'FAILED' && this.isBlocking(duplicate.lastError)) {
        return duplicate;
      }
      await this.queueRepo.delete(duplicate.id);
    }
    const entry = ThreadsQueueEntry.create({
      channelId: message.channelId,
      messageId: message.messageId,
      rawContent: message.content,
      matchedKeywordIds: message.matchedKeywords.map((k) => k.id),
    });
    await this.queueRepo.enqueue(entry);
    return entry;
  }

  private isBlocking(reason: string | null): boolean {
    if (!reason) {
      return false;
    }
    const r = reason.toLowerCase();
    return (
      r.includes('non-latin') ||
      r.includes('policy') ||
      r.includes('blacklist') ||
      r.includes('honeypot') ||
      r.includes('scam') ||
      r.includes('rug')
    );
  }
}
