import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ChainId } from 'chain/identity/chain-id.vo';
import { ChainFamily } from 'chain/identity/chain-family.vo';
import { NormalizedAddress } from 'token/identity/normalized-address.vo';
import { CanonicalTokenCallRepository } from 'token/normalization/application/ports/canonical-token-call.repository';
import { TokenSnapshotRepository } from 'chain/explorer/application/ports/token-snapshot.repository';
import { TokenFilteredEvent } from 'token/token-gating/domain/events/token-filtered.event';
import { VipCallsPublishUseCase } from '../../application/handlers/vip-calls-publish.use-case';

@Injectable()
export class TokenApprovedPublishHandler {
  private readonly logger = new Logger(TokenApprovedPublishHandler.name);

  constructor(
    private readonly publish: VipCallsPublishUseCase,
    private readonly tokenRepo: CanonicalTokenCallRepository,
    private readonly snapshotRepo: TokenSnapshotRepository,
  ) {}

  @OnEvent(TokenFilteredEvent.EVENT_NAME, { async: true })
  async handle(event: TokenFilteredEvent): Promise<void> {
    try {
      const chainId = ChainId.fromString(event.payload.chain);
      const family = chainId.isEvm ? ChainFamily.EVM : ChainFamily.SOLANA;
      const addressLower = event.payload.address.toLowerCase();
      const address = chainId.isEvm
        ? NormalizedAddress.fromEvm(addressLower)
        : NormalizedAddress.fromSolana(event.payload.address);

      const [token, snapshot] = await Promise.all([
        this.tokenRepo.findByIdentity(family, address),
        this.snapshotRepo.findByChainAndAddress(chainId, addressLower),
      ]);

      const best = token?.bestMetrics;
      const ticker = token?.ticker ?? snapshot?.symbol ?? null;
      const name = snapshot?.name ?? token?.name ?? null;
      const marketCapUsd = snapshot?.marketCapUsd ?? best?.marketCapUsd ?? null;
      const liquidityUsd = snapshot?.liquidityUsd ?? best?.liquidityUsd ?? null;
      const holderCount = snapshot?.holders ?? best?.holders ?? null;
      const chart = snapshot?.primaryPair
        ? `https://dexscreener.com/${chainId.value === 'solana' ? 'solana' : 'ethereum'}/${addressLower}`
        : null;

      await this.publish.execute({
        chain: event.payload.chain,
        address: event.payload.address,
        ticker,
        name,
        marketCapUsd,
        liquidityUsd,
        holderCount,
        sourceCount: token?.sources.length ?? 1,
        mentionCount: token?.mentionCount ?? 1,
        chart,
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