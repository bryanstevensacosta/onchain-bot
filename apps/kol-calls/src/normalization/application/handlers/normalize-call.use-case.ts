import { Injectable, Logger } from '@nestjs/common';
import { DomainError } from '../../../shared/kernel/domain-error';
import { DomainEvent } from '../../../shared/kernel/domain-event';
import { ParsedCall } from '../../../parsing/domain/entities/parsed-call.entity';
import { NormalizedMention } from '../../domain/entities/normalized-mention.entity';
import { NormalizedMentionRepository } from '../ports/normalized-mention.repository';

export interface NormalizeCallInput {
  readonly parsed: ReadonlyArray<ParsedCall>;
}

export interface NormalizeCallResult {
  /** One NormalizedMention per parseable call (P1 mention index, order = input order). */
  readonly normalized: ReadonlyArray<NormalizedMention>;
  /** One `normalization.call.normalized` event per mention (direct return, no bus). */
  readonly events: ReadonlyArray<DomainEvent>;
  readonly discarded: number;
}

/**
 * Normalize parsed calls into the mention index (P1, G-12, Ph6 spec).
 *
 * Direct call, fix-1: invoked synchronously with the parsed calls as an
 * argument — no event bus on the way in or out (kol-calls wires no bus;
 * the head of the money-path stays synchronous/deterministic).
 *
 * One row per mention, keyed `(contract, kol, messageId)` (+ contractIndex
 * disambiguator for multi-tip same-contract messages): the same contract
 * across 2 kols x 2 messages yields 4 rows. An illegible call is discarded
 * with a warn log — the pipeline keeps going (adversarial: one bad mention
 * never kills the batch). Empty input → empty output, never a throw.
 */
@Injectable()
export class NormalizeCallUseCase {
  private readonly logger = new Logger(NormalizeCallUseCase.name);

  public constructor(
    private readonly mentionRepo: NormalizedMentionRepository,
  ) {}

  public async execute(
    input: NormalizeCallInput,
  ): Promise<NormalizeCallResult> {
    const parsed = input.parsed ?? [];
    if (parsed.length === 0) {
      return { normalized: [], events: [], discarded: 0 };
    }

    const normalized: NormalizedMention[] = [];
    let discarded = 0;

    for (const call of parsed) {
      try {
        const mention = NormalizedMention.create({
          kolId: call.kolId,
          messageId: call.messageId,
          contractIndex: call.contractIndex,
          occurredAt: call.occurredAt,
          contractAddress: call.address,
          ticker: call.ticker,
          name: call.name,
          chart: call.chart,
          handle: call.handle,
          channelId: call.channelId,
        });
        normalized.push(mention);
      } catch (err) {
        discarded += 1;
        const reason =
          err instanceof DomainError
            ? `${err.code}: ${err.message}`
            : (err as Error).message;
        this.logger.warn(
          `Discarding illegible parsed call at index ${normalized.length + discarded - 1} (${reason})`,
        );
      }
    }

    const events: DomainEvent[] = [];
    for (const mention of normalized) {
      await this.mentionRepo.save(mention);
      mention.emitNormalized();
      events.push(...mention.commit());
    }

    return { normalized, events, discarded };
  }
}
