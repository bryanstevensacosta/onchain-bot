import { Module } from '@nestjs/common';
import { AggregationPolicyPort } from './domain/aggregation-policy.port';
import { DefaultAggregationPolicyService } from './application/default-aggregation-policy.service';
import { SnapshotAggregatorService } from './application/snapshot-aggregator.service';

/**
 * AggregatorsModule (market-data restructure).
 *
 * Canonical home of aggregation: cascade/merge/failover as data —
 * `SnapshotAggregatorService` (first-non-null merge, moved verbatim
 * from snapshot/) over the pure `ProviderFailoverPolicy` ordering —
 * plus the NEW `AggregationPolicyPort` (ordered provider list from
 * context: kind, chain, fields, quota state, account credits) with its
 * default impl (builder order preserved — ccxt-first where it covers —
 * quota-exhausted / zero-credit sunk last). SnapshotModule imports
 * this module and owns history persistence only.
 */
@Module({
  providers: [
    SnapshotAggregatorService,
    DefaultAggregationPolicyService,
    {
      provide: AggregationPolicyPort,
      useExisting: DefaultAggregationPolicyService,
    },
  ],
  exports: [
    AggregationPolicyPort,
    DefaultAggregationPolicyService,
    SnapshotAggregatorService,
  ],
})
export class AggregatorsModule {}
