import { Module } from '@nestjs/common';
import { AddressModule } from 'address/address.module';

/**
 * TokenModule (Tramo 3, P45).
 *
 * @deprecated Absorbed into AddressModule — token logic is the
 * kind=token path of AddressSnapshotService (Address = chain + value
 * + kind). This module is a thin alias re-exporting AddressModule and
 * will be removed in the final review. New code imports address/*.
 */
@Module({
  imports: [AddressModule],
  exports: [AddressModule],
})
export class TokenModule {}
