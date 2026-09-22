import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SharedModule } from '../core/shared.module';
import { CryptoNewsMessageEntity } from 'feed/infrastructure/persistence/typeorm/entities/crypto-news-message.entity';
import { TelegramFeedMessageEntity } from 'feed/infrastructure/persistence/typeorm/entities/telegram-feed-message.entity';
import { TelegramFeedMessageMediaEntity } from 'feed/infrastructure/persistence/typeorm/entities/telegram-feed-message-media.entity';
import { CryptoNewsMessageRepository } from 'feed/infrastructure/persistence/typeorm/repositories/crypto-news-message.repository';
import { TelegramFeedMessageRepository } from 'feed/infrastructure/persistence/typeorm/repositories/telegram-feed-message.repository';
import { CryptoNewsController } from 'feed/api/http/crypto-news.controller';
import { RegisterNewsSourceUseCase } from 'registry/application/use-cases/register-news-source.use-case';
import { CryptoNewsRetentionCleanupScheduler } from './infrastructure/scheduling/crypto-news-retention-cleanup.scheduler';
import { DiskMonitorService } from './infrastructure/scheduling/disk-monitor.service';

/**
 * CryptoNewsModule - Crypto news channel management
 *
 * **ARCHITECTURE CHANGE (2026-09-05):**
 * Ingestion-service is now the SOLE OWNER of crypto-news sources.
 * - RegisterNewsSourceUseCase enables POST /api/crypto-news/sources (NEW)
 * - Backend no longer writes sources (deprecated)
 *
 * **DB-driven architecture (CENTRALIZED):**
 * - CryptoNewsSourceRepository provided by SharedModule (read/write from own DB)
 * - CryptoNewsMessageRepository OWNS crypto_news_messages table (single source of truth)
 * - HTTP API serves messages/sources to backend staging/prod + frontend
 * - Used by TelegramMtprotoListenerAdapter for channel cache
 * - All sources managed via ingestion-telegram API (no backend DB writes)
 *
 * **Per AGENTS.md Ingestion-Service Architecture:**
 * - This service OWNS: crypto_news_sources, crypto_news_messages, crypto_news_message_media, media files
 * - Backends/frontends READ via HTTP API (no DB replication)
 * - One ingestion-telegram instance feeds ALL environments (dev/staging/prod)
 *
 * **REMOVED:**
 * - Static channel seed list completely removed (DB-driven only)
 * - Add sources via: POST /api/crypto-news/sources (ingestion-telegram endpoint)
 */
@Module({
  imports: [
    SharedModule,
    TypeOrmModule.forFeature([
      CryptoNewsMessageEntity,
      TelegramFeedMessageEntity,
      TelegramFeedMessageMediaEntity,
    ]),
  ],
  controllers: [CryptoNewsController],
  providers: [
    CryptoNewsMessageRepository,
    TelegramFeedMessageRepository,
    RegisterNewsSourceUseCase,
    DiskMonitorService,
    CryptoNewsRetentionCleanupScheduler,
  ],
  exports: [CryptoNewsMessageRepository, TelegramFeedMessageRepository],
})
export class RetentionModule {}
