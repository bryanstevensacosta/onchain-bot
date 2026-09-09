import { Module } from '@nestjs/common';
import { SharedIngestionModule } from './shared/shared-ingestion.module';
import { KolIngestionModule } from './kol/kol-ingestion.module';
import { CryptoNewsIngestionModule } from './crypto-news/crypto-news-ingestion.module';
import { IdentityModule } from 'kol/identity/identity.module';
import { IngestionCoordinator } from './shared/application/ingestion-coordinator.service';
import { CryptoNewsIntegrationModule } from 'telegram/crypto-news-integration/crypto-news-integration.module';

/**
 * Root ingestion module.
 *
 * Wires the shared infrastructure, the KOL and crypto-news sub-modules,
 * and the IdentityModule so the IngestionCoordinator can resolve all
 * cross-BC dependencies (KolRepository, ProcessCryptoNewsMessageHandler, etc.).
 *
 * Provides IngestionCoordinator (single subscription + routing for all
 * Telegram channels).
 *
 * Module dependency graph (no cycles):
 *   TelegramIngestionModule
 *   ├── SharedIngestionModule   (provides TelegramListenerPort globally)
 *   ├── KolIngestionModule
 *   │   └── SharedIngestionModule, IdentityModule
 *   ├── CryptoNewsIngestionModule
 *   │   └── SharedIngestionModule
 *   ├── CryptoNewsIntegrationModule (provides ProcessCryptoNewsMessageHandler)
 *   │   └── CryptoNewsIngestionModule, CryptoNewsPublisherModule
 *   └── IdentityModule
 *
 * Note (2026-09-06): Seeders removed. Channels are now registered via:
 * - KOLs: POST /telegram-kol/identity/kols
 * - Crypto-news: POST {INGESTION_SERVICE_URL}/api/crypto-news/sources
 */
@Module({
  imports: [
    SharedIngestionModule,
    KolIngestionModule,
    CryptoNewsIngestionModule,
    CryptoNewsIntegrationModule,
    IdentityModule,
  ],
  providers: [IngestionCoordinator],
  exports: [IngestionCoordinator, SharedIngestionModule],
})
export class TelegramIngestionModule {}
