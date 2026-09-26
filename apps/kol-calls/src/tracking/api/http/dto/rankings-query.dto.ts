import { IsIn, IsOptional } from 'class-validator';
import type { RankingWindow } from '../../../domain/entities/kol-window-stat.entity';
import type { RankingsSort } from '../../../application/use-cases/get-kol-rankings.use-case';

export class RankingsQueryDto {
  @IsOptional()
  @IsIn(['30d', '7d', '1d'])
  public readonly window?: RankingWindow;

  @IsOptional()
  @IsIn(['perf_desc', 'perf_asc', 'calls_desc'])
  public readonly sort?: RankingsSort;
}
