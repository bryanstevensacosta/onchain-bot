import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CryptoNewsSeeder } from './seeders/crypto-news.seeder';
import { SharedModule } from '../shared/shared.module';
import { CryptoNewsSourceEntity } from './infrastructure/persistence/typeorm/entities/crypto-news-source.entity';
import { CryptoNewsSourceRepository } from './infrastructure/persistence/typeorm/repositories/crypto-news-source.repository';

/**
 * CryptoNewsModule - Crypto news channel management
 *
 * **NEW (DB-driven):**
 * - CryptoNewsSourceRepository queries active sources from backend database
 * - Used by TelegramMtprotoListenerAdapter for channel cache
 *
 * **DEPRECATED:**
 * - CryptoNewsSeeder (static seed list) is deprecated in favor of DB query
 * - Kept for backward compatibility only
 */
@Module({
  imports: [
    SharedModule,
    TypeOrmModule.forFeature([CryptoNewsSourceEntity]),
  ],
  providers: [
    CryptoNewsSeeder, // Deprecated but kept for backward compatibility
    CryptoNewsSourceRepository,
  ],
  exports: [
    CryptoNewsSeeder, // Deprecated export
    CryptoNewsSourceRepository, // New DB-driven approach
  ],
})
export class CryptoNewsModule {}
