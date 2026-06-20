import { Injectable } from '@nestjs/common';
import {
  CanonicalTokenCall,
  MentionInput,
} from 'ca/normalization/domain/entities/canonical-token-call.entity';
import { Chain } from 'ca/normalization/domain/value-objects/chain.vo';
import { NormalizedAddress } from 'ca/normalization/domain/value-objects/normalized-address.vo';
import { CanonicalTokenCallRepository } from 'ca/normalization/application/ports/canonical-token-call.repository';
import { NormalizationEventPublisher } from 'ca/normalization/application/ports/normalization-event.publisher';
import {
  CanonicalTokenCallMapper,
  CanonicalTokenCallView,
} from 'ca/normalization/application/mappers/canonical-token-call.mapper';

export interface NormalizeCallInput extends Omit<
  MentionInput,
  'chain' | 'address'
> {
  readonly chainHint: string;
  readonly addressRaw: string;
}

/**
 * Use case: normalize a parsed mention into the canonical token-call
 * repository. Creates a new entry on first sight, merges with existing
 * entry on subsequent mentions of the same `(chain, address)`.
 *
 * Returns null if the chain hint is unsupported (chain-detection BC has
 * not yet resolved the chain — caller can re-process later).
 */
@Injectable()
export class NormalizeCallUseCase {
  public constructor(
    private readonly callRepo: CanonicalTokenCallRepository,
    private readonly eventPublisher: NormalizationEventPublisher,
  ) {}

  public async execute(
    input: NormalizeCallInput,
  ): Promise<CanonicalTokenCallView | null> {
    const chain = Chain.tryFromString(input.chainHint);
    if (!chain) return null;

    const address = NormalizedAddress.fromChainHint(
      input.addressRaw,
      input.chainHint,
    );
    if (!address) return null;

    const mention: MentionInput = {
      chain,
      address,
      ticker: input.ticker,
      name: input.name,
      chart: input.chart,
      metrics: input.metrics,
      confidence: input.confidence,
      channelId: input.channelId,
      username: input.username,
      messageId: input.messageId,
      occurredAt: input.occurredAt,
    };

    const existing = await this.callRepo.findByIdentity(chain, address);
    const updated = existing
      ? existing.mergeWith(mention)
      : CanonicalTokenCall.create(mention);

    await this.callRepo.save(updated);

    updated.emitNormalized();
    await this.eventPublisher.publishAll(updated.commit());

    return CanonicalTokenCallMapper.toView(updated);
  }
}
