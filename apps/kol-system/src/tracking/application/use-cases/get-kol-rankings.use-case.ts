import { Injectable } from '@nestjs/common';
import { DomainError, ErrorCode } from '../../../shared/kernel/domain-error';
import type {
  KolWindowStat,
  RankingWindow,
} from '../../domain/entities/kol-window-stat.entity';
import { RANKING_WINDOWS } from '../../domain/entities/kol-window-stat.entity';
import { KolWindowStatRepository } from '../ports/kol-window-stat.repository';

export type RankingsSort = 'perf_desc' | 'perf_asc' | 'calls_desc';

export const RANKINGS_SORTS: ReadonlyArray<RankingsSort> = [
  'perf_desc',
  'perf_asc',
  'calls_desc',
];

export interface GetKolRankingsInput {
  readonly window?: RankingWindow;
  readonly sort?: RankingsSort;
}

export interface GetKolRankingsResult {
  readonly window: RankingWindow;
  readonly sort: RankingsSort;
  readonly rows: KolWindowStat[];
}

/**
 * Reads precomputed caller rankings for one window (Tramo 1, todo 12,
 * P11 — screens read, never compute; the cron owns the math).
 *
 * Sort (P17): `perf_desc` (total_x desc) | `perf_asc` (total_x asc) |
 * `calls_desc` (calls_count desc). Ties break by caller asc.
 */
@Injectable()
export class GetKolRankingsUseCase {
  public constructor(private readonly stats: KolWindowStatRepository) {}

  public async execute(
    input: GetKolRankingsInput,
  ): Promise<GetKolRankingsResult> {
    const window = input.window ?? '30d';
    const sort = input.sort ?? 'perf_desc';
    if (!RANKING_WINDOWS.includes(window)) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        `unknown ranking window: ${window as string}`,
      );
    }
    if (!RANKINGS_SORTS.includes(sort)) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        `unknown rankings sort: ${sort as string}`,
      );
    }
    const rows = await this.stats.findByWindow(window);
    const ranked = [...rows].sort((a, b) => {
      switch (sort) {
        case 'perf_asc':
          return a.totalX - b.totalX || a.caller.localeCompare(b.caller);
        case 'calls_desc':
          return (
            b.callsCount - a.callsCount || a.caller.localeCompare(b.caller)
          );
        case 'perf_desc':
        default:
          return b.totalX - a.totalX || a.caller.localeCompare(b.caller);
      }
    });
    return { window, sort, rows: ranked };
  }
}
