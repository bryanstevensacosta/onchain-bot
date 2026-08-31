import { Module } from '@nestjs/common';
import { CryptoNewsSeeder } from './seeders/crypto-news.seeder';
import { SharedModule } from '../shared/shared.module';

/**
 * CryptoNewsModule - Crypto news channel seeding
 *
 * Provides CryptoNewsSeeder which registers crypto-news channels from:
 * - Environment variable `INGESTION_TELEGRAM_SEED_NEWS`
 * - Or hardcoded seed file `crypto-news.seed.ts`
 */
@Module({
  imports: [SharedModule],
  providers: [CryptoNewsSeeder],
  exports: [CryptoNewsSeeder],
})
export class CryptoNewsModule {}
