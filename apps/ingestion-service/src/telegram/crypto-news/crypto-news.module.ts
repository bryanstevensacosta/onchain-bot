import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SharedModule } from '../shared/shared.module';
import { CryptoNewsMessageEntity } from './infrastructure/persistence/typeorm/entities/crypto-news-message.entity';
import { CryptoNewsMessageMediaEntity } from './infrastructure/persistence/typeorm/entities/crypto-news-message-media.entity';
import { ChannelContentFilterConfigEntity } from './infrastructure/persistence/typeorm/entities/channel-content-filter-config.entity';
import { CryptoNewsMessageRepository } from './infrastructure/persistence/typeorm/repositories/crypto-news-message.repository';
import { CryptoNewsController } from './api/http/crypto-news.controller';

/**
 * CryptoNewsModule - Crypto news channel management
 *
 * **DB-driven architecture (CENTRALIZED):**
 * - CryptoNewsSourceRepository provided by SharedModule (read-only from backend DB)
 * - CryptoNewsMessageRepository OWNS crypto_news_messages table (single source of truth)
 * - HTTP API serves messages/sources to backend staging/prod + frontend
 * - Used by TelegramMtprotoListenerAdapter for channel cache
 * - All sources loaded from backend DB via BackendChannelProviderService
 *
 * **Per AGENTS.md Ingestion-Service Architecture:**
 * - This service OWNS: crypto_news_messages, crypto_news_message_media, media files
 * - Backends/frontends READ via HTTP API (no DB replication)
 * - One ingestion-service instance feeds ALL environments (dev/staging/prod)
 *
 * **REMOVED:**
 * - CryptoNewsSeeder (static seed list) completely removed
 * - Add sources via backend API: POST /api/crypto-news/sources
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
  providers: [CryptoNewsMessageRepository],
  exports: [CryptoNewsMessageRepository],
})
export class CryptoNewsModule {}
