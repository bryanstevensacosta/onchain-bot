import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ChainId } from 'chain/identity/chain-id.vo';
import { ChainFamily } from 'chain/identity/chain-family.vo';
import { NormalizedAddress } from 'token/identity/normalized-address.vo';
import { CanonicalTokenCallRepository } from 'token/normalization/application/ports/canonical-token-call.repository';
import { TokenFilteredEvent } from 'token/token-gating/domain/events/token-filtered.event';
import { VipCallsPublishUseCase } from '../../application/handlers/vip-calls-publish.use-case';

@Injectable()
export class TokenApprovedPublishHandler {
  private readonly logger = new Logger(TokenApprovedPublishHandler.name);

  constructor(
    private readonly publish: VipCallsPublishUseCase,
    private readonly tokenRepo: CanonicalTokenCallRepository,
  ) {}

  @OnEvent(TokenFilteredEvent.EVENT_NAME, { async: true })
  async handle(event: TokenFilteredEvent): Promise<void> {
    try {
      const chainId = ChainId.fromString(event.payload.chain);
      const family = chainId.isEvm ? ChainFamily.EVM : ChainFamily.SOLANA;
      const address = chainId.isEvm
        ? NormalizedAddress.fromEvm(event.payload.address)
        : NormalizedAddress.fromSolana(event.payload.address);

      const token = await this.tokenRepo.findByIdentity(family, address);
      const best = token?.bestMetrics;

      await this.publish.execute({
        chain: event.payload.chain,
        address: event.payload.address,
        ticker: token?.ticker ?? null,
        name: token?.name ?? null,
        marketCapUsd: best?.marketCapUsd ?? null,
        liquidityUsd: best?.liquidityUsd ?? null,
        holderCount: best?.holders ?? null,
        sourceCount: token?.sources.length ?? 1,
        mentionCount: token?.mentionCount ?? 1,
        score: event.payload.score,
        classification: event.payload.classification,
      });
    } catch (err) {
      this.logger.warn(
        `Publish-on-approval failed for ${event.payload.chain}:${event.payload.address}: ${(err as Error).message}`,
      );
    }
  }
}