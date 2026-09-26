import type {
  KolWindowStat,
  RankingWindow,
} from '../../domain/entities/kol-window-stat.entity';

/**
 * Storage port for precomputed (caller, window) ranking rows (same
 * kol-calls DB; in-memory today — TypeORM entity + migration land with
 * the persistence todo). Written only by `TrackingCronService.rebuild()`.
 */
export abstract class KolWindowStatRepository {
  public abstract save(stat: KolWindowStat): Promise<void>;
  public abstract findByWindow(window: RankingWindow): Promise<KolWindowStat[]>;
  public abstract findByCallerWindow(
    caller: string,
    window: RankingWindow,
  ): Promise<KolWindowStat | null>;
  public abstract count(): Promise<number>;
}
