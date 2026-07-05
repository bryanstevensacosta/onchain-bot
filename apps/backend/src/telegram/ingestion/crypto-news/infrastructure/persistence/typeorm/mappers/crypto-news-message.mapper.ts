import { CryptoNewsMessage } from 'telegram/ingestion/crypto-news/domain/entities/crypto-news-message.entity';
import { CryptoNewsMedia } from 'telegram/ingestion/crypto-news/domain/value-objects/crypto-news-media.vo';
import { CryptoNewsMessageEntity } from 'telegram/ingestion/crypto-news/infrastructure/persistence/typeorm/entities/crypto-news-message.entity';
import { CryptoNewsMessageMediaEntity } from 'telegram/ingestion/crypto-news/infrastructure/persistence/typeorm/entities/crypto-news-message-media.entity';

/**
 * Maps between the domain entity `CryptoNewsMessage` and its anemic
 * TypeORM persistence shape `CryptoNewsMessageEntity`.
 *
 * Media mapping rules:
 *  - `id` is intentionally left unset on the child row; the DB auto-generates
 *    it on insert via `@PrimaryGeneratedColumn('uuid')`.
 *  - `message` (parent relation) is intentionally left unset; TypeORM wires it
 *    at save time via the parent's `OneToMany` cascade.
 *  - `messageId` (FK column) is intentionally left unset; TypeORM populates it
 *    from the freshly-inserted parent's `id` during cascading insert.
 *  - `createdAt` is left unset; `@CreateDateColumn` fills it at INSERT time.
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
    row.linkPreviewUrl = message.linkPreviewUrl;
    row.linkPreviewTitle = message.linkPreviewTitle;
    row.linkPreviewDescription = message.linkPreviewDescription;
    row.linkPreviewSiteName = message.linkPreviewSiteName;
    row.messageEntities = message.formattingEntities;
    row.groupedId = message.groupedId;
    row.media = (message.media ?? []).map((m) =>
      CryptoNewsMessageMapper.mediaToEntity(m),
    );
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
      linkPreviewUrl: row.linkPreviewUrl ?? null,
      linkPreviewTitle: row.linkPreviewTitle ?? null,
      linkPreviewDescription: row.linkPreviewDescription ?? null,
      linkPreviewSiteName: row.linkPreviewSiteName ?? null,
      formattingEntities: row.messageEntities ?? null,
      groupedId: row.groupedId ?? null,
      media: (row.media ?? []).map((m) =>
        CryptoNewsMessageMapper.mediaToDomain(m),
      ),
    });
  }

  /**
   * Map a single domain `CryptoNewsMedia` to its anemic TypeORM shape.
   * See class-level docblock for the rationale on omitted fields.
   */
  private static mediaToEntity(
    media: CryptoNewsMedia,
  ): CryptoNewsMessageMediaEntity {
    const row = new CryptoNewsMessageMediaEntity();
    row.index = media.index;
    row.type = media.type;
    row.filePath = media.filePath;
    row.mimeType = media.mimeType;
    row.fileSize = media.fileSize;
    return row;
  }

  /**
   * Map a single `CryptoNewsMessageMediaEntity` back to the domain VO.
   * `reconstitute()` skips validation — values originate from a trusted
   * persistence read so missing/malformed rows surface as runtime VO
   * invariants rather than mapper-layer rejections.
   */
  private static mediaToDomain(
    entity: CryptoNewsMessageMediaEntity,
  ): CryptoNewsMedia {
    return CryptoNewsMedia.reconstitute({
      index: entity.index,
      type: entity.type,
      filePath: entity.filePath,
      mimeType: entity.mimeType,
      fileSize: entity.fileSize,
    });
  }
}
