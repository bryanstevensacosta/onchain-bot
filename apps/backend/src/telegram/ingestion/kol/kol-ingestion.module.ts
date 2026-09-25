import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { IdentityModule } from 'kol/identity/identity.module';
import { SharedIngestionModule } from 'telegram/ingestion/shared/shared-ingestion.module';

/**
 * @deprecated Moved to apps/kol-system/src/ingestion/ (Tramo 1, todo 4 + P18 companion todo 18).
 * KOL ingestion now lives in kol-system: KolIngestionClientService (SSE-only,
 * client-side messageType==='kol' filter, reconnect catch-up by cursor) +
 * ProcessKolMessageHandler. This module stays wired for dual-run; it will be
 * removed in todo 16 (cutover + cleanup). Do not extend it — add KOL ingestion
 * logic in apps/kol-system/src/ingestion/ instead.
 *
 * New location: apps/kol-system/src/ingestion/
 * Reason: extracting KOL pipeline from backend monolith to dedicated app
 * Breaking change: Yes (removal in todo 16)
 * Rollback: re-enable backend path (KOL_PIPELINE_ENABLED=true)
 *
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
