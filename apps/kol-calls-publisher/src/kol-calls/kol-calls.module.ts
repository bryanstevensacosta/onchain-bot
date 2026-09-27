import { Module } from '@nestjs/common';
import { ScoringModule } from '../scoring/scoring.module';
import { KolCallsClient } from './kol-calls.client';
import { KolCallsSyncService } from './kol-calls-sync.service';
import { KolCallsHealthIndicator } from './health/kol-calls-health.indicator';

/**
 * KolCallsModule — upstream kol-calls HTTP reader (P51 contract).
 *
 * Owns the paginated mentions+snapshots client (KOL_CALLS_URL +
 * KOL_CALLS_API_KEY) plus the sync service that joins both pages and
 * feeds the UNCHANGED ScoreTokenUseCase. Imports ScoringModule for the
 * scorer + ScoredCallRepository (same in-memory port the moved
 * ScoringModule provides). Exports the client for rankings/rating reads.
 * NOTE: no ScheduleModule.forRoot() here — the templates-registered
 * explorer scans all providers app-wide (same pattern as tracking).
 */
@Module({
  imports: [ScoringModule],
  providers: [KolCallsClient, KolCallsSyncService, KolCallsHealthIndicator],
  exports: [KolCallsClient, KolCallsSyncService, KolCallsHealthIndicator],
})
export class KolCallsModule {}
