import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { TokenEnrichedEvent } from 'chain/explorer/domain/events/token-enriched.event';
import { ClassifyTokenUseCase } from 'token/classification/application/handlers/classify-token.use-case';

/**
 * Subscribes to enrichment.token.enriched and triggers classification.
 *
 * Skips enrichment-failed events (no data to classify).
 */
@Injectable()
export class TokenEnrichedHandler {
  private readonly logger = new Logger(TokenEnrichedHandler.name);

  public constructor(private readonly classify: ClassifyTokenUseCase) {}

  @OnEvent('enrichment.token.enriched', { async: true })
  public async handle(event: TokenEnrichedEvent): Promise<void> {
    try {
      await this.classify.execute({
        chain: event.payload.chain,
        address: event.payload.address,
        hasPairs: event.payload.pairCount > 0,
        pairCount: event.payload.pairCount,
        liquidityUsd: event.payload.liquidityUsd,
        marketCapUsd: event.payload.marketCapUsd,
        priceChange24h: event.payload.priceChange24h,
        holders: event.payload.holders,
        top10HolderPercent: event.payload.top10HolderPercent,
        hasName:
          typeof event.payload.name === 'string' &&
          event.payload.name.trim().length > 0,
        hasTicker: false, // symbol not yet carried in enrichment event
        completeness: event.payload.completeness,
      });
    } catch (err) {
      this.logger.error(
        `Classification failed for ${event.payload.address}: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }
}
