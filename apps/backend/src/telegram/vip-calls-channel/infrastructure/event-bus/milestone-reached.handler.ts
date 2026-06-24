import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { CallMilestoneReachedEvent } from 'token/milestone/domain/events/call-milestone-reached.event';
import { MessageFormatterPort, TelegramPublisherPort } from 'telegram/shared';
import { VipCallsMessageFormatterAdapter } from '../formatters/vip-message-formatter.adapter';

@Injectable()
export class MilestoneReachedHandler {
  private readonly logger = new Logger(MilestoneReachedHandler.name);

  constructor(
    @Inject(MessageFormatterPort)
    private readonly formatter: VipCallsMessageFormatterAdapter,
    @Inject(TelegramPublisherPort)
    private readonly publisher: TelegramPublisherPort,
  ) {}

  @OnEvent(CallMilestoneReachedEvent.EVENT_NAME, { async: true })
  async handle(event: CallMilestoneReachedEvent): Promise<void> {
    const { chain, address, multiple, mcAtCall, mcNow } = event.payload;
    try {
      const message = this.formatter.formatMilestoneMessage({
        chain,
        address,
        multiple,
        mcAtCall,
        mcNow,
      });
      const result = await this.publisher.sendMessage('', message);
      if (!result.ok) {
        this.logger.warn(
          `Telegram send failed for milestone ${multiple}x callId=${event.payload.callId}: ${result.error ?? 'unknown'}`,
        );
      }
    } catch (err) {
      this.logger.warn(
        `Milestone consumer failed for ${multiple}x callId=${event.payload.callId}: ${(err as Error).message}`,
      );
    }
  }
}
