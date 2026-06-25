import { Injectable, Logger } from '@nestjs/common';
import { ChainId } from 'chain/identity/chain-id.vo';
import { PublishedCallRepository } from 'telegram/shared/application/ports/published-call.repository';
import { TrackedPublishedCall } from '../../domain/entities/tracked-published-call.entity';
import { TrackedPublishedCallRepository } from '../ports/tracked-published-call.repository';

export interface TrackPublishedCallInput {
  readonly chain: string;
  readonly address: string;
  readonly ticker: string | null;
  readonly publishedAt: Date;
  readonly kolId?: string | null;
}

export interface TrackPublishedCallResult {
  readonly created: boolean;
  readonly trackedId: string;
}

@Injectable()
export class TrackPublishedCallUseCase {
  private readonly logger = new Logger(TrackPublishedCallUseCase.name);

  constructor(
    private readonly trackedRepo: TrackedPublishedCallRepository,
    private readonly publishedCallRepo: PublishedCallRepository,
  ) {}

  async execute(
    input: TrackPublishedCallInput,
  ): Promise<TrackPublishedCallResult> {
    const existing = await this.trackedRepo.findByChainAndAddress(
      input.chain,
      input.address,
    );
    const chain = ChainId.fromString(input.chain);

    const published = await this.publishedCallRepo.findByChainAndAddress(
      chain,
      input.address,
    );
    const mcAtPublish = published?.mcAtCall ?? 0;
    const kolId =
      input.kolId ?? published?.publishedChannelIds[0]?.toString() ?? 'unknown';

    const tracked = existing
      ? TrackedPublishedCall.rehydrate({
          kolId,
          chain: input.chain,
          address: input.address,
          ticker: input.ticker,
          mcAtPublish: existing.mcAtPublish || mcAtPublish,
          mcNow: existing.mcNow,
          milestonesHit: existing.milestonesHit,
          maxMilestone: existing.maxMilestone,
          priceDropPercent: existing.priceDropPercent,
          publishedAt: existing.publishedAt,
          lastUpdatedAt: new Date(),
          isActive: true,
        })
      : TrackedPublishedCall.create({
          kolId,
          chain: input.chain,
          address: input.address,
          ticker: input.ticker,
          mcAtPublish,
          publishedAt: input.publishedAt,
        });

    await this.trackedRepo.save({
      id: tracked.id,
      kolId: tracked.kolId,
      chain: tracked.chain,
      address: tracked.address,
      ticker: tracked.ticker,
      mcAtPublish: tracked.mcAtPublish,
      mcNow: tracked.mcNow,
      milestonesHit: tracked.milestonesHit,
      maxMilestone: tracked.maxMilestone,
      priceDropPercent: tracked.priceDropPercent,
      publishedAt: tracked.publishedAt,
      lastUpdatedAt: tracked.lastUpdatedAt,
      isActive: tracked.isActive,
    });

    this.logger.log(
      `Tracked published call: ${tracked.id} (created=${!existing}, mcAtPublish=${tracked.mcAtPublish})`,
    );

    return { created: !existing, trackedId: tracked.id };
  }
}
