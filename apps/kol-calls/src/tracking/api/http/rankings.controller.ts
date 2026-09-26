import {
  Controller,
  Get,
  Optional,
  Query,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { DomainExceptionFilter } from '../../../shared/filters/domain-exception.filter';
import { ApiKeyGuard } from '../../../shared/guards/api-key.guard';
import type { KolWindowStat } from '../../domain/entities/kol-window-stat.entity';
import { GetKolRankingsUseCase } from '../../application/use-cases/get-kol-rankings.use-case';
import { KolAvatarResolverService } from '../../../ingestion/application/services/kol-avatar-resolver.service';
import { RankingsQueryDto } from './dto/rankings-query.dto';

function toJson(
  stat: KolWindowStat,
  avatarUrl: string | null,
): Record<string, unknown> {
  return {
    caller: stat.caller,
    window: stat.window,
    totalX: stat.totalX,
    callsCount: stat.callsCount,
    strongCalls: stat.strongCalls,
    display: stat.display,
    avatarUrl,
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
@UseGuards(ApiKeyGuard)
@UseFilters(DomainExceptionFilter)
export class RankingsController {
  public constructor(
    private readonly rankings: GetKolRankingsUseCase,
    @Optional() private readonly avatars?: KolAvatarResolverService,
  ) {}

  @Get()
  public async list(
    @Query() query: RankingsQueryDto,
  ): Promise<Record<string, unknown>[]> {
    const { rows } = await this.rankings.execute({
      window: query.window,
      sort: query.sort,
    });
    const avatarUrls = this.avatars
      ? await this.avatars.resolveMany(rows.map((row) => row.caller))
      : {};
    return rows.map((row) => toJson(row, avatarUrls[row.caller] ?? null));
  }
}
