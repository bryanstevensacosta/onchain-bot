import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChannelContentFilterConfigEntity } from './infrastructure/persistence/typeorm/entities/channel-content-filter-config.entity';

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
 *
 * Post db-separation todo 4: only the filter-config entity stays in the
 * backend. Sources/messages/media moved to ingestion-service's own DB.
 */
@Module({
  imports: [TypeOrmModule.forFeature([ChannelContentFilterConfigEntity])],
  exports: [TypeOrmModule],
})
export class CryptoNewsPersistenceModule {}
