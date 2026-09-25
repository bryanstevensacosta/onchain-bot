import { PublisherQueueEntry } from '../../../../domain/publisher-queue-entry.entity';
import type { PublisherQueueStatus } from '../../../../domain/publisher-queue-status';
import { PublisherQueueOrmEntity } from '../publisher-queue.orm-entity';

/**
 * Domain <-> persistence mapper for `PublisherQueueEntry` (unwired GAP-1).
 */
export class PublisherQueueMapper {
  public static toRow(entry: PublisherQueueEntry): PublisherQueueOrmEntity {
    const row = new PublisherQueueOrmEntity();
    row.id = entry.id;
    row.contentType = entry.contentType;
    row.channelId = entry.channelId;
    row.messageId = entry.messageId;
    row.rawContent = entry.rawContent;
    row.rawTitle = entry.rawTitle;
    row.imagePaths = [...entry.imagePaths];
    row.groupedId = entry.groupedId;
    row.messageReceivedAt = entry.messageReceivedAt;
    row.queuedAt = entry.queuedAt;
    row.matchedKeywordIds = [...entry.matchedKeywordIds];
    row.keywordTemplateId = entry.keywordTemplateId;
    row.status = entry.status;
    row.attempts = entry.attempts;
    row.publishedAt = entry.publishedAt;
    row.telegramMessageId = entry.telegramMessageId;
    row.generatedContent = entry.generatedContent;
    row.lastError = entry.lastError;
    row.blockedReason = entry.blockedReason;
    row.duplicateOfChannelId = entry.duplicateOfChannelId;
    row.duplicateOfMessageId = entry.duplicateOfMessageId;
    row.duplicateOfEntryId = entry.duplicateOfEntryId;
    return row;
  }

  public static toDomain(row: PublisherQueueOrmEntity): PublisherQueueEntry {
    return PublisherQueueEntry.reconstitute({
      id: row.id,
      contentType: row.contentType,
      channelId: row.channelId,
      messageId: row.messageId,
      rawContent: row.rawContent,
      rawTitle: row.rawTitle,
      imagePaths: row.imagePaths ?? [],
      groupedId: row.groupedId,
      messageReceivedAt: row.messageReceivedAt,
      queuedAt: row.queuedAt,
      matchedKeywordIds: row.matchedKeywordIds ?? [],
      keywordTemplateId: row.keywordTemplateId,
      status: row.status as PublisherQueueStatus,
      attempts: row.attempts,
      publishedAt: row.publishedAt,
      telegramMessageId: row.telegramMessageId,
      generatedContent: row.generatedContent,
      lastError: row.lastError,
      blockedReason: row.blockedReason,
      duplicateOfChannelId: row.duplicateOfChannelId,
      duplicateOfMessageId: row.duplicateOfMessageId,
      duplicateOfEntryId: row.duplicateOfEntryId,
    });
  }
}
