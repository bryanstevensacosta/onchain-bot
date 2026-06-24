import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { RecomputeKolReputationUseCase } from 'kol/reputation/application/handlers/recompute-kol-reputation.use-case';
import {
  GetKolReputationUseCase,
  GetTopKolsUseCase,
  ListAllKolReputationsUseCase,
} from 'kol/reputation/application/handlers/kol-stats-queries.use-case';
import { KolReputationView } from 'kol/reputation/application/mappers/kol-reputation.mapper';
import { GetTopKolsQueryDto } from 'kol/reputation/api/http/dto/get-top-kols-query.dto';

@Controller('telegram-kol/reputation')
export class KolReputationController {
  public constructor(
    private readonly recompute: RecomputeKolReputationUseCase,
    private readonly getOne: GetKolReputationUseCase,
    private readonly getTop: GetTopKolsUseCase,
    private readonly listAll: ListAllKolReputationsUseCase,
  ) {}

  @Post('kols/recompute/:kolId')
  public recomputeKol(
    @Param('kolId') kolId: string,
  ): Promise<KolReputationView> {
    return this.recompute
      .execute({ kolId })
      .then((stats) => this.getOne.execute(stats.kolId));
  }

  @Get('kols/top')
  public topKols(
    @Query() query: GetTopKolsQueryDto,
  ): Promise<ReadonlyArray<KolReputationView>> {
    return this.getTop.execute(query.limit ?? 20, query.minConfidence);
  }

  @Get('kols')
  public listAllKols(): Promise<ReadonlyArray<KolReputationView>> {
    return this.listAll.execute();
  }

  @Get('kols/:kolId')
  public getKol(@Param('kolId') kolId: string): Promise<KolReputationView> {
    return this.getOne.execute(kolId);
  }
}
