import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { KolSeeder } from 'telegram/ingestion/kol/seeders/kol.seeder';

/**
 * KOL ingestion sub-module.
 *
 * Owns the KOL seed list and seeder. Provides KolSeeder which is invoked
 * by IngestionCoordinator (in telegram/ingestion/shared/) on application
 * bootstrap. Does NOT auto-start listening — the coordinator collects all
 * channels (KOL + crypto-news) and starts a single subscription.
 *
 * Dependencies on kol/identity (RegisterKolUseCase, KolRepository,
 * ResolvedKolMetadataRepository) are resolved via DI — no IdentityModule
 * import here to avoid circular dependencies.
 */
@Module({
  imports: [ConfigModule],
  providers: [KolSeeder],
  exports: [KolSeeder],
})
export class KolIngestionModule {}
