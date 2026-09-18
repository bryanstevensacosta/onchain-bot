import { Module } from '@nestjs/common';
import { KolSeeder } from './seeders/kol.seeder';
import { SharedModule } from '../shared/shared.module';

/**
 * KolModule - KOL channel seeding
 *
 * Provides KolSeeder which registers KOL channels from:
 * - Environment variable `INGESTION_TELEGRAM_SEED_CHANNELS`
 * - Or hardcoded seed file `kol.seed.ts`
 */
@Module({
  imports: [SharedModule],
  providers: [KolSeeder],
  exports: [KolSeeder],
})
export class KolModule {}
