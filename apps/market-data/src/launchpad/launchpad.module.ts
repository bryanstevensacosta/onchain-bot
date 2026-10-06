import { Module } from '@nestjs/common';
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
 */
@Module({
  imports: [SolanaRpcModule],
  providers: [
    LaunchpadDetectorService,
    { provide: LAUNCHPAD_DETECTOR, useExisting: LaunchpadDetectorService },
  ],
  exports: [LaunchpadDetectorService, LAUNCHPAD_DETECTOR],
})
export class LaunchpadModule {}
