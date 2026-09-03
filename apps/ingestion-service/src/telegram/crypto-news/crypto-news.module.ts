import { Module } from '@nestjs/common';
import { SharedModule } from '../shared/shared.module';

/**
 * CryptoNewsModule - Crypto news channel management
 *
 * **DB-driven architecture:**
 * - CryptoNewsSourceRepository provided by SharedModule
 * - Used by TelegramMtprotoListenerAdapter for channel cache
 * - All sources loaded from backend DB via BackendChannelProviderService
 *
 * **REMOVED:**
 * - CryptoNewsSeeder (static seed list) completely removed
 * - Add sources via backend API: POST /api/crypto-news/sources
 */
@Module({
  imports: [SharedModule],
  providers: [],
  exports: [],
})
export class CryptoNewsModule {}
