import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { TokenFilteredEvent } from 'discovery/filters/domain/events/token-filtered.event';
import { PublishApprovedCallUseCase } from 'discovery/publishing/telegram/application/handlers/publish-approved-call.use-case';

/**
 * Subscribes to filters.token.approved and triggers publishing.
 *
 * The event carries minimal data; for v1 we use defaults for fields not
 * in the event (source count, mention count, etc.). The controller path
 * can publish with full data.
 */
@Injectable()
export class FiltersApprovedHandler {
  private readonly logger = new Logger(FiltersApprovedHandler.name);

  public constructor(private readonly publish: PublishApprovedCallUseCase) {}

  @OnEvent('filters.token.approved', { async: true })
  public async handle(event: TokenFilteredEvent): Promise<void> {
    try {
      await this.publish.execute({
        chain: event.payload.chain,
        address: event.payload.address,
        ticker: null,
        name: null,
        score: event.payload.score,
        classification: event.payload.classification,
        marketCapUsd: null,
        liquidityUsd: null,
        holders: null,
        sourceCount: 1,
        mentionCount: 1,
        chart: null,
      });
    } catch (err) {
      this.logger.error(
        `Publish failed for ${event.payload.address}: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }
}
