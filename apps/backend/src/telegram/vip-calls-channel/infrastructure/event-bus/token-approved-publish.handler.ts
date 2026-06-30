import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ChainId } from 'chain/identity/chain-id.vo';
import { ChainFamily } from 'chain/identity/chain-family.vo';
import { NormalizedAddress } from 'token/identity/normalized-address.vo';
import { CanonicalTokenCallRepository } from 'token/normalization/application/ports/canonical-token-call.repository';
import { TokenSnapshotRepository } from 'token/enrichment/application/ports/token-snapshot.repository';
import { VipCallApprovedEvent } from 'token/vip-call-approval/domain/events/vip-call-approved.event';
import { VipCallsPublishUseCase } from '../../application/handlers/vip-calls-publish.use-case';
import { PublishedCallRepository } from 'telegram/shared';
import { TickerResolverService } from '../../application/services/ticker-resolver.service';

@Injectable()
export class TokenApprovedPublishHandler {
  private readonly logger = new Logger(TokenApprovedPublishHandler.name);

  constructor(
    private readonly publish: VipCallsPublishUseCase,
    private readonly tokenRepo: CanonicalTokenCallRepository,
    private readonly snapshotRepo: TokenSnapshotRepository,
    private readonly publishedCallRepo: PublishedCallRepository,
    private readonly tickerResolver: TickerResolverService,
  ) {}

  @OnEvent(VipCallApprovedEvent.EVENT_NAME, { async: true })
  async handle(event: VipCallApprovedEvent): Promise<void> {
    try {
      const chainId = ChainId.fromString(event.payload.chain);
      const addressLower = event.payload.address.toLowerCase();
      const normalizedAddress = chainId.isEvm
        ? addressLower
        : event.payload.address;

      // Check for duplicate publication
      try {
        const existing = await this.publishedCallRepo.findByChainAndAddress(
          chainId,
          normalizedAddress,
        );
        if (existing) {
          this.logger.log(
            `Token ${chainId.value}:${normalizedAddress} already published, skipping duplicate publication`,
          );
          return;
        }
      } catch (err) {
        // Fail open: if duplicate check fails, proceed with publication
        this.logger.warn(
          `Duplicate check failed for ${chainId.value}:${normalizedAddress}, proceeding with publication: ${(err as Error).message}`,
        );
      }

      const family = chainId.isEvm ? ChainFamily.EVM : ChainFamily.SOLANA;
      const address = chainId.isEvm
        ? NormalizedAddress.fromEvm(addressLower)
        : NormalizedAddress.fromSolana(event.payload.address);

      const [token, snapshot] = await Promise.all([
        this.tokenRepo.findByIdentity(family, address),
        this.snapshotRepo.findByChainAndAddress(chainId, addressLower),
      ]);

      const best = token?.bestMetrics;
      let ticker = token?.ticker ?? snapshot?.symbol ?? null;
      if (ticker === null) {
        this.logger.debug(
          `Ticker null after DB lookups, attempting cascading fallback for ${event.payload.chain}:${event.payload.address}`,
        );
        ticker =
          (await this.tickerResolver.resolveTicker({
            chain: event.payload.chain,
            address: event.payload.address,
            name: snapshot?.name ?? token?.name ?? null,
          })) ?? 'ANON';
        this.logger.debug(`Cascading fallback resolved ticker: ${ticker}`);
      }
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
