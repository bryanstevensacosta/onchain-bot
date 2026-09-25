import { Module } from '@nestjs/common';
import { AddressKindDetectorService } from './application/address-kind-detector.service';

/**
 * AddressModule (Tramo 3, P45; hexagonal slim-down todo 12, P50).
 *
 * Universal address model: Address = chain + value + kind
 * (wallet | token | program | exchange | unknown). Snapshot aggregation
 * moved to SnapshotModule (`src/snapshot/` — token logic stays the
 * kind=token path). Exposes the kind detector as a port; HTTP lives in
 * gateway/ (P43).
 */
@Module({
  providers: [AddressKindDetectorService],
  exports: [AddressKindDetectorService],
})
export class AddressModule {}
