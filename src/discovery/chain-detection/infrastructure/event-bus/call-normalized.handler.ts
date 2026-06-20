import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { CallNormalizedEvent } from 'discovery/normalization/domain/events/call-normalized.event';
import { DetectChainUseCase } from 'discovery/chain-detection/application/handlers/detect-chain.use-case';

/**
 * Subscribes to normalization.call.normalized and triggers chain-detection
 * only when the chain hint is not already `evm` or `solana`.
 *
 * In v1, the normalization BC always produces `evm`/`solana`, so this
 * handler is a safety net. Useful when upstream chains expand (sui,
 * aptos) or when the format is ambiguous.
 */
@Injectable()
export class CallNormalizedHandler {
  private readonly logger = new Logger(CallNormalizedHandler.name);

  public constructor(private readonly detect: DetectChainUseCase) {}

  @OnEvent('normalization.call.normalized', { async: true })
  public async handle(event: CallNormalizedEvent): Promise<void> {
    if (event.payload.chain === 'evm' || event.payload.chain === 'solana') {
      this.logger.debug(
        `Skipping already-resolved chain: ${event.payload.address} (${event.payload.chain})`,
      );
      return;
    }

    try {
      await this.detect.execute({ address: event.payload.address });
    } catch (err) {
      this.logger.error(
        `Chain detection failed for ${event.payload.address}: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }
}
