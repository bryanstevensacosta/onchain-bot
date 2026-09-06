import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { IdentityModule } from 'kol/identity/identity.module';
import { SharedIngestionModule } from 'telegram/ingestion/shared/shared-ingestion.module';

/**
 * KOL ingestion sub-module.
 *
 * Imports IdentityModule to resolve KolRepository and use cases.
 * Imports SharedIngestionModule to access TelegramListenerPort.
 *
 * Note: KolSeeder removed (2026-09-06). KOLs are now registered via:
 * POST /telegram-kol/identity/kols
 */
@Module({
  imports: [ConfigModule, IdentityModule, SharedIngestionModule],
  providers: [],
  exports: [],
})
export class KolIngestionModule {}
