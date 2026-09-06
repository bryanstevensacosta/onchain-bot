import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SharedModule } from '../shared/shared.module';
import { CryptoNewsMessageEntity } from './infrastructure/persistence/typeorm/entities/crypto-news-message.entity';
import { CryptoNewsMessageMediaEntity } from './infrastructure/persistence/typeorm/entities/crypto-news-message-media.entity';
import { ChannelContentFilterConfigEntity } from './infrastructure/persistence/typeorm/entities/channel-content-filter-config.entity';
import { CryptoNewsMessageRepository } from './infrastructure/persistence/typeorm/repositories/crypto-news-message.repository';
import { CryptoNewsController } from './api/http/crypto-news.controller';
import { RegisterNewsSourceUseCase } from './application/use-cases/register-news-source.use-case';

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
 * - All sources managed via ingestion-service API (no backend DB writes)
 *
 * **Per AGENTS.md Ingestion-Service Architecture:**
 * - This service OWNS: crypto_news_sources, crypto_news_messages, crypto_news_message_media, media files
 * - Backends/frontends READ via HTTP API (no DB replication)
 * - One ingestion-service instance feeds ALL environments (dev/staging/prod)
 *
 * **REMOVED:**
 * - CryptoNewsSeeder (static seed list) completely removed
 * - Add sources via: POST /api/crypto-news/sources (ingestion-service endpoint)
 */
@Module({
  imports: [
    SharedModule,
    TypeOrmModule.forFeature([
      CryptoNewsMessageEntity,
      CryptoNewsMessageMediaEntity,
      ChannelContentFilterConfigEntity,
    ]),
  ],
  controllers: [CryptoNewsController],
  providers: [CryptoNewsMessageRepository, RegisterNewsSourceUseCase],
  exports: [CryptoNewsMessageRepository],
})
export class CryptoNewsModule {}
