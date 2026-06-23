import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { DetectChainUseCase } from 'chain/detection/application/handlers/detect-chain.use-case';
import { GetDetectionResultUseCase } from 'chain/detection/application/handlers/get-detection-result.use-case';
import { ListDetectionResultsUseCase } from 'chain/detection/application/handlers/list-detection-results.use-case';
import { DetectChainInput } from 'chain/detection/api/input/detect-chain.input';
import type { ChainDetectionResultView } from 'chain/detection/application/mappers/chain-detection-result.mapper';

@Controller('chain/detection')
export class ChainDetectionController {
  public constructor(
    private readonly detect: DetectChainUseCase,
    private readonly getResult: GetDetectionResultUseCase,
    private readonly listResults: ListDetectionResultsUseCase,
  ) {}

  @Post('detect')
  public run(
    @Body() input: DetectChainInput,
  ): Promise<ChainDetectionResultView> {
    return this.detect.execute({ address: input.address });
  }

  @Get('results/recent')
  public recent(
    @Query('limit') limit?: string,
  ): Promise<ReadonlyArray<ChainDetectionResultView>> {
    const parsed = limit ? Number(limit) : 10;
    return this.listResults.execute(parsed);
  }

  @Get('results/:address')
  public get(
    @Param('address') address: string,
  ): Promise<ChainDetectionResultView> {
    return this.getResult.execute(address);
  }
}
