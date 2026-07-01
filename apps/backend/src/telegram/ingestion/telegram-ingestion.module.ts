import { Module } from '@nestjs/common';
import { SharedIngestionModule } from './shared/shared-ingestion.module';
import { KolIngestionModule } from './kol/kol-ingestion.module';
import { CryptoNewsIngestionModule } from './crypto-news/crypto-news-ingestion.module';
import { IdentityModule } from 'kol/identity/identity.module';
import { IngestionCoordinator } from './shared/application/ingestion-coordinator.service';

/**
 * Root ingestion module.
 *
 * Wires the shared infrastructure, the KOL and crypto-news sub-modules,
 * and the IdentityModule so the IngestionCoordinator can resolve all
 * cross-BC dependencies (KolRepository, KolSeeder, etc.).
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
 *   └── IdentityModule
 */
@Module({
  imports: [
    SharedIngestionModule,
    KolIngestionModule,
    CryptoNewsIngestionModule,
    IdentityModule,
  ],
  providers: [IngestionCoordinator],
  exports: [IngestionCoordinator, SharedIngestionModule],
})
export class TelegramIngestionModule {}
