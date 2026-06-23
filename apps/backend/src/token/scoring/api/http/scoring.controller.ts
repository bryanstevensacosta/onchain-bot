import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ScoreTokenUseCase } from 'token/scoring/application/handlers/score-token.use-case';
import { GetTokenScoreUseCase } from 'token/scoring/application/handlers/get-token-score.use-case';
import { ListTokenScoresUseCase } from 'token/scoring/application/handlers/list-token-scores.use-case';
import { GetTopScoresUseCase } from 'token/scoring/application/handlers/get-top-scores.use-case';
import { ScoreTokenInput } from 'token/scoring/api/input/score-token.input';
import type { TokenScoreView } from 'token/scoring/application/mappers/token-score.mapper';

@Controller('token/scoring')
export class ScoringController {
  public constructor(
    private readonly score: ScoreTokenUseCase,
    private readonly getOne: GetTokenScoreUseCase,
    private readonly list: ListTokenScoresUseCase,
    private readonly getTop: GetTopScoresUseCase,
  ) {}

  @Post('score')
  public run(@Body() input: ScoreTokenInput): Promise<TokenScoreView> {
    return this.score.execute({
      chain: input.chain,
      address: input.address,
      classification: input.classification,
      securityFlag: input.securityFlag,
      signals: input.signals,
      liquidityUsd: input.liquidityUsd ?? null,
      marketCapUsd: input.marketCapUsd ?? null,
      volume24hUsd: input.volume24hUsd ?? null,
      holders: input.holders ?? null,
      sourceCount: input.sourceCount ?? 1,
      mentionCount: input.mentionCount ?? 1,
      sourceChannelIds: input.sourceChannelIds ?? [],
    });
  }

  @Get('tokens/top')
  public top(
    @Query('limit') limit?: string,
    @Query('minScore') minScore?: string,
  ): Promise<ReadonlyArray<TokenScoreView>> {
    return this.getTop.execute(
      limit ? Number(limit) : 20,
      minScore ? Number(minScore) : 70,
    );
  }

  @Get('tokens/recent')
  public recent(
    @Query('limit') limit?: string,
  ): Promise<ReadonlyArray<TokenScoreView>> {
    const parsed = limit ? Number(limit) : 10;
    return this.list.execute(parsed);
  }

  @Get('tokens/:chain/:address')
  public get(
    @Param('chain') chain: string,
    @Param('address') address: string,
  ): Promise<TokenScoreView> {
    return this.getOne.execute(chain, address);
  }
}
