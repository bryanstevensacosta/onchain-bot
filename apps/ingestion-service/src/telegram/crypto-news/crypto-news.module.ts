import { Module } from '@nestjs/common';
import { CryptoNewsSeeder } from './seeders/crypto-news.seeder';
import { SharedModule } from '../shared/shared.module';

/**
 * CryptoNewsModule - Crypto news channel management
 *
 * **NEW (DB-driven):**
 * - CryptoNewsSourceRepository now provided by SharedModule
 * - Used by TelegramMtprotoListenerAdapter for channel cache
 *
 * **DEPRECATED:**
 * - CryptoNewsSeeder (static seed list) is deprecated in favor of DB query
 * - Kept for backward compatibility only
 */
@Module({
  imports: [SharedModule],
  providers: [
    CryptoNewsSeeder, // Deprecated but kept for backward compatibility
  ],
  exports: [
    CryptoNewsSeeder, // Deprecated export
  ],
})
export class CryptoNewsModule {}
