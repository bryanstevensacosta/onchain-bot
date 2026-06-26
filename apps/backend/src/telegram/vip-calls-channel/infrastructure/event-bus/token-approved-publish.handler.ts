import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { TokenFilteredEvent } from 'token/token-gating/domain/events/token-filtered.event';
import { VipCallsPublishUseCase } from '../../application/handlers/vip-calls-publish.use-case';

@Injectable()
export class TokenApprovedPublishHandler {
  private readonly logger = new Logger(TokenApprovedPublishHandler.name);

  constructor(private readonly publish: VipCallsPublishUseCase) {}

  @OnEvent(TokenFilteredEvent.EVENT_NAME, { async: true })
  async handle(event: TokenFilteredEvent): Promise<void> {
    try {
      await this.publish.execute({
        chain: event.payload.chain,
        address: event.payload.address,
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