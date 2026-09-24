import { PublisherQueueEntry } from 'telegram/crypto-news-publisher/domain/entities/publisher-queue-entry.entity';
import type { QueueEntryView, QueueSourceView } from './queue-entry.view';

export async function toQueueEntryView(
  entry: PublisherQueueEntry,
  sourceByChannelId: Map<string, QueueSourceView>,
  outputChannel: string,
): Promise<QueueEntryView> {
  const source = sourceByChannelId.get(entry.channelId) ?? null;
  const sourceHandle = source?.handle ?? null;
  const sourceTitle = source?.title ?? null;

  // Telegram link to the ORIGINAL post in the source channel
  const sourceChannelForLink = entry.channelId.replace(/^-100/, '');
  const sourceTelegramUrl =
    entry.messageId && sourceHandle
      ? `https://t.me/${sourceHandle}/${entry.messageId}`
      : entry.messageId && sourceChannelForLink
        ? `https://t.me/c/${sourceChannelForLink}/${entry.messageId}`
        : null;

  // Telegram link to the PUBLISHED post (output channel)
  const outputChannelForLink = outputChannel.replace(/^-100/, '');
  const _publishedTelegramUrl =
    entry.telegramMessageId && outputChannelForLink
      ? `https://t.me/c/${outputChannelForLink}/${entry.telegramMessageId}`
      : null;

  // Telegram link to the DUPLICATE-OF source (used by Blocked Post Details modal)
  const duplicateOfSource = entry.duplicateOfChannelId
    ? (sourceByChannelId.get(entry.duplicateOfChannelId) ?? null)
    : null;
  const duplicateOfSourceHandle = duplicateOfSource?.handle ?? null;
  const duplicateOfChannelForLink =
    entry.duplicateOfChannelId?.replace(/^-100/, '') ?? null;
  const duplicateOfTelegramUrl =
    entry.duplicateOfMessageId && duplicateOfSourceHandle
      ? `https://t.me/${duplicateOfSourceHandle}/${entry.duplicateOfMessageId}`
      : entry.duplicateOfMessageId && duplicateOfChannelForLink
        ? `https://t.me/c/${duplicateOfChannelForLink}/${entry.duplicateOfMessageId}`
        : null;

  // Queue list always shows source link; DetailsModal shows published link
  const telegramUrl = sourceTelegramUrl;

  return {
    id: entry.id,
    traceId: entry.traceId,
    channelId: entry.channelId,
    sourceHandle,
    sourceTitle,
    messageId: entry.messageId,
    rawTitle: entry.rawTitle,
    rawContent: entry.rawContent,
    imagePath: entry.imagePath,
    imagePaths: entry.imagePaths,
    groupedId: entry.groupedId,
    matchedKeywordIds: entry.matchedKeywordIds,
    status: entry.status,
    messageReceivedAt: entry.messageReceivedAt.toISOString(),
    publishedAt: entry.publishedAt?.toISOString() ?? null,
    telegramMessageId: entry.telegramMessageId,
    telegramUrl,
    lastError: entry.lastError,
    attempts: entry.attempts,
    generatedContent: entry.generatedContent,
    generatedSystemPrompt: entry.generatedSystemPrompt,
    generatedUserPrompt: entry.generatedUserPrompt,
    generatedTemperature: entry.generatedTemperature,
    generatedReasoningEffort: entry.generatedReasoningEffort,
    generatedModel: entry.generatedModel,
    blockedReason: entry.blockedReason,
    duplicateOfChannelId: entry.duplicateOfChannelId,
    duplicateOfMessageId: entry.duplicateOfMessageId,
    duplicateOfEntryId: entry.duplicateOfEntryId,
    duplicateOfSourceHandle,
    duplicateOfTelegramUrl,
    displayName:
      sourceHandle?.replace(/^@/, '') ?? sourceTitle ?? entry.channelId,
  };
}
