import { Module } from '@nestjs/common';
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
 * No cycle: `HeliusModule` depends on config alone.
 */
@Module({
  imports: [SolanaRpcModule, HeliusModule],
  providers: [
    LaunchpadDetectorService,
    { provide: LAUNCHPAD_DETECTOR, useExisting: LaunchpadDetectorService },
  ],
  exports: [LaunchpadDetectorService, LAUNCHPAD_DETECTOR],
})
export class LaunchpadModule {}
