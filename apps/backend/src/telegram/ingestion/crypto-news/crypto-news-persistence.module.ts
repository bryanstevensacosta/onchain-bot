import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CryptoNewsSourceEntity } from 'telegram/ingestion/crypto-news/infrastructure/persistence/typeorm/entities/crypto-news-source.entity';
import { CryptoNewsMessageEntity } from 'telegram/ingestion/crypto-news/infrastructure/persistence/typeorm/entities/crypto-news-message.entity';
import { CryptoNewsMessageMediaEntity } from 'telegram/ingestion/crypto-news/infrastructure/persistence/typeorm/entities/crypto-news-message-media.entity';
import { ChannelContentFilterConfigEntity } from 'telegram/ingestion/crypto-news/infrastructure/persistence/typeorm/entities/channel-content-filter-config.entity';

/**
 * **CryptoNewsPersistenceModule**
 *
 * Separate module for TypeORM entity registration to avoid deadlock.
 *
 * **Problem:** `CryptoNewsIngestionModule` uses `forwardRef(() => SharedIngestionModule)`
 * to resolve circular dependency (SharedIngestionModule → TelegramMtprotoListenerAdapter
 * → CryptoNewsMediaDownloader ← CryptoNewsIngestionModule).
 *
 * When `TypeOrmModule.forFeature([...])` is in the same module as `forwardRef(...)`,
 * NestJS module graph resolution deadlocks indefinitely during `app.listen()`.
 *
 * **Solution:** Extract TypeORM entity registration to this separate module,
 * import it BEFORE the module with forwardRef in the parent module chain.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      CryptoNewsSourceEntity,
      CryptoNewsMessageEntity,
      CryptoNewsMessageMediaEntity,
      ChannelContentFilterConfigEntity,
    ]),
  ],
  exports: [TypeOrmModule],
})
export class CryptoNewsPersistenceModule {}
