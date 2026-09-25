import { Module } from '@nestjs/common';
import { AddressModule } from 'address/address.module';
import { ChainModule } from 'chain/chain.module';
import { ProviderModule } from 'provider/provider.module';
import { AddressSnapshotService } from './application/address-snapshot.service';

/**
 * SnapshotModule (Tramo 3, todo 12, P50).
 *
 * Canonical home of snapshot aggregation (moved from AddressModule —
 * P45 placed it under address/, P50 promotes it to its own module so
 * every module follows domain/ + application/ + infrastructure/).
 * The service consumes chain/provider ports plus the address kind
 * detector; delivery stays in gateway/ (P43). Persistence (TypeORM
 * entity + repository, P44) lands with the todo-3 aggregators.
 */
@Module({
  imports: [AddressModule, ChainModule, ProviderModule],
  providers: [AddressSnapshotService],
  exports: [AddressSnapshotService],
})
export class SnapshotModule {}
