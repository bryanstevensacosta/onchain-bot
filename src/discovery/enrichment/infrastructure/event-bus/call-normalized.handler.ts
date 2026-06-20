import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { CallNormalizedEvent } from 'discovery/normalization/domain/events/call-normalized.event';
import { EnrichTokenUseCase } from 'discovery/enrichment/application/handlers/enrich-token.use-case';

/**
 * Subscribes to normalization.call.normalized and triggers enrichment.
 *
 * Only fires for evm/solana chains (chain-detection would skip others
 * anyway, but we don't want to even attempt enrichment on sui/aptos
 * in v1 since no providers support them).
 */
@Injectable()
export class CallNormalizedHandler {
  private readonly logger = new Logger(CallNormalizedHandler.name);

  public constructor(private readonly enrich: EnrichTokenUseCase) {}

  @OnEvent('normalization.call.normalized', { async: true })
  public async handle(event: CallNormalizedEvent): Promise<void> {
    if (event.payload.chain !== 'evm' && event.payload.chain !== 'solana') {
      return;
    }
    try {
      const result = await this.enrich.execute({
        chain: event.payload.chain,
        address: event.payload.address,
      });
      if (result.errors.length > 0) {
        this.logger.warn(
          `Enriched with ${result.errors.length} provider error(s): ${event.payload.address} (${result.errors.map((e) => e.provider).join(', ')})`,
        );
      }
    } catch (err) {
      this.logger.error(
        `Enrichment failed for ${event.payload.address}: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }
}
