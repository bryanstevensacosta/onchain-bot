import type { PublishedCall } from 'discovery/publishing/telegram/domain/entities/published-call.entity';

export interface PublishedCallView {
  readonly id: string;
  readonly chain: string;
  readonly address: string;
  readonly ticker: string | null;
  readonly score: number;
  readonly tier: string;
  readonly classification: string;
  readonly message: string;
  readonly status: string;
  readonly publishedChannelIds: ReadonlyArray<string>;
  readonly failedChannelIds: ReadonlyArray<string>;
  readonly successCount: number;
  readonly publishedAt: string;
}

export class PublishedCallMapper {
  public static toView(call: PublishedCall): PublishedCallView {
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
    };
  }
}
