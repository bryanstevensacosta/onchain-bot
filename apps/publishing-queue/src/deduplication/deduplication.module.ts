import { Module } from '@nestjs/common';
import { DeduplicationService } from './application/services/deduplication.service';
import { NoopDedupProbe } from './noop-dedup-probe.service';

/**
 * DeduplicationModule (R-b1, gateway side).
 *
 * Binds the gateway-side `DeduplicationService` probe port to the
 * fail-open no-op. The exact/content/semantic cascade + normalizers +
 * scorers + embeddings stay in feed-publisher per R6; B1 dual binds a
 * thin HTTP probe here without touching the enqueue use-case.
 */
@Module({
  providers: [
    NoopDedupProbe,
    {
      provide: DeduplicationService,
      useClass: NoopDedupProbe,
    },
  ],
  exports: [DeduplicationService],
})
export class DeduplicationModule {}
