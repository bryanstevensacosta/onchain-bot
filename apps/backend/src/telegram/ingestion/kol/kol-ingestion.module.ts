import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { KolSeeder } from 'telegram/ingestion/kol/seeders/kol.seeder';
import { IdentityModule } from 'kol/identity/identity.module';
import { SharedIngestionModule } from 'telegram/ingestion/shared/shared-ingestion.module';

/**
 * KOL ingestion sub-module.
 *
 * Owns the KOL seed list and seeder. Provides KolSeeder which is invoked
 * by IngestionCoordinator (in telegram-ingestion.module.ts root) on
 * application bootstrap.
 *
 * Imports IdentityModule to resolve KolRepository, RegisterKolUseCase,
 * ResolvedKolMetadataRepository. Imports SharedIngestionModule to access
 * TelegramListenerPort (for metadata resolution). No circular dependency:
 * IdentityModule does not import KolIngestionModule, and
 * SharedIngestionModule does not import KolIngestionModule.
 */
@Module({
  imports: [ConfigModule, IdentityModule, SharedIngestionModule],
  providers: [KolSeeder],
  exports: [KolSeeder],
})
export class KolIngestionModule {}
