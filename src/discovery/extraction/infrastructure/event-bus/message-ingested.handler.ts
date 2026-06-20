import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { MessageIngestedEvent } from 'discovery/ingestion/telegram/domain/events/message-ingested.event';
import { ExtractFromMessageUseCase } from 'discovery/extraction/application/handlers/extract-from-message.use-case';

/**
 * Listens for `telegram.message.ingested` events and triggers extraction.
 *
 * Lifecycle events (channel start/stop) emitted without text are skipped —
 * only per-message events with raw text produce an ExtractionResult.
 */
@Injectable()
export class MessageIngestedHandler {
  private readonly logger = new Logger(MessageIngestedHandler.name);

  public constructor(private readonly extract: ExtractFromMessageUseCase) {}

  @OnEvent('telegram.message.ingested', { async: true })
  public async handle(event: MessageIngestedEvent): Promise<void> {
    if (!event.payload.text) {
      this.logger.debug(
        `Skipping lifecycle event channelId=${event.payload.channelId} messageId=${event.payload.messageId}`,
      );
      return;
    }
    try {
      await this.extract.execute({
        channelId: event.payload.channelId,
        messageId: event.payload.messageId,
        occurredAt: event.payload.occurredAt,
        text: event.payload.text,
      });
    } catch (err) {
      this.logger.error(
        `Extraction failed for ${event.payload.channelId}:${event.payload.messageId}: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }
}
