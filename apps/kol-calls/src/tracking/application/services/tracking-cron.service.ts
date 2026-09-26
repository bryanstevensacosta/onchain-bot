import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import {
  KolWindowStat,
  RANKING_WINDOWS,
  RANKING_WINDOW_MS,
  type RankingWindow,
} from '../../domain/entities/kol-window-stat.entity';
import { STRONG_THRESHOLD } from '../../domain/kol-rating';
import { TrackedMentionRepository } from '../ports/tracked-mention.repository';
import { KolWindowStatRepository } from '../ports/kol-window-stat.repository';

/**
 * Ranking background job (Tramo 1, todo 12, P11 + P17 — cron every 1 min).
 *
 * Maintains `kol_window_stats(caller, window, total_x, calls_count)` for
 * 30d/7d/1d: per tracked (kol, contract) row inside the window (by
 * `last_seen_at`), multiple = `last_call_mc_at/first_mc_at` (X vs the
 * LATEST observation, P26 — `last_call_mc_at` carries the latest snapshot
 * mc per mention), SUM per caller + SUM of `times_called`; rows with
 * null mc contribute 0 to the sum but still count their calls (no-data
 * never poisons the ranking).
 *
 * `strongCalls` counts pairs at >=5x (backend `Outcome.STRONG` mirror —
 * the kol +5x rating input).
 */
@Injectable()
export class TrackingCronService {
  private readonly logger = new Logger(TrackingCronService.name);

  public constructor(
    private readonly tracked: TrackedMentionRepository,
    private readonly stats: KolWindowStatRepository,
    @Optional() private readonly config?: ConfigService,
  ) {}

  @Cron('*/1 * * * *')
  public async handleCron(): Promise<void> {
    const enabled =
      this.config?.get<string>('TRACKING_CRON_ENABLED') ??
      process.env.TRACKING_CRON_ENABLED;
    if (enabled !== 'true') return;
    await this.rebuild();
  }

  public async rebuild(now: Date = new Date()): Promise<KolWindowStat[]> {
    const all = await this.tracked.findAll();
    const out: KolWindowStat[] = [];
    for (const window of RANKING_WINDOWS) {
      const cutoff = now.getTime() - RANKING_WINDOW_MS[window];
      const inWindow = all.filter(
        (row) => row.lastSeenAt.getTime() >= cutoff,
      );
      const byCaller = new Map<string, typeof inWindow>();
      for (const row of inWindow) {
        const group = byCaller.get(row.kolId) ?? [];
        group.push(row);
        byCaller.set(row.kolId, group);
      }
      for (const [caller, rows] of byCaller) {
        const stat = KolWindowStat.create({
          caller,
          window,
          totalX: rows.reduce(
            (sum, row) => sum + (row.multiple ?? 0),
            0,
          ),
          callsCount: rows.reduce((sum, row) => sum + row.timesCalled, 0),
          strongCalls: rows.filter(
            (row) => row.multiple !== null && row.multiple >= STRONG_THRESHOLD,
          ).length,
        });
        await this.stats.save(stat);
        out.push(stat);
      }
    }
    this.logger.debug(
      `Rebuilt kol_window_stats for ${RANKING_WINDOWS.length} windows from ${all.length} tracked pairs`,
    );
    return out;
  }

  public windowOf(window: RankingWindow): number {
    return RANKING_WINDOW_MS[window];
  }
}
