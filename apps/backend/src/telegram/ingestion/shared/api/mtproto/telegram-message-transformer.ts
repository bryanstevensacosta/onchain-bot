import type {
  TelegramRawMessage,
  TelegramMediaAttachment,
} from 'telegram/ingestion/shared/domain/ports/telegram-listener.port';
import type { RawTelegramMessage } from './telegram-mtproto.utils';

export function normalizeEntityType(className?: string): string {
  const map: Record<string, string> = {
    MessageEntityUrl: 'url',
    MessageEntityTextUrl: 'text_url',
    MessageEntityBold: 'bold',
    MessageEntityItalic: 'italic',
    MessageEntityCode: 'code',
    MessageEntityPre: 'pre',
    MessageEntityStrike: 'strike',
    MessageEntityUnderline: 'underline',
    MessageEntitySpoiler: 'spoiler',
    MessageEntityMention: 'mention',
    MessageEntityHashtag: 'hashtag',
    MessageEntityCashtag: 'cashtag',
  };
  return map[className ?? ''] ?? 'unknown';
}

export function transformMessage(
  peerId: string,
  rawMsg: RawTelegramMessage,
  media: ReadonlyArray<TelegramMediaAttachment> | undefined,
): TelegramRawMessage {
  return {
    peerId,
    messageId: rawMsg.id,
    text: rawMsg.message ?? '',
    occurredAt: new Date(rawMsg.date * 1000),
    entities: (rawMsg.entities ?? []).map((e) => ({
      offset: e.offset,
      length: e.length,
      type: normalizeEntityType(e.className),
      ...(e.url ? { url: e.url } : {}),
    })),
    ...(media ? { media } : {}),
    groupedId: rawMsg.groupedId,
  };
}
