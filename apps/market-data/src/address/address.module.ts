import { Module } from '@nestjs/common';
import { ChainModule } from 'chain/chain.module';
import { ProviderModule } from 'provider/provider.module';
import { AddressKindDetectorService } from './address-kind-detector.service';
import { AddressSnapshotService } from './address-snapshot.service';

/**
 * AddressModule (Tramo 3, P45).
 *
 * Universal address model: Address = chain + value + kind
 * (wallet | token | program | exchange | unknown). Absorbs the token/
 * stub — token logic is the kind=token path of AddressSnapshotService.
 * Exposes services as ports; HTTP lives in gateway/ (P43).
 */
@Module({
  imports: [ChainModule, ProviderModule],
  providers: [AddressKindDetectorService, AddressSnapshotService],
  exports: [AddressKindDetectorService, AddressSnapshotService],
})
export class AddressModule {}
