/**
 * @deprecated Tramo 1 cutover (task-16, staging): KOL rankings served by
 * apps/kol-calls GET /api/kol-rankings (tracking module). Refactor target:
 * delete this stub at the central FINAL REVIEW (C4-bis.3).
 */
import { Module } from '@nestjs/common';
import { KolStatsController } from 'kol/stats/api/http/kol-stats.controller';

/**
 * Stats BC module (Fase 5 of the kol-refactor plan).
 *
 * Stub for now — provides a placeholder controller that documents the
 * planned endpoints. Real implementations (per-chain consistency, ROI
 * trends, alpha-caller count) will be added when there is enough data
 * in production to make the aggregations statistically meaningful.
 */
@Module({
  controllers: [KolStatsController],
})
export class StatsModule {}
