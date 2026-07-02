import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { randomUUID } from 'crypto';
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
import { RegisterCallForAchievementsEvent } from 'token/achievement/domain/events/register-call-for-achievements.event';

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
    // (1) entered
    const correlationId = `pub-${randomUUID()}`;
    const chain = ChainId.fromString(input.chain);
    const tierThresholds = await this.settings.getScoringTierThresholds();
    const tier = ScoreTier.fromScore(input.score, tierThresholds);

    const imageUrls = input.imageUrls ?? [];
    const headerImageUrl = imageUrls[0] ?? null;
    const mcAtCall = input.marketCapUsd ?? null;

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

    this.logger.log(
      JSON.stringify({
        event: 'entered',
        correlationId,
        chain: input.chain,
        address: input.address,
        tier: tier.value,
        score: input.score,
      }),
    );

    // (2) Reserve atomically. If a row already exists for (chain, address),
    // skip Telegram + finalize and return the existing snapshot.
    const reservation = await this.callRepo.tryReserve({
      chain,
      address: input.address,
      ticker: input.ticker ?? null,
      score: input.score,
      tier: tier.value,
      classification: input.classification,
      message,
      targetChannels: ['vip-calls'],
      mcAtCall,
      correlationId,
    });

    if (!reservation.reserved) {
      this.logger.warn(
        JSON.stringify({
          event: 'duplicate_detected',
          correlationId,
          id: reservation.id,
        }),
      );
      const existing = reservation.existing as PublishedCall;
      return {
        id: existing.id,
        chain: existing.chain.value,
        address: existing.address,
        ticker: existing.ticker,
        score: existing.score,
        tier: existing.tier,
        classification: existing.classification,
        message: existing.message,
        status: existing.status.value,
        publishedChannelIds: [...existing.publishedChannelIds],
        failedChannelIds: [...existing.failedChannelIds],
        successCount: existing.successCount,
        publishedAt: existing.publishedAt.toISOString(),
        headerImageUrl,
      };
    }

    // (3) before_sendMessage
    this.logger.log(
      JSON.stringify({
        event: 'before_sendMessage',
        correlationId,
        id: reservation.id,
      }),
    );

    let sendResult: {
      readonly ok: boolean;
      readonly messageId: number | null;
      readonly error: string | null;
    };
    try {
      sendResult = await this.publisher.sendMessage(
        '',
        message,
        headerImageUrl ?? undefined,
      );
    } catch (err) {
      // (3a) after_sendMessage with throw
      this.logger.error(
        JSON.stringify({
          event: 'after_sendMessage',
          correlationId,
          id: reservation.id,
          ok: false,
          error: err instanceof Error ? err.message : 'unknown',
        }),
      );
      // Mark the reserved row as FAILED before re-throwing so we don't
      // leak dangling RESERVED entries. markFailed is best-effort:
      // if it also throws, log and continue with the original error.
      const reason = `sendMessage: ${
        err instanceof Error ? err.message : 'unknown error'
      }`;
      try {
        await this.callRepo.markFailed(reservation.id, reason);
      } catch (markFailedErr) {
        this.logger.error(
          JSON.stringify({
            event: 'markFailed_failed',
            correlationId,
            id: reservation.id,
            error:
              markFailedErr instanceof Error
                ? markFailedErr.message
                : 'unknown',
          }),
        );
      }
      throw err;
    }

    // (3b) after_sendMessage success path
    this.logger.log(
      JSON.stringify({
        event: 'after_sendMessage',
        correlationId,
        id: reservation.id,
        ok: sendResult.ok,
        messageId: sendResult.messageId,
      }),
    );

    // (4) before_finalize (replaces before_save)
    this.logger.log(
      JSON.stringify({
        event: 'before_finalize',
        correlationId,
        id: reservation.id,
        status: sendResult.ok ? 'PUBLISHED' : 'FAILED',
      }),
    );

    try {
      await this.callRepo.finalize(reservation.id, {
        status: sendResult.ok ? 'PUBLISHED' : 'FAILED',
        telegramMessageId: sendResult.messageId,
        failedReason: sendResult.ok
          ? undefined
          : (sendResult.error ?? 'unknown'),
      });
    } catch (finalizeErr) {
      this.logger.error(
        JSON.stringify({
          event: 'finalize_failed',
          correlationId,
          id: reservation.id,
          error: finalizeErr instanceof Error ? finalizeErr.message : 'unknown',
        }),
      );
      // The row stays RESERVED — no deleteMessage, no further action.
      // Re-throw the original finalize error so the caller sees what
      // actually went wrong.
      throw finalizeErr;
    }

    // (5) after_finalize (replaces after_save)
    this.logger.log(
      JSON.stringify({
        event: 'after_finalize',
        correlationId,
        id: reservation.id,
      }),
    );

    // Reload the row to publish any events queued by markPublished /
    // markFailed during finalize (in-memory repo) and to read final
    // state for the output (TypeORM).
    const call = await this.callRepo.findByChainAndAddress(
      chain,
      input.address,
    );

    if (call) {
      // The in-memory repo's finalize() invokes markPublished /
      // markFailed, which queue events on the aggregate. The
      // TypeORM repo's finalize() is a raw SQL UPDATE and queues
      // nothing — but the resulting aggregate is in its final
      // state. Either way, commit() then publishAll() handles both
      // paths safely (an empty event list is a no-op).
      await this.eventPublisher.publishAll(call.commit());
    }

    // (6) Emit achievement event ONLY when published with mcAtCall > 0.
    if (call && call.isPublished && mcAtCall !== null && mcAtCall > 0) {
      const registerEvent = new RegisterCallForAchievementsEvent(call.id, {
        callId: call.id,
        chain: call.chain.value,
        address: call.address,
        publishedAt: call.publishedAt.toISOString(),
      });
      this.eventEmitter.emit(registerEvent.eventName, registerEvent);
    }

    // (7) returning
    this.logger.log(
      JSON.stringify({
        event: 'returning',
        correlationId,
        id: reservation.id,
        status: call?.status.value ?? 'UNKNOWN',
      }),
    );

    if (!call) {
      // Defensive: should never happen because we just reserved/finalized
      // the row. Throw a domain error so the caller sees something.
      throw new Error(
        `PublishedCall missing after finalize for id ${reservation.id}`,
      );
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
