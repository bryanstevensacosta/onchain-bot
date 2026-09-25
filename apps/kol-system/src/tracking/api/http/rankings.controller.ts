import { Controller, Get, Query, UseFilters } from '@nestjs/common';
import { DomainExceptionFilter } from '../../../shared/filters/domain-exception.filter';
import type { KolWindowStat } from '../../domain/entities/kol-window-stat.entity';
import { GetKolRankingsUseCase } from '../../application/use-cases/get-kol-rankings.use-case';
import { RankingsQueryDto } from './dto/rankings-query.dto';

function toJson(stat: KolWindowStat): Record<string, unknown> {
  return {
    caller: stat.caller,
    window: stat.window,
    totalX: stat.totalX,
    callsCount: stat.callsCount,
    strongCalls: stat.strongCalls,
    display: stat.display,
  };
}

/**
 * Rankings controller (Tramo 1, todo 12, P11 API).
 *
 * `GET /api/kol-rankings?window=30d|7d|1d&sort=perf_desc|perf_asc|calls_desc`
 * reads the cron-maintained `kol_window_stats` rows (P17: exposes
 * `total_x` + `calls_count` + `strongCalls` + `display`; acceptance:
 * `jq 'length >= 0'`).
 */
@Controller('api/kol-rankings')
@UseFilters(DomainExceptionFilter)
export class RankingsController {
  public constructor(private readonly rankings: GetKolRankingsUseCase) {}

  @Get()
  public async list(
    @Query() query: RankingsQueryDto,
  ): Promise<Record<string, unknown>[]> {
    const { rows } = await this.rankings.execute({
      window: query.window,
      sort: query.sort,
    });
    return rows.map(toJson);
  }
}
