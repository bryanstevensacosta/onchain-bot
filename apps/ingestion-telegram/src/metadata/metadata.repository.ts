import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TelegramChannelMetadataEntity } from './channel-metadata.entity';

/**
 * Repository for the centralized `telegram_channel_metadata` table (P58).
 *
 * Read-only consumers (feed/stream/media/core) query through here — they
 * hold NO local copies of handle/photo. Reads fail-open (`null`/`[]`) so
 * a DB hiccup never breaks ingestion or serving; writes throw (callers
 * log + keep the file/registration win).
 *
 * PRIVACY: `phone` is `select: false` on the entity — it is excluded from
 * every read below by construction. Never add it to a `select`, a DTO,
 * or a log line.
 */
@Injectable()
export class MetadataRepository {
  private readonly logger = new Logger(MetadataRepository.name);

  public constructor(
    @InjectRepository(TelegramChannelMetadataEntity)
    private readonly repo: Repository<TelegramChannelMetadataEntity>,
  ) {}

  /**
   * Find one identity row by Telegram id (`phone` excluded by the entity).
   */
  public async findByChannelId(
    channelId: string,
  ): Promise<TelegramChannelMetadataEntity | null> {
    try {
      const row = await this.repo.findOne({ where: { channelId } });
      return row ?? null;
    } catch (error) {
      this.logger.error(
        `Failed to find channel metadata ${channelId}: ${(error as Error).message}`,
      );
      return null;
    }
  }

  /**
   * All identity rows, newest first (`phone` excluded by the entity).
   */
  public async findAll(): Promise<
    ReadonlyArray<TelegramChannelMetadataEntity>
  > {
    try {
      return await this.repo.find({ order: { fetchedAt: 'DESC' } });
    } catch (error) {
      this.logger.error(
        `Failed to list channel metadata: ${(error as Error).message}`,
      );
      return [];
    }
  }

  /**
   * Build a transient row (not persisted). Callers fill identity fields,
   * then `save()`. `phone` may be set here (User rows, write-only).
   */
  public create(
    channelId: string,
    partial?: Partial<TelegramChannelMetadataEntity>,
  ): TelegramChannelMetadataEntity {
    return this.repo.create({
      channelId,
      title: channelId,
      peerType: null,
      kind: null,
      firstName: null,
      lastName: null,
      handle: null,
      usernames: null,
      about: null,
      isBot: false,
      verified: false,
      isScam: false,
      isFake: false,
      participantsCount: null,
      phone: null,
      avatarPath: null,
      avatarUpdatedAt: null,
      photoDcId: null,
      photoFileRef: null,
      fetchStatus: 'miss',
      ...(partial ?? {}),
    });
  }

  /**
   * Persist a metadata row (insert or update).
   */
  public async save(
    row: TelegramChannelMetadataEntity,
  ): Promise<TelegramChannelMetadataEntity> {
    const saved = await this.repo.save(row);
    this.logger.log(`Saved channel metadata: ${saved.channelId}`);
    return saved;
  }
}
