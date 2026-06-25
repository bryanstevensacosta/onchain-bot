import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { CallPublishedEvent } from 'telegram/shared/domain/events/call-published.event';
import { TrackPublishedCallUseCase } from '../../application/handlers/track-published-call.use-case';

export const CALL_PUBLISHED_EVENT_NAME = 'publishing.telegram.published';

@Injectable()
export class CallPublishedTrackedHandler {
  private readonly logger = new Logger(CallPublishedTrackedHandler.name);

  constructor(private readonly trackUseCase: TrackPublishedCallUseCase) {}

  @OnEvent(CALL_PUBLISHED_EVENT_NAME, { async: true })
  async handle(event: CallPublishedEvent): Promise<void> {
    const { chain, address, ticker, publishedChannelIds, publishedAt } =
      event.payload;
    try {
      await this.trackUseCase.execute({
        chain,
        address,
        ticker,
        publishedAt: new Date(publishedAt),
        kolId: publishedChannelIds[0] ?? null,
      });
    } catch (err) {
      this.logger.warn(
        `Failed to track published call ${chain}:${address}: ${(err as Error).message}`,
      );
    }
  }
}
