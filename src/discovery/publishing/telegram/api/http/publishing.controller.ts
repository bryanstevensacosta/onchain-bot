import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { PublishApprovedCallUseCase } from 'discovery/publishing/telegram/application/handlers/publish-approved-call.use-case';
import { GetPublishedCallUseCase } from 'discovery/publishing/telegram/application/handlers/get-published-call.use-case';
import { ListPublishedCallsUseCase } from 'discovery/publishing/telegram/application/handlers/list-published-calls.use-case';
import { PublishCallInput } from 'discovery/publishing/telegram/api/input/publish-call.input';
import type { PublishedCallView } from 'discovery/publishing/telegram/application/mappers/published-call.mapper';

@Controller('discovery/publishing/telegram')
export class PublishingController {
  public constructor(
    private readonly publish: PublishApprovedCallUseCase,
    private readonly getOne: GetPublishedCallUseCase,
    private readonly list: ListPublishedCallsUseCase,
  ) {}

  @Post('publish')
  public run(@Body() input: PublishCallInput): Promise<PublishedCallView> {
    return this.publish.execute({
      chain: input.chain,
      address: input.address,
      ticker: input.ticker ?? null,
      name: input.name ?? null,
      score: input.score,
      classification: input.classification,
      marketCapUsd: input.marketCapUsd ?? null,
      liquidityUsd: input.liquidityUsd ?? null,
      holders: input.holders ?? null,
      sourceCount: input.sourceCount ?? 1,
      mentionCount: input.mentionCount ?? 1,
      chart: input.chart ?? null,
    });
  }

  @Get('calls/published')
  public published(
    @Query('limit') limit?: string,
  ): Promise<ReadonlyArray<PublishedCallView>> {
    return this.list.execute('published', limit ? Number(limit) : 20);
  }

  @Get('calls/failed')
  public failed(
    @Query('limit') limit?: string,
  ): Promise<ReadonlyArray<PublishedCallView>> {
    return this.list.execute('failed', limit ? Number(limit) : 20);
  }

  @Get('calls/recent')
  public recent(
    @Query('limit') limit?: string,
  ): Promise<ReadonlyArray<PublishedCallView>> {
    return this.list.execute('recent', limit ? Number(limit) : 10);
  }

  @Get('calls/:chain/:address')
  public get(
    @Param('chain') chain: string,
    @Param('address') address: string,
  ): Promise<PublishedCallView> {
    return this.getOne.execute(chain, address);
  }
}
