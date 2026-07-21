import { PublisherQueueEntry } from 'telegram/crypto-news-publisher/domain/entities/publisher-queue-entry.entity';
import { PublisherQueueEntity } from 'telegram/crypto-news-publisher/infrastructure/persistence/typeorm/entities/publisher-queue.entity';

/**
 * Maps between the domain aggregate `PublisherQueueEntry` and its
 * anemic TypeORM persistence shape `PublisherQueueEntity`.
 */
export class PublisherQueueMapper {
  public static toEntity(entry: PublisherQueueEntry): PublisherQueueEntity {
    const row = new PublisherQueueEntity();
    row.id = entry.id;
    row.channelId = entry.channelId;
    row.messageId = entry.messageId;
    row.rawContent = entry.rawContent;
    row.rawTitle = entry.rawTitle;
    row.imagePath = entry.imagePath;
    row.imagePaths = entry.imagePaths;
    row.groupedId = entry.groupedId;
    row.messageReceivedAt = entry.messageReceivedAt;
    row.matchedKeywordIds = entry.matchedKeywordIds;
    row.keywordTemplateId = entry.keywordTemplateId;
    row.status = entry.status;
    row.publishedAt = entry.publishedAt;
    row.telegramMessageId = entry.telegramMessageId;
    row.lastError = entry.lastError;
    row.attempts = entry.attempts;
    row.generatedContent = entry.generatedContent;
    row.generatedSystemPrompt = entry.generatedSystemPrompt;
    row.generatedUserPrompt = entry.generatedUserPrompt;
    row.generatedTemperature = entry.generatedTemperature;
    row.generatedReasoningEffort = entry.generatedReasoningEffort;
    row.blockedReason = entry.blockedReason;
    return row;
  }

  public static toDomain(row: PublisherQueueEntity): PublisherQueueEntry {
    return PublisherQueueEntry.reconstitute(row.toProps());
  }
}
