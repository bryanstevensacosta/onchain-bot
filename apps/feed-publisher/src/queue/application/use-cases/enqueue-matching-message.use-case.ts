import { Injectable } from '@nestjs/common';
import { QueueManager } from '../services/queue-manager.service';
import { DeduplicationService } from '../../../deduplication/application/services/deduplication.service';
import { PublisherQueueEntry } from '../../domain/publisher-queue-entry.entity';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import type { FilteredFeedMessage } from '../../../matching/application/services/matching-evaluator.service';

export const MATCHING_ENQUEUE_SOURCE = 'feed-publisher';

/**
 * EnqueueMatchingMessage: matched feed -> unified queue (todo 4).
 *
 * Binds the todo 3 `MatchedMessageEnqueuePort` (via the queue adapter):
 * media-gate (requireMedia keywords skip document/video-only bundles),
 * dedup probe (exact hit on an already-tracked channel+message returns
 * null; other hits are BLOCKED with refs, never dropped silently), then
 * PENDING enqueue + markAsSeen. Every dedup interaction is fail-open —
 * an embeddings/store outage still enqueues.
 */
@Injectable()
export class EnqueueMatchingMessageUseCase {
  public constructor(
    private readonly manager: QueueManager,
    private readonly deduplication: DeduplicationService,
  ) {}

  public async execute(input: {
    message: FilteredFeedMessage;
  }): Promise<PublisherQueueEntry | null> {
    const { message } = input;
    if (
      typeof message.channelId !== 'string' ||
      message.channelId.length === 0
    ) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        'EnqueueMatchingMessage requires a non-empty channelId',
      );
    }
    const firstKeyword = message.matchedKeywords[0] as
      | { requireMedia?: boolean; templateId?: string | null; id?: string }
      | undefined;
    if (
      firstKeyword?.requireMedia === true &&
      message.media.every((m) => m.type === 'document' || m.type === 'video')
    ) {
      return null;
    }
    let duplicate = null;
    try {
      duplicate = await this.deduplication.checkDuplicate({
        source: MATCHING_ENQUEUE_SOURCE,
        channelId: message.channelId,
        messageId: message.messageId,
        content: message.content,
      });
    } catch {
      duplicate = null;
    }
    if (duplicate !== null && duplicate.isDuplicate) {
      const alreadyTracked = await this.manager.findTracked(
        message.channelId,
        message.messageId,
      );
      if (alreadyTracked !== null) {
        return null;
      }
      const entry = PublisherQueueEntry.create({
        contentType: 'crypto-news',
        channelId: message.channelId,
        messageId: message.messageId,
        rawContent: message.content,
        rawTitle: message.title,
        imagePaths: [],
        groupedId: message.groupedId,
        matchedKeywordIds: message.matchedKeywords
          .map((k) => (k as { id?: string }).id)
          .filter((id): id is string => typeof id === 'string'),
        keywordTemplateId: firstKeyword?.templateId ?? null,
      });
      entry.markBlocked(duplicate.blockedReason ?? 'Duplicate of queue', {
        channelId: duplicate.duplicateOf?.channelId ?? null,
        messageId: duplicate.duplicateOf?.messageId ?? null,
        entryId: duplicate.duplicateOf?.entryId ?? null,
      });
      await this.manager.enqueue(entry);
      return entry;
    }
    const entry = PublisherQueueEntry.create({
      contentType: 'crypto-news',
      channelId: message.channelId,
      messageId: message.messageId,
      rawContent: message.content,
      rawTitle: message.title,
      imagePaths: [],
      groupedId: message.groupedId,
      matchedKeywordIds: message.matchedKeywords
        .map((k) => (k as { id?: string }).id)
        .filter((id): id is string => typeof id === 'string'),
      keywordTemplateId: firstKeyword?.templateId ?? null,
    });
    await this.manager.enqueue(entry);
    try {
      await this.deduplication.markAsSeen({
        source: MATCHING_ENQUEUE_SOURCE,
        channelId: message.channelId,
        messageId: message.messageId,
        content: message.content,
        entryId: entry.id,
      });
    } catch {
      // Fail-open: the entry is already queued; a store outage must not
      // roll it back (mirrors the backend warn-only storeFingerprint).
    }
    return entry;
  }
}
