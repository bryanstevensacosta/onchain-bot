import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SharedModule } from '../core/shared.module';
import { TelegramFeedMessageEntity } from 'feed/infrastructure/persistence/typeorm/entities/telegram-feed-message.entity';
import { TelegramFeedMessageMediaEntity } from 'feed/infrastructure/persistence/typeorm/entities/telegram-feed-message-media.entity';
import { TelegramFeedMessageRepository } from 'feed/infrastructure/persistence/typeorm/repositories/telegram-feed-message.repository';
import { SourcesController } from 'registry/api/http/sources.controller';
import { FeedController } from 'feed/api/http/feed.controller';
import { RegisterNewsSourceUseCase } from 'registry/application/use-cases/register-news-source.use-case';
import { AvatarModule } from '../avatar/avatar.module';
import { FeedRetentionCleanupScheduler } from './infrastructure/scheduling/feed-retention-cleanup.scheduler';
import { DiskMonitorService } from './infrastructure/scheduling/disk-monitor.service';

/**
 * RetentionModule - Unified feed channel management + retention.
 *
 * Ingestion-service is the SOLE OWNER of the feed catalog and hot data:
 * - RegisterNewsSourceUseCase enables POST /api/feed/sources (backed by
 *   `telegram_feed_sources` via TelegramFeedSourceRepository from SharedModule)
 * - SourcesController (registry/) serves feed source CRUD at /api/feed/sources*
 * - FeedController (feed/) serves message reads + stats at /api/feed/messages*
 * - Backend no longer writes sources (deprecated)
 *
 * DB-driven architecture (CENTRALIZED):
 * - TelegramFeedSourceRepository provided by SharedModule (read/write from own DB)
 * - TelegramFeedMessageRepository OWNS telegram_feed_messages table (single source of truth)
 * - HTTP API serves messages/sources to backend staging/prod + frontend
 * - Used by TelegramMtprotoListenerAdapter for channel cache
 * - All sources managed via ingestion-telegram API (no backend DB writes)
 *
 * Per AGENTS.md Ingestion-Service Architecture:
 * - This service OWNS: telegram_feed_sources, telegram_feed_messages, telegram_feed_message_media, media files
 * - Backends/frontends READ via HTTP API (no DB replication)
 * - One ingestion-telegram instance feeds ALL environments (dev/staging/prod)
 *
 * REMOVED:
 * - Static channel seed list completely removed (DB-driven only)
 * - Add sources via: POST /api/feed/sources (ingestion-telegram endpoint)
 * - Legacy feed controller/entities/repos cut in feed-unification item 5
 */
@Module({
  imports: [
    SharedModule,
    AvatarModule, // KOL avatars (P19): controller + fetch-once for RegisterNewsSourceUseCase
    TypeOrmModule.forFeature([
      TelegramFeedMessageEntity,
      TelegramFeedMessageMediaEntity,
    ]),
  ],
  controllers: [SourcesController, FeedController],
  providers: [
    TelegramFeedMessageRepository,
    RegisterNewsSourceUseCase,
    DiskMonitorService,
    FeedRetentionCleanupScheduler,
  ],
  exports: [TelegramFeedMessageRepository],
})
export class RetentionModule {}
