import { Controller, Post, Get, Body, Param, Query } from '@nestjs/common';
import { VipCallsPublishUseCase } from '../../application/handlers/vip-calls-publish.use-case';
import { VipCallsListPublishedUseCase } from '../../application/handlers/vip-calls-list-published.use-case';

@Controller('vip-calls')
export class VipCallsController {
  public constructor(
    private readonly publishUseCase: VipCallsPublishUseCase,
    private readonly listPublishedUseCase: VipCallsListPublishedUseCase,
  ) {}

  @Post('publish')
  public async publish(
    @Body() input: VipCallsPublishInput,
  ): Promise<VipCallsPublishOutput> {
    return this.publishUseCase.execute(input);
  }

  @Get('calls/published')
  public async published(
    @Query('limit') limit?: string,
  ): Promise<VipCallsPublishOutput[]> {
    const parsed = limit ? parseInt(limit, 10) : 20;
    return this.listPublishedUseCase.execute({
      kind: 'published',
      limit: parsed,
    });
  }

  @Get('calls/recent')
  public async recent(
    @Query('limit') limit?: string,
  ): Promise<VipCallsPublishOutput[]> {
    const parsed = limit ? parseInt(limit, 10) : 10;
    return this.listPublishedUseCase.execute({ kind: 'recent', limit: parsed });
  }
}

export interface VipCallsPublishInput {
  readonly chain: string;
  readonly address: string;
  readonly score: number;
  readonly classification: string;
  readonly ticker?: string | null;
  readonly name?: string | null;
  readonly marketCapUsd?: number | null;
  readonly liquidityUsd?: number | null;
  readonly holders?: number | null;
  readonly sourceCount?: number;
  readonly mentionCount?: number;
  readonly chart?: string | null;
  readonly imageUrls?: ReadonlyArray<string>;
}

export interface VipCallsPublishOutput {
  readonly id: string;
  readonly chain: string;
  readonly address: string;
  readonly ticker: string | null;
  readonly score: number;
  readonly tier: string;
  readonly classification: string;
  readonly message: string;
  readonly status: string;
  readonly publishedChannelIds: string[];
  readonly failedChannelIds: string[];
  readonly successCount: number;
  readonly publishedAt: string;
  readonly headerImageUrl: string | null;
}
