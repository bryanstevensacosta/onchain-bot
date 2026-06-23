import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ClassifyTokenUseCase } from 'token/classification/application/handlers/classify-token.use-case';
import { GetClassificationUseCase } from 'token/classification/application/handlers/get-classification.use-case';
import { ListClassificationsUseCase } from 'token/classification/application/handlers/list-classifications.use-case';
import { ClassifyTokenInput } from 'token/classification/api/input/classify-token.input';
import type { TokenClassificationView } from 'token/classification/application/mappers/token-classification.mapper';

@Controller('token/classification')
export class ClassificationController {
  public constructor(
    private readonly classify: ClassifyTokenUseCase,
    private readonly getOne: GetClassificationUseCase,
    private readonly list: ListClassificationsUseCase,
  ) {}

  @Post('classify')
  public run(
    @Body() input: ClassifyTokenInput,
  ): Promise<TokenClassificationView> {
    return this.classify.execute({
      chain: input.chain,
      address: input.address,
      hasPairs: input.hasPairs,
      pairCount: input.pairCount,
      liquidityUsd: input.liquidityUsd ?? null,
      marketCapUsd: input.marketCapUsd ?? null,
      priceChange24h: input.priceChange24h ?? null,
      holders: input.holders ?? null,
      top10HolderPercent: input.top10HolderPercent ?? null,
      hasName: input.hasName ?? false,
      hasTicker: input.hasTicker ?? false,
      completeness: input.completeness ?? 0,
    });
  }

  @Get('tokens/recent')
  public recent(
    @Query('limit') limit?: string,
  ): Promise<ReadonlyArray<TokenClassificationView>> {
    const parsed = limit ? Number(limit) : 10;
    return this.list.execute(parsed);
  }

  @Get('tokens/:chain/:address')
  public get(
    @Param('chain') chain: string,
    @Param('address') address: string,
  ): Promise<TokenClassificationView> {
    return this.getOne.execute(chain, address);
  }
}
