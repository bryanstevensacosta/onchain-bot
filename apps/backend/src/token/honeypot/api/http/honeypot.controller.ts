import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { AnalyzeTokenHoneypotUseCase } from 'token/honeypot/application/handlers/analyze-token-honeypot.use-case';
import { GetHoneypotAnalysisUseCase } from 'token/honeypot/application/handlers/get-honeypot-analysis.use-case';
import { ListHoneypotAnalysesUseCase } from 'token/honeypot/application/handlers/list-honeypot-analyses.use-case';
import { AnalyzeHoneypotInput } from 'token/honeypot/api/input/analyze-honeypot.input';
import type { HoneypotAnalysisView } from 'token/honeypot/application/mappers/honeypot-analysis.mapper';

@Controller('token/honeypot')
export class HoneypotController {
  public constructor(
    private readonly analyze: AnalyzeTokenHoneypotUseCase,
    private readonly getOne: GetHoneypotAnalysisUseCase,
    private readonly list: ListHoneypotAnalysesUseCase,
  ) {}

  @Post('analyze')
  public async run(
    @Body() input: AnalyzeHoneypotInput,
  ): Promise<HoneypotAnalysisView> {
    const analysis = await this.analyze.execute({
      chain: input.chain,
      address: input.address,
    });
    return this.getOne.execute(analysis.chain.value, analysis.address);
  }

  @Get('analyses/recent')
  public recent(
    @Query('limit') limit?: string,
  ): Promise<ReadonlyArray<HoneypotAnalysisView>> {
    return this.list.execute(limit ? Number(limit) : 20);
  }

  @Get('analyses/:chain/:address')
  public get(
    @Param('chain') chain: string,
    @Param('address') address: string,
  ): Promise<HoneypotAnalysisView> {
    return this.getOne.execute(chain, address);
  }
}
