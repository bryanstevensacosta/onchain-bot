import { CryptoNewsMessage } from 'telegram/ingestion/crypto-news/domain/entities/crypto-news-message.entity';
import { CryptoNewsMessageEntity } from 'telegram/ingestion/crypto-news/infrastructure/persistence/typeorm/entities/crypto-news-message.entity';

/**
 * Maps between the domain entity `CryptoNewsMessage` and its anemic
 * TypeORM persistence shape `CryptoNewsMessageEntity`.
 */
export class CryptoNewsMessageMapper {
  public static toEntity(message: CryptoNewsMessage): CryptoNewsMessageEntity {
    const row = new CryptoNewsMessageEntity();
    row.id = message.id;
    row.channelId = message.channelId;
    row.messageId = message.messageId;
    row.title = message.title;
    row.content = message.content;
    row.publishedAt = message.publishedAt;
    row.ingestedAt = message.ingestedAt;
    return row;
  }

  public static toDomain(row: CryptoNewsMessageEntity): CryptoNewsMessage {
    return CryptoNewsMessage.reconstitute({
      id: row.id,
      channelId: row.channelId,
      messageId: row.messageId,
      title: row.title,
      content: row.content,
      publishedAt: row.publishedAt,
      ingestedAt: row.ingestedAt,
    });
  }
}
