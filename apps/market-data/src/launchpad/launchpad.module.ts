import { Module } from '@nestjs/common';
import { AlchemyModule } from 'provider/infrastructure/alchemy/alchemy.module';
import { DexScreenerModule } from 'provider/infrastructure/dexscreener';
import { HeliusModule } from 'provider/infrastructure/helius/helius.module';
import { SolanaRpcModule } from 'provider/infrastructure/solana-rpc/solana-rpc.module';
import { LaunchpadDetectorService } from './application/launchpad-detector.service';
import { LAUNCHPAD_DETECTOR } from './domain/launchpad-detector.port';

/**
 * LaunchpadModule (dexter-launchpad Wave 1, Lane D).
 *
 * Owns origin-launchpad detection (`detectLaunchpad(chain, address)`
 * only — no market-data input). Imported by `SnapshotModule` for the
 * `snapshot.launchpad` field; the class and the `LAUNCHPAD_DETECTOR`
 * port token are both exported (port pattern mirrors `DevHoldingsPort`
 * `useExisting` binding).
 *
 * `HeliusModule` is imported for the todo-36 LAST-resort archival
 * leg only (Solana history → origin program; `@Optional()` in the
 * detector, so hand-built specs without it stay byte-identical).
 * `DexScreenerModule` is imported for the todo-60 BSC flapsh-pair
 * corroboration leg only (ONE keyless pair-list read; `@Optional()`
 * in the detector, same byte-identical-no-DI property).
 * `AlchemyModule` is imported for the fix-5 creation-hash leg
 * (`getAssetTransfers` — the retired Blockscout replacement;
 * `@Optional()` in the detector, same property).
 * No cycle: `HeliusModule`/`DexScreenerModule`/`AlchemyModule` depend
 * on config alone.
 */
@Module({
  imports: [SolanaRpcModule, HeliusModule, DexScreenerModule, AlchemyModule],
  providers: [
    LaunchpadDetectorService,
    { provide: LAUNCHPAD_DETECTOR, useExisting: LaunchpadDetectorService },
  ],
  exports: [LaunchpadDetectorService, LAUNCHPAD_DETECTOR],
})
export class LaunchpadModule {}
