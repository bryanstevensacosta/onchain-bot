import { Injectable } from '@nestjs/common';
import {
  PublishedCallRepository,
  PublishedCall,
} from 'telegram-publishing/shared';
import { VipCallsPublishOutput } from './vip-calls-publish.use-case';

export interface ListInput {
  readonly kind: 'published' | 'failed' | 'recent';
  readonly limit: number;
}

@Injectable()
export class VipCallsListPublishedUseCase {
  public constructor(private readonly callRepo: PublishedCallRepository) {}

  public async execute(input: ListInput): Promise<VipCallsPublishOutput[]> {
    const limit = Math.min(Math.max(input.limit, 1), 500);
    let calls: ReadonlyArray<PublishedCall>;

    switch (input.kind) {
      case 'published':
        calls = await this.callRepo.findPublished(limit);
        break;
      case 'failed':
        calls = await this.callRepo.findFailed(limit);
        break;
      case 'recent':
      default:
        calls = await this.callRepo.findRecent(limit);
        break;
    }

    return calls.map((call) => this.toView(call));
  }

  private toView(call: PublishedCall): VipCallsPublishOutput {
    return {
      id: call.id,
      chain: call.chain.value,
      address: call.address,
      ticker: call.ticker,
      score: call.score,
      tier: call.tier,
      classification: call.classification,
      message: call.message,
      status: call.status.value,
      publishedChannelIds: [...call.publishedChannelIds],
      failedChannelIds: [...call.failedChannelIds],
      successCount: call.successCount,
      publishedAt: call.publishedAt.toISOString(),
      headerImageUrl: null,
    };
  }
}
