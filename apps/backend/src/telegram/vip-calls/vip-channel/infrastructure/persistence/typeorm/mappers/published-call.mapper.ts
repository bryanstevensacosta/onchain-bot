import { ChainId } from 'chain/identity/chain-id.vo';
import { PublishedCall } from 'telegram/shared';
import { PublishStatus } from 'telegram/shared';
import { PublishedCallEntity } from '../entities/published-call.entity';

/**
 * Maps between the `PublishedCall` domain aggregate and its TypeORM
 * persistence shape.
 */
export class PublishedCallMapper {
  public static toEntity(call: PublishedCall): PublishedCallEntity {
    const row = new PublishedCallEntity();
    row.id = call.id;
    row.chain = call.chain.value;
    row.address = call.address;
    row.ticker = call.ticker;
    row.score = call.score;
    row.tier = call.tier;
    row.classification = call.classification;
    row.message = call.message;
    row.status = call.status.value;
    row.publishedChannelIds = call.publishedChannelIds;
    row.failedChannelIds = call.failedChannelIds;
    row.publishedAt = call.publishedAt;
    row.mcAtCall = call.mcAtCall;
    row.telegramMessageId = call.telegramMessageId;
    return row;
  }

  public static toDomain(row: PublishedCallEntity): PublishedCall {
    return PublishedCall.rehydrate({
      id: row.id,
      chain: ChainId.fromString(row.chain),
      address: row.address,
      ticker: row.ticker,
      score: row.score,
      tier: row.tier,
      classification: row.classification,
      message: row.message,
      targetChannels: ['vip-calls'],
      publishedChannelIds: row.publishedChannelIds ?? [],
      failedChannelIds: row.failedChannelIds ?? [],
      status: PublishStatus.fromString(row.status),
      publishedAt: row.publishedAt,
      mcAtCall: row.mcAtCall,
      telegramMessageId: row.telegramMessageId,
    });
  }
}
