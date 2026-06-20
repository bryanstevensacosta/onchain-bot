import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { CandidatesExtractedEvent } from 'discovery/extraction/domain/events/candidates-extracted.event';
import { ContractAddress } from 'discovery/extraction/domain/value-objects/contract-address.vo';
import { ParseFromCandidatesUseCase } from 'discovery/parsing/application/handlers/parse-from-candidates.use-case';
import { DomainError } from 'shared/kernel/domain-error';

/**
 * Subscribes to extraction.candidates.extracted and triggers parsing.
 *
 * Skips events with no contract addresses (these are non-call messages
 * like "Just chart analysis" with no CA → noise).
 *
 * NO_CONTRACT_ADDRESS errors are absorbed silently — they are expected
 * for non-call messages, not actual failures.
 */
@Injectable()
export class CandidatesExtractedHandler {
  private readonly logger = new Logger(CandidatesExtractedHandler.name);

  public constructor(private readonly parse: ParseFromCandidatesUseCase) {}

  @OnEvent('extraction.candidates.extracted', { async: true })
  public async handle(event: CandidatesExtractedEvent): Promise<void> {
    const addresses = (event.payload.contractAddresses ?? []).map((c) => {
      if (c.chainHint === 'evm') return ContractAddress.fromEvm(c.value);
      if (c.chainHint === 'solana') return ContractAddress.fromSolana(c.value);
      return ContractAddress.fromUnknown(c.value);
    });

    if (addresses.length === 0) {
      this.logger.debug(
        `Skipping non-call message: ${event.payload.channelId}:${event.payload.messageId}`,
      );
      return;
    }

    try {
      await this.parse.execute({
        channelId: event.payload.channelId,
        messageId: event.payload.messageId,
        occurredAt: event.payload.occurredAt,
        rawText: event.payload.rawText,
        contractAddresses: addresses,
      });
    } catch (err) {
      if (err instanceof DomainError && err.code === 'NO_CONTRACT_ADDRESS') {
        this.logger.debug(
          `NO_CONTRACT_ADDRESS for ${event.payload.channelId}:${event.payload.messageId}`,
        );
        return;
      }
      this.logger.error(
        `Parsing failed for ${event.payload.channelId}:${event.payload.messageId}: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }
}
