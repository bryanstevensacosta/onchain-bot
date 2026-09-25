import { Module } from '@nestjs/common';
import { TrackedMentionRepository } from './application/ports/tracked-mention.repository';
import { KolWindowStatRepository } from './application/ports/kol-window-stat.repository';
import { InMemoryTrackedMentionRepository } from './infrastructure/repositories/in-memory-tracked-mention.repository';
import { InMemoryKolWindowStatRepository } from './infrastructure/repositories/in-memory-kol-window-stat.repository';
import { RecordMentionUseCase } from './application/handlers/record-mention.use-case';
import { GetKolRankingsUseCase } from './application/use-cases/get-kol-rankings.use-case';
import { TrackingCronService } from './application/services/tracking-cron.service';
import { RankingsController } from './api/http/rankings.controller';
import { TrackingHealthIndicator } from './health/tracking-health.indicator';

/**
 * TrackingModule — first-seen + rating + rankings API (Tramo 1, todo 12,
 * Ph12 + P8 + P11 + P17).
 *
 * `TrackedMention` (id `kolId:chain:address`, own `first_mc_at` column —
 * no canonical mcAtCall assumption) + `RecordMentionUseCase` (direct
 * call fix-1: `First time` vs `Nx from last call`, `mc n/a` on missing
 * mc) + `TrackingCronService` (cron 1 min, gated by
 * `TRACKING_CRON_ENABLED=true`, maintains `kol_window_stats` for
 * 30d/7d/1d: SUM of `last_mc/first_mc_at` + SUM of `times_called` +
 * >=5x strong count) + `RankingsController`
 * (`GET /api/kol-rankings?window=&sort=`) + kol +5x rating
 * (`domain/kol-rating.ts`, backend `Outcome.STRONG>=5x` mirror,
 * read-only reference).
 *
 * Scheduling note: the `@Cron` explorer is registered once by
 * `TemplatesModule` (`ScheduleModule.forRoot()`), which scans ALL
 * providers app-wide — so this module declares no second `forRoot`
 * (a duplicate would fork the scheduler registry).
 */
@Module({
  controllers: [RankingsController],
  providers: [
    RecordMentionUseCase,
    GetKolRankingsUseCase,
    TrackingCronService,
    TrackingHealthIndicator,
    {
      provide: TrackedMentionRepository,
      useClass: InMemoryTrackedMentionRepository,
    },
    {
      provide: KolWindowStatRepository,
      useClass: InMemoryKolWindowStatRepository,
    },
  ],
  exports: [
    RecordMentionUseCase,
    GetKolRankingsUseCase,
    TrackedMentionRepository,
    KolWindowStatRepository,
    TrackingHealthIndicator,
  ],
})
export class TrackingModule {}
