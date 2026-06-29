import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ChainId } from 'chain/identity/chain-id.vo';
import { ScoreTier } from 'token/scoring/domain/value-objects/score-tier.vo';
import { SettingsService } from 'settings/application/services/settings.service';
import {
  MessageFormatterPort,
  ApprovedCallInput,
  TelegramPublisherPort,
  PublishedCall,
  PublishedCallRepository,
  PublishingEventPublisher,
} from 'telegram/shared';
import { RegisterCallForMilestonesEvent } from 'token/milestone/domain/events/register-call-for-milestones.event';

export interface VipCallsPublishInput {
  readonly chain: string;
  readonly address: string;
  readonly score: number;
  readonly classification: string;
  readonly ticker?: string | null;
  readonly name?: string | null;
  readonly marketCapUsd?: number | null;
  readonly liquidityUsd?: number | null;
  readonly holderCount?: number | null;
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

@Injectable()
export class VipCallsPublishUseCase {
  private readonly logger = new Logger(VipCallsPublishUseCase.name);

  public constructor(
    private readonly formatter: MessageFormatterPort,
    private readonly publisher: TelegramPublisherPort,
    private readonly callRepo: PublishedCallRepository,
    private readonly eventPublisher: PublishingEventPublisher,
    private readonly eventEmitter: EventEmitter2,
    private readonly settings: SettingsService,
  ) {}

  public async execute(
    input: VipCallsPublishInput,
  ): Promise<VipCallsPublishOutput> {
    const chain = ChainId.fromString(input.chain);
    const tierThresholds = await this.settings.getScoringTierThresholds();
    const tier = ScoreTier.fromScore(input.score, tierThresholds);

    const imageUrls = input.imageUrls ?? [];
    const headerImageUrl = imageUrls[0] ?? null;

    const approvedInput: ApprovedCallInput = {
      chain: input.chain,
      address: input.address,
      ticker: input.ticker ?? null,
      name: input.name ?? null,
      score: input.score,
      classification: input.classification,
      marketCapUsd: input.marketCapUsd ?? null,
      liquidityUsd: input.liquidityUsd ?? null,
      holders: input.holderCount ?? null,
      sourceCount: input.sourceCount ?? 1,
      mentionCount: input.mentionCount ?? 1,
      chart: input.chart ?? null,
      imageUrls,
    };

    const message = this.formatter.format(approvedInput);

    const result = await this.publisher.sendMessage(
      '',
      message,
      headerImageUrl ?? undefined,
    );

    const published = result.ok ? ['vip-calls'] : [];
    const failed = result.ok ? [] : ['vip-calls'];

    const mcAtCall = input.marketCapUsd ?? null;
    const call = PublishedCall.create(
      {
        chain,
        address: input.address,
        ticker: input.ticker ?? null,
        score: input.score,
        tier: tier.value,
        classification: input.classification,
        message,
        targetChannels: ['vip-calls'],
        mcAtCall,
        telegramMessageId: result.messageId,
      },
      { published, failed },
    );

    await this.callRepo.save(call);
    call.emit();
    await this.eventPublisher.publishAll(call.commit());

    if (call.isPublished && mcAtCall !== null && mcAtCall > 0) {
      const registerEvent = new RegisterCallForMilestonesEvent(call.id, {
        callId: call.id,
        chain: call.chain.value,
        address: call.address,
        mcAtCall,
        publishedAt: call.publishedAt.toISOString(),
      });
      this.eventEmitter.emit(registerEvent.eventName, registerEvent);
    }

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
      headerImageUrl,
    };
  }
}
